import * as fs from "fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  collection,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

// Phase 102 — classes/{classId}/chatReads/{memberUid}, the per-recipient
// read cursor behind "Görüldü".
//
// What the rules must hold: a member may write only their OWN cursor, only
// while a member, only to a message that exists in this class, with
// lastReadAt equal to that message's stored createdAt and updatedAt the
// server's clock; the cursor never moves backwards; any member may read the
// cursors; nobody deletes one. And the message documents themselves stay
// closed to every client write — the teacher's removal is a Cloud Function.

const PROJECT_ID = "netflow-edu-chat-reads-rules-test";
const CLASS_ID = "class-1";
const TEACHER = "teacher-1";
const STUDENT_A = "student-a";
const STUDENT_B = "student-b";
const OUTSIDER = "student-outside";

const T1 = Timestamp.fromMillis(1_700_000_000_000);
const T2 = Timestamp.fromMillis(1_700_000_005_000);
const T3 = Timestamp.fromMillis(1_700_000_010_000);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

afterAll(async () => testEnv.cleanup());
afterEach(async () => testEnv.clearFirestore());

const asStudent = (uid: string) => testEnv.authenticatedContext(uid, { role: "student", organizationId: "org-1" });
const asTeacher = (uid: string) => testEnv.authenticatedContext(uid, { role: "teacher", organizationId: "org-1" });

function message(senderId: string, senderRole: "student" | "teacher", createdAt: Timestamp) {
  return {
    classId: CLASS_ID, senderId, senderName: senderId, senderPhoto: null, senderRole,
    clientMessageId: `c-${senderId}-${createdAt.toMillis()}`, text: "merhaba",
    createdAt, editedAt: null, deleted: false,
  };
}

/** Class with a teacher and two students, and three messages m1 < m2 < m3. */
async function seedClassChat() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "classes", CLASS_ID), {
      name: "Sistem", teacherId: TEACHER, organizationId: "org-1", status: "active",
      joinCode: "ABC123", memberCount: 3, createdAt: 1, updatedAt: 1,
    });
    for (const [uid, role] of [[TEACHER, "teacher"], [STUDENT_A, "student"], [STUDENT_B, "student"]] as const) {
      await setDoc(doc(db, "classes", CLASS_ID, "members", uid), {
        uid, role, joinedAt: 1, displayName: uid, username: uid, photoURL: null,
      });
    }
    await setDoc(doc(db, "classes", CLASS_ID, "messages", "m1"), message(STUDENT_A, "student", T1));
    await setDoc(doc(db, "classes", CLASS_ID, "messages", "m2"), message(TEACHER, "teacher", T2));
    await setDoc(doc(db, "classes", CLASS_ID, "messages", "m3"), message(STUDENT_B, "student", T3));
  });
}

const cursor = (lastReadMessageId: string, lastReadAt: Timestamp, extra: Record<string, unknown> = {}) => ({
  lastReadMessageId, lastReadAt, updatedAt: serverTimestamp(), ...extra,
});

const readRef = (uid: string, ownerUid: string, role: "student" | "teacher" = "student") =>
  doc((role === "teacher" ? asTeacher(uid) : asStudent(uid)).firestore(), "classes", CLASS_ID, "chatReads", ownerUid);

describe("firestore.rules — classes/{classId}/chatReads/{memberUid}", () => {
  it("R1 a member creates their own cursor at an existing message", async () => {
    await seedClassChat();
    await assertSucceeds(setDoc(readRef(STUDENT_A, STUDENT_A), cursor("m2", T2)));
    await assertSucceeds(setDoc(readRef(TEACHER, TEACHER, "teacher"), cursor("m3", T3)));
  });

  it("R2 a member cannot write ANOTHER member's cursor", async () => {
    await seedClassChat();
    await assertFails(setDoc(readRef(STUDENT_A, STUDENT_B), cursor("m2", T2)));
    await assertFails(setDoc(readRef(TEACHER, STUDENT_A, "teacher"), cursor("m2", T2)));
  });

  it("R3 a non-member cannot create a cursor, even for themselves", async () => {
    await seedClassChat();
    await assertFails(setDoc(readRef(OUTSIDER, OUTSIDER), cursor("m2", T2)));
  });

  it("R4 the cursor must point at a message that exists, with that message's own createdAt", async () => {
    await seedClassChat();
    await assertFails(setDoc(readRef(STUDENT_A, STUDENT_A), cursor("m-nope", T2)));
    // Right message, wrong time — a cursor cannot claim a time the message
    // does not have (this is also what keeps it honest against clock skew).
    await assertFails(setDoc(readRef(STUDENT_A, STUDENT_A), cursor("m2", T3)));
    await assertFails(setDoc(readRef(STUDENT_A, STUDENT_A), cursor("m2", Timestamp.fromMillis(T2.toMillis() + 1))));
  });

  it("R5 updatedAt must be the server's clock and no extra field is accepted", async () => {
    await seedClassChat();
    await assertFails(setDoc(readRef(STUDENT_A, STUDENT_A), { lastReadMessageId: "m2", lastReadAt: T2, updatedAt: T2 }));
    await assertFails(setDoc(readRef(STUDENT_A, STUDENT_A), cursor("m2", T2, { online: true })));
    await assertFails(setDoc(readRef(STUDENT_A, STUDENT_A), cursor("m2", T2, { typing: true })));
    await assertFails(setDoc(readRef(STUDENT_A, STUDENT_A), { lastReadMessageId: "m2", updatedAt: serverTimestamp() }));
  });

  it("R6 the cursor only moves forward (or stays): idempotent re-marks pass, going back fails", async () => {
    await seedClassChat();
    await assertSucceeds(setDoc(readRef(STUDENT_A, STUDENT_A), cursor("m2", T2)));
    await assertSucceeds(setDoc(readRef(STUDENT_A, STUDENT_A), cursor("m2", T2)));
    await assertSucceeds(setDoc(readRef(STUDENT_A, STUDENT_A), cursor("m3", T3)));
    await assertFails(setDoc(readRef(STUDENT_A, STUDENT_A), cursor("m1", T1)));
    await assertFails(updateDoc(readRef(STUDENT_A, STUDENT_A), { lastReadMessageId: "m1", lastReadAt: T1, updatedAt: serverTimestamp() }));
    const stored = await getDoc(readRef(STUDENT_A, STUDENT_A));
    expect(stored.data()?.lastReadMessageId).toBe("m3");
  });

  it("R7 any member may read the cursors (this is what a sender's Görüldü is computed from); a non-member may not", async () => {
    await seedClassChat();
    await assertSucceeds(setDoc(readRef(STUDENT_B, STUDENT_B), cursor("m3", T3)));
    await assertSucceeds(getDocs(collection(asStudent(STUDENT_A).firestore(), "classes", CLASS_ID, "chatReads")));
    await assertSucceeds(getDocs(collection(asTeacher(TEACHER).firestore(), "classes", CLASS_ID, "chatReads")));
    await assertFails(getDocs(collection(asStudent(OUTSIDER).firestore(), "classes", CLASS_ID, "chatReads")));
  });

  it("R8 nobody deletes a cursor", async () => {
    await seedClassChat();
    await assertSucceeds(setDoc(readRef(STUDENT_A, STUDENT_A), cursor("m2", T2)));
    await assertFails(deleteDoc(readRef(STUDENT_A, STUDENT_A)));
    await assertFails(deleteDoc(readRef(TEACHER, STUDENT_A, "teacher")));
  });

  it("R9 a member whose membership was removed can no longer move their cursor", async () => {
    await seedClassChat();
    await assertSucceeds(setDoc(readRef(STUDENT_A, STUDENT_A), cursor("m2", T2)));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), "classes", CLASS_ID, "members", STUDENT_A));
    });
    await assertFails(setDoc(readRef(STUDENT_A, STUDENT_A), cursor("m3", T3)));
  });
});

describe("firestore.rules — messages stay closed to every client write (Phase 102 removal is a Cloud Function)", () => {
  it("the CLASS TEACHER cannot soft-delete a student message from the client", async () => {
    await seedClassChat();
    const ref = doc(asTeacher(TEACHER).firestore(), "classes", CLASS_ID, "messages", "m1");
    await assertFails(updateDoc(ref, { deleted: true, deletedAt: serverTimestamp(), deletedBy: TEACHER, text: "" }));
    await assertFails(updateDoc(ref, { deleted: true }));
    await assertFails(deleteDoc(ref));
  });

  it("a student cannot soft-delete, edit or delete their own message", async () => {
    await seedClassChat();
    const ref = doc(asStudent(STUDENT_A).firestore(), "classes", CLASS_ID, "messages", "m1");
    await assertFails(updateDoc(ref, { deleted: true }));
    await assertFails(updateDoc(ref, { text: "düzenlendi", editedAt: serverTimestamp() }));
    await assertFails(deleteDoc(ref));
  });

  it("a member cannot rewrite another member's message", async () => {
    await seedClassChat();
    const ref = doc(asStudent(STUDENT_B).firestore(), "classes", CLASS_ID, "messages", "m1");
    await assertFails(updateDoc(ref, { text: "başkası yazdı" }));
    await assertFails(updateDoc(ref, { senderName: "Öğretmen" }));
  });
});
