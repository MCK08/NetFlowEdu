// Phase 93 — the authoritative comment delete, against a real Firestore.
//
// Comment CREATE has been server-only since Phase 17. DELETE was the other half
// of the same lifecycle and was still a direct client write — Phase 93
// reproduced that first: an author's raw REST DELETE returned 200, while every
// other actor was already refused.
//
// What this proves is the contract that replaced it: the author may still
// remove their own comment, nobody else may, a retry after a lost response is a
// quiet success rather than a failure, and the payload carries an id and
// nothing forgeable.
//
// It drives the SHIPPED handler — `applyDeleteQuestionComment` is what the
// onCall wrapper delegates to and takes `db` as a parameter for exactly this
// reason.

import { deleteApp, initializeApp } from "../../functions/node_modules/firebase-admin/lib/app";
import { getFirestore } from "../../functions/node_modules/firebase-admin/lib/firestore";
import type { App } from "../../functions/node_modules/firebase-admin/lib/app";
import type { Firestore } from "../../functions/node_modules/firebase-admin/lib/firestore";

import { applyDeleteQuestionComment } from "../../functions/src/social/deleteQuestionComment";

const PROJECT_ID = "netflow-edu-comment-delete-test";
const ORG = "org-1";
const CLASS_ID = "class-1";
const TEACHER = "teacher-1";        // also the question's owner
const AUTHOR = "student-author";
const OTHER = "student-other";
const OUTSIDER = "student-outside";

let app: App;
let db: Firestore;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  app = initializeApp({ projectId: PROJECT_ID }, `comment-delete-${Date.now()}`);
  db = getFirestore(app);
  await db.collection("classes").doc(CLASS_ID).set({
    classId: CLASS_ID, teacherId: TEACHER, organizationId: ORG, subject: "Matematik", archived: false,
  });
});

afterAll(async () => {
  await deleteApp(app);
});

let seq = 0;
async function seedComment(over: Record<string, unknown> = {}): Promise<{ commentId: string; questionId: string }> {
  const n = ++seq;
  const questionId = `q-${n}-${Date.now()}`;
  const commentId = `c-${n}-${Date.now()}`;
  await db.collection("questions").doc(questionId).set({
    ownerId: TEACHER, classId: CLASS_ID, organizationId: ORG, visibility: "class",
    posterRole: "teacher", subject: "Matematik", description: "soru",
    createdAt: 1, likeCount: 0, commentCount: 1, answerCount: 0,
  });
  await db.collection("questionComments").doc(commentId).set({
    questionId, ownerId: AUTHOR, text: "yorum", status: "active", createdAt: new Date(), ...over,
  });
  return { commentId, questionId };
}

const exists = async (commentId: string): Promise<boolean> =>
  (await db.collection("questionComments").doc(commentId).get()).exists;

async function failureOf(run: () => Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await run();
    return { code: "no-error", message: "the call was allowed to succeed" };
  } catch (error) {
    const e = error as { code?: string; message?: string };
    return { code: e.code ?? "unknown", message: e.message ?? "" };
  }
}

describe("authorization", () => {
  it("D1 denies an unauthenticated caller and leaves the comment", async () => {
    const { commentId } = await seedComment();
    const failure = await failureOf(() => applyDeleteQuestionComment(db, undefined, { commentId }));
    expect(failure.code).toBe("unauthenticated");
    expect(await exists(commentId)).toBe(true);
  });

  it("D2 lets the comment's author delete it", async () => {
    const { commentId } = await seedComment();
    expect(await applyDeleteQuestionComment(db, AUTHOR, { commentId })).toEqual({ deleted: true });
    expect(await exists(commentId)).toBe(false);
  });

  it("D3 denies another student", async () => {
    const { commentId } = await seedComment();
    const failure = await failureOf(() => applyDeleteQuestionComment(db, OTHER, { commentId }));
    expect(failure.code).toBe("permission-denied");
    expect(failure.message).toContain("yalnızca yazarı");
    expect(await exists(commentId)).toBe(true);
  });

  it("D4 denies the QUESTION'S OWNER — authoring a question is not moderating it", async () => {
    const { commentId } = await seedComment();
    expect((await failureOf(() => applyDeleteQuestionComment(db, TEACHER, { commentId }))).code)
      .toBe("permission-denied");
    expect(await exists(commentId)).toBe(true);
  });

  it("D5 denies a teacher — teaching the class is not moderation either", async () => {
    // TEACHER here IS the class's teacher; the refusal above is the same person
    // in both roles, which is the point: neither role grants it.
    const { commentId } = await seedComment();
    expect((await failureOf(() => applyDeleteQuestionComment(db, TEACHER, { commentId }))).code)
      .toBe("permission-denied");
    expect(await exists(commentId)).toBe(true);
  });

  it("D6 denies an outsider", async () => {
    const { commentId } = await seedComment();
    expect((await failureOf(() => applyDeleteQuestionComment(db, OUTSIDER, { commentId }))).code)
      .toBe("permission-denied");
    expect(await exists(commentId)).toBe(true);
  });

  it("the author of ONE comment cannot delete another person's", async () => {
    const { commentId } = await seedComment({ ownerId: OTHER });
    expect((await failureOf(() => applyDeleteQuestionComment(db, AUTHOR, { commentId }))).code)
      .toBe("permission-denied");
    expect(await exists(commentId)).toBe(true);
  });
});

describe("retry safety", () => {
  it("D7/D8 a second delete of the same comment is a quiet success", async () => {
    const { commentId } = await seedComment();
    expect(await applyDeleteQuestionComment(db, AUTHOR, { commentId })).toEqual({ deleted: true });
    // The retry a client makes after a lost response. The user asked for it
    // gone and it is gone, so this reports success with `deleted: false` rather
    // than an error the client would have to explain away.
    expect(await applyDeleteQuestionComment(db, AUTHOR, { commentId })).toEqual({ deleted: false });
    expect(await applyDeleteQuestionComment(db, AUTHOR, { commentId })).toEqual({ deleted: false });
  });

  it("a comment that never existed reports the same quiet result", async () => {
    expect(await applyDeleteQuestionComment(db, AUTHOR, { commentId: "never-existed" }))
      .toEqual({ deleted: false });
  });

  it("but a non-author retrying against a missing comment learns nothing extra", async () => {
    // Already-gone wins over ownership, because there is no document to own.
    // The caller learns only that no comment is there, which tells them nothing
    // they did not already know.
    expect(await applyDeleteQuestionComment(db, OUTSIDER, { commentId: "never-existed" }))
      .toEqual({ deleted: false });
  });

  it("two concurrent deletes by the author still remove exactly one document", async () => {
    const { commentId } = await seedComment();
    const results = await Promise.allSettled([
      applyDeleteQuestionComment(db, AUTHOR, { commentId }),
      applyDeleteQuestionComment(db, AUTHOR, { commentId }),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(await exists(commentId)).toBe(false);
  });
});

describe("the payload carries nothing forgeable", () => {
  it("D9/D10 ignores a forged ownerId and questionId", async () => {
    const { commentId } = await seedComment();
    // Only `commentId` is read; authorization comes from the stored document.
    const failure = await failureOf(() =>
      applyDeleteQuestionComment(db, OTHER, {
        commentId,
        ownerId: OTHER,
        questionId: "some-other-question",
      } as Record<string, unknown>));
    expect(failure.code).toBe("permission-denied");
    expect(await exists(commentId)).toBe(true);
  });

  it("refuses a malformed comment id", async () => {
    for (const commentId of ["", "has/slash", 42, null, undefined]) {
      const failure = await failureOf(() =>
        applyDeleteQuestionComment(db, AUTHOR, { commentId } as Record<string, unknown>));
      expect(failure.code).toBe("invalid-argument");
    }
  });
});

describe("blast radius", () => {
  it("deletes only the targeted comment", async () => {
    const first = await seedComment();
    const second = await seedComment();
    await applyDeleteQuestionComment(db, AUTHOR, { commentId: first.commentId });
    expect(await exists(first.commentId)).toBe(false);
    expect(await exists(second.commentId)).toBe(true);
  });

  it("does not write the question document — the counter trigger owns that", async () => {
    // commentCount is maintained by onQuestionCommentDelete, which fires on this
    // deletion. Touching it here as well would double-count, so the handler
    // deliberately leaves the question alone.
    const { commentId, questionId } = await seedComment();
    const before = (await db.collection("questions").doc(questionId).get()).updateTime!.toMillis();
    await applyDeleteQuestionComment(db, AUTHOR, { commentId });
    expect((await db.collection("questions").doc(questionId).get()).updateTime!.toMillis()).toBe(before);
  });

  it("D14 an orphaned comment is still deletable by its author", async () => {
    // Phase 90 measured that a server-side question removal would orphan its
    // comments. The rule this replaces did not require the question to exist
    // either, and requiring it would strand the author with a comment they can
    // never remove.
    const { commentId, questionId } = await seedComment();
    await db.collection("questions").doc(questionId).delete();
    expect(await applyDeleteQuestionComment(db, AUTHOR, { commentId })).toEqual({ deleted: true });
    expect(await exists(commentId)).toBe(false);
  });

  it("D14 leaves the moderation submission alone", async () => {
    // The audit trail of what was approved is a separate document and outlives
    // the comment on purpose.
    const { commentId, questionId } = await seedComment();
    const submissionId = `${AUTHOR}_op-${Date.now()}`;
    await db.collection("moderationSubmissions").doc(submissionId).set({
      submissionId, authorId: AUTHOR, targetType: "question_comment", questionId,
      text: "yorum", status: "approved", publishedEntityId: commentId, createdAt: Date.now(),
    });
    await applyDeleteQuestionComment(db, AUTHOR, { commentId });
    const submission = await db.collection("moderationSubmissions").doc(submissionId).get();
    expect(submission.exists).toBe(true);
    expect(submission.data()!.status).toBe("approved");
    expect(submission.data()!.publishedEntityId).toBe(commentId);
  });
});
