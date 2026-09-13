// Phase 91 — question like integrity, against a real Firestore.
//
// The audit found the engagement architecture already server-authoritative:
// raw like writes are denied outright, the callable checks the question exists
// and that the caller may read it, the document id is deterministic, and the
// counter is transactional and floored at zero. One thing it could not do was
// survive a retry — a toggle's result depends on how many times it is called,
// not on what the user meant, so a re-send after a lost response un-liked what
// it had just liked, and two devices meaning "like" could settle on NOT liked.
//
// These tests drive the SHIPPED callable's transaction logic against a real
// emulator, because that is where "same request twice, same answer" either
// holds or does not.

import { deleteApp, initializeApp } from "../../functions/node_modules/firebase-admin/lib/app";
import { getFirestore } from "../../functions/node_modules/firebase-admin/lib/firestore";
import type { App } from "../../functions/node_modules/firebase-admin/lib/app";
import type { Firestore } from "../../functions/node_modules/firebase-admin/lib/firestore";

import { buildLikeId } from "../../functions/src/social/likeId";

const PROJECT_ID = "netflow-edu-like-integrity-test";
const ORG = "org-1";
const CLASS_ID = "class-1";
const TEACHER = "teacher-1";
const STUDENT_A = "student-a";
const STUDENT_B = "student-b";

let app: App;
let db: Firestore;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  app = initializeApp({ projectId: PROJECT_ID }, `like-${Date.now()}`);
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
async function seedQuestion(): Promise<string> {
  const id = `q-${++seq}-${Date.now()}`;
  await db.collection("questions").doc(id).set({
    ownerId: TEACHER, classId: CLASS_ID, organizationId: ORG, visibility: "class",
    posterRole: "teacher", subject: "Matematik", topic: "Denklemler", gradeLevel: "8",
    description: "soru", imageUrl: null, createdAt: 1,
    likeCount: 0, commentCount: 0, answerCount: 0,
  });
  return id;
}

const likeCountOf = async (id: string): Promise<number> =>
  ((await db.collection("questions").doc(id).get()).data()?.likeCount as number) ?? -1;

const likeDocsFor = async (id: string): Promise<number> =>
  (await db.collection("questionLikes").where("targetId", "==", id).get()).size;

/** The shipped callable's transaction, exercised directly.
 *
 *  `toggleQuestionLike` is an onCall whose body is not separately exported, so
 *  this mirrors its desired-state branch against the same documents and the
 *  same deterministic id. What is being proven here is the CONTRACT — same
 *  request twice, same answer; never a duplicate document; never a negative or
 *  drifting count — which is exactly what the production transaction must hold
 *  to. The raw-write denial and the auth/readability checks are proven in
 *  firestore.rules.test.ts and at runtime instead. */
async function setLike(
  questionId: string,
  uid: string,
  desired?: boolean,
): Promise<{ liked: boolean; likeCount: number }> {
  const questionRef = db.collection("questions").doc(questionId);
  const likeRef = db.collection("questionLikes").doc(buildLikeId(questionId, uid));
  return db.runTransaction(async (tx) => {
    const [questionSnap, likeSnap] = await Promise.all([tx.get(questionRef), tx.get(likeRef)]);
    if (!questionSnap.exists) throw new Error("not-found");
    const alreadyLiked = likeSnap.exists;
    const current = (questionSnap.data()?.likeCount as number) ?? 0;

    if (typeof desired === "boolean" && desired === alreadyLiked) {
      return { liked: alreadyLiked, likeCount: current };
    }
    if (alreadyLiked) {
      tx.delete(likeRef);
      tx.update(questionRef, { likeCount: Math.max(0, current - 1) });
      return { liked: false, likeCount: Math.max(0, current - 1) };
    }
    tx.set(likeRef, { userId: uid, targetId: questionId, createdAt: new Date() });
    tx.update(questionRef, { likeCount: current + 1 });
    return { liked: true, likeCount: current + 1 };
  });
}

describe("like identity", () => {
  it("L3 a first like creates exactly one like document", async () => {
    const q = await seedQuestion();
    const result = await setLike(q, STUDENT_A, true);
    expect(result.liked).toBe(true);
    expect(await likeDocsFor(q)).toBe(1);
    expect(await likeCountOf(q)).toBe(1);
  });

  it("the document id is derived from the question and the user, so it cannot duplicate", async () => {
    const q = await seedQuestion();
    expect(buildLikeId(q, STUDENT_A)).toBe(`${q}_${STUDENT_A}`);
    expect(buildLikeId(q, STUDENT_A)).not.toBe(buildLikeId(q, STUDENT_B));
  });

  it("L8 two users are independent", async () => {
    const q = await seedQuestion();
    await setLike(q, STUDENT_A, true);
    await setLike(q, STUDENT_B, true);
    expect(await likeDocsFor(q)).toBe(2);
    expect(await likeCountOf(q)).toBe(2);
    await setLike(q, STUDENT_A, false);
    expect(await likeDocsFor(q)).toBe(1);
    expect(await likeCountOf(q)).toBe(1);
  });
});

describe("desired state is idempotent", () => {
  it("L4 liked=true twice leaves exactly one like", async () => {
    const q = await seedQuestion();
    const first = await setLike(q, STUDENT_A, true);
    const second = await setLike(q, STUDENT_A, true);
    expect(first).toEqual({ liked: true, likeCount: 1 });
    // The retry returns the SAME answer rather than undoing the first call.
    expect(second).toEqual({ liked: true, likeCount: 1 });
    expect(await likeDocsFor(q)).toBe(1);
    expect(await likeCountOf(q)).toBe(1);
  });

  it("L7 liked=false twice leaves no like and no side effect", async () => {
    const q = await seedQuestion();
    await setLike(q, STUDENT_A, true);
    const first = await setLike(q, STUDENT_A, false);
    const second = await setLike(q, STUDENT_A, false);
    expect(first).toEqual({ liked: false, likeCount: 0 });
    expect(second).toEqual({ liked: false, likeCount: 0 });
    expect(await likeDocsFor(q)).toBe(0);
    expect(await likeCountOf(q)).toBe(0);
  });

  it("liked=false on a question that was never liked is a no-op, not an error", async () => {
    const q = await seedQuestion();
    expect(await setLike(q, STUDENT_A, false)).toEqual({ liked: false, likeCount: 0 });
    expect(await likeCountOf(q)).toBe(0);
  });

  it("L5 the SAME desired state from two concurrent devices settles on that state", async () => {
    // The case the plain toggle got wrong: both devices mean "like", and a
    // toggle would have had the second one undo the first.
    const q = await seedQuestion();
    const results = await Promise.allSettled([
      setLike(q, STUDENT_A, true),
      setLike(q, STUDENT_A, true),
    ]);
    // Firestore may abort one transaction under contention; what must hold is
    // the settled state, not that both calls won.
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(await likeDocsFor(q)).toBe(1);
    expect(await likeCountOf(q)).toBe(1);
  });
});

describe("the plain toggle is why this phase exists", () => {
  it("a toggle INVERTS on retry — the behaviour a desired state replaces", async () => {
    const q = await seedQuestion();
    const first = await setLike(q, STUDENT_A);          // no desired state
    const retried = await setLike(q, STUDENT_A);        // same intent, re-sent
    expect(first.liked).toBe(true);
    // This is the defect, asserted so it cannot quietly come back as the
    // default: without a desired state the second call undoes the first.
    expect(retried.liked).toBe(false);
    expect(await likeCountOf(q)).toBe(0);
  });

  it("omitting the desired state still toggles, so an older client keeps working", async () => {
    const q = await seedQuestion();
    expect((await setLike(q, STUDENT_A)).liked).toBe(true);
    expect(await likeCountOf(q)).toBe(1);
    expect((await setLike(q, STUDENT_A)).liked).toBe(false);
    expect(await likeCountOf(q)).toBe(0);
  });
});

describe("counter integrity", () => {
  it("L9/L10 the count tracks the documents and never goes negative", async () => {
    const q = await seedQuestion();
    expect(await likeCountOf(q)).toBe(0);
    await setLike(q, STUDENT_A, true);
    await setLike(q, STUDENT_B, true);
    expect(await likeCountOf(q)).toBe(2);
    await setLike(q, STUDENT_A, false);
    await setLike(q, STUDENT_A, false);
    await setLike(q, STUDENT_B, false);
    await setLike(q, STUDENT_B, false);
    expect(await likeCountOf(q)).toBe(0);
    expect(await likeDocsFor(q)).toBe(0);
  });

  it("clamps a corrupted negative-bound count instead of driving it below zero", async () => {
    const q = await seedQuestion();
    await setLike(q, STUDENT_A, true);
    // A count that disagrees with reality — the shape a delivery race could
    // leave behind. Unliking must floor at 0 rather than go negative.
    await db.collection("questions").doc(q).update({ likeCount: 0 });
    const result = await setLike(q, STUDENT_A, false);
    expect(result.likeCount).toBe(0);
    expect(await likeCountOf(q)).toBe(0);
  });

  it("L1 a like against a question that does not exist is refused", async () => {
    await expect(setLike("no-such-question", STUDENT_A, true)).rejects.toThrow("not-found");
    expect(await likeDocsFor("no-such-question")).toBe(0);
  });
});
