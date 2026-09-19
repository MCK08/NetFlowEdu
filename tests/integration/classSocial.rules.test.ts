import * as fs from "fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

// Phase 110 — the safe class social layer, against the real rules.
//
// What must hold:
//   * a CURRENT member of a class may read THAT class's member rows (the
//     public identity snapshot), and nothing about any other class;
//   * leaving a class takes the roster away with it;
//   * no classmate gains any path to another student's private data —
//     users/{uid}, studyItems, studyEvents, notifications, sent kudos;
//   * a sender's kudos record is theirs alone, and no client writes one;
//   * the weekly class pulse is readable by the class and written by no
//     client, and the markers behind it (who took part) are readable by nobody.

const PROJECT_ID = "netflow-edu-class-social-rules-test";
const CLASS_A = "class-a";
const CLASS_B = "class-b";
const TEACHER_A = "teacher-a";
const TEACHER_B = "teacher-b";
const STUDENT_A = "student-a";
const STUDENT_B = "student-b";
const STUDENT_C = "student-c"; // class B only
const WEEK = "2026-09-14";

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

function member(uid: string, role: "student" | "teacher") {
  return { uid, role, joinedAt: 1_700_000_000_000, displayName: `Ad ${uid}`, username: null, photoURL: null };
}

async function seed(options: { archivedA?: boolean } = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "classes", CLASS_A), {
      name: "8-A", teacherId: TEACHER_A, organizationId: "org-1", status: options.archivedA ? "archived" : "active",
    });
    await setDoc(doc(db, "classes", CLASS_B), { name: "8-B", teacherId: TEACHER_B, organizationId: "org-1", status: "active" });
    await setDoc(doc(db, "classes", CLASS_A, "members", TEACHER_A), member(TEACHER_A, "teacher"));
    await setDoc(doc(db, "classes", CLASS_A, "members", STUDENT_A), member(STUDENT_A, "student"));
    await setDoc(doc(db, "classes", CLASS_A, "members", STUDENT_B), member(STUDENT_B, "student"));
    await setDoc(doc(db, "classes", CLASS_B, "members", TEACHER_B), member(TEACHER_B, "teacher"));
    await setDoc(doc(db, "classes", CLASS_B, "members", STUDENT_C), member(STUDENT_C, "student"));

    // STUDENT_B's private world — nothing here may reach a classmate.
    await setDoc(doc(db, "users", STUDENT_B), { email: "b@example.test", displayName: "Ad student-b", role: "student" });
    await setDoc(doc(db, "users", STUDENT_B, "studyItems", "q1"), { questionId: "q1", solvedCount: 1, struggledCount: 3, againCount: 0 });
    await setDoc(doc(db, "users", STUDENT_B, "studyEvents", "e1"), { questionId: "q1", outcome: "struggled", occurredAt: 1, sourceClassId: CLASS_A });
    await setDoc(doc(db, "users", STUDENT_B, "notifications", "n1"), { recipientId: STUDENT_B, type: "class_kudos_received" });
    await setDoc(doc(db, "users", STUDENT_B, "sentKudos", "question__q9"), { classId: CLASS_A, targetId: "q9", recipientId: STUDENT_A });

    await setDoc(doc(db, "classes", CLASS_A, "pulse", WEEK), {
      weekKey: WEEK, weekStart: 0, outcomeCount: 9, solvedCount: 5, participantCount: 3, schemaVersion: 1,
    });
    await setDoc(doc(db, "classes", CLASS_A, "pulse", WEEK, "participants", STUDENT_B), { firstCountedAt: 1 });
    await setDoc(doc(db, "classes", CLASS_A, "pulse", WEEK, "events", `${STUDENT_B}__e1`), { countedAt: 1 });
  });
}

describe("classmates — a class's own roster, and only its own", () => {
  it("1. a student can list the safe member rows of their own class", async () => {
    await seed();
    const snap = await assertSucceeds(getDocs(collection(asStudent(STUDENT_A).firestore(), "classes", CLASS_A, "members")));
    expect(snap.docs.map((d) => d.id).sort()).toEqual([STUDENT_A, STUDENT_B, TEACHER_A].sort());
  });

  it("1b. …and read one classmate's row directly", async () => {
    await seed();
    await assertSucceeds(getDoc(doc(asStudent(STUDENT_A).firestore(), "classes", CLASS_A, "members", STUDENT_B)));
  });

  it("2. a student cannot list or read another class's members", async () => {
    await seed();
    const db = asStudent(STUDENT_A).firestore();
    await assertFails(getDocs(collection(db, "classes", CLASS_B, "members")));
    await assertFails(getDoc(doc(db, "classes", CLASS_B, "members", STUDENT_C)));
  });

  it("2b. the collection group still yields only the caller's OWN memberships", async () => {
    await seed();
    const db = asStudent(STUDENT_A).firestore();
    await assertFails(getDocs(query(collectionGroup(db, "members"), where("uid", "==", STUDENT_B))));
    await assertSucceeds(getDocs(query(collectionGroup(db, "members"), where("uid", "==", STUDENT_A))));
  });

  it("3. a classmate still cannot read a peer's private user or study data", async () => {
    await seed();
    const db = asStudent(STUDENT_A).firestore();
    await assertFails(getDoc(doc(db, "users", STUDENT_B)));
    await assertFails(getDoc(doc(db, "users", STUDENT_B, "studyItems", "q1")));
    await assertFails(getDocs(collection(db, "users", STUDENT_B, "studyItems")));
    await assertFails(getDoc(doc(db, "users", STUDENT_B, "studyEvents", "e1")));
    await assertFails(getDoc(doc(db, "users", STUDENT_B, "notifications", "n1")));
    await assertFails(getDoc(doc(db, "users", STUDENT_B, "sentKudos", "question__q9")));
  });

  it("4. teacher access is unchanged: own class yes, another teacher's class no", async () => {
    await seed();
    await assertSucceeds(getDocs(collection(asTeacher(TEACHER_A).firestore(), "classes", CLASS_A, "members")));
    await assertFails(getDocs(collection(asTeacher(TEACHER_B).firestore(), "classes", CLASS_A, "members")));
  });

  it("5. an archived class keeps its roster for its members, and closed to everyone else", async () => {
    await seed({ archivedA: true });
    await assertSucceeds(getDocs(collection(asStudent(STUDENT_A).firestore(), "classes", CLASS_A, "members")));
    await assertFails(getDocs(collection(asStudent(STUDENT_C).firestore(), "classes", CLASS_A, "members")));
  });

  it("6. a removed member loses the roster the moment their own row is gone", async () => {
    await seed();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), "classes", CLASS_A, "members", STUDENT_A));
    });
    const db = asStudent(STUDENT_A).firestore();
    await assertFails(getDocs(collection(db, "classes", CLASS_A, "members")));
    await assertFails(getDoc(doc(db, "classes", CLASS_A, "members", STUDENT_B)));
  });

  it("no member can write a member row, not even their own", async () => {
    await seed();
    const db = asStudent(STUDENT_A).firestore();
    await assertFails(updateDoc(doc(db, "classes", CLASS_A, "members", STUDENT_A), { displayName: "Başka" }));
    await assertFails(setDoc(doc(db, "classes", CLASS_A, "members", STUDENT_C), member(STUDENT_C, "student")));
  });
});

describe("kudos records — private to their sender, written by no client", () => {
  it("the sender reads their own sent kudos", async () => {
    await seed();
    await assertSucceeds(getDocs(collection(asStudent(STUDENT_B).firestore(), "users", STUDENT_B, "sentKudos")));
  });

  it("nobody can write one directly — no spoofed sender, no self-made record", async () => {
    await seed();
    const own = asStudent(STUDENT_A).firestore();
    await assertFails(setDoc(doc(own, "users", STUDENT_A, "sentKudos", "question__qx"), { classId: CLASS_A, targetId: "qx", recipientId: STUDENT_B }));
    await assertFails(setDoc(doc(own, "users", STUDENT_B, "sentKudos", "question__qx"), { classId: CLASS_A, targetId: "qx", recipientId: STUDENT_A }));
    await assertFails(setDoc(doc(own, "users", STUDENT_B, "notifications", "forged"), { recipientId: STUDENT_B, actorId: STUDENT_A, type: "class_kudos_received" }));
    const sender = asStudent(STUDENT_B).firestore();
    await assertFails(deleteDoc(doc(sender, "users", STUDENT_B, "sentKudos", "question__q9")));
  });
});

describe("the weekly class pulse — the class's own aggregate", () => {
  it("is readable by the class's members and teacher", async () => {
    await seed();
    await assertSucceeds(getDoc(doc(asStudent(STUDENT_A).firestore(), "classes", CLASS_A, "pulse", WEEK)));
    await assertSucceeds(getDoc(doc(asTeacher(TEACHER_A).firestore(), "classes", CLASS_A, "pulse", WEEK)));
  });

  it("is closed to another class", async () => {
    await seed();
    await assertFails(getDoc(doc(asStudent(STUDENT_C).firestore(), "classes", CLASS_A, "pulse", WEEK)));
  });

  it("is written by no client — a member cannot inflate it and a teacher cannot edit it", async () => {
    await seed();
    await assertFails(updateDoc(doc(asStudent(STUDENT_A).firestore(), "classes", CLASS_A, "pulse", WEEK), { solvedCount: 999 }));
    await assertFails(updateDoc(doc(asTeacher(TEACHER_A).firestore(), "classes", CLASS_A, "pulse", WEEK), { participantCount: 0 }));
    await assertFails(setDoc(doc(asStudent(STUDENT_A).firestore(), "classes", CLASS_A, "pulse", "2026-09-21"), { outcomeCount: 1 }));
  });

  it("never lets anyone read who took part", async () => {
    await seed();
    for (const db of [asStudent(STUDENT_A).firestore(), asTeacher(TEACHER_A).firestore(), asStudent(STUDENT_B).firestore()]) {
      await assertFails(getDocs(collection(db, "classes", CLASS_A, "pulse", WEEK, "participants")));
      await assertFails(getDoc(doc(db, "classes", CLASS_A, "pulse", WEEK, "participants", STUDENT_B)));
      await assertFails(getDocs(collection(db, "classes", CLASS_A, "pulse", WEEK, "events")));
    }
  });
});
