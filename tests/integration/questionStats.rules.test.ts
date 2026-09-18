import * as fs from "fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

// Phase 108 — questionStats/{questionId}, the anonymous community cohort.
//
// What the rules must hold: a signed-in student may GET the stats document
// of a question they can read (public, own private, their own class); a
// question they cannot read hides its stats too; nobody may LIST the
// collection (no "which questions are hard" scan from the client — that is
// the callable's job, filtered by access); nobody may write a counter or a
// band; and a student still cannot read another student's studyItems, which
// is where the raw per-person evidence lives.

const PROJECT_ID = "netflow-edu-question-stats-rules-test";
const CLASS_ID = "class-1";
const OTHER_CLASS_ID = "class-2";
const TEACHER = "teacher-1";
const STUDENT_A = "student-a";
const STUDENT_B = "student-b";

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

const STATS = { attemptedStudents: 8, struggledStudents: 5, band: "challenging", schemaVersion: 1, updatedAt: 1 };

function questionDoc(overrides: Record<string, unknown>) {
  return {
    ownerId: TEACHER,
    organizationId: "org-1",
    visibility: "public",
    imageUrl: "https://example.test/q.jpg",
    classId: null,
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "8",
    description: null,
    posterRole: "teacher",
    createdAt: 1,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    ...overrides,
  };
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "classes", CLASS_ID, "members", STUDENT_A), { uid: STUDENT_A, role: "student", joinedAt: 1 });
    await setDoc(doc(db, "classes", OTHER_CLASS_ID, "members", STUDENT_B), { uid: STUDENT_B, role: "student", joinedAt: 1 });
    await setDoc(doc(db, "questions", "q-public"), questionDoc({}));
    await setDoc(doc(db, "questions", "q-my-class"), questionDoc({ visibility: "class", classId: CLASS_ID }));
    await setDoc(doc(db, "questions", "q-other-class"), questionDoc({ visibility: "class", classId: OTHER_CLASS_ID }));
    await setDoc(doc(db, "questions", "q-private-b"), questionDoc({ visibility: "private", ownerId: STUDENT_B }));
    for (const id of ["q-public", "q-my-class", "q-other-class", "q-private-b", "q-deleted"]) {
      await setDoc(doc(db, "questionStats", id), STATS);
    }
    await setDoc(doc(db, "users", STUDENT_B, "studyItems", "q-public"), {
      questionId: "q-public", status: "learning", lastOutcome: "struggled", struggledCount: 3, attemptCount: 4,
      nextReviewAt: 1, lastReviewedAt: 1, source: "public", sourceClassId: null,
    });
  });
}

describe("questionStats — single reads gated on question access", () => {
  beforeEach(seed);

  it("a student can get the stats of a question they can read", async () => {
    const db = asStudent(STUDENT_A).firestore();
    await assertSucceeds(getDoc(doc(db, "questionStats", "q-public")));
    await assertSucceeds(getDoc(doc(db, "questionStats", "q-my-class")));
  });

  it("a question the student cannot read hides its stats too", async () => {
    const db = asStudent(STUDENT_A).firestore();
    await assertFails(getDoc(doc(db, "questionStats", "q-other-class")));
    await assertFails(getDoc(doc(db, "questionStats", "q-private-b")));
    await assertFails(getDoc(doc(db, "questionStats", "q-deleted")));
  });

  it("a signed-out reader gets nothing", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "questionStats", "q-public")));
  });
});

describe("questionStats — no list, no write", () => {
  beforeEach(seed);

  it("nobody can list or query the collection", async () => {
    const db = asStudent(STUDENT_A).firestore();
    await assertFails(getDocs(collection(db, "questionStats")));
    await assertFails(getDocs(query(collection(db, "questionStats"), where("attemptedStudents", ">=", 5))));
  });

  it("no client can create, inflate, re-band or delete a cohort", async () => {
    const db = asStudent(STUDENT_A).firestore();
    await assertFails(setDoc(doc(db, "questionStats", "q-new"), STATS));
    await assertFails(updateDoc(doc(db, "questionStats", "q-public"), { attemptedStudents: 999 }));
    await assertFails(updateDoc(doc(db, "questionStats", "q-public"), { band: "light" }));
    await assertFails(deleteDoc(doc(db, "questionStats", "q-public")));
  });
});

describe("raw per-student evidence stays closed", () => {
  beforeEach(seed);

  it("a student cannot read another student's studyItems, singly or as a list", async () => {
    const db = asStudent(STUDENT_A).firestore();
    await assertFails(getDoc(doc(db, "users", STUDENT_B, "studyItems", "q-public")));
    await assertFails(getDocs(collection(db, "users", STUDENT_B, "studyItems")));
    await assertSucceeds(getDocs(collection(db, "users", STUDENT_A, "studyItems")));
  });
});
