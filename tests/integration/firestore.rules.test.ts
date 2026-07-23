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
        likeCount: 0,
        commentCount: 0,
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
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    createdAt: 1,
    ...overrides,
  };
}

function publicQuestionDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return privateQuestionDoc({ visibility: "public", ...overrides });
}

function classQuestionDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return privateQuestionDoc({ visibility: "class", ...overrides });
}

function answerDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    questionId: "q1",
    ownerId: "student-1",
    imageUrl: "https://example.com/answer.jpg",
    method: "photo",
    likeCount: 0,
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

function publicProfileDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    uid: "student-1",
    username: "student1",
    displayName: "Student One",
    photoURL: null,
    role: "student",
    organizationId: null,
    totalPoints: 0,
    weeklyPoints: 0,
    createdAt: 1,
    ...overrides,
  };
}

function commentDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    questionId: "q1",
    ownerId: "student-1",
    text: "Merhaba",
    status: "active",
    createdAt: 1,
    ...overrides,
  };
}

describe("firestore.rules — questions/{questionId} visibility model", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    });
  });

  afterAll(async () => testEnv.cleanup());
  afterEach(async () => testEnv.clearFirestore());

  async function seedQuestion(id: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "questions", id), data);
    });
  }

  function studentContext(uid: string) {
    return testEnv.authenticatedContext(uid, { role: "student", organizationId: null });
  }

  // Step 22 #1: private question hidden from unrelated user.
  it("hides a private question from an unrelated user", async () => {
    await seedQuestion("q1", privateQuestionDoc({ ownerId: "student-1" }));
    await assertFails(getDoc(doc(studentContext("student-2").firestore(), "questions", "q1")));
  });

  // Step 22 #2: public question readable by authenticated user.
  it("lets any authenticated user read a public question", async () => {
    await seedQuestion("q1", publicQuestionDoc({ ownerId: "student-1" }));
    await assertSucceeds(getDoc(doc(studentContext("student-2").firestore(), "questions", "q1")));
  });

  // Step 22 #3: unauthenticated user cannot read a public question.
  it("denies an unauthenticated user reading a public question", async () => {
    await seedQuestion("q1", publicQuestionDoc({ ownerId: "student-1" }));
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "questions", "q1")));
  });

  // Step 22 #4: class question denied to nonmember (no roster system yet —
  // owner-only, same as private, until one exists — see firestore.rules).
  it("denies a class question to a non-owner (no membership system yet)", async () => {
    await seedQuestion("q1", classQuestionDoc({ ownerId: "student-1" }));
    await assertFails(getDoc(doc(studentContext("student-2").firestore(), "questions", "q1")));
  });

  it("still lets the owner read their own class-visibility question", async () => {
    await seedQuestion("q1", classQuestionDoc({ ownerId: "student-1" }));
    await assertSucceeds(getDoc(doc(studentContext("student-1").firestore(), "questions", "q1")));
  });

  it("allows creating a public question", async () => {
    const student = studentContext("student-1");
    await assertSucceeds(
      addDoc(collection(student.firestore(), "questions"), {
        ...publicQuestionDoc({ ownerId: "student-1" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  // 'class' is schema-reserved but not creatable yet.
  it("denies creating a question with visibility 'class'", async () => {
    const student = studentContext("student-1");
    await assertFails(
      addDoc(collection(student.firestore(), "questions"), {
        ...classQuestionDoc({ ownerId: "student-1" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("denies creating a question with a nonzero likeCount/commentCount", async () => {
    const student = studentContext("student-1");
    await assertFails(
      addDoc(collection(student.firestore(), "questions"), {
        ...publicQuestionDoc({ ownerId: "student-1", likeCount: 5 }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("denies a student changing their own question's visibility after creation", async () => {
    await seedQuestion("q1", privateQuestionDoc({ ownerId: "student-1" }));
    const student = studentContext("student-1");
    await assertFails(
      updateDoc(doc(student.firestore(), "questions", "q1"), { visibility: "public" }),
    );
  });

  it("denies a student incrementing their own question's likeCount directly", async () => {
    await seedQuestion("q1", publicQuestionDoc({ ownerId: "student-1" }));
    const student = studentContext("student-1");
    await assertFails(updateDoc(doc(student.firestore(), "questions", "q1"), { likeCount: 5 }));
  });

  it("denies a student incrementing their own question's commentCount directly", async () => {
    await seedQuestion("q1", publicQuestionDoc({ ownerId: "student-1" }));
    const student = studentContext("student-1");
    await assertFails(updateDoc(doc(student.firestore(), "questions", "q1"), { commentCount: 5 }));
  });
});

describe("firestore.rules — publicProfiles/{uid}", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    });
  });

  afterAll(async () => testEnv.cleanup());
  afterEach(async () => testEnv.clearFirestore());

  async function seedPublicProfile(uid: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "publicProfiles", uid), data);
    });
  }

  it("lets any authenticated user read another user's public profile", async () => {
    await seedPublicProfile("student-1", publicProfileDoc());
    const other = testEnv.authenticatedContext("student-2", { role: "student", organizationId: null });
    await assertSucceeds(getDoc(doc(other.firestore(), "publicProfiles", "student-1")));
  });

  it("denies an unauthenticated user reading a public profile", async () => {
    await seedPublicProfile("student-1", publicProfileDoc());
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "publicProfiles", "student-1")));
  });

  // Step 22 #8/#9: publicProfiles never has email/accountStatus in the
  // first place (see functions/src/profiles/syncPublicProfile.ts, the
  // only writer) — proven here structurally: the owner-only users/{uid}
  // doc is where those fields live, and it stays unreadable cross-user
  // even though publicProfiles/{uid} for the same uid is readable.
  it("keeps users/{uid} (which has email/accountStatus) unreadable cross-user even though publicProfiles/{uid} is readable", async () => {
    await seedPublicProfile("student-1", publicProfileDoc());
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", "student-1"), activeUserDoc());
    });
    const other = testEnv.authenticatedContext("student-2", { role: "student", organizationId: null });

    await assertSucceeds(getDoc(doc(other.firestore(), "publicProfiles", "student-1")));
    await assertFails(getDoc(doc(other.firestore(), "users", "student-1")));
  });

  it("denies any client write to publicProfiles — server-only via syncPublicProfile", async () => {
    const student = testEnv.authenticatedContext("student-1", { role: "student", organizationId: null });
    await assertFails(setDoc(doc(student.firestore(), "publicProfiles", "student-1"), publicProfileDoc()));
  });
});

describe("firestore.rules — questionLikes/{likeId} and answerLikes/{likeId}", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    });
  });

  afterAll(async () => testEnv.cleanup());
  afterEach(async () => testEnv.clearFirestore());

  function studentContext(uid: string) {
    return testEnv.authenticatedContext(uid, { role: "student", organizationId: null });
  }

  async function seedLike(collectionName: string, id: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), collectionName, id), data);
    });
  }

  // Step 22 #13: a client can never write its own like doc directly — the
  // only path is the toggleQuestionLike/toggleAnswerLike callables (Admin
  // SDK), which is exactly what makes the owner unspoofable.
  it("denies a client creating a questionLikes doc directly, even as themselves", async () => {
    const student = studentContext("student-1");
    await assertFails(
      setDoc(doc(student.firestore(), "questionLikes", "q1_student-1"), {
        userId: "student-1",
        targetId: "q1",
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("denies a client creating an answerLikes doc directly", async () => {
    const student = studentContext("student-1");
    await assertFails(
      setDoc(doc(student.firestore(), "answerLikes", "a1_student-1"), {
        userId: "student-1",
        targetId: "a1",
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("lets a user read their own questionLikes record", async () => {
    await seedLike("questionLikes", "q1_student-1", {
      userId: "student-1",
      targetId: "q1",
      createdAt: 1,
    });
    const student = studentContext("student-1");
    await assertSucceeds(getDoc(doc(student.firestore(), "questionLikes", "q1_student-1")));
  });

  it("denies a user reading another user's questionLikes record", async () => {
    await seedLike("questionLikes", "q1_student-1", {
      userId: "student-1",
      targetId: "q1",
      createdAt: 1,
    });
    const otherStudent = studentContext("student-2");
    await assertFails(getDoc(doc(otherStudent.firestore(), "questionLikes", "q1_student-1")));
  });

  // The common case: most question/answer pairs have no like doc at all.
  // Before `resource == null || ...` was added to the rule, this get()
  // errored on `resource.data.userId` (resource is null for a
  // non-existent doc), which Firestore surfaced to the client as
  // permission-denied — reproduced on a real device via useLike's
  // getMyLikeState() on a question that had never been liked.
  it("lets a user read a questionLikes doc that doesn't exist yet (not liked)", async () => {
    const student = studentContext("student-1");
    const snapshot = await getDoc(doc(student.firestore(), "questionLikes", "q1_student-1"));
    expect(snapshot.exists()).toBe(false);
  });

  it("lets a user read an answerLikes doc that doesn't exist yet (not liked)", async () => {
    const student = studentContext("student-1");
    const snapshot = await getDoc(doc(student.firestore(), "answerLikes", "a1_student-1"));
    expect(snapshot.exists()).toBe(false);
  });

  it("denies a client deleting a questionLikes doc directly", async () => {
    await seedLike("questionLikes", "q1_student-1", {
      userId: "student-1",
      targetId: "q1",
      createdAt: 1,
    });
    const student = studentContext("student-1");
    await assertFails(deleteDoc(doc(student.firestore(), "questionLikes", "q1_student-1")));
  });
});

describe("firestore.rules — questionComments/{commentId}", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    });
  });

  afterAll(async () => testEnv.cleanup());
  afterEach(async () => testEnv.clearFirestore());

  async function seedQuestion(id: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "questions", id), data);
    });
  }

  async function seedComment(id: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "questionComments", id), data);
    });
  }

  function studentContext(uid: string) {
    return testEnv.authenticatedContext(uid, { role: "student", organizationId: null });
  }

  it("denies an unauthenticated user reading comments", async () => {
    await seedQuestion("q1", publicQuestionDoc({ ownerId: "student-1" }));
    await seedComment("c1", commentDoc());
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "questionComments", "c1")));
  });

  // Step 22 #21: private question comments hidden from unrelated user.
  it("hides comments on a private question from an unrelated user", async () => {
    await seedQuestion("q1", privateQuestionDoc({ ownerId: "student-1" }));
    await seedComment("c1", commentDoc({ questionId: "q1", ownerId: "student-1" }));
    await assertFails(getDoc(doc(studentContext("student-2").firestore(), "questionComments", "c1")));
  });

  it("lets any authenticated user read comments on a public question", async () => {
    await seedQuestion("q1", publicQuestionDoc({ ownerId: "student-1" }));
    await seedComment("c1", commentDoc({ questionId: "q1", ownerId: "student-1" }));
    await assertSucceeds(
      getDoc(doc(studentContext("student-2").firestore(), "questionComments", "c1")),
    );
  });

  it("allows an authenticated user to create their own comment on a public question", async () => {
    await seedQuestion("q1", publicQuestionDoc({ ownerId: "student-1" }));
    const commenter = studentContext("student-2");
    await assertSucceeds(
      addDoc(collection(commenter.firestore(), "questionComments"), {
        ...commentDoc({ questionId: "q1", ownerId: "student-2" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  // Step 22 #14: comment ownerId cannot be spoofed.
  it("denies creating a comment with a spoofed ownerId", async () => {
    await seedQuestion("q1", publicQuestionDoc({ ownerId: "student-1" }));
    const student = studentContext("student-2");
    await assertFails(
      addDoc(collection(student.firestore(), "questionComments"), {
        ...commentDoc({ questionId: "q1", ownerId: "student-1" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  // Step 22 #15: empty comment rejected.
  it("denies creating an empty comment", async () => {
    await seedQuestion("q1", publicQuestionDoc({ ownerId: "student-1" }));
    const student = studentContext("student-1");
    await assertFails(
      addDoc(collection(student.firestore(), "questionComments"), {
        ...commentDoc({ questionId: "q1", ownerId: "student-1", text: "" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  // Step 22 #16: over-500-character comment rejected.
  it("denies creating a comment over 500 characters", async () => {
    await seedQuestion("q1", publicQuestionDoc({ ownerId: "student-1" }));
    const student = studentContext("student-1");
    await assertFails(
      addDoc(collection(student.firestore(), "questionComments"), {
        ...commentDoc({ questionId: "q1", ownerId: "student-1", text: "a".repeat(501) }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("allows exactly 500 characters", async () => {
    await seedQuestion("q1", publicQuestionDoc({ ownerId: "student-1" }));
    const student = studentContext("student-1");
    await assertSucceeds(
      addDoc(collection(student.firestore(), "questionComments"), {
        ...commentDoc({ questionId: "q1", ownerId: "student-1", text: "a".repeat(500) }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("denies creating a comment for a question the caller cannot read", async () => {
    await seedQuestion("q1", privateQuestionDoc({ ownerId: "student-1" }));
    const student = studentContext("student-2");
    await assertFails(
      addDoc(collection(student.firestore(), "questionComments"), {
        ...commentDoc({ questionId: "q1", ownerId: "student-2" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("denies editing a comment after creation", async () => {
    await seedQuestion("q1", publicQuestionDoc({ ownerId: "student-1" }));
    await seedComment("c1", commentDoc({ questionId: "q1", ownerId: "student-1" }));
    const student = studentContext("student-1");
    await assertFails(
      updateDoc(doc(student.firestore(), "questionComments", "c1"), { text: "edited" }),
    );
  });

  // Step 22 #17: user may delete own comment.
  it("allows a user to delete their own comment", async () => {
    await seedQuestion("q1", publicQuestionDoc({ ownerId: "student-1" }));
    await seedComment("c1", commentDoc({ questionId: "q1", ownerId: "student-1" }));
    const student = studentContext("student-1");
    await assertSucceeds(deleteDoc(doc(student.firestore(), "questionComments", "c1")));
  });

  // Step 22 #18: user may not delete another user's comment.
  it("denies a user deleting another user's comment", async () => {
    await seedQuestion("q1", publicQuestionDoc({ ownerId: "student-1" }));
    await seedComment("c1", commentDoc({ questionId: "q1", ownerId: "student-1" }));
    const otherStudent = studentContext("student-2");
    await assertFails(deleteDoc(doc(otherStudent.firestore(), "questionComments", "c1")));
  });
});

describe("firestore.rules — users/{uid}/savedQuestions/{questionId}", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    });
  });

  afterAll(async () => testEnv.cleanup());
  afterEach(async () => testEnv.clearFirestore());

  function studentContext(uid: string) {
    return testEnv.authenticatedContext(uid, { role: "student", organizationId: null });
  }

  it("lets a user save a question to their own savedQuestions", async () => {
    const student = studentContext("student-1");
    await assertSucceeds(
      setDoc(doc(student.firestore(), "users", "student-1", "savedQuestions", "q1"), {
        ownerId: "student-2",
        organizationId: null,
        visibility: "public",
        imageUrl: "https://example.com/q1.jpg",
        classId: null,
        likeCount: 0,
        commentCount: 0,
        answerCount: 0,
        createdAt: 1,
        savedAt: serverTimestamp(),
      }),
    );
  });

  it("lets a user read their own savedQuestions", async () => {
    const student = studentContext("student-1");
    await setDoc(doc(student.firestore(), "users", "student-1", "savedQuestions", "q1"), {
      ownerId: "student-2",
      savedAt: serverTimestamp(),
    });
    await assertSucceeds(getDoc(doc(student.firestore(), "users", "student-1", "savedQuestions", "q1")));
  });

  it("denies a user reading another user's savedQuestions", async () => {
    const otherStudent = studentContext("student-2");
    await assertFails(
      getDoc(doc(otherStudent.firestore(), "users", "student-1", "savedQuestions", "q1")),
    );
  });

  it("denies a user writing to another user's savedQuestions", async () => {
    const otherStudent = studentContext("student-2");
    await assertFails(
      setDoc(doc(otherStudent.firestore(), "users", "student-1", "savedQuestions", "q1"), {
        ownerId: "student-1",
        savedAt: serverTimestamp(),
      }),
    );
  });

  it("lets a user remove their own saved question", async () => {
    const student = studentContext("student-1");
    await setDoc(doc(student.firestore(), "users", "student-1", "savedQuestions", "q1"), {
      ownerId: "student-2",
      savedAt: serverTimestamp(),
    });
    await assertSucceeds(deleteDoc(doc(student.firestore(), "users", "student-1", "savedQuestions", "q1")));
  });

  // getSavedQuestionsPage's exact query shape — a plain orderBy with no
  // where clause at all. Unlike questions/{questionId} (see below), this
  // rule (`isOwner(uid)`) depends only on the {uid} *path* segment, which
  // is always known for any query under that path — never on
  // resource.data — so it's provable regardless of query shape.
  it("lets a user list their own savedQuestions via a plain orderBy(savedAt) query", async () => {
    const student = studentContext("student-1");
    await setDoc(doc(student.firestore(), "users", "student-1", "savedQuestions", "q1"), {
      ownerId: "student-2",
      savedAt: serverTimestamp(),
    });
    const q = query(
      collection(student.firestore(), "users", "student-1", "savedQuestions"),
      orderBy("savedAt", "desc"),
    );
    await assertSucceeds(getDocs(q));
  });
});

describe("firestore.rules — questions/{questionId} list queries (query provability)", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    });
  });

  afterAll(async () => testEnv.cleanup());
  afterEach(async () => testEnv.clearFirestore());

  function studentContext(uid: string) {
    return testEnv.authenticatedContext(uid, { role: "student", organizationId: null });
  }

  async function seedQuestion(id: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "questions", id), data);
    });
  }

  // Regression test for the exact bug getOwnQuestionsPage hit in
  // production: `where('ownerId','==',uid())` alone (no visibility
  // filter) must be a provable query, so the owner can list ALL of their
  // own questions regardless of visibility in one query — see the comment
  // on the questions/{questionId} read rule.
  it("lets the owner list their own questions (mixed visibility) via where(ownerId)+orderBy(createdAt)", async () => {
    await seedQuestion("q1", {
      ownerId: "student-1",
      organizationId: null,
      visibility: "private",
      imageUrl: "https://example.com/q1.jpg",
      classId: null,
      likeCount: 0,
      commentCount: 0,
      answerCount: 0,
      createdAt: 1,
    });
    await seedQuestion("q2", {
      ownerId: "student-1",
      organizationId: null,
      visibility: "public",
      imageUrl: "https://example.com/q2.jpg",
      classId: null,
      likeCount: 0,
      commentCount: 0,
      answerCount: 0,
      createdAt: 2,
    });

    const student = studentContext("student-1");
    const q = query(
      collection(student.firestore(), "questions"),
      where("ownerId", "==", "student-1"),
      orderBy("createdAt", "desc"),
    );
    const snapshot = await assertSucceeds(getDocs(q));
    expect(snapshot.docs.map((d) => d.id).sort()).toEqual(["q1", "q2"]);
  });

  it("still denies a different user listing someone else's private questions by ownerId", async () => {
    await seedQuestion("q1", {
      ownerId: "student-1",
      organizationId: null,
      visibility: "private",
      imageUrl: "https://example.com/q1.jpg",
      classId: null,
      likeCount: 0,
      commentCount: 0,
      answerCount: 0,
      createdAt: 1,
    });

    const otherStudent = studentContext("student-2");
    const q = query(
      collection(otherStudent.firestore(), "questions"),
      where("ownerId", "==", "student-1"),
      orderBy("createdAt", "desc"),
    );
    await assertFails(getDocs(q));
  });

  it("still lets any signed-in user list public questions via where(visibility)+orderBy(createdAt)", async () => {
    await seedQuestion("q1", {
      ownerId: "student-1",
      organizationId: null,
      visibility: "public",
      imageUrl: "https://example.com/q1.jpg",
      classId: null,
      likeCount: 0,
      commentCount: 0,
      answerCount: 0,
      createdAt: 1,
    });

    const otherStudent = studentContext("student-2");
    const q = query(
      collection(otherStudent.firestore(), "questions"),
      where("visibility", "==", "public"),
      orderBy("createdAt", "desc"),
    );
    await assertSucceeds(getDocs(q));
  });
});
