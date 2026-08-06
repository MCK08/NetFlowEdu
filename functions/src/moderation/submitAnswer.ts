import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

import { canReadQuestion } from "../social/questionAccess";
import { isValidOperationId } from "../study/operationId";
import {
  AnswerMethod,
  buildApprovedAnswerPath,
  buildDownloadUrl,
  buildQuarantinePath,
  isAllowedAnswerMime,
  isOwnedQuarantinePath,
  MAX_ANSWER_BYTES,
} from "./answerPublication";
import { decideImageModeration } from "./moderationDecision";
import { canPublish, ModerationState } from "./moderationStates";
import { IMAGE_ANALYSIS_UNAVAILABLE, resolveProviders } from "./providers";
import { MODERATION_SCHEMA_VERSION, SubmissionResult } from "./submissionTypes";
import { normalizeForModeration } from "./textNormalization";
import { evaluateTextRules } from "./textRules";

// THE PUBLICATION GATE for answer images and drawings.
//
// Before this, a student uploaded straight to answers/{public|private}/... —
// a path readable by every classmate — and then wrote answers/{id} directly.
// The image was viewable the instant the upload finished, before the
// Firestore document even existed, and onAnswerCreate then incremented
// answerCount and notified the question owner. Nothing ever looked at the
// picture.
//
// Now: the client uploads to a private quarantine path, calls this function,
// and an answer document exists ONLY if Vision's SafeSearch cleared the image
// AND the OCR text cleared the same Turkish deterministic layer that guards
// comments. onAnswerCreate is untouched — it still fires on answer creation,
// but an answer now only exists when approved, so counters and notifications
// are gated by construction rather than by adding checks in two more places.
//
// Transaction ordering: every read completes before the first write. The
// 2026-08-05 outage came from breaking exactly that rule.

// One answer per 10 seconds per author. Server clock only.
const ANSWER_INTERVAL_MS = 10000;

interface SubmitAnswerRequest {
  questionId: string;
  storagePath: string;
  contentType: string;
  method: AnswerMethod;
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

function safeStatus(state: ModerationState): SubmissionResult["status"] {
  if (state === "approved") return "published";
  if (state === "manual_review") return "in_review";
  if (state === "rejected" || state === "removed") return "not_published";
  return "checking";
}

export function buildAnswerSubmissionId(uid: string, operationId: string): string {
  return `${uid}_${operationId}`;
}

export const submitAnswerForModeration = onCall<SubmitAnswerRequest>(
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
    const method = request.data?.method;
    if (method !== "photo" && method !== "drawing") {
      throw new HttpsError("invalid-argument", "Geçersiz cevap türü.");
    }
    // The DECLARED type. Checked here to fail fast, then re-checked against
    // the stored object's real metadata below — a client can claim anything.
    const contentType = request.data?.contentType;
    if (!isAllowedAnswerMime(contentType)) {
      throw new HttpsError("invalid-argument", "Desteklenmeyen dosya türü.");
    }
    const operationId = request.data?.operationId;
    if (!isValidOperationId(operationId)) {
      throw new HttpsError("invalid-argument", "Geçersiz işlem kimliği.");
    }

    const submissionId = buildAnswerSubmissionId(caller.uid, operationId);

    // Path ownership: compared against the path we would have built
    // ourselves, which rejects another uid's folder, another submission's
    // folder, traversal, and any path aimed at the approved answers/ tree.
    if (!isOwnedQuarantinePath(request.data?.storagePath, caller.uid, submissionId, contentType)) {
      throw new HttpsError("permission-denied", "Bu dosyayı gönderme yetkin bulunmuyor.");
    }
    const quarantinePath = buildQuarantinePath(caller.uid, submissionId, contentType);

    const db = getFirestore();
    const bucket = getStorage().bucket();
    const now = Date.now();

    const subRef = submissionRef(db, submissionId);
    const questionRef = db.collection("questions").doc(questionId);
    const rateRef = throttleRef(db, caller.uid);

    // ---- Early replay check, BEFORE any Vision spend ---------------------
    // A retry must not re-analyse the image: that would bill a second time
    // and could reach a different decision for identical content.
    const earlySnap = await subRef.get();
    if (earlySnap.exists) {
      const existing = earlySnap.data() ?? {};
      return {
        submissionId,
        status: safeStatus(existing.status as ModerationState),
        publishedEntityId:
          typeof existing.publishedEntityId === "string" ? existing.publishedEntityId : null,
      };
    }

    // ---- Verify the real stored object ----------------------------------
    // Metadata is read from Storage, never trusted from the request. This is
    // what catches a client that declared image/png and uploaded something
    // else, or that never uploaded at all.
    const file = bucket.file(quarantinePath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new HttpsError("failed-precondition", "Yüklenen dosya bulunamadı.");
    }
    const [metadata] = await file.getMetadata();
    const actualType = metadata.contentType;
    if (!isAllowedAnswerMime(actualType)) {
      throw new HttpsError("invalid-argument", "Desteklenmeyen dosya türü.");
    }
    // GCS reports size as a STRING (it can exceed 2^53), so Number() rather
    // than a plain numeric check — reading it as a number yields NaN and
    // would reject every real upload as zero-byte.
    const size = Number(metadata.size);
    if (!Number.isFinite(size) || size <= 0 || size > MAX_ANSWER_BYTES) {
      throw new HttpsError("invalid-argument", "Dosya boyutu sınırların dışında.");
    }

    // ---- Moderation, OUTSIDE the transaction ----------------------------
    // A network round trip inside a Firestore transaction would burn its
    // deadline and hold locks for the duration.
    const providers = resolveProviders();
    const analysis = providers.imageAnalysis
      ? await providers.imageAnalysis
          .analyzeImage(`gs://${bucket.name}/${quarantinePath}`)
          .catch(() => IMAGE_ANALYSIS_UNAVAILABLE)
      : IMAGE_ANALYSIS_UNAVAILABLE;

    // OCR text goes through the SAME Turkish layer that guards comments —
    // that is the only reason handwritten profanity is ever caught, and it
    // means the two surfaces cannot disagree about what a word means.
    const extractedTextRules = analysis.imageTextAvailable
      ? evaluateTextRules(normalizeForModeration(analysis.extractedText))
      : null;

    const decision = decideImageModeration({
      provider: analysis.image,
      extractedText: extractedTextRules,
      imageTextAvailable: analysis.imageTextAvailable,
    });

    // ---- Publish the object BEFORE the transaction, if approved ---------
    // Storage I/O cannot happen inside a Firestore transaction. The
    // destination is deterministic (submissionId), so doing this twice
    // overwrites one object rather than creating two, and an object with no
    // answer document pointing at it is unreachable by anyone.
    let publishedUrl: string | null = null;
    let approvedPath: string | null = null;
    if (canPublish(decision.state)) {
      const questionSnap = await questionRef.get();
      const visibility = String(questionSnap.data()?.visibility ?? "private");
      approvedPath = buildApprovedAnswerPath(
        visibility,
        questionId,
        caller.uid,
        submissionId,
        actualType,
      );
      const downloadToken = randomUUID();
      await file.copy(bucket.file(approvedPath));
      await bucket.file(approvedPath).setMetadata({
        contentType: actualType,
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      });
      publishedUrl = buildDownloadUrl(bucket.name, approvedPath, downloadToken);
    }

    return db.runTransaction(async (tx: Transaction) => {
      // ================= READ PHASE =================
      const [subSnap, questionSnap, rateSnap] = await Promise.all([
        tx.get(subRef),
        tx.get(questionRef),
        tx.get(rateRef),
      ]);

      // Re-checked inside the transaction: two devices can reach this point
      // concurrently, and only one may create an answer.
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

      let isClassMember = false;
      if (question.visibility === "class" && typeof question.classId === "string") {
        const memberSnap = await tx.get(
          db.collection("classes").doc(question.classId).collection("members").doc(caller.uid),
        );
        isClassMember = memberSnap.exists;
      }
      if (!canReadQuestion(question, caller.uid, isClassMember)) {
        throw new HttpsError("permission-denied", "Bu içeriği gönderme yetkin bulunmuyor.");
      }

      const lastSubmissionAt = num(rateSnap.exists ? (rateSnap.data() ?? {}).lastSubmissionAt : 0);
      if (now - lastSubmissionAt < ANSWER_INTERVAL_MS) {
        throw new HttpsError(
          "resource-exhausted",
          "Çok hızlı gönderim yaptın. Biraz bekleyip tekrar dene.",
        );
      }

      // ================= COMPUTE (pure) =================
      const publish = canPublish(decision.state) && publishedUrl !== null;
      const answerRef = publish ? db.collection("answers").doc() : null;

      // ================= WRITE PHASE =================
      tx.set(subRef, {
        submissionId,
        authorId: caller.uid,
        targetType: "answer_image",
        questionId,
        classId: typeof question.classId === "string" ? question.classId : null,
        organizationId:
          typeof question.organizationId === "string" ? question.organizationId : null,
        // No image bytes, no download URL for unpublished content, and NO raw
        // Vision payload — only the coarse categories a reviewer needs.
        quarantinePath,
        method,
        status: decision.state,
        riskCategories: decision.categories,
        decisionReason: decision.reason,
        operationId,
        publishedEntityId: answerRef ? answerRef.id : null,
        createdAt: now,
        updatedAt: now,
        scannedAt: now,
        reviewedAt: null,
        reviewedBy: null,
        schemaVersion: MODERATION_SCHEMA_VERSION,
      });

      if (answerRef && publishedUrl) {
        tx.set(answerRef, {
          questionId,
          ownerId: caller.uid,
          imageUrl: publishedUrl,
          method,
          likeCount: 0,
          createdAt: new Date(now),
        });
      }

      tx.set(rateRef, { lastSubmissionAt: now, updatedAt: now }, { merge: true });

      return {
        submissionId,
        status: safeStatus(decision.state),
        publishedEntityId: answerRef ? answerRef.id : null,
      };
    });
  },
);
