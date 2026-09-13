// Phase 97 — class-scoped manual answer review, against real Firestore and
// real Storage emulators.
//
// Drives the SHIPPED handlers (loadAnswerReviewQueue, loadAnswerReviewDetail,
// applyAnswerReview) — the onCall wrappers delegate to them with the Admin
// db/bucket injected, the same pattern the Phase 88 revision gateway test
// established. Everything this file asserts depends on real transaction
// semantics: one answer under concurrent approval, a refused call writing
// nothing, an object-bound media token that actually serves the bytes.
//
// What is NOT here: answerCount and the publication notification. Those are
// onAnswerCreate's, a trigger the rules emulator suite does not load; they are
// proven per document by Phase 95 and re-proven end-to-end in the Phase 97
// runtime QA with the Functions emulator. This file proves the input they
// depend on — exactly one answer document per approval — under every race.

import { deleteApp, initializeApp } from "../../functions/node_modules/firebase-admin/lib/app";
import { getFirestore } from "../../functions/node_modules/firebase-admin/lib/firestore";
import { getStorage } from "../../functions/node_modules/firebase-admin/lib/storage";
import type { App } from "../../functions/node_modules/firebase-admin/lib/app";
import type { Firestore } from "../../functions/node_modules/firebase-admin/lib/firestore";

import { buildPublishedAnswerDocument } from "../../functions/src/moderation/answerFinalization";
import { buildQuarantinePath, buildReviewAccessPath } from "../../functions/src/moderation/answerPublication";
import {
  applyAnswerReview,
  loadAnswerReviewDetail,
  loadAnswerReviewQueue,
  REVIEW_QUEUE_PAGE_SIZE,
} from "../../functions/src/review/answerReview";

const PROJECT_ID = "netflow-edu-answer-review-test";
const BUCKET = `${PROJECT_ID}.appspot.com`;
const STORAGE_HOST = "127.0.0.1:9199";

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

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

let app: App;
let db: Firestore;
let bucket: ReturnType<ReturnType<typeof getStorage>["bucket"]>;

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = STORAGE_HOST;
  app = initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET }, `review-${Date.now()}`);
  db = getFirestore(app);
  bucket = getStorage(app).bucket();
});

afterAll(async () => {
  await deleteApp(app);
});

// ---------------------------------------------------------------------------
// Fixtures — documents shaped exactly as the shipped code writes them.
// ---------------------------------------------------------------------------

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

async function seedClass(classId: string, teacherId: string, students: string[]): Promise<void> {
  await db.collection("classes").doc(classId).set({
    name: classId,
    organizationId: "org-1",
    teacherId,
    joinCode: classId.toUpperCase(),
    createdAt: 1,
    updatedAt: 1,
    memberCount: 1 + students.length,
    status: "active",
  });
  const members = db.collection("classes").doc(classId).collection("members");
  await members.doc(teacherId).set({ uid: teacherId, role: "teacher", displayName: `Öğretmen ${teacherId}` });
  for (const uid of students) {
    await members.doc(uid).set({ uid, role: "student", displayName: `Öğrenci ${uid}` });
  }
}

async function seedQuestion(questionId: string, classId: string, ownerId: string): Promise<void> {
  await db.collection("questions").doc(questionId).set({
    ownerId,
    classId,
    organizationId: "org-1",
    visibility: "class",
    posterRole: "teacher",
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "8",
    description: "3x + 4 = 16 denkleminde x kaçtır?",
    imageUrl: null,
    createdAt: 1,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
  });
}

interface SubmissionSeed {
  authorId: string;
  classId: string;
  questionId: string;
  status?: string;
  reason?: string;
  createdAt?: number;
  upload?: boolean;
}

/** The record submitAnswerForModeration writes for a manual_review outcome —
 *  same fields, same nulls — plus the quarantined object it refers to. */
async function seedSubmission(seed: SubmissionSeed): Promise<string> {
  const operationId = nextId("op");
  const submissionId = `${seed.authorId}_${operationId}`;
  const quarantinePath = buildQuarantinePath(seed.authorId, submissionId, "image/png");
  if (seed.upload !== false) {
    await bucket.file(quarantinePath).save(PNG, { contentType: "image/png" });
  }
  const status = seed.status ?? "manual_review";
  const createdAt = seed.createdAt ?? Date.now();
  await db.collection("moderationSubmissions").doc(submissionId).set({
    submissionId,
    authorId: seed.authorId,
    targetType: "answer_image",
    questionId: seed.questionId,
    classId: seed.classId,
    organizationId: "org-1",
    quarantinePath,
    method: "drawing",
    status,
    riskCategories: status === "manual_review" ? [seed.reason ?? "provider_unavailable"] : [],
    decisionReason: seed.reason ?? (status === "manual_review" ? "provider_unavailable" : "clean_all_signals"),
    operationId,
    publishedEntityId: null,
    createdAt,
    updatedAt: createdAt,
    scannedAt: createdAt,
    reviewedAt: null,
    reviewedBy: null,
    schemaVersion: 1,
  });
  return submissionId;
}

async function submission(id: string): Promise<Record<string, unknown>> {
  return (await db.collection("moderationSubmissions").doc(id).get()).data() ?? {};
}

async function answersFor(questionId: string): Promise<Record<string, unknown>[]> {
  const snap = await db.collection("answers").where("questionId", "==", questionId).get();
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
  await seedQuestion(QUESTION_A, CLASS_A, TEACHER_A);
  await seedQuestion(QUESTION_B, CLASS_B, TEACHER_B);
  for (const uid of [ORG_ADMIN, PLATFORM_ADMIN]) {
    await db.collection("users").doc(uid).set({ uid, role: uid === ORG_ADMIN ? "organization_admin" : "platform_admin" });
  }
});

// ---------------------------------------------------------------------------
// Queue — Q1..Q13
// ---------------------------------------------------------------------------

describe("review queue", () => {
  let pending1: string;
  let pending2: string;

  beforeAll(async () => {
    pending1 = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: QUESTION_A, createdAt: 1000 });
    pending2 = await seedSubmission({ authorId: STUDENT_2, classId: CLASS_A, questionId: QUESTION_A, createdAt: 2000, reason: "uncertain" });
    await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: QUESTION_A, status: "approved" });
    await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: QUESTION_A, status: "rejected" });
    await seedSubmission({ authorId: STUDENT_1, classId: CLASS_B, questionId: QUESTION_B, createdAt: 500 });
  });

  it("Q1 the class teacher lists their own queue, oldest first, reviewable only (Q7–Q10)", async () => {
    const page = await loadAnswerReviewQueue(db, TEACHER_A, { classId: CLASS_A });
    const ids = page.items.map((i) => i.submissionId);
    expect(ids).toEqual([pending1, pending2]);
    expect(page.items[0]?.reviewReason).toBe("provider_unavailable");
    expect(page.items[1]?.reviewReason).toBe("uncertain");
    expect(page.items[0]?.author.displayName).toBe(`Öğrenci ${STUDENT_1}`);
    expect(page.items[0]?.question.description).toContain("3x + 4 = 16");
    expect(page.pageSize).toBe(REVIEW_QUEUE_PAGE_SIZE);
    expect(page.nextCursor).toBeNull();
  });

  it("Q13 a queue item exposes no raw uid, storage path or reviewer identity", async () => {
    const page = await loadAnswerReviewQueue(db, TEACHER_A, { classId: CLASS_A });
    const json = JSON.stringify(page.items[0]);
    expect(json).not.toContain("moderation/pending");
    expect(json).not.toContain(`"authorId"`);
    expect(json).not.toContain("reviewedBy");
    expect(json).not.toContain("riskCategories");
  });

  it.each([
    ["Q2 unrelated teacher", TEACHER_B],
    ["Q3 student", STUDENT_1],
    ["Q4 org admin", ORG_ADMIN],
    ["Q5 platform admin", PLATFORM_ADMIN],
    ["Q6 outsider", OUTSIDER],
  ])("%s is denied", async (_label, uid) => {
    expect(await code(loadAnswerReviewQueue(db, uid, { classId: CLASS_A }))).toBe("permission-denied");
  });

  it("anonymous is unauthenticated", async () => {
    expect(await code(loadAnswerReviewQueue(db, undefined, { classId: CLASS_A }))).toBe("unauthenticated");
  });

  it("Q11/Q12 pages are bounded and pagination is deterministic with no overlap", async () => {
    const CLASS_C = "class-c";
    await seedClass(CLASS_C, "teacher-c", [STUDENT_1]);
    await seedQuestion("question-c", CLASS_C, "teacher-c");
    const seeded: string[] = [];
    for (let i = 0; i < REVIEW_QUEUE_PAGE_SIZE + 3; i += 1) {
      seeded.push(
        await seedSubmission({ authorId: STUDENT_1, classId: CLASS_C, questionId: "question-c", createdAt: 10_000 + i, upload: false }),
      );
    }
    const first = await loadAnswerReviewQueue(db, "teacher-c", { classId: CLASS_C });
    expect(first.items).toHaveLength(REVIEW_QUEUE_PAGE_SIZE);
    expect(first.nextCursor).not.toBeNull();
    const second = await loadAnswerReviewQueue(db, "teacher-c", { classId: CLASS_C, cursor: first.nextCursor });
    expect(second.items).toHaveLength(3);
    expect(second.nextCursor).toBeNull();
    const all = [...first.items, ...second.items].map((i) => i.submissionId);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(seeded);
    // The same cursor yields the same page.
    const again = await loadAnswerReviewQueue(db, "teacher-c", { classId: CLASS_C, cursor: first.nextCursor });
    expect(again.items.map((i) => i.submissionId)).toEqual(second.items.map((i) => i.submissionId));
  });
});

// ---------------------------------------------------------------------------
// Media — M1..M8
// ---------------------------------------------------------------------------

describe("review media access", () => {
  let id: string;
  beforeAll(async () => {
    id = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: QUESTION_A });
  });

  it("M1 the class teacher receives a working, object-bound image URL (M8)", async () => {
    const detail = await loadAnswerReviewDetail(db, bucket, TEACHER_A, { submissionId: id });
    expect(detail.status).toBe("manual_review");
    expect(detail.imageUrl).toMatch(/^http:\/\/127\.0\.0\.1:9199\/v0\/b\//);
    expect(detail.imageUrl).toContain("token=");
    // Bound to THIS submission's review copy — never the quarantine object
    // itself, and never another submission's.
    expect(decodeURIComponent(detail.imageUrl ?? "")).toContain(`moderation/review/${id}/upload.png`);
    expect(decodeURIComponent(detail.imageUrl ?? "")).not.toContain("moderation/pending");
    const res = await fetch(detail.imageUrl ?? "");
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it("M7 the same object without the token is not served", async () => {
    const detail = await loadAnswerReviewDetail(db, bucket, TEACHER_A, { submissionId: id });
    const bare = (detail.imageUrl ?? "").replace(/&token=[^&]+/, "");
    const res = await fetch(bare);
    expect(res.status).not.toBe(200);
  });

  it("each open replaces the previous review copy, so an older URL stops working", async () => {
    const a = await loadAnswerReviewDetail(db, bucket, TEACHER_A, { submissionId: id });
    const b = await loadAnswerReviewDetail(db, bucket, TEACHER_A, { submissionId: id });
    expect(a.imageUrl).not.toEqual(b.imageUrl);
    expect((await fetch(a.imageUrl ?? "")).status).not.toBe(200);
    expect((await fetch(b.imageUrl ?? "")).status).toBe(200);
  });

  it("the quarantine object itself carries no review token", async () => {
    await loadAnswerReviewDetail(db, bucket, TEACHER_A, { submissionId: id });
    const [meta] = await bucket.file(buildQuarantinePath(STUDENT_1, id, "image/png")).getMetadata();
    expect(meta.metadata?.firebaseStorageDownloadTokens ?? undefined).toBeUndefined();
  });

  it.each([
    ["M2 other class teacher", TEACHER_B],
    ["M3 student (author)", STUDENT_1],
    ["M3 student (classmate)", STUDENT_2],
    ["org admin", ORG_ADMIN],
    ["platform admin", PLATFORM_ADMIN],
    ["M4 outsider", OUTSIDER],
  ])("%s is denied", async (_label, uid) => {
    expect(await code(loadAnswerReviewDetail(db, bucket, uid, { submissionId: id }))).toBe("permission-denied");
  });

  it("M5 anonymous is unauthenticated", async () => {
    expect(await code(loadAnswerReviewDetail(db, bucket, undefined, { submissionId: id }))).toBe("unauthenticated");
  });
});

// ---------------------------------------------------------------------------
// Approval — A1..A13
// ---------------------------------------------------------------------------

describe("approval", () => {
  it("A1/A2 first approval publishes exactly one answer through the canonical shape; retry returns it", async () => {
    const q = nextId("q-approve");
    await seedQuestion(q, CLASS_A, TEACHER_A);
    const id = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q });
    const studyBefore = await snapshotStudy(STUDENT_1);
    const reviewUrl = (await loadAnswerReviewDetail(db, bucket, TEACHER_A, { submissionId: id })).imageUrl ?? "";
    expect((await fetch(reviewUrl)).status).toBe(200);

    const first = await applyAnswerReview(db, bucket, TEACHER_A, { submissionId: id, decision: "approve" }, 5000);
    expect(first.status).toBe("approved");
    expect(first.alreadyDecided).toBe(false);
    expect(first.publishedEntityId).toBeTruthy();

    const answers = await answersFor(q);
    expect(answers).toHaveLength(1);
    const answer = answers[0] as Record<string, unknown>;
    expect(answer.id).toBe(first.publishedEntityId);
    // Canonical shape: the same keys the finalizer defines, no review metadata.
    const expected = buildPublishedAnswerDocument({ questionId: q, ownerId: STUDENT_1, imageUrl: String(answer.imageUrl), method: "drawing", now: 5000 });
    expect(Object.keys(answer).sort()).toEqual(["id", ...Object.keys(expected)].sort());
    expect(answer.ownerId).toBe(STUDENT_1);
    expect(answer.questionId).toBe(q);
    expect(answer.method).toBe("drawing");
    expect(answer.likeCount).toBe(0);
    expect(answer.imageUrl).toContain(`answers/private/${q}/${STUDENT_1}/${id}.png`.replace(/\//g, "%2F"));
    expect((await fetch(String(answer.imageUrl))).status).toBe(200);

    const sub = await submission(id);
    expect(sub.status).toBe("approved");
    expect(sub.publishedEntityId).toBe(first.publishedEntityId);
    expect(sub.reviewedAt).toBe(5000);
    expect(sub.reviewedBy).toBe(TEACHER_A);
    // Immutable submission facts untouched.
    expect(sub.authorId).toBe(STUDENT_1);
    expect(sub.questionId).toBe(q);
    expect(sub.classId).toBe(CLASS_A);
    expect(sub.decisionReason).toBe("provider_unavailable");

    // Review access revoked: the review copy is gone, so the URL minted
    // before the decision no longer serves.
    expect((await bucket.file(buildReviewAccessPath(id, "image/png")).exists())[0]).toBe(false);
    expect((await fetch(reviewUrl)).status).not.toBe(200);

    const retry = await applyAnswerReview(db, bucket, TEACHER_A, { submissionId: id, decision: "approve" }, 6000);
    expect(retry.alreadyDecided).toBe(true);
    expect(retry.publishedEntityId).toBe(first.publishedEntityId);
    expect(await answersFor(q)).toHaveLength(1);
    expect((await submission(id)).reviewedAt).toBe(5000);

    // A10 approving an approved submission is the same safe no-op.
    const again = await applyAnswerReview(db, bucket, TEACHER_A, { submissionId: id, decision: "approve" });
    expect(again.alreadyDecided).toBe(true);
    expect(await answersFor(q)).toHaveLength(1);

    // Learning evidence: nothing written.
    expect(await snapshotStudy(STUDENT_1)).toBe(studyBefore);
  });

  it("A3 two sessions approving concurrently yield ONE answer document with a coherent image token", async () => {
    const q = nextId("q-race");
    await seedQuestion(q, CLASS_A, TEACHER_A);
    const id = await seedSubmission({ authorId: STUDENT_2, classId: CLASS_A, questionId: q });
    const [a, b] = await Promise.all([
      applyAnswerReview(db, bucket, TEACHER_A, { submissionId: id, decision: "approve" }),
      applyAnswerReview(db, bucket, TEACHER_A, { submissionId: id, decision: "approve" }),
    ]);
    expect(a.status).toBe("approved");
    expect(b.status).toBe("approved");
    expect(a.publishedEntityId).toBe(b.publishedEntityId);
    expect([a.alreadyDecided, b.alreadyDecided].filter(Boolean)).toHaveLength(1);
    const answers = await answersFor(q);
    expect(answers).toHaveLength(1);
    // The winning document's URL must be the token the object actually carries.
    expect((await fetch(String((answers[0] as Record<string, unknown>).imageUrl))).status).toBe(200);
  });

  it.each([
    ["A4 student author", STUDENT_1],
    ["other student", STUDENT_2],
    ["A5 unrelated teacher", TEACHER_B],
    ["A6 org admin", ORG_ADMIN],
    ["A7 platform admin", PLATFORM_ADMIN],
    ["A8 outsider", OUTSIDER],
  ])("%s cannot approve, and nothing is written", async (_label, uid) => {
    const q = nextId("q-deny");
    await seedQuestion(q, CLASS_A, TEACHER_A);
    const id = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q });
    const before = JSON.stringify(await submission(id));
    expect(await code(applyAnswerReview(db, bucket, uid, { submissionId: id, decision: "approve" }))).toBe("permission-denied");
    expect(JSON.stringify(await submission(id))).toBe(before);
    expect(await answersFor(q)).toHaveLength(0);
  });

  it("A9 the class teacher cannot approve their own submission", async () => {
    const q = nextId("q-self");
    await seedQuestion(q, CLASS_A, TEACHER_A);
    const id = await seedSubmission({ authorId: TEACHER_A, classId: CLASS_A, questionId: q });
    expect(await code(applyAnswerReview(db, bucket, TEACHER_A, { submissionId: id, decision: "approve" }))).toBe("permission-denied");
    expect(await code(applyAnswerReview(db, bucket, TEACHER_A, { submissionId: id, decision: "reject" }))).toBe("permission-denied");
    expect(await code(loadAnswerReviewDetail(db, bucket, TEACHER_A, { submissionId: id }))).toBe("permission-denied");
    expect((await submission(id)).status).toBe("manual_review");
    expect(await answersFor(q)).toHaveLength(0);
  });

  it("A11 a rejected submission cannot be approved; an approved one cannot be rejected", async () => {
    const q = nextId("q-final");
    await seedQuestion(q, CLASS_A, TEACHER_A);
    const rejected = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q, status: "rejected" });
    expect(await code(applyAnswerReview(db, bucket, TEACHER_A, { submissionId: rejected, decision: "approve" }))).toBe("failed-precondition");
    expect((await submission(rejected)).status).toBe("rejected");
    expect(await answersFor(q)).toHaveLength(0);

    const approved = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q });
    await applyAnswerReview(db, bucket, TEACHER_A, { submissionId: approved, decision: "approve" });
    expect(await code(applyAnswerReview(db, bucket, TEACHER_A, { submissionId: approved, decision: "reject" }))).toBe("failed-precondition");
    expect((await submission(approved)).status).toBe("approved");
    expect(await answersFor(q)).toHaveLength(1);
  });

  it("a submission whose question belongs to another class is refused even for that class's teacher", async () => {
    const q = nextId("q-mismatch");
    await seedQuestion(q, CLASS_B, TEACHER_B);
    // Submission claims class A, question lives in class B.
    const id = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q });
    expect(await code(applyAnswerReview(db, bucket, TEACHER_A, { submissionId: id, decision: "approve" }))).toBe("permission-denied");
    expect(await code(applyAnswerReview(db, bucket, TEACHER_B, { submissionId: id, decision: "approve" }))).toBe("permission-denied");
  });

  it("a missing submission is not-found; a malformed request is invalid-argument", async () => {
    expect(await code(applyAnswerReview(db, bucket, TEACHER_A, { submissionId: "nope", decision: "approve" }))).toBe("not-found");
    expect(await code(applyAnswerReview(db, bucket, TEACHER_A, { submissionId: "nope", decision: "publish" }))).toBe("invalid-argument");
    expect(await code(applyAnswerReview(db, bucket, TEACHER_A, { decision: "approve" }))).toBe("invalid-argument");
  });
});

// ---------------------------------------------------------------------------
// Rejection — R1..R12
// ---------------------------------------------------------------------------

describe("rejection", () => {
  it("R1/R2/R10/R11 reject records the decision, creates nothing, and retries safely", async () => {
    const q = nextId("q-reject");
    await seedQuestion(q, CLASS_A, TEACHER_A);
    const id = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q, reason: "uncertain" });
    const studyBefore = await snapshotStudy(STUDENT_1);

    const first = await applyAnswerReview(db, bucket, TEACHER_A, { submissionId: id, decision: "reject" }, 7000);
    expect(first).toEqual({ submissionId: id, status: "rejected", publishedEntityId: null, alreadyDecided: false });
    const sub = await submission(id);
    expect(sub.status).toBe("rejected");
    expect(sub.reviewedAt).toBe(7000);
    expect(sub.reviewedBy).toBe(TEACHER_A);
    expect(sub.publishedEntityId).toBeNull();
    expect(sub.decisionReason).toBe("uncertain");
    expect(await answersFor(q)).toHaveLength(0);
    // The quarantine object is retained (no cleanup feature); the review copy is gone.
    expect((await bucket.file(String(sub.quarantinePath)).exists())[0]).toBe(true);
    expect((await bucket.file(buildReviewAccessPath(id, "image/png")).exists())[0]).toBe(false);

    const retry = await applyAnswerReview(db, bucket, TEACHER_A, { submissionId: id, decision: "reject" }, 8000);
    expect(retry.alreadyDecided).toBe(true);
    expect((await submission(id)).reviewedAt).toBe(7000);
    expect(await answersFor(q)).toHaveLength(0);
    expect(await snapshotStudy(STUDENT_1)).toBe(studyBefore);
  });

  it("R3 simultaneous rejections settle on one final state", async () => {
    const q = nextId("q-reject-race");
    await seedQuestion(q, CLASS_A, TEACHER_A);
    const id = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q });
    const [a, b] = await Promise.all([
      applyAnswerReview(db, bucket, TEACHER_A, { submissionId: id, decision: "reject" }),
      applyAnswerReview(db, bucket, TEACHER_A, { submissionId: id, decision: "reject" }),
    ]);
    expect(a.status).toBe("rejected");
    expect(b.status).toBe("rejected");
    expect([a.alreadyDecided, b.alreadyDecided].filter(Boolean)).toHaveLength(1);
    expect((await submission(id)).status).toBe("rejected");
    expect(await answersFor(q)).toHaveLength(0);
  });

  it("a concurrent approve and reject settle on exactly one outcome", async () => {
    const q = nextId("q-mixed-race");
    await seedQuestion(q, CLASS_A, TEACHER_A);
    const id = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q });
    const results = await Promise.allSettled([
      applyAnswerReview(db, bucket, TEACHER_A, { submissionId: id, decision: "approve" }),
      applyAnswerReview(db, bucket, TEACHER_A, { submissionId: id, decision: "reject" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejectedCalls = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejectedCalls).toHaveLength(1);
    const final = (await submission(id)).status;
    expect(["approved", "rejected"]).toContain(final);
    expect(await answersFor(q)).toHaveLength(final === "approved" ? 1 : 0);
  });

  it.each([
    ["R4 student", STUDENT_1],
    ["R5 unrelated teacher", TEACHER_B],
    ["R6 org admin", ORG_ADMIN],
    ["R7 platform admin", PLATFORM_ADMIN],
    ["R8 outsider", OUTSIDER],
  ])("%s cannot reject", async (_label, uid) => {
    const q = nextId("q-reject-deny");
    await seedQuestion(q, CLASS_A, TEACHER_A);
    const id = await seedSubmission({ authorId: STUDENT_2, classId: CLASS_A, questionId: q });
    expect(await code(applyAnswerReview(db, bucket, uid, { submissionId: id, decision: "reject" }))).toBe("permission-denied");
    expect((await submission(id)).status).toBe("manual_review");
  });
});

// ---------------------------------------------------------------------------
// Continuity — the three review-required reasons all flow the same way.
// ---------------------------------------------------------------------------

describe("review-required reasons", () => {
  it.each(["provider_unavailable", "uncertain", "no_ocr_provider"])(
    "%s: queued, inspectable, publishable by the teacher, never auto-published",
    async (reason) => {
      const q = nextId(`q-${reason}`);
      await seedQuestion(q, CLASS_A, TEACHER_A);
      const id = await seedSubmission({ authorId: STUDENT_1, classId: CLASS_A, questionId: q, reason });
      expect(await answersFor(q)).toHaveLength(0);
      const queue = await loadAnswerReviewQueue(db, TEACHER_A, { classId: CLASS_A });
      expect(queue.items.map((i) => i.submissionId)).toContain(id);
      const detail = await loadAnswerReviewDetail(db, bucket, TEACHER_A, { submissionId: id });
      expect(detail.reviewReason).toBe(reason);
      expect((await fetch(detail.imageUrl ?? "")).status).toBe(200);
      const result = await applyAnswerReview(db, bucket, TEACHER_A, { submissionId: id, decision: "approve" });
      expect(result.status).toBe("approved");
      expect(await answersFor(q)).toHaveLength(1);
      const after = await loadAnswerReviewQueue(db, TEACHER_A, { classId: CLASS_A });
      expect(after.items.map((i) => i.submissionId)).not.toContain(id);
    },
  );
});
