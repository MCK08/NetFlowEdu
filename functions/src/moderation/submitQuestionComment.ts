import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";

import { canReadQuestion } from "../social/questionAccess";
import { isValidOperationId } from "../study/operationId";
import { decideTextModeration } from "./moderationDecision";
import { canPublish, ModerationState } from "./moderationStates";
import { callProvider, resolveProviders } from "./providers";
import {
  isValidCommentText,
  MODERATION_SCHEMA_VERSION,
  SubmissionResult,
} from "./submissionTypes";
import { normalizeForModeration } from "./textNormalization";
import { evaluateTextRules } from "./textRules";

// THE PUBLICATION GATE for question comments.
//
// Before this, a client wrote questionComments/{id} directly and it was
// instantly live to everyone who could read the question — the comment
// counter and the question-owner notification both fired off the resulting
// onDocumentCreated trigger. There was no point at which anything inspected
// the text.
//
// Now the ONLY writer of questionComments is this function (Admin SDK), and
// firestore.rules denies client creates outright. The trigger, the counter
// and the notification are untouched: they still fire on comment creation,
// but a comment now only ever exists if it was approved, so "pending content
// must not trigger counters or notifications" holds by construction rather
// than by adding checks to three more places.
//
// Transaction ordering: Firestore rejects any read issued after the first
// write, and that exact mistake caused the 2026-08-05 production outage
// across every notification-producing function (see
// functions/src/notifications/createNotification.ts). Every read below is
// completed before anything is staged.

const PROVIDER_TIMEOUT_MS = 8000;
// One comment per 5 seconds per author. Server clock only — a client cannot
// move this by changing its own time, which is why the timestamp is read
// from the stored submission rather than sent in the request.
const COMMENT_INTERVAL_MS = 5000;

interface SubmitCommentRequest {
  questionId: string;
  text: string;
  operationId: string;
}

function submissionRef(db: Firestore, submissionId: string): DocumentReference {
  return db.collection("moderationSubmissions").doc(submissionId);
}

function throttleRef(db: Firestore, uid: string): DocumentReference {
  return db.collection("users").doc(uid).collection("moderationMeta").doc("throttle");
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Deterministic id: one operationId maps to exactly one submission document,
 *  so a retry addresses the SAME document instead of racing to create a
 *  second one. This is the idempotency primitive — not a query, not a
 *  scan. Mirrors buildLikeId / buildFriendshipPairId. */
export function buildSubmissionId(uid: string, operationId: string): string {
  return `${uid}_${operationId}`;
}

export const submitQuestionCommentForModeration = onCall<SubmitCommentRequest>(
  { region: "us-central1" },
  async (request): Promise<SubmissionResult> => {
    const caller = request.auth;
    if (!caller) {
      throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
    }

    const questionId = request.data?.questionId;
    if (typeof questionId !== "string" || questionId.length === 0) {
      throw new HttpsError("invalid-argument", "Geçersiz soru kimliği.");
    }
    const text = request.data?.text;
    if (!isValidCommentText(text)) {
      throw new HttpsError("invalid-argument", "Yorum metni geçersiz.");
    }
    // Rejected, not ignored: silently dropping the id would silently drop
    // the replay protection with it.
    const operationId = request.data?.operationId;
    if (!isValidOperationId(operationId)) {
      throw new HttpsError("invalid-argument", "Geçersiz işlem kimliği.");
    }

    const db = getFirestore();
    const now = Date.now();
    const submissionId = buildSubmissionId(caller.uid, operationId);

    // ---- Moderation runs OUTSIDE the transaction, on purpose. -----------
    // It may call a provider over the network; holding a Firestore
    // transaction open across that would burn the transaction's deadline and
    // lock documents for the duration. The decision is a pure function of
    // the text, so computing it early changes nothing — the transaction
    // still re-reads and re-checks everything that matters.
    const providers = resolveProviders();
    const rules = evaluateTextRules(normalizeForModeration(text));
    const providerSignal = providers.text
      ? await callProvider(() => providers.text!.moderateText(text), PROVIDER_TIMEOUT_MS)
      : null;
    const decision = decideTextModeration({ rules, provider: providerSignal });

    const questionRef = db.collection("questions").doc(questionId);
    const subRef = submissionRef(db, submissionId);
    const rateRef = throttleRef(db, caller.uid);

    return db.runTransaction(async (tx: Transaction) => {
      // ================= READ PHASE =================
      const [subSnap, questionSnap, rateSnap] = await Promise.all([
        tx.get(subRef),
        tx.get(questionRef),
        tx.get(rateRef),
      ]);

      // Replay: this exact gesture already ran. Return what it produced,
      // without re-deciding and without publishing a second time. Checked
      // FIRST so a retry is never rejected by the rate limiter.
      const existing = subSnap.exists ? (subSnap.data() ?? {}) : null;
      if (existing) {
        return {
          submissionId,
          status: safeStatus(existing.status as ModerationState),
          publishedEntityId:
            typeof existing.publishedEntityId === "string" ? existing.publishedEntityId : null,
        };
      }

      if (!questionSnap.exists) {
        throw new HttpsError("not-found", "Bu soru artık mevcut değil.");
      }
      const question = questionSnap.data() ?? {};

      // Class questions need a membership lookup. Still inside the read
      // phase — canReadQuestion never issues a read of its own.
      let isClassMember = false;
      if (question.visibility === "class" && typeof question.classId === "string") {
        const memberSnap = await tx.get(
          db.collection("classes").doc(question.classId).collection("members").doc(caller.uid),
        );
        isClassMember = memberSnap.exists;
      }
      // The SAME helper firestore.rules mirrors — never a second, parallel
      // access model. This is what stops a cross-class or cross-visibility
      // comment.
      if (!canReadQuestion(question, caller.uid, isClassMember)) {
        throw new HttpsError("permission-denied", "Bu içeriği gönderme yetkin bulunmuyor.");
      }

      const lastSubmissionAt = num(rateSnap.exists ? (rateSnap.data() ?? {}).lastSubmissionAt : 0);
      if (now - lastSubmissionAt < COMMENT_INTERVAL_MS) {
        throw new HttpsError(
          "resource-exhausted",
          "Çok hızlı gönderim yaptın. Biraz bekleyip tekrar dene.",
        );
      }

      // ================= COMPUTE (pure) =================
      const publish = canPublish(decision.state);
      const commentRef = publish ? db.collection("questionComments").doc() : null;

      // ================= WRITE PHASE =================
      tx.set(subRef, {
        submissionId,
        authorId: caller.uid,
        targetType: "question_comment",
        questionId,
        classId: typeof question.classId === "string" ? question.classId : null,
        organizationId:
          typeof question.organizationId === "string" ? question.organizationId : null,
        text,
        status: decision.state,
        riskCategories: decision.categories,
        decisionReason: decision.reason,
        operationId,
        publishedEntityId: commentRef ? commentRef.id : null,
        createdAt: now,
        updatedAt: now,
        reviewedAt: null,
        reviewedBy: null,
        schemaVersion: MODERATION_SCHEMA_VERSION,
      });

      // The public entity is created ONLY here, and only when approved. A
      // rejected or manual_review submission reaches this point too — and
      // writes nothing to questionComments, so no counter moves and no
      // notification is produced.
      if (commentRef) {
        tx.set(commentRef, {
          questionId,
          ownerId: caller.uid,
          text,
          status: "active",
          // Milliseconds, matching what the client's toComment() reads.
          // Written by the Admin SDK, so request.time is unavailable here.
          createdAt: new Date(now),
        });
      }

      tx.set(rateRef, { lastSubmissionAt: now, updatedAt: now }, { merge: true });

      return {
        submissionId,
        status: safeStatus(decision.state),
        publishedEntityId: commentRef ? commentRef.id : null,
      };
    });
  },
);

// Local copy of the author-visible projection so this module never returns
// an internal state by accident.
function safeStatus(state: ModerationState): SubmissionResult["status"] {
  if (state === "approved") return "published";
  if (state === "manual_review") return "in_review";
  if (state === "rejected" || state === "removed") return "not_published";
  return "checking";
}
