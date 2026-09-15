// Phase 102 — class-teacher message moderation, against a real Firestore.
//
// A class chat had no moderation path: firestore.rules deny update/delete on
// classes/{classId}/messages for every client, and nothing server-side wrote
// the reserved `deleted` field. This drives the SHIPPED handler
// (`applyRemoveClassMessage`, what the onCall wrapper delegates to) and pins
// the whole authorization matrix the phase spec lists:
//
//   teacher of THIS class, student message      → removed
//   teacher of ANOTHER class                     → denied
//   the message's own author (student)           → denied
//   another student in the class                 → denied
//   organization admin / platform admin          → denied (no role is consulted)
//   the teacher's OWN message                    → denied (not student content)
//   retry after a lost response                  → quiet success, nothing changes twice

import { deleteApp, initializeApp } from "../../functions/node_modules/firebase-admin/lib/app";
import { getFirestore, Timestamp } from "../../functions/node_modules/firebase-admin/lib/firestore";
import type { App } from "../../functions/node_modules/firebase-admin/lib/app";
import type { Firestore } from "../../functions/node_modules/firebase-admin/lib/firestore";

import { applyRemoveClassMessage } from "../../functions/src/classes/removeClassMessage";

const PROJECT_ID = "netflow-edu-remove-message-test";
const CLASS_A = "class-a";
const CLASS_B = "class-b";
const TEACHER_A = "teacher-a";
const TEACHER_B = "teacher-b";
const STUDENT_1 = "student-1";
const STUDENT_2 = "student-2";
const ORG_ADMIN = "org-admin";
const PLATFORM_ADMIN = "platform-admin";

let app: App;
let db: Firestore;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  app = initializeApp({ projectId: PROJECT_ID }, `remove-message-${Date.now()}`);
  db = getFirestore(app);
  await db.collection("classes").doc(CLASS_A).set({ teacherId: TEACHER_A, organizationId: "org-1", name: "A" });
  await db.collection("classes").doc(CLASS_B).set({ teacherId: TEACHER_B, organizationId: "org-1", name: "B" });
  // Admin roles exist as user documents only — the handler must never look
  // at them, which is exactly what the admin cases below prove.
  await db.collection("users").doc(ORG_ADMIN).set({ role: "admin", organizationId: "org-1" });
  await db.collection("users").doc(PLATFORM_ADMIN).set({ role: "platform_admin" });
});

afterAll(async () => {
  await deleteApp(app);
});

let seq = 0;
async function seedMessage(
  classId: string,
  over: Record<string, unknown> = {},
): Promise<{ messageId: string; before: Record<string, unknown> }> {
  const messageId = `m-${++seq}-${Date.now()}`;
  const data = {
    classId,
    senderId: STUDENT_1,
    senderName: "Öğrenci Bir",
    senderPhoto: null,
    senderRole: "student",
    clientMessageId: `c-${messageId}`,
    text: "selam sınıf",
    createdAt: Timestamp.fromMillis(1_700_000_000_000 + seq),
    editedAt: null,
    deleted: false,
    ...over,
  };
  await db.collection("classes").doc(classId).collection("messages").doc(messageId).set(data);
  return { messageId, before: data };
}

const readMessage = async (classId: string, messageId: string) =>
  (await db.collection("classes").doc(classId).collection("messages").doc(messageId).get()).data() ?? {};

async function failureOf(run: () => Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await run();
    return { code: "no-error", message: "the call was allowed to succeed" };
  } catch (error) {
    const e = error as { code?: string; message?: string };
    return { code: e.code ?? "unknown", message: e.message ?? "" };
  }
}

/** The message is exactly as seeded — nothing about it moved. */
async function expectUntouched(classId: string, messageId: string, before: Record<string, unknown>) {
  const after = await readMessage(classId, messageId);
  expect(after.deleted).toBe(false);
  expect(after.text).toBe(before.text);
  expect(after).not.toHaveProperty("deletedAt");
  expect(after).not.toHaveProperty("deletedBy");
  expect((after.createdAt as Timestamp).isEqual(before.createdAt as Timestamp)).toBe(true);
}

describe("authorization", () => {
  it("M1 denies an unauthenticated caller", async () => {
    const { messageId, before } = await seedMessage(CLASS_A);
    const failure = await failureOf(() =>
      applyRemoveClassMessage(db, undefined, { classId: CLASS_A, messageId }),
    );
    expect(failure.code).toBe("unauthenticated");
    await expectUntouched(CLASS_A, messageId, before);
  });

  it("M2 lets the class's teacher remove a student's message — a soft delete that keeps the timestamp", async () => {
    const { messageId, before } = await seedMessage(CLASS_A);
    expect(await applyRemoveClassMessage(db, TEACHER_A, { classId: CLASS_A, messageId })).toEqual({ removed: true });

    const after = await readMessage(CLASS_A, messageId);
    expect(after.deleted).toBe(true);
    expect(after.text).toBe("");
    expect(after.deletedBy).toBe(TEACHER_A);
    expect(after.deletedAt).toBeInstanceOf(Timestamp);
    // Removal is not an edit: no timestamp of the message itself moves and
    // nothing about who sent it is rewritten.
    expect((after.createdAt as Timestamp).isEqual(before.createdAt as Timestamp)).toBe(true);
    expect(after.editedAt).toBeNull();
    expect(after.senderId).toBe(STUDENT_1);
    expect(after.senderName).toBe("Öğrenci Bir");
    expect(after.senderRole).toBe("student");
    expect(after.clientMessageId).toBe(before.clientMessageId);
  });

  it("M3 denies the teacher of ANOTHER class — the right is per room, not per role", async () => {
    const { messageId, before } = await seedMessage(CLASS_A);
    const failure = await failureOf(() =>
      applyRemoveClassMessage(db, TEACHER_B, { classId: CLASS_A, messageId }),
    );
    expect(failure.code).toBe("permission-denied");
    expect(failure.message).toContain("yalnızca sınıf öğretmeni");
    await expectUntouched(CLASS_A, messageId, before);
  });

  it("M4 a teacher cannot reach a message through their OWN class's path either", async () => {
    // Addressing class B (which TEACHER_B owns) with a message id that lives
    // in class A finds nothing — the path is the scope.
    const { messageId, before } = await seedMessage(CLASS_A);
    const failure = await failureOf(() =>
      applyRemoveClassMessage(db, TEACHER_B, { classId: CLASS_B, messageId }),
    );
    expect(failure.code).toBe("not-found");
    await expectUntouched(CLASS_A, messageId, before);
  });

  it("M5 denies the message's own author — student self-delete is not introduced", async () => {
    const { messageId, before } = await seedMessage(CLASS_A);
    expect((await failureOf(() => applyRemoveClassMessage(db, STUDENT_1, { classId: CLASS_A, messageId }))).code)
      .toBe("permission-denied");
    await expectUntouched(CLASS_A, messageId, before);
  });

  it("M6 denies another student in the class", async () => {
    const { messageId, before } = await seedMessage(CLASS_A);
    expect((await failureOf(() => applyRemoveClassMessage(db, STUDENT_2, { classId: CLASS_A, messageId }))).code)
      .toBe("permission-denied");
    await expectUntouched(CLASS_A, messageId, before);
  });

  it("M7 denies an organization admin and a platform admin — no role grants this", async () => {
    const { messageId, before } = await seedMessage(CLASS_A);
    expect((await failureOf(() => applyRemoveClassMessage(db, ORG_ADMIN, { classId: CLASS_A, messageId }))).code)
      .toBe("permission-denied");
    expect((await failureOf(() => applyRemoveClassMessage(db, PLATFORM_ADMIN, { classId: CLASS_A, messageId }))).code)
      .toBe("permission-denied");
    await expectUntouched(CLASS_A, messageId, before);
  });

  it("M8 denies removing the teacher's OWN message — this is moderation of student content", async () => {
    const { messageId, before } = await seedMessage(CLASS_A, { senderId: TEACHER_A, senderRole: "teacher" });
    const failure = await failureOf(() =>
      applyRemoveClassMessage(db, TEACHER_A, { classId: CLASS_A, messageId }),
    );
    expect(failure.code).toBe("permission-denied");
    expect(failure.message).toContain("Yalnızca öğrenci mesajları");
    await expectUntouched(CLASS_A, messageId, before);
  });

  it("M9 a message whose stored classId disagrees with its path is treated as not found", async () => {
    const { messageId } = await seedMessage(CLASS_A, { classId: CLASS_B });
    expect((await failureOf(() => applyRemoveClassMessage(db, TEACHER_A, { classId: CLASS_A, messageId }))).code)
      .toBe("not-found");
    expect((await readMessage(CLASS_A, messageId)).deleted).toBe(false);
  });
});

describe("input", () => {
  it("rejects a missing, empty or path-like id and an unknown class", async () => {
    for (const data of [
      {},
      { classId: CLASS_A },
      { messageId: "x" },
      { classId: "", messageId: "x" },
      { classId: CLASS_A, messageId: "" },
      { classId: "a/b", messageId: "x" },
      { classId: CLASS_A, messageId: "x/y" },
      { classId: 12, messageId: "x" },
    ]) {
      expect((await failureOf(() => applyRemoveClassMessage(db, TEACHER_A, data as never))).code)
        .toBe("invalid-argument");
    }
    expect((await failureOf(() => applyRemoveClassMessage(db, TEACHER_A, { classId: "no-such", messageId: "x" }))).code)
      .toBe("not-found");
    expect((await failureOf(() => applyRemoveClassMessage(db, TEACHER_A, { classId: CLASS_A, messageId: "no-such" }))).code)
      .toBe("not-found");
  });
});

describe("retry safety", () => {
  it("M10 a second removal of the same message is a quiet success that changes nothing", async () => {
    const { messageId } = await seedMessage(CLASS_A);
    expect(await applyRemoveClassMessage(db, TEACHER_A, { classId: CLASS_A, messageId })).toEqual({ removed: true });
    const first = await readMessage(CLASS_A, messageId);

    expect(await applyRemoveClassMessage(db, TEACHER_A, { classId: CLASS_A, messageId })).toEqual({ removed: false });
    expect(await applyRemoveClassMessage(db, TEACHER_A, { classId: CLASS_A, messageId })).toEqual({ removed: false });

    const later = await readMessage(CLASS_A, messageId);
    expect((later.deletedAt as Timestamp).isEqual(first.deletedAt as Timestamp)).toBe(true);
    expect(later.deletedBy).toBe(TEACHER_A);
  });

  it("M11 two concurrent removals of one message remove it exactly once", async () => {
    const { messageId } = await seedMessage(CLASS_A);
    const results = await Promise.all([
      applyRemoveClassMessage(db, TEACHER_A, { classId: CLASS_A, messageId }),
      applyRemoveClassMessage(db, TEACHER_A, { classId: CLASS_A, messageId }),
    ]);
    expect(results.filter((r) => r.removed).length).toBe(1);
    expect((await readMessage(CLASS_A, messageId)).deleted).toBe(true);
  });
});
