import * as fs from "fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const PROJECT_ID = "netflow-edu-rules-test";

function activeUserDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    uid: "student-1",
    email: "student1@example.com",
    displayName: "Student One",
    role: "student",
    organizationId: null,
    photoURL: null,
    totalPoints: 0,
    weeklyPoints: 0,
    accountStatus: "active",
    emailVerified: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("firestore.rules — users/{uid}", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync("firestore.rules", "utf8"),
        host: "127.0.0.1",
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  afterEach(async () => {
    await testEnv.clearFirestore();
  });

  async function seedUser(uid: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid), data);
    });
  }

  // 1. Unauthenticated user cannot read a profile.
  it("denies an unauthenticated read", async () => {
    await seedUser("student-1", activeUserDoc());
    const unauthed = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(unauthed.firestore(), "users", "student-1")));
  });

  // 2. Student can read their own permitted profile.
  it("allows a student to read their own profile", async () => {
    await seedUser("student-1", activeUserDoc());
    const student = testEnv.authenticatedContext("student-1", {
      role: "student",
      organizationId: null,
    });
    await assertSucceeds(getDoc(doc(student.firestore(), "users", "student-1")));
  });

  // 3. Student cannot read another user's profile.
  it("denies a student reading another user's profile", async () => {
    await seedUser("student-2", activeUserDoc({ uid: "student-2", email: "s2@example.com" }));
    const student = testEnv.authenticatedContext("student-1", {
      role: "student",
      organizationId: null,
    });
    await assertFails(getDoc(doc(student.firestore(), "users", "student-2")));
  });

  // 4. Student can update displayName.
  it("allows a student to update their own displayName", async () => {
    await seedUser("student-1", activeUserDoc());
    const student = testEnv.authenticatedContext("student-1", {
      role: "student",
      organizationId: null,
    });
    await assertSucceeds(
      updateDoc(doc(student.firestore(), "users", "student-1"), {
        displayName: "New Name",
        updatedAt: 2,
      }),
    );
  });

  // 5. Student cannot update role.
  it("denies a student updating their own role", async () => {
    await seedUser("student-1", activeUserDoc());
    const student = testEnv.authenticatedContext("student-1", {
      role: "student",
      organizationId: null,
    });
    await assertFails(
      updateDoc(doc(student.firestore(), "users", "student-1"), { role: "teacher" }),
    );
  });

  // 6. Student cannot update organizationId.
  it("denies a student updating their own organizationId", async () => {
    await seedUser("student-1", activeUserDoc());
    const student = testEnv.authenticatedContext("student-1", {
      role: "student",
      organizationId: null,
    });
    await assertFails(
      updateDoc(doc(student.firestore(), "users", "student-1"), { organizationId: "org-1" }),
    );
  });

  // 7. Student cannot update totalPoints.
  it("denies a student updating their own totalPoints", async () => {
    await seedUser("student-1", activeUserDoc());
    const student = testEnv.authenticatedContext("student-1", {
      role: "student",
      organizationId: null,
    });
    await assertFails(
      updateDoc(doc(student.firestore(), "users", "student-1"), { totalPoints: 999 }),
    );
  });

  // 8. Student cannot update weeklyPoints.
  it("denies a student updating their own weeklyPoints", async () => {
    await seedUser("student-1", activeUserDoc());
    const student = testEnv.authenticatedContext("student-1", {
      role: "student",
      organizationId: null,
    });
    await assertFails(
      updateDoc(doc(student.firestore(), "users", "student-1"), { weeklyPoints: 999 }),
    );
  });

  // 9. Student cannot update accountStatus.
  it("denies a student updating their own accountStatus", async () => {
    await seedUser("student-1", activeUserDoc());
    const student = testEnv.authenticatedContext("student-1", {
      role: "student",
      organizationId: null,
    });
    await assertFails(
      updateDoc(doc(student.firestore(), "users", "student-1"), { accountStatus: "suspended" }),
    );
  });

  // 10. Student cannot delete profile.
  it("denies a student deleting their own profile", async () => {
    await seedUser("student-1", activeUserDoc());
    const student = testEnv.authenticatedContext("student-1", {
      role: "student",
      organizationId: null,
    });
    await assertFails(deleteDoc(doc(student.firestore(), "users", "student-1")));
  });

  // 11. Student cannot create themselves as teacher.
  it("denies client-side profile creation entirely, including as teacher", async () => {
    const student = testEnv.authenticatedContext("student-1", {
      role: "student",
      organizationId: null,
    });
    await assertFails(
      setDoc(
        doc(student.firestore(), "users", "student-1"),
        activeUserDoc({ role: "teacher" }),
      ),
    );
  });

  // 12. Student cannot create themselves with nonzero points.
  it("denies client-side profile creation with nonzero points", async () => {
    const student = testEnv.authenticatedContext("student-1", {
      role: "student",
      organizationId: null,
    });
    await assertFails(
      setDoc(
        doc(student.firestore(), "users", "student-1"),
        activeUserDoc({ totalPoints: 500 }),
      ),
    );
  });

  it("denies client-side profile creation even with otherwise-valid student data", async () => {
    // Profiles are created exclusively by the onUserCreate Cloud Function
    // via the Admin SDK (which bypasses rules) — client creates are always
    // denied, matching firestore.rules `allow create: if false`.
    const student = testEnv.authenticatedContext("student-1", {
      role: "student",
      organizationId: null,
    });
    await assertFails(
      setDoc(doc(student.firestore(), "users", "student-1"), activeUserDoc()),
    );
  });
});

describe("firestore.rules — questions/{questionId} answerCount protection", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync("firestore.rules", "utf8"),
        host: "127.0.0.1",
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  afterEach(async () => {
    await testEnv.clearFirestore();
  });

  it("denies a student incrementing their own question's answerCount directly", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "questions", "q1"), {
        ownerId: "student-1",
        organizationId: null,
        visibility: "private",
        imageUrl: "https://example.com/q.jpg",
        classId: null,
        likes: 0,
        comments: 0,
        answerCount: 0,
        createdAt: 1,
      });
    });

    const student = testEnv.authenticatedContext("student-1", {
      role: "student",
      organizationId: null,
    });
    await assertFails(
      updateDoc(doc(student.firestore(), "questions", "q1"), { answerCount: 99 }),
    );
  });
});

function privateQuestionDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ownerId: "student-1",
    organizationId: null,
    visibility: "private",
    imageUrl: "https://example.com/question.jpg",
    classId: null,
    likes: 0,
    comments: 0,
    answerCount: 0,
    createdAt: 1,
    ...overrides,
  };
}

function answerDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    questionId: "q1",
    ownerId: "student-1",
    imageUrl: "https://example.com/answer.jpg",
    method: "photo",
    createdAt: 1,
    ...overrides,
  };
}

describe("firestore.rules — answers/{answerId}", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync("firestore.rules", "utf8"),
        host: "127.0.0.1",
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  afterEach(async () => {
    await testEnv.clearFirestore();
  });

  async function seedQuestion(questionId: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "questions", questionId), data);
    });
  }

  async function seedAnswer(answerId: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "answers", answerId), data);
    });
  }

  function studentContext(uid: string) {
    return testEnv.authenticatedContext(uid, { role: "student", organizationId: null });
  }

  // 14. Unauthenticated answer read is denied.
  it("denies an unauthenticated read of an answer", async () => {
    await seedQuestion("q1", privateQuestionDoc());
    await seedAnswer("a1", answerDoc());

    const unauthed = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(unauthed.firestore(), "answers", "a1")));
  });

  // 11. Private-question answers are inaccessible to another user.
  it("denies a different user from reading an answer to someone else's private question", async () => {
    await seedQuestion("q1", privateQuestionDoc({ ownerId: "student-1" }));
    await seedAnswer("a1", answerDoc({ questionId: "q1", ownerId: "student-1" }));

    const otherStudent = studentContext("student-2");
    await assertFails(getDoc(doc(otherStudent.firestore(), "answers", "a1")));
  });

  it("allows the question owner to read an answer on their own private question", async () => {
    await seedQuestion("q1", privateQuestionDoc({ ownerId: "student-1" }));
    await seedAnswer("a1", answerDoc({ questionId: "q1", ownerId: "student-1" }));

    const owner = studentContext("student-1");
    await assertSucceeds(getDoc(doc(owner.firestore(), "answers", "a1")));
  });

  it("denies reading an answer whose question no longer exists", async () => {
    await seedAnswer("a1", answerDoc({ questionId: "missing-question", ownerId: "student-1" }));

    const student = studentContext("student-1");
    await assertFails(getDoc(doc(student.firestore(), "answers", "a1")));
  });

  // 12. Answer owner cannot be spoofed.
  it("denies creating an answer with a spoofed ownerId", async () => {
    await seedQuestion("q1", privateQuestionDoc({ ownerId: "student-1" }));
    const student = studentContext("student-1");

    await assertFails(
      addDoc(collection(student.firestore(), "answers"), {
        ...answerDoc({ questionId: "q1", ownerId: "student-2" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  // 13. Unsupported answer method is denied.
  it("denies creating an answer with an unsupported method", async () => {
    await seedQuestion("q1", privateQuestionDoc({ ownerId: "student-1" }));
    const student = studentContext("student-1");

    await assertFails(
      addDoc(collection(student.firestore(), "answers"), {
        ...answerDoc({ questionId: "q1", ownerId: "student-1", method: "text" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("denies creating an answer for a question the caller cannot read", async () => {
    await seedQuestion("q1", privateQuestionDoc({ ownerId: "student-1" }));
    const otherStudent = studentContext("student-2");

    await assertFails(
      addDoc(collection(otherStudent.firestore(), "answers"), {
        ...answerDoc({ questionId: "q1", ownerId: "student-2" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("denies creating an answer with a client-supplied (non-server) createdAt", async () => {
    await seedQuestion("q1", privateQuestionDoc({ ownerId: "student-1" }));
    const student = studentContext("student-1");

    await assertFails(
      addDoc(
        collection(student.firestore(), "answers"),
        answerDoc({ questionId: "q1", ownerId: "student-1", createdAt: 12345 }),
      ),
    );
  });

  it("allows the question owner to create a valid photo answer", async () => {
    await seedQuestion("q1", privateQuestionDoc({ ownerId: "student-1" }));
    const student = studentContext("student-1");

    await assertSucceeds(
      addDoc(collection(student.firestore(), "answers"), {
        ...answerDoc({ questionId: "q1", ownerId: "student-1", method: "drawing" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("denies updating an answer after creation (no edit feature exists)", async () => {
    await seedQuestion("q1", privateQuestionDoc({ ownerId: "student-1" }));
    await seedAnswer("a1", answerDoc({ questionId: "q1", ownerId: "student-1" }));
    const student = studentContext("student-1");

    await assertFails(
      updateDoc(doc(student.firestore(), "answers", "a1"), { method: "drawing" }),
    );
  });

  it("denies a student from deleting another user's answer", async () => {
    await seedQuestion("q1", privateQuestionDoc({ ownerId: "student-1" }));
    await seedAnswer("a1", answerDoc({ questionId: "q1", ownerId: "student-1" }));
    const otherStudent = studentContext("student-2");

    await assertFails(deleteDoc(doc(otherStudent.firestore(), "answers", "a1")));
  });

  // 4/5. Answer query filters by questionId and orders by createdAt.
  it("filters by questionId and orders answers by createdAt ascending", async () => {
    await seedQuestion("q1", privateQuestionDoc({ ownerId: "student-1" }));
    await seedQuestion("q2", privateQuestionDoc({ ownerId: "student-1" }));
    await seedAnswer("a1", answerDoc({ questionId: "q1", ownerId: "student-1", createdAt: 3 }));
    await seedAnswer("a2", answerDoc({ questionId: "q1", ownerId: "student-1", createdAt: 1 }));
    await seedAnswer("a3", answerDoc({ questionId: "q1", ownerId: "student-1", createdAt: 2 }));
    // Belongs to a different question — must never appear in q1's results.
    await seedAnswer("a4", answerDoc({ questionId: "q2", ownerId: "student-1", createdAt: 1 }));

    const student = studentContext("student-1");
    const q = query(
      collection(student.firestore(), "answers"),
      where("questionId", "==", "q1"),
      orderBy("createdAt", "asc"),
    );
    const snapshot = await getDocs(q);

    expect(snapshot.docs.map((d) => d.id)).toEqual(["a2", "a3", "a1"]);
  });

  // 6. New answer appears through listener update.
  it("delivers a newly created answer to an active onSnapshot listener", async () => {
    await seedQuestion("q1", privateQuestionDoc({ ownerId: "student-1" }));
    const student = studentContext("student-1");
    const q = query(
      collection(student.firestore(), "answers"),
      where("questionId", "==", "q1"),
      orderBy("createdAt", "asc"),
    );

    const receivedCounts: number[] = [];
    const gotUpdateWithOneAnswer = new Promise<void>((resolve) => {
      const unsubscribe = onSnapshot(q, (snapshot) => {
        receivedCounts.push(snapshot.size);
        if (snapshot.size >= 1) {
          unsubscribe();
          resolve();
        }
      });
    });

    // Written through the same client instance the listener is attached
    // to (rather than a separate withSecurityRulesDisabled admin context)
    // — this is also the realistic case: a real client creates an answer
    // and expects its own active listener to pick it up.
    await addDoc(collection(student.firestore(), "answers"), {
      ...answerDoc({ questionId: "q1", ownerId: "student-1" }),
      createdAt: serverTimestamp(),
    });
    await gotUpdateWithOneAnswer;

    expect(receivedCounts.at(-1)).toBe(1);
  }, 15000);
});
