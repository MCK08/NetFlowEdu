import { HttpsError } from "firebase-functions/v2/https";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";

import { ModerationState } from "../moderation/moderationStates";
import { ModeratedTargetType } from "../moderation/submissionTypes";

// Phase 97/98 — the review authorization contract, shared by every
// class-scoped review path (answers in Phase 97, comments in Phase 98).
//
// One rule, one place: the reviewer of a submission is the canonical teacher
// of the submission's class — classes/{classId}.teacherId — and nobody else.
// Not a role, not an admin, never the author. Every helper here derives its
// facts from documents the server loads; nothing in a request carries
// authority. Extracted from answerReview.ts in Phase 98 so the comment path
// could not drift from the answer path by re-typing the same checks.

export const REVIEW_QUEUE_PAGE_SIZE = 20;

/** The one state a human rules on. `rejected` and `removed` are terminal;
 *  `approved` already published; the rest are the machine's. */
export const HUMAN_REVIEWABLE_STATES: readonly ModerationState[] = ["manual_review"];

export type ReviewDecision = "approve" | "reject";

export interface LoadedSubmission {
  ref: DocumentReference;
  data: Record<string, unknown>;
}

export function submissionRef(db: Firestore, submissionId: string): DocumentReference {
  return db.collection("moderationSubmissions").doc(submissionId);
}

export function requireUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Bu işlem için giriş yapmanız gerekiyor.");
  return uid;
}

export function requireSubmissionId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) {
    throw new HttpsError("invalid-argument", "Geçersiz inceleme kimliği.");
  }
  return value;
}

export function requireClassId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpsError("invalid-argument", "Geçersiz sınıf kimliği.");
  }
  return value;
}

export function requireDecision(value: unknown): ReviewDecision {
  if (value !== "approve" && value !== "reject") {
    throw new HttpsError("invalid-argument", "Geçersiz inceleme kararı.");
  }
  return value;
}

export function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Asserts that `callerUid` is the canonical teacher of `classId`.
 *
 * Reads the class document — inside the caller's transaction when one is
 * supplied, so a decision cannot commit against a class whose teacher
 * changed underneath it.
 */
export async function assertClassTeacher(
  db: Firestore,
  tx: Transaction | null,
  classId: string,
  callerUid: string,
): Promise<void> {
  const ref = db.collection("classes").doc(classId);
  const snap = tx ? await tx.get(ref) : await ref.get();
  const teacherId = snap.exists ? snap.data()?.teacherId : null;
  if (typeof teacherId !== "string" || teacherId !== callerUid) {
    throw new HttpsError(
      "permission-denied",
      "Bu sınıfın gönderilerini yalnızca sınıfın öğretmeni inceleyebilir.",
    );
  }
}

/**
 * Every check a reviewer must pass for ONE submission of the expected kind.
 * Pure over its inputs except for the class read, so the transaction and the
 * pre-flight can share it. Order matters for what the caller learns: a
 * non-teacher is refused before anything about the submission's state is
 * revealed.
 */
export async function assertMayReview(
  db: Firestore,
  tx: Transaction | null,
  submission: Record<string, unknown>,
  callerUid: string,
  expectedTargetType: ModeratedTargetType,
): Promise<{ classId: string; authorId: string; questionId: string }> {
  if (submission.targetType !== expectedTargetType) {
    throw new HttpsError("failed-precondition", "Bu gönderi bu incelemenin türünde değil.");
  }
  const classId = submission.classId;
  const authorId = submission.authorId;
  const questionId = submission.questionId;
  if (typeof classId !== "string" || classId.length === 0) {
    // A submission with no class has no canonical teacher — and therefore no
    // reviewer. Stated as a permission fact, not a bug.
    throw new HttpsError(
      "permission-denied",
      "Bu gönderi bir sınıfa bağlı değil; sınıf incelemesi yapılamaz.",
    );
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
export async function assertQuestionInClass(
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
    throw new HttpsError("permission-denied", "Bu gönderi bu sınıfın sorusuna ait değil.");
  }
  return question;
}

export async function loadSubmission(db: Firestore, submissionId: string): Promise<LoadedSubmission> {
  const ref = submissionRef(db, submissionId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "İncelenecek gönderi bulunamadı.");
  return { ref, data: snap.data() ?? {} };
}

// ---------------------------------------------------------------------------
// Queue pagination — opaque to the client.
// ---------------------------------------------------------------------------

export function encodeCursor(createdAt: number, submissionId: string): string {
  return `${createdAt}:${submissionId}`;
}

export function decodeCursor(value: unknown): { createdAt: number; submissionId: string } | null {
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
 * The class teacher's bounded review page for one target type: this class,
 * human-reviewable state only, oldest first (pending work — the student who
 * has waited longest is served first). Backed by the moderationSubmissions
 * composite index (classId, targetType, status, createdAt); the target type
 * is an equality filter, so answers and comments share that one index.
 */
export async function queryReviewPage(
  db: Firestore,
  classId: string,
  targetType: ModeratedTargetType,
  cursor: { createdAt: number; submissionId: string } | null,
) {
  let query = db
    .collection("moderationSubmissions")
    .where("classId", "==", classId)
    .where("targetType", "==", targetType)
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
    page,
    nextCursor: hasMore && last ? encodeCursor(num(last.data()?.createdAt), last.id) : null,
  };
}

/** Question context and author display name for a page of submissions.
 *  One getAll for the distinct questions and one for the distinct class
 *  members — at most 2 × pageSize reads on top of the query. */
export async function loadReviewContext(
  db: Firestore,
  classId: string,
  docs: { data(): Record<string, unknown> | undefined }[],
): Promise<{
  questions: Map<string, Record<string, unknown>>;
  members: Map<string, Record<string, unknown>>;
}> {
  const questionIds = [...new Set(docs.map((d) => str(d.data()?.questionId)).filter((v): v is string => !!v))];
  const authorIds = [...new Set(docs.map((d) => str(d.data()?.authorId)).filter((v): v is string => !!v))];
  const membersRef = db.collection("classes").doc(classId).collection("members");
  const [questionSnaps, memberSnaps] = await Promise.all([
    questionIds.length ? db.getAll(...questionIds.map((id) => db.collection("questions").doc(id))) : [],
    authorIds.length ? db.getAll(...authorIds.map((id) => membersRef.doc(id))) : [],
  ]);
  return {
    questions: new Map(questionSnaps.map((s) => [s.id, s.data() ?? {}])),
    members: new Map(memberSnaps.map((s) => [s.id, s.data() ?? {}])),
  };
}

export function questionContext(question: Record<string, unknown>): {
  description: string | null;
  subject: string;
  topic: string;
  imageUrl: string | null;
} {
  return {
    description: str(question.description),
    subject: str(question.subject) ?? "",
    topic: str(question.topic) ?? "",
    imageUrl: str(question.imageUrl),
  };
}
