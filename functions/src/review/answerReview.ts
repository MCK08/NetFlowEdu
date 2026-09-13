import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { DocumentReference, DocumentSnapshot, Firestore, Transaction } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

import {
  extractDownloadToken,
  finalizeApprovedAnswer,
  publishApprovedAnswerObject,
  reassertPublishedToken,
  storageDownloadBase,
  StorageBucket,
} from "../moderation/answerFinalization";
import {
  AnswerMethod,
  buildApprovedAnswerPath,
  buildDownloadUrl,
  buildReviewAccessPath,
} from "../moderation/answerPublication";
import { applyTransition, isModerationState, ModerationState } from "../moderation/moderationStates";

// Phase 97 — class-scoped manual answer review.
//
// WHO REVIEWS
//
// The canonical teacher of the submission's class: classes/{classId}.teacherId,
// the field createClass writes from the caller's uid and every other class
// mutation already trusts. Not a role. A teacher of another class has no
// authority here, an organization or platform admin has none, and the author
// has none over their own submission even if they are also the teacher.
// Nothing in the request carries authority: the server loads the submission,
// its class and its question and derives every fact from those.
//
// WHAT REVIEW IS
//
// A publication decision on content automated review could not settle —
// nothing more. The teacher sees the submission and says "publish" or "do not
// publish". They cannot edit the image, the text, the author, the question or
// the counters, because there is no field for any of that in the request, and
// the only writes below are the status flip, the audit stamp, and the answer
// document the shared finalizer produces.
//
// WHAT IT IS NOT
//
// Not an override of an explicit provider refusal: `rejected` is terminal in
// moderationStates.ts and nothing here reopens it. Not grading. Not a
// judgement of the student.
//
// EXACTLY ONCE
//
// Approval creates the answer document inside the same transaction that flips
// the submission to `approved`, and the transaction re-reads the submission
// first. A retry, or a second session approving at the same instant, sees
// `approved` and returns the existing publishedEntityId — no second document,
// so no second onAnswerCreate, so no second count and no second notification.

export const REVIEW_QUEUE_PAGE_SIZE = 20;

/** The one state a human rules on. `rejected` and `removed` are terminal;
 *  `approved` already published; the rest are the machine's. */
export const HUMAN_REVIEWABLE_STATES: readonly ModerationState[] = ["manual_review"];

export type ReviewDecision = "approve" | "reject";

export interface AnswerReviewQueueItem {
  /** Opaque handle for the detail and decision calls. Never rendered. */
  submissionId: string;
  submittedAt: number;
  /** The decision layer's machine token (provider_unavailable, uncertain,
   *  no_ocr_provider, no_image_provider). The client turns it into copy. */
  reviewReason: string;
  method: AnswerMethod;
  question: { description: string | null; subject: string; topic: string; imageUrl: string | null };
  author: { displayName: string };
}

export interface AnswerReviewQueuePage {
  items: AnswerReviewQueueItem[];
  nextCursor: string | null;
  pageSize: number;
}

export interface AnswerReviewDetail extends AnswerReviewQueueItem {
  status: ModerationState;
  /** Server-issued access to the quarantined image, bound to this object and
   *  revoked once a decision is recorded. Null when the object is gone. */
  imageUrl: string | null;
}

export interface AnswerReviewResult {
  submissionId: string;
  status: "approved" | "rejected";
  publishedEntityId: string | null;
  /** True when the decision had already been recorded before this call —
   *  a retry, or a second session that lost the race. */
  alreadyDecided: boolean;
}

// ---------------------------------------------------------------------------
// Authorization — the whole Phase 97 product decision, in one function.
// ---------------------------------------------------------------------------

interface LoadedSubmission {
  ref: DocumentReference;
  data: Record<string, unknown>;
}

function submissionRef(db: Firestore, submissionId: string): DocumentReference {
  return db.collection("moderationSubmissions").doc(submissionId);
}

function requireUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
  return uid;
}

function requireSubmissionId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) {
    throw new HttpsError("invalid-argument", "Geçersiz inceleme kimliği.");
  }
  return value;
}

/**
 * Asserts that `callerUid` is the canonical teacher of `classId`.
 *
 * Reads the class document — inside the caller's transaction when one is
 * supplied, so the decision cannot commit against a class whose teacher
 * changed underneath it.
 */
async function assertClassTeacher(
  db: Firestore,
  tx: Transaction | null,
  classId: string,
  callerUid: string,
): Promise<void> {
  const ref = db.collection("classes").doc(classId);
  const snap = tx ? await tx.get(ref) : await ref.get();
  const teacherId = snap.exists ? snap.data()?.teacherId : null;
  if (typeof teacherId !== "string" || teacherId !== callerUid) {
    throw new HttpsError("permission-denied", "Bu sınıfın yanıtlarını yalnızca sınıfın öğretmeni inceleyebilir.");
  }
}

/**
 * Every check a reviewer must pass for ONE submission. Pure over its inputs
 * except for the class read, so the transaction and the pre-flight can share
 * it. Order matters for what the caller learns: a non-teacher is refused
 * before anything about the submission's state is revealed.
 */
async function assertMayReview(
  db: Firestore,
  tx: Transaction | null,
  submission: Record<string, unknown>,
  callerUid: string,
): Promise<{ classId: string; authorId: string; questionId: string }> {
  if (submission.targetType !== "answer_image") {
    throw new HttpsError("failed-precondition", "Bu gönderi bir yanıt incelemesi değil.");
  }
  const classId = submission.classId;
  const authorId = submission.authorId;
  const questionId = submission.questionId;
  if (typeof classId !== "string" || classId.length === 0) {
    // A submission with no class has no canonical teacher — and therefore,
    // in Phase 97, no reviewer. Stated as a permission fact, not a bug.
    throw new HttpsError("permission-denied", "Bu yanıt bir sınıfa bağlı değil; sınıf incelemesi yapılamaz.");
  }
  if (typeof authorId !== "string" || typeof questionId !== "string") {
    throw new HttpsError("failed-precondition", "Gönderi kaydı eksik.");
  }
  await assertClassTeacher(db, tx, classId, callerUid);
  // Self-review is refused AFTER the teacher check on purpose: a teacher who
  // somehow authored the submission is told they may not rule on their own
  // content, not that they are not the teacher.
  if (authorId === callerUid) {
    throw new HttpsError("permission-denied", "Kendi gönderini inceleyemezsin.");
  }
  return { classId, authorId, questionId };
}

/** The parent question must belong to the SAME class the submission claims. */
async function assertQuestionInClass(
  db: Firestore,
  tx: Transaction | null,
  questionId: string,
  classId: string,
): Promise<Record<string, unknown>> {
  const ref = db.collection("questions").doc(questionId);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Bu soru artık mevcut değil.");
  const question = snap.data() ?? {};
  if (question.classId !== classId) {
    throw new HttpsError("permission-denied", "Bu yanıt bu sınıfın sorusuna ait değil.");
  }
  return question;
}

async function loadSubmission(db: Firestore, submissionId: string): Promise<LoadedSubmission> {
  const ref = submissionRef(db, submissionId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "İncelenecek gönderi bulunamadı.");
  return { ref, data: snap.data() ?? {} };
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function encodeCursor(createdAt: number, submissionId: string): string {
  return `${createdAt}:${submissionId}`;
}

function decodeCursor(value: unknown): { createdAt: number; submissionId: string } | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const idx = value.indexOf(":");
  if (idx <= 0) throw new HttpsError("invalid-argument", "Geçersiz sayfa imleci.");
  const createdAt = Number(value.slice(0, idx));
  const submissionId = value.slice(idx + 1);
  if (!Number.isFinite(createdAt) || submissionId.length === 0) {
    throw new HttpsError("invalid-argument", "Geçersiz sayfa imleci.");
  }
  return { createdAt, submissionId };
}

/**
 * Joins the bounded page with its question and author context.
 *
 * One getAll for the distinct questions and one for the distinct class
 * members — at most 2 × pageSize document reads on top of the query, never a
 * read per item per field. The author's name comes from the class member
 * record, which the teacher may read anyway, rather than from the user
 * profile.
 */
async function enrichQueueItems(
  db: Firestore,
  classId: string,
  docs: DocumentSnapshot[],
): Promise<AnswerReviewQueueItem[]> {
  const questionIds = [...new Set(docs.map((d) => str(d.data()?.questionId)).filter((v): v is string => !!v))];
  const authorIds = [...new Set(docs.map((d) => str(d.data()?.authorId)).filter((v): v is string => !!v))];
  const membersRef = db.collection("classes").doc(classId).collection("members");
  const [questionSnaps, memberSnaps] = await Promise.all([
    questionIds.length ? db.getAll(...questionIds.map((id) => db.collection("questions").doc(id))) : [],
    authorIds.length ? db.getAll(...authorIds.map((id) => membersRef.doc(id))) : [],
  ]);
  const questions = new Map(questionSnaps.map((s) => [s.id, s.data() ?? {}]));
  const members = new Map(memberSnaps.map((s) => [s.id, s.data() ?? {}]));

  return docs.map((doc) => {
    const data = doc.data() ?? {};
    const question = questions.get(String(data.questionId)) ?? {};
    const member = members.get(String(data.authorId)) ?? {};
    return {
      submissionId: doc.id,
      submittedAt: num(data.createdAt),
      reviewReason: str(data.decisionReason) ?? "uncertain",
      method: data.method === "drawing" ? "drawing" : "photo",
      question: {
        description: str(question.description),
        subject: str(question.subject) ?? "",
        topic: str(question.topic) ?? "",
        imageUrl: str(question.imageUrl),
      },
      author: { displayName: str(member.displayName) ?? "Öğrenci" },
    };
  });
}

/**
 * The class teacher's review queue: this class, answer images, human-
 * reviewable state only, oldest first, one bounded page.
 *
 * Oldest first because a review queue is pending work — the student who has
 * waited longest is served first, and a page that fills up never hides the
 * item that most needs attention behind newer ones.
 */
export async function loadAnswerReviewQueue(
  db: Firestore,
  callerUid: string | undefined,
  data: { classId?: unknown; cursor?: unknown } | undefined,
): Promise<AnswerReviewQueuePage> {
  const uid = requireUid(callerUid);
  const classId = data?.classId;
  if (typeof classId !== "string" || classId.length === 0) {
    throw new HttpsError("invalid-argument", "Geçersiz sınıf kimliği.");
  }
  await assertClassTeacher(db, null, classId, uid);
  const cursor = decodeCursor(data?.cursor);

  let query = db
    .collection("moderationSubmissions")
    .where("classId", "==", classId)
    .where("targetType", "==", "answer_image")
    .where("status", "==", "manual_review")
    .orderBy("createdAt", "asc")
    .orderBy("__name__", "asc")
    .limit(REVIEW_QUEUE_PAGE_SIZE + 1);
  if (cursor) query = query.startAfter(cursor.createdAt, submissionRef(db, cursor.submissionId));

  const snap = await query.get();
  const page = snap.docs.slice(0, REVIEW_QUEUE_PAGE_SIZE);
  const hasMore = snap.docs.length > REVIEW_QUEUE_PAGE_SIZE;
  const last = page[page.length - 1];
  return {
    items: await enrichQueueItems(db, classId, page),
    nextCursor: hasMore && last ? encodeCursor(num(last.data()?.createdAt), last.id) : null,
    pageSize: REVIEW_QUEUE_PAGE_SIZE,
  };
}

export const listAnswerReviewQueue = onCall<{ classId: string; cursor?: string }>(
  { region: "us-central1" },
  (request) => loadAnswerReviewQueue(getFirestore(), request.auth?.uid, request.data),
);

// ---------------------------------------------------------------------------
// Detail — the only place review media access is minted.
// ---------------------------------------------------------------------------

/**
 * Makes the quarantined image viewable by the authorized teacher, and by no
 * one else, for the life of the review.
 *
 * Mechanism: a review COPY at a deterministic path no client may read, with a
 * fresh download token. Each open deletes the previous copy and makes a new
 * one, so an older URL stops working the moment the teacher reopens;
 * recording a decision deletes the copy outright (revokeReviewAccess). Object
 * deletion is the revocation, because it is the one operation production and
 * the emulator treat identically — token metadata is not.
 *
 * Why not a signed URL: signing needs a private key or an IAM signBlob grant
 * the runtime service account does not have, and the Storage emulator cannot
 * sign at all — so a signed URL would be unprovable locally and a deployment
 * prerequisite in production. The download-token scheme is what published
 * answers already rely on.
 */
async function mintReviewAccess(
  bucket: StorageBucket,
  submissionId: string,
  quarantinePath: string,
): Promise<string | null> {
  const source = bucket.file(quarantinePath);
  const [exists] = await source.exists();
  if (!exists) return null;
  const [metadata] = await source.getMetadata();
  const contentType =
    typeof metadata.contentType === "string" ? metadata.contentType : mimeForQuarantinePath(quarantinePath);
  const reviewPath = buildReviewAccessPath(submissionId, contentType);
  const review = bucket.file(reviewPath);
  await review.delete({ ignoreNotFound: true });
  await source.copy(review);
  const token = randomUUID();
  await review.setMetadata({
    contentType,
    metadata: { firebaseStorageDownloadTokens: token },
  });
  return buildDownloadUrl(bucket.name, reviewPath, token, storageDownloadBase());
}

/** Best-effort: a decided submission's review copy is deleted, which ends
 *  every review URL ever minted for it. Failure never fails the decision. */
async function revokeReviewAccess(
  bucket: StorageBucket,
  submissionId: string,
  quarantinePath: string | null,
): Promise<void> {
  if (!quarantinePath) return;
  try {
    const reviewPath = buildReviewAccessPath(submissionId, mimeForQuarantinePath(quarantinePath));
    await bucket.file(reviewPath).delete({ ignoreNotFound: true });
  } catch {
    // Hygiene, not the gate: the decision is already durable, and a stale
    // copy opens nothing but an image the teacher was authorized to see.
  }
}

function mimeForQuarantinePath(path: string): string {
  return path.endsWith(".png") ? "image/png" : "image/jpeg";
}

export async function loadAnswerReviewDetail(
  db: Firestore,
  bucket: StorageBucket,
  callerUid: string | undefined,
  data: { submissionId?: unknown } | undefined,
): Promise<AnswerReviewDetail> {
  const uid = requireUid(callerUid);
  const submissionId = requireSubmissionId(data?.submissionId);
  const { data: submission } = await loadSubmission(db, submissionId);
  const { classId, questionId } = await assertMayReview(db, null, submission, uid);
  await assertQuestionInClass(db, null, questionId, classId);

  const status = isModerationState(submission.status) ? submission.status : "manual_review";
  const [item] = await enrichQueueItems(db, classId, [await submissionRef(db, submissionId).get()]);
  if (!item) throw new HttpsError("not-found", "İncelenecek gönderi bulunamadı.");
  const quarantinePath = str(submission.quarantinePath);
  // Media is minted only while a decision is still open. A decided submission
  // is not a review any more, and its image is either published (reachable
  // through the answer) or withheld.
  const imageUrl =
    HUMAN_REVIEWABLE_STATES.includes(status) && quarantinePath
      ? await mintReviewAccess(bucket, submissionId, quarantinePath)
      : null;
  return { ...item, status, imageUrl };
}

export const getAnswerReviewDetail = onCall<{ submissionId: string }>(
  { region: "us-central1" },
  (request) =>
    loadAnswerReviewDetail(getFirestore(), getStorage().bucket(), request.auth?.uid, request.data),
);

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

function requireDecision(value: unknown): ReviewDecision {
  if (value !== "approve" && value !== "reject") {
    throw new HttpsError("invalid-argument", "Geçersiz inceleme kararı.");
  }
  return value;
}

/**
 * The canonical review decision. One mutation, two outcomes.
 *
 * The request carries a submission id and a word. Everything else — who the
 * reviewer is, which class, which question, which author, which object, which
 * state it is in — is loaded server-side and checked twice: once before any
 * Storage work so an unauthorized caller costs nothing, and again inside the
 * transaction so the commit is against current facts.
 */
export async function applyAnswerReview(
  db: Firestore,
  bucket: StorageBucket,
  callerUid: string | undefined,
  data: { submissionId?: unknown; decision?: unknown } | undefined,
  now: number = Date.now(),
): Promise<AnswerReviewResult> {
  const uid = requireUid(callerUid);
  const submissionId = requireSubmissionId(data?.submissionId);
  const decision = requireDecision(data?.decision);

  // ---- Pre-flight: authorization and idempotent short-circuits ----------
  const { ref, data: submission } = await loadSubmission(db, submissionId);
  const { classId, authorId, questionId } = await assertMayReview(db, null, submission, uid);
  const question = await assertQuestionInClass(db, null, questionId, classId);
  const currentState = isModerationState(submission.status) ? submission.status : null;
  if (!currentState) throw new HttpsError("failed-precondition", "Gönderi durumu okunamadı.");

  const target: ModerationState = decision === "approve" ? "approved" : "rejected";
  if (currentState === target) {
    // Retry after a lost response, or the second of two sessions. Nothing to
    // do and nothing to write.
    return {
      submissionId,
      status: target,
      publishedEntityId: str(submission.publishedEntityId),
      alreadyDecided: true,
    };
  }
  if (applyTransition(currentState, target) === null) {
    // rejected → approved, approved → rejected, removed → anything: final
    // decisions stay final. The state module owns that table.
    throw new HttpsError("failed-precondition", "Bu gönderi için karar zaten verildi.");
  }

  const quarantinePath = str(submission.quarantinePath);
  const method: AnswerMethod = submission.method === "drawing" ? "drawing" : "photo";

  // ---- Approve: publish the object BEFORE the transaction ---------------
  // Same order as the automated path, through the same finalizer. The
  // token is minted per attempt; the transaction below decides which
  // attempt's answer document is the one, and a losing attempt repairs the
  // object's token to match (reassertPublishedToken).
  let publishedUrl: string | null = null;
  let approvedPath: string | null = null;
  let contentType: string | null = null;
  if (decision === "approve") {
    if (!quarantinePath) throw new HttpsError("failed-precondition", "Yanıt görseli bulunamadı.");
    const file = bucket.file(quarantinePath);
    const [exists] = await file.exists();
    if (!exists) throw new HttpsError("failed-precondition", "Yanıt görseli bulunamadı.");
    const [metadata] = await file.getMetadata();
    contentType = typeof metadata.contentType === "string" ? metadata.contentType : mimeForQuarantinePath(quarantinePath);
    approvedPath = buildApprovedAnswerPath(
      String(question.visibility ?? "private"),
      questionId,
      authorId,
      submissionId,
      contentType,
    );
    publishedUrl = await publishApprovedAnswerObject({
      bucket,
      quarantinePath,
      approvedPath,
      contentType,
      downloadToken: randomUUID(),
    });
  }

  const result = await db.runTransaction(async (tx: Transaction): Promise<AnswerReviewResult> => {
    // ================= READ PHASE =================
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "İncelenecek gönderi bulunamadı.");
    const current = snap.data() ?? {};
    // Re-checked against the documents as they are NOW.
    await assertMayReview(db, tx, current, uid);
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

    // ================= COMPUTE =================
    const answerRef = decision === "approve" ? db.collection("answers").doc() : null;

    // ================= WRITE PHASE =================
    tx.update(ref, {
      status: target,
      publishedEntityId: answerRef ? answerRef.id : null,
      reviewedAt: now,
      reviewedBy: uid,
      updatedAt: now,
    });
    if (answerRef && publishedUrl) {
      finalizeApprovedAnswer(tx, answerRef, {
        questionId,
        ownerId: authorId,
        imageUrl: publishedUrl,
        method,
        now,
      });
    }
    return {
      submissionId,
      status: target,
      publishedEntityId: answerRef ? answerRef.id : null,
      alreadyDecided: false,
    };
  });

  // ---- After commit: token repair and review-access revocation ----------
  if (decision === "approve" && result.alreadyDecided && approvedPath && contentType && result.publishedEntityId) {
    // We lost the race. The object may now carry OUR token while the winning
    // document references THEIRS — re-apply the winner's.
    const winner = await db.collection("answers").doc(result.publishedEntityId).get();
    const winnerToken = extractDownloadToken(winner.data()?.imageUrl);
    if (winnerToken) await reassertPublishedToken(bucket, approvedPath, contentType, winnerToken).catch(() => undefined);
  }
  await revokeReviewAccess(bucket, submissionId, quarantinePath);
  return result;
}

export const reviewAnswerSubmission = onCall<{ submissionId: string; decision: ReviewDecision }>(
  { region: "us-central1" },
  (request) =>
    applyAnswerReview(getFirestore(), getStorage().bucket(), request.auth?.uid, request.data),
);
