import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import type { DocumentSnapshot, Firestore, Transaction } from "firebase-admin/firestore";

import { finalizeApprovedComment } from "../moderation/commentFinalization";
import { applyTransition, isModerationState, ModerationState } from "../moderation/moderationStates";
import { commitModerationOutcome, prepareModerationOutcome } from "../moderation/moderationOutcome";
import { isValidCommentText } from "../moderation/submissionTypes";
import {
  assertClassTeacher,
  assertMayReview,
  assertQuestionInClass,
  decodeCursor,
  loadReviewContext,
  loadSubmission,
  num,
  queryReviewPage,
  questionContext,
  requireClassId,
  requireDecision,
  requireSubmissionId,
  requireUid,
  REVIEW_QUEUE_PAGE_SIZE,
  ReviewDecision,
  str,
  submissionRef,
} from "./reviewAuthorization";

// Phase 98 — class-scoped manual comment review.
//
// WHY THIS EXISTS
//
// The deterministic Turkish text layer returns "review" — not "block", not
// "clean" — for exactly the cases no regex can settle: an ambiguous token
// ("hayvan" — zoology or insult?), wellbeing or meet-up language, a phone
// number or handle in a student product, meaningless repetition.
// decideTextModeration turns that into `manual_review` with reason
// `uncertain`. Until Phase 98 nothing resolved it: the Phase 97 review path
// refuses anything that is not an answer image, and every client patch is
// denied. A comment that needed a human never got one.
//
// WHO REVIEWS
//
// The same reviewer as Phase 97 and through the same helpers: the canonical
// teacher of the comment's class (classes/{classId}.teacherId). Not a role,
// not an admin, never the author. See reviewAuthorization.ts.
//
// WHAT REVIEW IS
//
// A publication decision on the retained text. The teacher reads exactly
// what the student wrote and says "publish" or "do not publish". There is no
// parameter for replacement text, so the published comment is byte-for-byte
// the sanitized submission — through the same finalizer the automated path
// uses. Ownership never moves: the author keeps the Phase 93 delete gateway,
// and the teacher gains no delete.
//
// EXACTLY ONCE
//
// Approval creates the comment inside the transaction that flips the
// submission; a retry or a concurrent session sees `approved` and returns the
// existing publishedEntityId. onQuestionCommentCreate then increments
// commentCount and notifies once, on that one document.

export interface CommentReviewQueueItem {
  /** Opaque handle for the detail and decision calls. Never rendered. */
  submissionId: string;
  submittedAt: number;
  /** The decision layer's machine token (`uncertain`; `provider_unavailable`
   *  if a text provider is ever configured). The client turns it into copy. */
  reviewReason: string;
  /** The retained submission text — what the teacher rules on. */
  text: string;
  question: { description: string | null; subject: string; topic: string; imageUrl: string | null };
  author: { displayName: string };
}

export interface CommentReviewQueuePage {
  items: CommentReviewQueueItem[];
  nextCursor: string | null;
  pageSize: number;
}

export interface CommentReviewDetail extends CommentReviewQueueItem {
  status: ModerationState;
}

export interface CommentReviewResult {
  submissionId: string;
  status: "approved" | "rejected";
  publishedEntityId: string | null;
  alreadyDecided: boolean;
}

async function enrichQueueItems(
  db: Firestore,
  classId: string,
  docs: DocumentSnapshot[],
): Promise<CommentReviewQueueItem[]> {
  const { questions, members } = await loadReviewContext(db, classId, docs);
  return docs.map((doc) => {
    const data = doc.data() ?? {};
    const question = questions.get(String(data.questionId)) ?? {};
    const member = members.get(String(data.authorId)) ?? {};
    return {
      submissionId: doc.id,
      submittedAt: num(data.createdAt),
      reviewReason: str(data.decisionReason) ?? "uncertain",
      text: str(data.text) ?? "",
      question: questionContext(question),
      author: { displayName: str(member.displayName) ?? "Öğrenci" },
    };
  });
}

/** The class teacher's comment review queue: this class, comments, human-
 *  reviewable state only, oldest first, one bounded page. */
export async function loadCommentReviewQueue(
  db: Firestore,
  callerUid: string | undefined,
  data: { classId?: unknown; cursor?: unknown } | undefined,
): Promise<CommentReviewQueuePage> {
  const uid = requireUid(callerUid);
  const classId = requireClassId(data?.classId);
  await assertClassTeacher(db, null, classId, uid);
  const { page, nextCursor } = await queryReviewPage(db, classId, "question_comment", decodeCursor(data?.cursor));
  return {
    items: await enrichQueueItems(db, classId, page),
    nextCursor,
    pageSize: REVIEW_QUEUE_PAGE_SIZE,
  };
}

export const listCommentReviewQueue = onCall<{ classId: string; cursor?: string }>(
  { region: "us-central1" },
  (request) => loadCommentReviewQueue(getFirestore(), request.auth?.uid, request.data),
);

export async function loadCommentReviewDetail(
  db: Firestore,
  callerUid: string | undefined,
  data: { submissionId?: unknown } | undefined,
): Promise<CommentReviewDetail> {
  const uid = requireUid(callerUid);
  const submissionId = requireSubmissionId(data?.submissionId);
  const { data: submission } = await loadSubmission(db, submissionId);
  const { classId, questionId } = await assertMayReview(db, null, submission, uid, "question_comment");
  await assertQuestionInClass(db, null, questionId, classId);
  const status = isModerationState(submission.status) ? submission.status : "manual_review";
  const [item] = await enrichQueueItems(db, classId, [await submissionRef(db, submissionId).get()]);
  if (!item) throw new HttpsError("not-found", "İncelenecek gönderi bulunamadı.");
  return { ...item, status };
}

export const getCommentReviewDetail = onCall<{ submissionId: string }>(
  { region: "us-central1" },
  (request) => loadCommentReviewDetail(getFirestore(), request.auth?.uid, request.data),
);

/**
 * The canonical comment review decision. One mutation, two outcomes.
 *
 * The request carries a submission id and a word. Reviewer, class, question,
 * author, text and state are all loaded server-side and checked twice — once
 * before the transaction so an unauthorized caller costs nothing, and again
 * inside it so the commit is against current facts.
 *
 * No rate limit here: the 5-second comment throttle guards SUBMISSION by an
 * author, and this is publication by a reviewer of an already-accepted
 * submission. Re-applying it would make an approval fail for reasons that
 * have nothing to do with the decision.
 */
export async function applyCommentReview(
  db: Firestore,
  callerUid: string | undefined,
  data: { submissionId?: unknown; decision?: unknown } | undefined,
  now: number = Date.now(),
): Promise<CommentReviewResult> {
  const uid = requireUid(callerUid);
  const submissionId = requireSubmissionId(data?.submissionId);
  const decision = requireDecision(data?.decision);

  // ---- Pre-flight: authorization and idempotent short-circuits ----------
  const { ref, data: submission } = await loadSubmission(db, submissionId);
  const { classId, authorId, questionId } = await assertMayReview(db, null, submission, uid, "question_comment");
  await assertQuestionInClass(db, null, questionId, classId);
  const currentState = isModerationState(submission.status) ? submission.status : null;
  if (!currentState) throw new HttpsError("failed-precondition", "Gönderi durumu okunamadı.");

  const target: ModerationState = decision === "approve" ? "approved" : "rejected";
  if (currentState === target) {
    return {
      submissionId,
      status: target,
      publishedEntityId: str(submission.publishedEntityId),
      alreadyDecided: true,
    };
  }
  if (applyTransition(currentState, target) === null) {
    throw new HttpsError("failed-precondition", "Bu gönderi için karar zaten verildi.");
  }

  return db.runTransaction(async (tx: Transaction): Promise<CommentReviewResult> => {
    // ================= READ PHASE =================
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "İncelenecek gönderi bulunamadı.");
    const current = snap.data() ?? {};
    await assertMayReview(db, tx, current, uid, "question_comment");
    await assertQuestionInClass(db, tx, questionId, classId);
    const state = isModerationState(current.status) ? current.status : null;
    if (!state) throw new HttpsError("failed-precondition", "Gönderi durumu okunamadı.");

    if (state === target) {
      return {
        submissionId,
        status: target,
        publishedEntityId: str(current.publishedEntityId),
        alreadyDecided: true,
      };
    }
    if (applyTransition(state, target) === null) {
      throw new HttpsError("failed-precondition", "Bu gönderi için karar zaten verildi.");
    }

    // Phase 99 — same contract as the answer path: the author's outcome is
    // read here and written below in this transaction, so a rejection (which
    // produces no document anywhere else) still leaves the student a durable
    // record. A retry plans nothing.
    const outcomePlan = await prepareModerationOutcome(tx, db, {
      authorId,
      submissionId,
      questionId,
      targetType: "question_comment",
      outcome: target === "approved" ? "approved" : "rejected",
    });

    // ================= COMPUTE =================
    // The text published is the text the submission retained — validated
    // again here against the same bound the submission gate applied, and
    // never taken from the request.
    const text = current.text;
    if (decision === "approve" && !isValidCommentText(text)) {
      throw new HttpsError("failed-precondition", "Yorum metni yayınlanabilir durumda değil.");
    }
    const commentRef = decision === "approve" ? db.collection("questionComments").doc() : null;

    // ================= WRITE PHASE =================
    tx.update(ref, {
      status: target,
      publishedEntityId: commentRef ? commentRef.id : null,
      reviewedAt: now,
      reviewedBy: uid,
      updatedAt: now,
    });
    if (commentRef) {
      finalizeApprovedComment(tx, commentRef, { questionId, ownerId: authorId, text: text as string, now });
    }
    commitModerationOutcome(tx, outcomePlan);
    return {
      submissionId,
      status: target,
      publishedEntityId: commentRef ? commentRef.id : null,
      alreadyDecided: false,
    };
  });
}

export const reviewCommentSubmission = onCall<{ submissionId: string; decision: ReviewDecision }>(
  { region: "us-central1" },
  (request) => applyCommentReview(getFirestore(), request.auth?.uid, request.data),
);
