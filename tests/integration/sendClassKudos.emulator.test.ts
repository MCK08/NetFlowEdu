// Phase 110 — "Tebrik Et", driven through the SHIPPED handler
// (applySendClassKudos, what the onCall wrapper delegates to) against a real
// Firestore. Pins the kudos matrix:
//
//   same-class student → classmate's class question     → sent, once
//   the same tap again / a retry                         → already_sent, still one notification
//   own question                                         → refused
//   another class's question, or non-member sender       → refused
//   a teacher's question, or a departed student's        → refused (classmates only)
//   a teacher as sender                                  → refused (students only)
//   an archived class                                    → refused (quiet)
//   extra payload fields claiming a sender/recipient     → ignored: identity is the caller's
//   no count, total or popularity field is written anywhere

import { deleteApp, initializeApp } from "../../functions/node_modules/firebase-admin/lib/app";
import { getFirestore } from "../../functions/node_modules/firebase-admin/lib/firestore";
import type { App } from "../../functions/node_modules/firebase-admin/lib/app";
import type { Firestore } from "../../functions/node_modules/firebase-admin/lib/firestore";

import { applySendClassKudos, buildSentKudosId } from "../../functions/src/classes/sendClassKudos";

const PROJECT_ID = "netflow-edu-class-kudos-test";
const CLASS_A = "class-a";
const CLASS_B = "class-b";
const CLASS_ARCHIVED = "class-archived";
const TEACHER_A = "teacher-a";
const S1 = "student-1";
const S2 = "student-2";
const S3 = "student-3"; // class B only
const S_LEFT = "student-left";

let app: App;
let db: Firestore;

/** Starts this suite from an empty database — ONLY this suite's own project id,
 *  via the emulator's documented reset endpoint. Without it a second run finds
 *  the first run's records and every idempotency expectation shifts by one. */
async function resetEmulatorProject(projectId: string): Promise<void> {
  const url = `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`;
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) throw new Error(`emulator reset failed: ${response.status}`);
}

const memberRow = (uid: string, role: "student" | "teacher") => ({
  uid, role, joinedAt: 1_700_000_000_000, displayName: `Ad ${uid}`, username: null, photoURL: null,
});

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  app = initializeApp({ projectId: PROJECT_ID }, `class-kudos-${Date.now()}`);
  db = getFirestore(app);
  await resetEmulatorProject(PROJECT_ID);

  await db.collection("classes").doc(CLASS_A).set({ name: "8-A", teacherId: TEACHER_A, status: "active" });
  await db.collection("classes").doc(CLASS_B).set({ name: "8-B", teacherId: "teacher-b", status: "active" });
  await db.collection("classes").doc(CLASS_ARCHIVED).set({ name: "7-C", teacherId: TEACHER_A, status: "archived" });
  for (const [classId, uid, role] of [
    [CLASS_A, TEACHER_A, "teacher"],
    [CLASS_A, S1, "student"],
    [CLASS_A, S2, "student"],
    [CLASS_B, S3, "student"],
    [CLASS_ARCHIVED, S1, "student"],
    [CLASS_ARCHIVED, S2, "student"],
  ] as const) {
    await db.collection("classes").doc(classId).collection("members").doc(uid).set(memberRow(uid, role));
  }
  await db.collection("users").doc(S1).set({ displayName: "Ayşe", username: "ayse", photoURL: null, email: "ayse@example.test" });

  const question = (id: string, classId: string | null, ownerId: string, visibility = "class") =>
    db.collection("questions").doc(id).set({ ownerId, classId, visibility, subject: "Matematik", topic: "Denklemler", createdAt: 1 });
  await question("q-s2", CLASS_A, S2);
  await question("q-s1", CLASS_A, S1);
  await question("q-teacher", CLASS_A, TEACHER_A);
  await question("q-left", CLASS_A, S_LEFT);
  await question("q-classb", CLASS_B, S3);
  await question("q-public", null, S2, "public");
  await question("q-archived", CLASS_ARCHIVED, S2);
});

afterAll(async () => {
  await deleteApp(app);
});

async function failureOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "no-error";
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  }
}

const sentRef = (sender: string, questionId: string) =>
  db.collection("users").doc(sender).collection("sentKudos").doc(buildSentKudosId(questionId));
const inbox = async (uid: string) => (await db.collection("users").doc(uid).collection("notifications").get()).docs;

describe("sendClassKudos", () => {
  it("1. a student congratulates a classmate for a question they shared — once", async () => {
    expect(await applySendClassKudos(db, S1, { classId: CLASS_A, questionId: "q-s2" })).toEqual({ status: "sent" });

    const record = (await sentRef(S1, "q-s2").get()).data();
    expect(record).toMatchObject({ classId: CLASS_A, targetType: "question", targetId: "q-s2", recipientId: S2 });

    const notes = (await inbox(S2)).filter((d) => d.data().type === "class_kudos_received");
    expect(notes).toHaveLength(1);
    const note = notes[0]!.data();
    expect(note).toMatchObject({
      recipientId: S2, actorId: S1, actorDisplayName: "Ayşe", entityType: "question",
      entityId: "q-s2", classId: CLASS_A, messagePreview: "8-A", isRead: false,
    });
    // The sender's email lives on their users doc; it must never be copied.
    expect(JSON.stringify(note)).not.toContain("ayse@example.test");
  });

  it("4. repeating it is idempotent — one record, one notification, one unread", async () => {
    expect(await applySendClassKudos(db, S1, { classId: CLASS_A, questionId: "q-s2" })).toEqual({ status: "already_sent" });
    expect(await applySendClassKudos(db, S1, { classId: CLASS_A, questionId: "q-s2" })).toEqual({ status: "already_sent" });
    expect((await inbox(S2)).filter((d) => d.data().type === "class_kudos_received")).toHaveLength(1);
    const meta = (await db.collection("users").doc(S2).collection("notificationMeta").doc("summary").get()).data();
    expect(meta?.unreadCount).toBe(1);
  });

  it("2. nobody congratulates themselves", async () => {
    expect(await failureOf(() => applySendClassKudos(db, S1, { classId: CLASS_A, questionId: "q-s1" }))).toBe("invalid-argument");
    expect((await sentRef(S1, "q-s1").get()).exists).toBe(false);
  });

  it("3. never across classes, and never from outside the class", async () => {
    expect(await failureOf(() => applySendClassKudos(db, S1, { classId: CLASS_B, questionId: "q-classb" }))).toBe("permission-denied");
    expect(await failureOf(() => applySendClassKudos(db, S1, { classId: CLASS_A, questionId: "q-classb" }))).toBe("not-found");
    expect(await failureOf(() => applySendClassKudos(db, S3, { classId: CLASS_A, questionId: "q-s2" }))).toBe("permission-denied");
    expect(await failureOf(() => applySendClassKudos(db, S1, { classId: CLASS_A, questionId: "q-public" }))).toBe("not-found");
    expect((await inbox(S3)).length).toBe(0);
  });

  it("is for classmates only: not a teacher's question, not a departed student's, not from a teacher", async () => {
    expect(await failureOf(() => applySendClassKudos(db, S1, { classId: CLASS_A, questionId: "q-teacher" }))).toBe("failed-precondition");
    expect(await failureOf(() => applySendClassKudos(db, S1, { classId: CLASS_A, questionId: "q-left" }))).toBe("failed-precondition");
    expect(await failureOf(() => applySendClassKudos(db, TEACHER_A, { classId: CLASS_A, questionId: "q-s2" }))).toBe("permission-denied");
  });

  it("stays quiet in an archived class", async () => {
    expect(await failureOf(() => applySendClassKudos(db, S1, { classId: CLASS_ARCHIVED, questionId: "q-archived" }))).toBe("failed-precondition");
  });

  it("5. identity is the caller's — a forged sender or recipient in the payload changes nothing", async () => {
    expect(await failureOf(() => applySendClassKudos(db, undefined, { classId: CLASS_A, questionId: "q-s2" }))).toBe("unauthenticated");
    const forged = { classId: CLASS_A, questionId: "q-s1", senderId: S1, actorId: S1, recipientId: S1 } as Record<string, unknown>;
    // Caller is S2; the forged fields claim S1 sent it. It is recorded as S2's.
    expect(await applySendClassKudos(db, S2, forged)).toEqual({ status: "sent" });
    expect((await sentRef(S2, "q-s1").get()).exists).toBe(true);
    expect((await sentRef(S1, "q-s1").get()).exists).toBe(false);
    const note = (await inbox(S1)).find((d) => d.data().type === "class_kudos_received")!.data();
    expect(note.actorId).toBe(S2);
    expect(note.recipientId).toBe(S1);
  });

  it("7-8. writes no count, total, rank or popularity field anywhere", async () => {
    const classDoc = (await db.collection("classes").doc(CLASS_A).get()).data() ?? {};
    const question = (await db.collection("questions").doc("q-s2").get()).data() ?? {};
    const member = (await db.collection("classes").doc(CLASS_A).collection("members").doc(S2).get()).data() ?? {};
    for (const data of [classDoc, question, member]) {
      expect(Object.keys(data).join(",")).not.toMatch(/kudos|congrat|tebrik|rank|score|popular/i);
    }
    expect((await db.collection("classes").doc(CLASS_A).collection("kudos").get()).empty).toBe(true);
    expect((await db.collection("leaderboards").get()).empty).toBe(true);
  });
});
