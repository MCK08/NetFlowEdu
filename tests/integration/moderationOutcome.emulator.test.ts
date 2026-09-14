import { deleteApp, initializeApp } from "../../functions/node_modules/firebase-admin/lib/app";
import { getFirestore } from "../../functions/node_modules/firebase-admin/lib/firestore";
import { getStorage } from "../../functions/node_modules/firebase-admin/lib/storage";
import type { App } from "../../functions/node_modules/firebase-admin/lib/app";
import type { Firestore } from "../../functions/node_modules/firebase-admin/lib/firestore";

import { buildQuarantinePath } from "../../functions/src/moderation/answerPublication";
import { MODERATION_ACTOR_ID } from "../../functions/src/moderation/moderationOutcome";
import { applyAnswerReview } from "../../functions/src/review/answerReview";
import { applyCommentReview } from "../../functions/src/review/commentReview";

// Phase 99 — the author's moderation outcome, against real Firestore and real
// Storage, driving the SHIPPED review handlers.
//
// The outcome notification is written inside the review transaction, not by a
// trigger, so unlike answerCount it is fully observable in this harness (which
// runs without the Functions emulator). What that buys: every assertion below
// about "exactly one" is a real transaction result under a real race, not a
// simulation.
//
// The property worth protecting is narrow and easy to lose: ONE outcome per
// submission, addressed to the author, carrying no reviewer. A retry, a
// concurrent second session and a re-delivered call must all land on the same
// document, and a refused review must leave the inbox completely untouched —
// a student must never be told their content was published by a call that was
// denied.

const PROJECT_ID = "netflow-edu-moderation-outcome-test";
const BUCKET = `${PROJECT_ID}.appspot.com`;

const TEACHER_A = "teacher-a";
const TEACHER_B = "teacher-b";
const AUTHOR = "student-author";
const OWNER = "student-owner";
const CLASSMATE = "student-classmate";
const OUTSIDER = "outsider-9";
const CLASS_A = "class-a";
const CLASS_B = "class-b";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

let app: App;
let db: Firestore;
let bucket: ReturnType<ReturnType<typeof getStorage>["bucket"]>;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
  app = initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET }, `outcome-${Date.now()}`);
  db = getFirestore(app);
  bucket = getStorage(app).bucket();
});

afterAll(async () => {
  await deleteApp(app);
});

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${(seq += 1)}`;

async function seedClass(classId: string, teacherId: string, students: string[]): Promise<void> {
  await db.collection("classes").doc(classId).set({
    name: classId, organizationId: "org-1", teacherId, joinCode: classId.toUpperCase(),
    createdAt: 1, updatedAt: 1, memberCount: 1 + students.length, status: "active",
  });
  const members = db.collection("classes").doc(classId).collection("members");
  await members.doc(teacherId).set({ uid: teacherId, role: "teacher", displayName: "Öğretmen" });
  for (const uid of students) {
    await members.doc(uid).set({ uid, role: "student", displayName: `Öğrenci ${uid}` });
  }
}

async function seedQuestion(questionId: string, classId: string, ownerId = OWNER): Promise<void> {
  await db.collection("questions").doc(questionId).set({
    ownerId, classId, organizationId: "org-1", visibility: "class", posterRole: "student",
    subject: "Matematik", topic: "Denklemler", gradeLevel: "8",
    description: "3x + 4 = 16 denkleminde x kaçtır?", imageUrl: null,
    createdAt: 1, likeCount: 0, commentCount: 0, answerCount: 0,
  });
}

async function seedAnswerSubmission(questionId: string, classId = CLASS_A, authorId = AUTHOR): Promise<string> {
  const operationId = nextId("op");
  const submissionId = `${authorId}_${operationId}`;
  const quarantinePath = buildQuarantinePath(authorId, submissionId, "image/png");
  await bucket.file(quarantinePath).save(PNG, { contentType: "image/png" });
  const now = Date.now();
  await db.collection("moderationSubmissions").doc(submissionId).set({
    submissionId, authorId, targetType: "answer_image", questionId, classId,
    organizationId: "org-1", quarantinePath, method: "drawing", status: "manual_review",
    riskCategories: ["provider_unavailable"], decisionReason: "provider_unavailable",
    operationId, publishedEntityId: null, createdAt: now, updatedAt: now, scannedAt: now,
    reviewedAt: null, reviewedBy: null, schemaVersion: 1,
  });
  return submissionId;
}

async function seedCommentSubmission(questionId: string, classId = CLASS_A, authorId = AUTHOR): Promise<string> {
  const operationId = nextId("op");
  const submissionId = `${authorId}_${operationId}`;
  const now = Date.now();
  await db.collection("moderationSubmissions").doc(submissionId).set({
    submissionId, authorId, targetType: "question_comment", questionId, classId,
    organizationId: "org-1", text: "Bence cevap 4 olmalı.", status: "manual_review",
    riskCategories: ["uncertain"], decisionReason: "uncertain", operationId,
    publishedEntityId: null, createdAt: now, updatedAt: now, scannedAt: now,
    reviewedAt: null, reviewedBy: null, schemaVersion: 1,
  });
  return submissionId;
}

async function outcomes(uid: string): Promise<Record<string, unknown>[]> {
  const snap = await db.collection("users").doc(uid).collection("notifications").get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((n) => /_review_(approved|rejected)$/.test(String((n as { type?: string }).type)));
}

const outcomesFor = async (uid: string, submissionId: string) =>
  (await outcomes(uid)).filter((n) => (n as { entityId?: string }).entityId === submissionId);

/** The single outcome for one submission — fails the test if there is not
 *  exactly one, which is the invariant every caller here is checking anyway. */
async function theOutcome(uid: string, submissionId: string): Promise<Record<string, unknown>> {
  const found = await outcomesFor(uid, submissionId);
  expect(found).toHaveLength(1);
  return found[0] as Record<string, unknown>;
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  }
}

beforeAll(async () => {
  await seedClass(CLASS_A, TEACHER_A, [AUTHOR, OWNER, CLASSMATE]);
  await seedClass(CLASS_B, TEACHER_B, []);
});

describe("an approved answer tells its author, exactly once", () => {
  it("the author receives one outcome naming neither the teacher nor the machine reason", async () => {
    const questionId = nextId("q");
    await seedQuestion(questionId, CLASS_A);
    const submissionId = await seedAnswerSubmission(questionId);

    expect(await outcomesFor(AUTHOR, submissionId)).toHaveLength(0);
    await applyAnswerReview(db, bucket, TEACHER_A, { submissionId, decision: "approve" });

    const outcome = await theOutcome(AUTHOR, submissionId);
    expect(outcome.type).toBe("answer_review_approved");
    expect(outcome.recipientId).toBe(AUTHOR);
    // The reviewer decided it; the platform says it.
    expect(outcome.actorId).toBe(MODERATION_ACTOR_ID);
    expect(JSON.stringify(outcome)).not.toContain(TEACHER_A);
    expect(JSON.stringify(outcome)).not.toContain("provider_unavailable");
    // Routing: the parent question, never the moderation submission.
    expect(outcome.parentEntityId).toBe(questionId);
    expect(outcome.entityType).toBe("moderation");
  });

  it("a retry after a lost response produces no second notification", async () => {
    const questionId = nextId("q");
    await seedQuestion(questionId, CLASS_A);
    const submissionId = await seedAnswerSubmission(questionId);

    await applyAnswerReview(db, bucket, TEACHER_A, { submissionId, decision: "approve" });
    const first = await theOutcome(AUTHOR, submissionId);
    await applyAnswerReview(db, bucket, TEACHER_A, { submissionId, decision: "approve" });
    const afterRetry = await theOutcome(AUTHOR, submissionId);

    expect(afterRetry.id).toBe(first.id);
  });

  it("two sessions approving at the same instant produce ONE notification", async () => {
    const questionId = nextId("q");
    await seedQuestion(questionId, CLASS_A);
    const submissionId = await seedAnswerSubmission(questionId);

    await Promise.allSettled([
      applyAnswerReview(db, bucket, TEACHER_A, { submissionId, decision: "approve" }),
      applyAnswerReview(db, bucket, TEACHER_A, { submissionId, decision: "approve" }),
    ]);

    expect(await outcomesFor(AUTHOR, submissionId)).toHaveLength(1);
  });
});

describe("a rejected answer still tells its author", () => {
  it("the outcome exists even though no answer document does", async () => {
    // The whole point of Phase 99: rejection produces no content anywhere, so
    // this notification is the student's only durable record of the result.
    const questionId = nextId("q");
    await seedQuestion(questionId, CLASS_A);
    const submissionId = await seedAnswerSubmission(questionId);

    await applyAnswerReview(db, bucket, TEACHER_A, { submissionId, decision: "reject" });

    const outcome = await theOutcome(AUTHOR, submissionId);
    expect(outcome.type).toBe("answer_review_rejected");
    expect(outcome.parentEntityId).toBe(questionId);
    const answers = await db.collection("answers").where("questionId", "==", questionId).get();
    expect(answers.size).toBe(0);
  });

  it("a retried rejection produces no second notification", async () => {
    const questionId = nextId("q");
    await seedQuestion(questionId, CLASS_A);
    const submissionId = await seedAnswerSubmission(questionId);

    await applyAnswerReview(db, bucket, TEACHER_A, { submissionId, decision: "reject" });
    await applyAnswerReview(db, bucket, TEACHER_A, { submissionId, decision: "reject" });

    expect(await outcomesFor(AUTHOR, submissionId)).toHaveLength(1);
  });

  it("two submissions on the SAME question each get their own outcome", async () => {
    // A question-keyed identity would silently merge these and the student
    // would never learn the second answer was refused too.
    const questionId = nextId("q");
    await seedQuestion(questionId, CLASS_A);
    const first = await seedAnswerSubmission(questionId);
    const second = await seedAnswerSubmission(questionId);

    await applyAnswerReview(db, bucket, TEACHER_A, { submissionId: first, decision: "reject" });
    await applyAnswerReview(db, bucket, TEACHER_A, { submissionId: second, decision: "reject" });

    const ids = new Set([
      (await theOutcome(AUTHOR, first)).id,
      (await theOutcome(AUTHOR, second)).id,
    ]);
    expect(ids.size).toBe(2);
  });
});

describe("comments follow the same contract", () => {
  it("approval notifies the author once and publishes one comment", async () => {
    const questionId = nextId("q");
    await seedQuestion(questionId, CLASS_A);
    const submissionId = await seedCommentSubmission(questionId);

    await applyCommentReview(db, TEACHER_A, { submissionId, decision: "approve" });
    await applyCommentReview(db, TEACHER_A, { submissionId, decision: "approve" });

    expect((await theOutcome(AUTHOR, submissionId)).type).toBe("comment_review_approved");
    const comments = await db.collection("questionComments").where("questionId", "==", questionId).get();
    expect(comments.size).toBe(1);
  });

  it("rejection notifies the author once and publishes nothing", async () => {
    const questionId = nextId("q");
    await seedQuestion(questionId, CLASS_A);
    const submissionId = await seedCommentSubmission(questionId);

    await applyCommentReview(db, TEACHER_A, { submissionId, decision: "reject" });
    await applyCommentReview(db, TEACHER_A, { submissionId, decision: "reject" });

    expect((await theOutcome(AUTHOR, submissionId)).type).toBe("comment_review_rejected");
    const comments = await db.collection("questionComments").where("questionId", "==", questionId).get();
    expect(comments.size).toBe(0);
  });
});

describe("a review that is refused tells nobody anything", () => {
  it.each([
    ["the author themselves", AUTHOR],
    ["a classmate", CLASSMATE],
    ["a teacher of another class", TEACHER_B],
    ["an outsider", OUTSIDER],
  ])("%s cannot produce an outcome notification", async (_label, uid) => {
    const questionId = nextId("q");
    await seedQuestion(questionId, CLASS_A);
    const submissionId = await seedAnswerSubmission(questionId);

    expect(await codeOf(applyAnswerReview(db, bucket, uid, { submissionId, decision: "approve" })))
      .toBe("permission-denied");
    expect(await outcomesFor(AUTHOR, submissionId)).toHaveLength(0);
    expect(await outcomesFor(uid, submissionId)).toHaveLength(0);
  });

  it("an anonymous caller produces nothing", async () => {
    const questionId = nextId("q");
    await seedQuestion(questionId, CLASS_A);
    const submissionId = await seedAnswerSubmission(questionId);

    expect(await codeOf(applyAnswerReview(db, bucket, undefined, { submissionId, decision: "approve" })))
      .toBe("unauthenticated");
    expect(await outcomesFor(AUTHOR, submissionId)).toHaveLength(0);
  });

  it("a cross-class teacher cannot notify another class's student", async () => {
    const questionId = nextId("q");
    await seedQuestion(questionId, CLASS_B);
    const submissionId = await seedAnswerSubmission(questionId, CLASS_B);

    expect(await codeOf(applyAnswerReview(db, bucket, TEACHER_A, { submissionId, decision: "approve" })))
      .toBe("permission-denied");
    expect(await outcomesFor(AUTHOR, submissionId)).toHaveLength(0);
  });

  it("extra request fields cannot redirect the outcome to someone else", async () => {
    const questionId = nextId("q");
    await seedQuestion(questionId, CLASS_A);
    const submissionId = await seedAnswerSubmission(questionId);

    await applyAnswerReview(db, bucket, TEACHER_A, {
      submissionId,
      decision: "reject",
      recipientId: CLASSMATE,
      authorId: CLASSMATE,
      reviewedBy: CLASSMATE,
    } as { submissionId: string; decision: "reject" });

    expect(await outcomesFor(CLASSMATE, submissionId)).toHaveLength(0);
    expect(await outcomesFor(AUTHOR, submissionId)).toHaveLength(1);
    const submission = (await db.collection("moderationSubmissions").doc(submissionId).get()).data() ?? {};
    expect(submission.reviewedBy).toBe(TEACHER_A);
  });
});
