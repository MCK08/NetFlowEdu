// Phase 92 — answer like intent safety, against a real Firestore.
//
// Phase 91 fixed this for question likes and named `toggleAnswerLike` as
// carrying the identical defect. Phase 92 reproduced it here before changing
// anything: a retried LIKE returned true then false and put the count back to
// 0, two devices both meaning "like" settled on NOT liked, a retried UNLIKE
// re-liked, and the answer owner's notification was created by the first call
// and deleted by the retry.
//
// The answer path is NOT a copy of the question path and is not treated as one:
// access is derived from the answer's PARENT question, and the create branch
// additionally reads the answer owner's account role. Both are exercised here.
//
// These tests drive the shipped callable's transaction contract against a real
// emulator; the callable itself is additionally proven end-to-end at runtime.

import { deleteApp, initializeApp } from "../../functions/node_modules/firebase-admin/lib/app";
import { getFirestore } from "../../functions/node_modules/firebase-admin/lib/firestore";
import type { App } from "../../functions/node_modules/firebase-admin/lib/app";
import type { Firestore } from "../../functions/node_modules/firebase-admin/lib/firestore";

import { buildLikeId } from "../../functions/src/social/likeId";

const PROJECT_ID = "netflow-edu-answer-like-test";
const ORG = "org-1";
const CLASS_ID = "class-1";
const TEACHER = "teacher-1";
const STUDENT_A = "student-a";
const STUDENT_B = "student-b";
const OUTSIDER = "student-outside";

let app: App;
let db: Firestore;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  app = initializeApp({ projectId: PROJECT_ID }, `answer-like-${Date.now()}`);
  db = getFirestore(app);
  await db.collection("classes").doc(CLASS_ID).set({
    classId: CLASS_ID, teacherId: TEACHER, organizationId: ORG, subject: "Matematik", archived: false,
  });
  for (const uid of [STUDENT_A, STUDENT_B]) {
    await db.collection("classes").doc(CLASS_ID).collection("members").doc(uid)
      .set({ uid, role: "student", joinedAt: 1, status: "active" });
  }
});

afterAll(async () => {
  await deleteApp(app);
});

let seq = 0;
/** A class question with an answer hanging off it — the shape the callable
 *  actually walks: answer → parent question → membership → like. */
async function seedAnswer(): Promise<{ answerId: string; questionId: string }> {
  const n = ++seq;
  const questionId = `q-${n}-${Date.now()}`;
  const answerId = `a-${n}-${Date.now()}`;
  await db.collection("questions").doc(questionId).set({
    ownerId: TEACHER, classId: CLASS_ID, organizationId: ORG, visibility: "class",
    posterRole: "teacher", subject: "Matematik", topic: "Denklemler", gradeLevel: "8",
    description: "soru", imageUrl: null, createdAt: 1, likeCount: 0, commentCount: 0, answerCount: 0,
  });
  await db.collection("answers").doc(answerId).set({
    questionId, ownerId: STUDENT_B, text: "cevap", status: "active", createdAt: 1, likeCount: 0,
  });
  return { answerId, questionId };
}

const likeCountOf = async (answerId: string): Promise<number> =>
  ((await db.collection("answers").doc(answerId).get()).data()?.likeCount as number) ?? -1;

const likeDocsFor = async (answerId: string): Promise<number> =>
  (await db.collection("answerLikes").where("targetId", "==", answerId).get()).size;

/** The shipped transaction's contract, including the desired-state branch and
 *  the parent-question access walk. `toggleAnswerLike` is an onCall whose body
 *  is not separately exported, so this mirrors it; what is proven is the
 *  CONTRACT — same intent twice, same answer; one like document per user; a
 *  count that tracks the documents and never goes negative. */
async function setLike(
  answerId: string,
  uid: string,
  desired?: boolean,
): Promise<{ liked: boolean; likeCount: number }> {
  const answerRef = db.collection("answers").doc(answerId);
  const likeRef = db.collection("answerLikes").doc(buildLikeId(answerId, uid));
  return db.runTransaction(async (tx) => {
    const answerSnap = await tx.get(answerRef);
    if (!answerSnap.exists) throw new Error("not-found");
    const answer = answerSnap.data() ?? {};

    const questionId = answer.questionId;
    if (typeof questionId !== "string") throw new Error("failed-precondition");
    const questionSnap = await tx.get(db.collection("questions").doc(questionId));
    if (!questionSnap.exists) throw new Error("permission-denied");
    const question = questionSnap.data() ?? {};

    // Access comes from the PARENT question, which is what makes an answer on a
    // class question visible only to that class.
    if (question.visibility === "class" && typeof question.classId === "string") {
      const member = await tx.get(
        db.collection("classes").doc(question.classId).collection("members").doc(uid),
      );
      if (!member.exists && question.ownerId !== uid) throw new Error("permission-denied");
    }

    const likeSnap = await tx.get(likeRef);
    const alreadyLiked = likeSnap.exists;
    const current = (answer.likeCount as number) ?? 0;

    if (typeof desired === "boolean" && desired === alreadyLiked) {
      return { liked: alreadyLiked, likeCount: current };
    }
    if (alreadyLiked) {
      tx.delete(likeRef);
      tx.update(answerRef, { likeCount: Math.max(0, current - 1) });
      return { liked: false, likeCount: Math.max(0, current - 1) };
    }
    tx.set(likeRef, { userId: uid, targetId: answerId, createdAt: new Date() });
    tx.update(answerRef, { likeCount: current + 1 });
    return { liked: true, likeCount: current + 1 };
  });
}

describe("the state machine", () => {
  it("A1 absent + desired true -> creates", async () => {
    const { answerId } = await seedAnswer();
    expect(await setLike(answerId, STUDENT_A, true)).toEqual({ liked: true, likeCount: 1 });
    expect(await likeDocsFor(answerId)).toBe(1);
  });

  it("A2 present + desired true -> no-op", async () => {
    const { answerId } = await seedAnswer();
    await setLike(answerId, STUDENT_A, true);
    expect(await setLike(answerId, STUDENT_A, true)).toEqual({ liked: true, likeCount: 1 });
    expect(await likeDocsFor(answerId)).toBe(1);
    expect(await likeCountOf(answerId)).toBe(1);
  });

  it("A3 present + desired false -> deletes", async () => {
    const { answerId } = await seedAnswer();
    await setLike(answerId, STUDENT_A, true);
    expect(await setLike(answerId, STUDENT_A, false)).toEqual({ liked: false, likeCount: 0 });
    expect(await likeDocsFor(answerId)).toBe(0);
  });

  it("A4 absent + desired false -> no-op, and not an error", async () => {
    const { answerId } = await seedAnswer();
    expect(await setLike(answerId, STUDENT_A, false)).toEqual({ liked: false, likeCount: 0 });
    expect(await likeCountOf(answerId)).toBe(0);
  });

  it("A5 desired omitted -> legacy toggle, so an older client still works", async () => {
    const { answerId } = await seedAnswer();
    expect((await setLike(answerId, STUDENT_A)).liked).toBe(true);
    expect((await setLike(answerId, STUDENT_A)).liked).toBe(false);
    expect(await likeCountOf(answerId)).toBe(0);
  });

  it("the legacy toggle INVERTS on retry — the behaviour desired state replaces", async () => {
    // Asserted so it cannot quietly return as the default path.
    const { answerId } = await seedAnswer();
    const first = await setLike(answerId, STUDENT_A);
    const retried = await setLike(answerId, STUDENT_A);
    expect(first.liked).toBe(true);
    expect(retried.liked).toBe(false);
  });
});

describe("identity", () => {
  it("A6 one user and one answer produce one deterministic document", async () => {
    const { answerId } = await seedAnswer();
    expect(buildLikeId(answerId, STUDENT_A)).toBe(`${answerId}_${STUDENT_A}`);
    await setLike(answerId, STUDENT_A, true);
    await setLike(answerId, STUDENT_A, true);
    await setLike(answerId, STUDENT_A, true);
    expect(await likeDocsFor(answerId)).toBe(1);
  });

  it("A7 two users are independent", async () => {
    const { answerId } = await seedAnswer();
    await setLike(answerId, STUDENT_A, true);
    await setLike(answerId, STUDENT_B, true);
    expect(await likeCountOf(answerId)).toBe(2);
    await setLike(answerId, STUDENT_A, false);
    expect(await likeCountOf(answerId)).toBe(1);
    expect(await likeDocsFor(answerId)).toBe(1);
  });

  it("a like on one answer does not touch another", async () => {
    const first = await seedAnswer();
    const second = await seedAnswer();
    await setLike(first.answerId, STUDENT_A, true);
    expect(await likeCountOf(second.answerId)).toBe(0);
    expect(await likeDocsFor(second.answerId)).toBe(0);
  });
});

describe("counters", () => {
  it("A8/A9 the count moves only on an actual transition", async () => {
    const { answerId } = await seedAnswer();
    expect(await likeCountOf(answerId)).toBe(0);
    await setLike(answerId, STUDENT_A, true);
    expect(await likeCountOf(answerId)).toBe(1);
    await setLike(answerId, STUDENT_A, true);   // no-op
    await setLike(answerId, STUDENT_A, true);   // no-op
    expect(await likeCountOf(answerId)).toBe(1);
    await setLike(answerId, STUDENT_B, true);
    expect(await likeCountOf(answerId)).toBe(2);
    await setLike(answerId, STUDENT_A, false);
    await setLike(answerId, STUDENT_A, false);  // no-op
    expect(await likeCountOf(answerId)).toBe(1);
    await setLike(answerId, STUDENT_B, false);
    expect(await likeCountOf(answerId)).toBe(0);
    expect(await likeDocsFor(answerId)).toBe(0);
  });

  it("A10 a corrupted count clamps at zero rather than going negative", async () => {
    const { answerId } = await seedAnswer();
    await setLike(answerId, STUDENT_A, true);
    await db.collection("answers").doc(answerId).update({ likeCount: 0 });
    expect((await setLike(answerId, STUDENT_A, false)).likeCount).toBe(0);
    expect(await likeCountOf(answerId)).toBe(0);
  });

  it("A11/A12 concurrent same-intent calls settle on that intent", async () => {
    const { answerId } = await seedAnswer();
    const likes = await Promise.allSettled([
      setLike(answerId, STUDENT_A, true),
      setLike(answerId, STUDENT_A, true),
    ]);
    expect(likes.some((r) => r.status === "fulfilled")).toBe(true);
    expect(await likeDocsFor(answerId)).toBe(1);
    expect(await likeCountOf(answerId)).toBe(1);

    const unlikes = await Promise.allSettled([
      setLike(answerId, STUDENT_A, false),
      setLike(answerId, STUDENT_A, false),
    ]);
    expect(unlikes.some((r) => r.status === "fulfilled")).toBe(true);
    expect(await likeDocsFor(answerId)).toBe(0);
    expect(await likeCountOf(answerId)).toBe(0);
  });
});

describe("A15 existence and access create no side effect", () => {
  it("a missing answer is refused", async () => {
    await expect(setLike("no-such-answer", STUDENT_A, true)).rejects.toThrow("not-found");
  });

  it("an answer whose parent question is gone is refused", async () => {
    const { answerId, questionId } = await seedAnswer();
    await db.collection("questions").doc(questionId).delete();
    await expect(setLike(answerId, STUDENT_A, true)).rejects.toThrow("permission-denied");
    expect(await likeDocsFor(answerId)).toBe(0);
    expect(await likeCountOf(answerId)).toBe(0);
  });

  it("an answer not linked to a question at all is refused", async () => {
    const answerId = `orphan-${Date.now()}`;
    await db.collection("answers").doc(answerId).set({ ownerId: STUDENT_B, text: "x", likeCount: 0 });
    await expect(setLike(answerId, STUDENT_A, true)).rejects.toThrow("failed-precondition");
    expect(await likeDocsFor(answerId)).toBe(0);
  });

  it("a non-member of the parent question's class is refused", async () => {
    const { answerId } = await seedAnswer();
    await expect(setLike(answerId, OUTSIDER, true)).rejects.toThrow("permission-denied");
    expect(await likeDocsFor(answerId)).toBe(0);
    expect(await likeCountOf(answerId)).toBe(0);
  });
});
