// Phase 98 — class-scoped manual comment review, against a real Firestore.
//
// Drives the SHIPPED handlers (loadCommentReviewQueue, loadCommentReviewDetail,
// applyCommentReview) with the Admin db injected — the same pattern the Phase
// 88 gateway and the Phase 97 answer review tests use. Also drives the shipped
// Phase 93 delete gateway and the shipped Phase 97 answer review path, because
// the guarantees here are relational: the author keeps their delete, the
// answer path refuses comments, the comment path refuses answers.
//
// commentCount and the publication notification are onQuestionCommentCreate's
// (a trigger the rules suite does not load); this file proves their input —
// exactly one comment document per approval under every race — and the Phase
// 98 runtime QA proves the trigger end to end with the Functions emulator.

import { deleteApp, initializeApp } from "../../functions/node_modules/firebase-admin/lib/app";
import { getFirestore } from "../../functions/node_modules/firebase-admin/lib/firestore";
import type { App } from "../../functions/node_modules/firebase-admin/lib/app";
import type { Firestore } from "../../functions/node_modules/firebase-admin/lib/firestore";

import { buildPublishedCommentDocument } from "../../functions/src/moderation/commentFinalization";
import { decideTextModeration } from "../../functions/src/moderation/moderationDecision";
import { normalizeForModeration } from "../../functions/src/moderation/textNormalization";
import { evaluateTextRules } from "../../functions/src/moderation/textRules";
import { applyAnswerReview, loadAnswerReviewQueue } from "../../functions/src/review/answerReview";
import {
  applyCommentReview,
  loadCommentReviewDetail,
  loadCommentReviewQueue,
} from "../../functions/src/review/commentReview";
import { REVIEW_QUEUE_PAGE_SIZE } from "../../functions/src/review/reviewAuthorization";
import { applyDeleteQuestionComment } from "../../functions/src/social/deleteQuestionComment";

const PROJECT_ID = "netflow-edu-comment-review-test";

const TEACHER_A = "teacher-a";
const TEACHER_B = "teacher-b";
const STUDENT_1 = "student-1";
const STUDENT_2 = "student-2";
const ORG_ADMIN = "org-admin-1";
const PLATFORM_ADMIN = "platform-admin-1";
const OUTSIDER = "outsider-9";
const CLASS_A = "class-a";
const CLASS_B = "class-b";
const QUESTION_A = "question-a";
const QUESTION_B = "question-b";

/** A real review-verdict comment: "hayvan" is an ambiguous token. */
const REVIEW_TEXT = "sen tam bir hayvan gibisin";

let app: App;
let db: Firestore;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  app = initializeApp({ projectId: PROJECT_ID }, `comment-review-${Date.now()}`);
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

async function seedClass(classId: string, teacherId: string, students: string[]): Promise<void> {
  await db.collection("classes").doc(classId).set({
    name: classId, organizationId: "org-1", teacherId, joinCode: classId.toUpperCase(),
    createdAt: 1, updatedAt: 1, memberCount: 1 + students.length, status: "active",
  });
  const members = db.collection("classes").doc(classId).collection("members");
  await members.doc(teacherId).set({ uid: teacherId, role: "teacher", displayName: `Öğretmen ${teacherId}` });
  for (const uid of students) {
    await members.doc(uid).set({ uid, role: "student", displayName: `Öğrenci ${uid}` });
  }
}

async function seedQuestion(questionId: string, classId: string, ownerId: string): Promise<void> {
  await db.collection("questions").doc(questionId).set({
    ownerId, classId, organizationId: "org-1", visibility: "class", posterRole: "student",
    subject: "Matematik", topic: "Denklemler", gradeLevel: "8",
    description: "3x + 4 = 16 denkleminde x kaçtır?", imageUrl: null,
    createdAt: 1, likeCount: 0, commentCount: 0, answerCount: 0,
  });
}

interface SubmissionSeed {
  authorId: string;
  classId: string;
  questionId: string;
  text?: string;
  status?: string;
  createdAt?: number;
  targetType?: "question_comment" | "answer_image";
}

/** The record submitQuestionCommentForModeration writes — same fields, same
 *  nulls — with the decision taken by the REAL decision layer on the text. */
async function seedSubmission(seed: SubmissionSeed): Promise<string> {
  const operationId = nextId("op");
  const submissionId = `${seed.authorId}_${operationId}`;
  const text = seed.text ?? REVIEW_TEXT;
  const decision = decideTextModeration({ rules: evaluateTextRules(normalizeForModeration(text)), provider: null });
  const status = seed.status ?? decision.state;
  const createdAt = seed.createdAt ?? Date.now();
  await db.collection("moderationSubmissions").doc(submissionId).set({
    submissionId, authorId: seed.authorId, targetType: seed.targetType ?? "question_comment",
    questionId: seed.questionId, classId: seed.classId, organizationId: "org-1", text,
    status, riskCategories: decision.categories, decisionReason: decision.reason, operationId,
    publishedEntityId: null, createdAt, updatedAt: createdAt, reviewedAt: null, reviewedBy: null, schemaVersion: 1,
  });
  return submissionId;
}

async function submission(id: string): Promise<Record<string, unknown>> {
  return (await db.collection("moderationSubmissions").doc(id).get()).data() ?? {};
}

async function commentsFor(questionId: string): Promise<Record<string, unknown>[]> {
  const snap = await db.collection("questionComments").where("questionId", "==", questionId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  }
}

async function snapshotStudy(uid: string): Promise<string> {
  const [events, items] = await Promise.all([
    db.collection("users").doc(uid).collection("studyEvents").get(),
    db.collection("users").doc(uid).collection("studyItems").get(),
  ]);
  return JSON.stringify({ e: events.docs.map((d) => [d.id, d.data()]), i: items.docs.map((d) => [d.id, d.data()]) });
}

beforeAll(async () => {
  await seedClass(CLASS_A, TEACHER_A, [STUDENT_1, STUDENT_2]);
  await seedClass(CLASS_B, TEACHER_B, []);
  await seedQuestion(QUESTION_A, CLASS_A, STUDENT_2);
  await seedQuestion(QUESTION_B, CLASS_B, TEACHER_B);
});

// ---------------------------------------------------------------------------
// Pre-Phase-98 terminality: the decision layer sends this text to a human, and
// the only human path that existed (Phase 97) refuses it.
// ---------------------------------------------------------------------------

describe("before Phase 98, a review-verdict comment had no resolver", () => {
  it("the real decision layer routes it to manual_review, and the Phase 97 answer path refuses it", async () => {
    const id = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: QUESTION_A });
    expect((await submission(id)).status).toBe("manual_review");
    expect((await submission(id)).decisionReason).toBe("uncertain");
    // Not in the answer queue…
    const answers = await loadAnswerReviewQueue(db, TEACHER_A, { classId: CLASS_A });
    expect(answers.items.map((i) => i.submissionId)).not.toContain(id);
    // …and not decidable through the answer callable, even by the right teacher.
    expect(await code(applyAnswerReview(db, {} as never, TEACHER_A, { submissionId: id, decision: "approve" }))).toBe("failed-precondition");
    expect((await submission(id)).status).toBe("manual_review");
    expect(await commentsFor(QUESTION_A)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

describe("comment review queue", () => {
  let pending1: string;
  let pending2: string;
  beforeAll(async () => {
    pending1 = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: QUESTION_A, createdAt: 1000 });
    pending2 = await seedSubmission({ authorId: STUDENT_2, classId: CLASS_A, questionId: QUESTION_A, createdAt: 2000, text: "beni ara 0532 123 45 67" });
    await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: QUESTION_A, text: "Güzel çözüm.", createdAt: 500 }); // approved
    await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: QUESTION_A, text: "seni geberteceğim", createdAt: 600 }); // rejected
    await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: QUESTION_A, createdAt: 700, targetType: "answer_image" }); // wrong kind
    await seedSubmission({ authorId: STUDENT_1, classId: CLASS_B, questionId: QUESTION_B, createdAt: 800 }); // other class
  });

  it("lists this class's reviewable comments only, oldest first, with the text and context", async () => {
    const page = await loadCommentReviewQueue(db, TEACHER_A, { classId: CLASS_A });
    const ids = page.items.map((i) => i.submissionId);
    expect(ids.slice(0, 2)).toEqual([pending1, pending2]);
    expect(ids).not.toContain(await (async () => (await db.collection("moderationSubmissions").where("targetType", "==", "answer_image").get()).docs[0]?.id)());
    expect(page.items[0]?.text).toBe(REVIEW_TEXT);
    expect(page.items[0]?.reviewReason).toBe("uncertain");
    expect(page.items[0]?.author.displayName).toBe(`Öğrenci ${STUDENT_1}`);
    expect(page.items[0]?.question.description).toContain("3x + 4 = 16");
    expect(page.pageSize).toBe(REVIEW_QUEUE_PAGE_SIZE);
    const json = JSON.stringify(page.items[0]);
    expect(json).not.toContain('"authorId"');
    expect(json).not.toContain("riskCategories");
    expect(json).not.toContain("reviewedBy");
  });

  it.each([
    ["unrelated teacher", TEACHER_B],
    ["student", STUDENT_1],
    ["org admin", ORG_ADMIN],
    ["platform admin", PLATFORM_ADMIN],
    ["outsider", OUTSIDER],
  ])("%s is denied", async (_label, uid) => {
    expect(await code(loadCommentReviewQueue(db, uid, { classId: CLASS_A }))).toBe("permission-denied");
  });

  it("anonymous is unauthenticated", async () => {
    expect(await code(loadCommentReviewQueue(db, undefined, { classId: CLASS_A }))).toBe("unauthenticated");
  });

  it("pages are bounded and deterministic", async () => {
    const CLASS_C = "class-c-comments";
    await seedClass(CLASS_C, "teacher-c", [STUDENT_1]);
    await seedQuestion("question-c", CLASS_C, "teacher-c");
    const seeded: string[] = [];
    for (let i = 0; i < REVIEW_QUEUE_PAGE_SIZE + 2; i += 1) {
      seeded.push(await seedSubmission({ authorId: STUDENT_1, classId: CLASS_C, questionId: "question-c", createdAt: 10_000 + i }));
    }
    const first = await loadCommentReviewQueue(db, "teacher-c", { classId: CLASS_C });
    expect(first.items).toHaveLength(REVIEW_QUEUE_PAGE_SIZE);
    const second = await loadCommentReviewQueue(db, "teacher-c", { classId: CLASS_C, cursor: first.nextCursor });
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    const all = [...first.items, ...second.items].map((i) => i.submissionId);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(seeded);
  });
});

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

describe("comment review detail", () => {
  let id: string;
  beforeAll(async () => {
    id = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: QUESTION_A });
  });

  it("gives the class teacher the text and context, nothing internal", async () => {
    const detail = await loadCommentReviewDetail(db, TEACHER_A, { submissionId: id });
    expect(detail.status).toBe("manual_review");
    expect(detail.text).toBe(REVIEW_TEXT);
    expect(JSON.stringify(detail)).not.toMatch(/authorId|riskCategories|reviewedBy/);
  });

  it.each([
    ["other class teacher", TEACHER_B],
    ["author", STUDENT_1],
    ["classmate", STUDENT_2],
    ["org admin", ORG_ADMIN],
    ["platform admin", PLATFORM_ADMIN],
    ["outsider", OUTSIDER],
  ])("%s is denied", async (_label, uid) => {
    expect(await code(loadCommentReviewDetail(db, uid, { submissionId: id }))).toBe("permission-denied");
  });

  it("an answer submission is refused by the comment path (kinds never mix)", async () => {
    const answerId = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: QUESTION_A, targetType: "answer_image" });
    expect(await code(loadCommentReviewDetail(db, TEACHER_A, { submissionId: answerId }))).toBe("failed-precondition");
    expect(await code(applyCommentReview(db, TEACHER_A, { submissionId: answerId, decision: "approve" }))).toBe("failed-precondition");
  });
});

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

describe("comment approval", () => {
  it("publishes exactly one comment, the retained text, through the canonical shape; retry returns it", async () => {
    const q = nextId("q-approve");
    await seedQuestion(q, CLASS_A, STUDENT_2);
    const id = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q });
    const studyBefore = await snapshotStudy(STUDENT_1);

    const first = await applyCommentReview(db, TEACHER_A, { submissionId: id, decision: "approve" }, 5000);
    expect(first.status).toBe("approved");
    expect(first.alreadyDecided).toBe(false);
    const comments = await commentsFor(q);
    expect(comments).toHaveLength(1);
    const comment = comments[0] as Record<string, unknown>;
    expect(comment.id).toBe(first.publishedEntityId);
    const expected = buildPublishedCommentDocument({ questionId: q, ownerId: STUDENT_1, text: REVIEW_TEXT, now: 5000 });
    expect(Object.keys(comment).sort()).toEqual(["id", ...Object.keys(expected)].sort());
    expect(comment.ownerId).toBe(STUDENT_1);
    expect(comment.text).toBe(REVIEW_TEXT);
    expect(comment.status).toBe("active");
    expect((comment.createdAt as { toMillis(): number }).toMillis()).toBe(5000);

    const sub = await submission(id);
    expect(sub.status).toBe("approved");
    expect(sub.publishedEntityId).toBe(first.publishedEntityId);
    expect(sub.reviewedAt).toBe(5000);
    expect(sub.reviewedBy).toBe(TEACHER_A);
    expect(sub.text).toBe(REVIEW_TEXT);
    expect(sub.decisionReason).toBe("uncertain");

    const retry = await applyCommentReview(db, TEACHER_A, { submissionId: id, decision: "approve" }, 6000);
    expect(retry.alreadyDecided).toBe(true);
    expect(retry.publishedEntityId).toBe(first.publishedEntityId);
    expect(await commentsFor(q)).toHaveLength(1);
    expect((await submission(id)).reviewedAt).toBe(5000);
    expect(await snapshotStudy(STUDENT_1)).toBe(studyBefore);
  });

  it("two sessions approving concurrently yield ONE comment", async () => {
    const q = nextId("q-race");
    await seedQuestion(q, CLASS_A, STUDENT_2);
    const id = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q });
    const [a, b] = await Promise.all([
      applyCommentReview(db, TEACHER_A, { submissionId: id, decision: "approve" }),
      applyCommentReview(db, TEACHER_A, { submissionId: id, decision: "approve" }),
    ]);
    expect(a.publishedEntityId).toBe(b.publishedEntityId);
    expect([a.alreadyDecided, b.alreadyDecided].filter(Boolean)).toHaveLength(1);
    expect(await commentsFor(q)).toHaveLength(1);
  });

  it.each([
    ["student author", STUDENT_1],
    ["other student", STUDENT_2],
    ["unrelated teacher", TEACHER_B],
    ["org admin", ORG_ADMIN],
    ["platform admin", PLATFORM_ADMIN],
    ["outsider", OUTSIDER],
  ])("%s cannot approve or reject, and nothing is written", async (_label, uid) => {
    const q = nextId("q-deny");
    await seedQuestion(q, CLASS_A, STUDENT_2);
    const id = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q });
    const before = JSON.stringify(await submission(id));
    expect(await code(applyCommentReview(db, uid, { submissionId: id, decision: "approve" }))).toBe("permission-denied");
    expect(await code(applyCommentReview(db, uid, { submissionId: id, decision: "reject" }))).toBe("permission-denied");
    expect(JSON.stringify(await submission(id))).toBe(before);
    expect(await commentsFor(q)).toHaveLength(0);
  });

  it("the class teacher cannot review their own comment", async () => {
    const q = nextId("q-self");
    await seedQuestion(q, CLASS_A, STUDENT_2);
    const id = await seedSubmission({ authorId: TEACHER_A, classId: CLASS_A, questionId: q });
    expect(await code(applyCommentReview(db, TEACHER_A, { submissionId: id, decision: "approve" }))).toBe("permission-denied");
    expect(await code(applyCommentReview(db, TEACHER_A, { submissionId: id, decision: "reject" }))).toBe("permission-denied");
    expect(await code(loadCommentReviewDetail(db, TEACHER_A, { submissionId: id }))).toBe("permission-denied");
    expect((await submission(id)).status).toBe("manual_review");
    expect(await commentsFor(q)).toHaveLength(0);
  });

  it("final decisions stay final", async () => {
    const q = nextId("q-final");
    await seedQuestion(q, CLASS_A, STUDENT_2);
    const rejected = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q, text: "seni geberteceğim" });
    expect((await submission(rejected)).status).toBe("rejected");
    expect(await code(applyCommentReview(db, TEACHER_A, { submissionId: rejected, decision: "approve" }))).toBe("failed-precondition");
    expect(await commentsFor(q)).toHaveLength(0);
    const approved = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q });
    await applyCommentReview(db, TEACHER_A, { submissionId: approved, decision: "approve" });
    expect(await code(applyCommentReview(db, TEACHER_A, { submissionId: approved, decision: "reject" }))).toBe("failed-precondition");
    expect(await commentsFor(q)).toHaveLength(1);
  });

  it("a submission whose question is in another class is refused for both teachers", async () => {
    const q = nextId("q-mismatch");
    await seedQuestion(q, CLASS_B, TEACHER_B);
    const id = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q });
    expect(await code(applyCommentReview(db, TEACHER_A, { submissionId: id, decision: "approve" }))).toBe("permission-denied");
    expect(await code(applyCommentReview(db, TEACHER_B, { submissionId: id, decision: "approve" }))).toBe("permission-denied");
  });
});

// ---------------------------------------------------------------------------
// Rejection
// ---------------------------------------------------------------------------

describe("comment rejection", () => {
  it("records the decision, creates nothing, retries safely, and settles one state under a race", async () => {
    const q = nextId("q-reject");
    await seedQuestion(q, CLASS_A, STUDENT_2);
    const id = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q });
    const first = await applyCommentReview(db, TEACHER_A, { submissionId: id, decision: "reject" }, 7000);
    expect(first).toEqual({ submissionId: id, status: "rejected", publishedEntityId: null, alreadyDecided: false });
    const sub = await submission(id);
    expect(sub.status).toBe("rejected");
    expect(sub.reviewedAt).toBe(7000);
    expect(sub.reviewedBy).toBe(TEACHER_A);
    expect(await commentsFor(q)).toHaveLength(0);
    const retry = await applyCommentReview(db, TEACHER_A, { submissionId: id, decision: "reject" }, 8000);
    expect(retry.alreadyDecided).toBe(true);
    expect((await submission(id)).reviewedAt).toBe(7000);

    const raceId = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q });
    const [a, b] = await Promise.all([
      applyCommentReview(db, TEACHER_A, { submissionId: raceId, decision: "reject" }),
      applyCommentReview(db, TEACHER_A, { submissionId: raceId, decision: "reject" }),
    ]);
    expect([a.alreadyDecided, b.alreadyDecided].filter(Boolean)).toHaveLength(1);
    expect(await commentsFor(q)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Ownership after approval — Phase 93 is untouched.
// ---------------------------------------------------------------------------

describe("a manually approved comment belongs to its author", () => {
  it("the author deletes it through the Phase 93 gateway; the reviewing teacher cannot", async () => {
    const q = nextId("q-own");
    await seedQuestion(q, CLASS_A, STUDENT_2);
    const id = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q });
    const { publishedEntityId } = await applyCommentReview(db, TEACHER_A, { submissionId: id, decision: "approve" });
    const commentId = String(publishedEntityId);

    // The reviewer gained no delete.
    expect(await code(applyDeleteQuestionComment(db, TEACHER_A, { commentId }))).toBe("permission-denied");
    expect(await commentsFor(q)).toHaveLength(1);

    // The author keeps theirs, retry-safe.
    expect(await applyDeleteQuestionComment(db, STUDENT_1, { commentId })).toEqual({ deleted: true });
    expect(await applyDeleteQuestionComment(db, STUDENT_1, { commentId })).toEqual({ deleted: false });
    expect(await commentsFor(q)).toHaveLength(0);
    // The submission's audit trail is untouched by the deletion.
    expect((await submission(id)).status).toBe("approved");
  });
});
