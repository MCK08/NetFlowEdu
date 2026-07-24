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

  // Onboarding completion (role/organizationId finalization) is
  // Cloud-Function-only — see functions/src/onboarding/completeOnboarding.ts.
  // A client can't set the flag that gates it, which is what makes "role
  // selection happens exactly once, ever" an enforced guarantee and not
  // just convention: even if a client tried to fake completion (to make a
  // later real completeOnboarding call believe it already ran and skip
  // straight to the idempotent branch) or clear it (to try calling
  // completeOnboarding again for a role switch), the field itself never
  // moves via a direct write.
  it("denies a student setting their own onboardingStatus directly", async () => {
    await seedUser("student-1", activeUserDoc());
    const student = testEnv.authenticatedContext("student-1", {
      role: "student",
      organizationId: null,
    });
    await assertFails(
      updateDoc(doc(student.firestore(), "users", "student-1"), {
        onboardingStatus: "complete",
      }),
    );
  });

  it("denies a student changing their own onboardingStatus once already set", async () => {
    await seedUser("student-1", activeUserDoc({ onboardingStatus: "complete" }));
    const student = testEnv.authenticatedContext("student-1", {
      role: "student",
      organizationId: null,
    });
    await assertFails(
      updateDoc(doc(student.firestore(), "users", "student-1"), { onboardingStatus: "pending" }),
    );
  });

  it("denies a student changing their own requestedRole directly (cannot self-promote)", async () => {
    await seedUser(
      "student-1",
      activeUserDoc({ onboardingStatus: "pending", requestedRole: "student" }),
    );
    const student = testEnv.authenticatedContext("student-1", {
      role: "student",
      organizationId: null,
    });
    await assertFails(
      updateDoc(doc(student.firestore(), "users", "student-1"), { requestedRole: "teacher" }),
    );
  });

  // username is exclusively set through the setUsername callable's secure
  // reservation transaction (see functions/src/users/setUsername.ts) — a
  // direct client write must be denied just like every other server-managed
  // field, matching the "profile edits cannot change protected fields"
  // requirement.
  it("denies a student setting their own username directly", async () => {
    await seedUser("student-1", activeUserDoc());
    const student = testEnv.authenticatedContext("student-1", {
      role: "student",
      organizationId: null,
    });
    await assertFails(
      updateDoc(doc(student.firestore(), "users", "student-1"), { username: "hacked" }),
    );
  });

  // A client CAN still update displayName/photoURL/updatedAt even after
  // onboarding has completed — completing onboarding doesn't lock the
  // profile-edit surface, only the server-managed fields.
  it("still allows a student to update displayName after onboarding has completed", async () => {
    await seedUser("student-1", activeUserDoc({ onboardingStatus: "complete" }));
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

  // Step 22 #4 (Phase 7 update): a class question with no real class behind
  // it (classId: null, the default here) denies everyone but its owner —
  // isClassMember(null) can never resolve true. Real membership-gated
  // access is covered by the dedicated "classes" describe block below.
  it("denies a class question with no class behind it to a non-owner", async () => {
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

  // A student (not a teacher, and no real class behind classId: null) can
  // never create a 'class'-visibility question — full teacher+class-owner
  // coverage lives in the dedicated "classes" describe block below.
  it("denies a student creating a question with visibility 'class'", async () => {
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

function classDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "10-A Matematik",
    organizationId: "org-1",
    teacherId: "teacher-1",
    joinCode: "ABC123",
    createdAt: 1,
    updatedAt: 1,
    memberCount: 1,
    status: "active",
    ...overrides,
  };
}

function classMemberDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    uid: "student-1",
    role: "student",
    joinedAt: 1,
    displayName: "Student One",
    photoURL: null,
    ...overrides,
  };
}

// Note: class *mutations* (create/join/leave/remove member/regenerate code)
// are exclusively Cloud-Function-only (see firestore.rules' classes/{classId}
// and classes/{classId}/members/{memberUid} — both `allow write: if false`),
// the same pattern already used for usernames/{username} and
// questionLikes/{likeId}. Rules-unit-testing exercises firestore.rules
// only, not Cloud Functions logic, so "teacher can create a class" /
// "student can join with a valid code" / "duplicate join is idempotent" /
// "student can leave own class" / "teacher can remove own class member" are
// verified by (a) the tests below proving direct client writes to these
// paths are denied for EVERY role (proving the Cloud-Function-only
// invariant these callables rely on), (b) unit tests for the pure
// generateJoinCode/normalizeJoinCode helpers (tests/unit/classJoinCode.test.ts),
// and (c) code review of functions/src/classes/*.ts's role/ownership checks
// — matching the exact depth already established for toggleQuestionLike/
// setUsername in this suite, where the transaction logic itself was never
// exercised against a live Functions emulator either.
describe("firestore.rules — classes/{classId} and members", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    });
  });

  afterAll(async () => testEnv.cleanup());
  afterEach(async () => testEnv.clearFirestore());

  function teacherContext(uid: string, organizationId: string | null = "org-1") {
    return testEnv.authenticatedContext(uid, { role: "teacher", organizationId });
  }

  function studentContext(uid: string, organizationId: string | null = "org-1") {
    return testEnv.authenticatedContext(uid, { role: "student", organizationId });
  }

  async function seedClass(classId: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "classes", classId), data);
    });
  }

  async function seedMember(classId: string, memberUid: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "classes", classId, "members", memberUid), data);
    });
  }

  // ---- classes/{classId} read/write --------------------------------------

  it("lets the owning teacher read their own class", async () => {
    await seedClass("class-1", classDoc());
    await assertSucceeds(getDoc(doc(teacherContext("teacher-1").firestore(), "classes", "class-1")));
  });

  it("lets a class member read the class", async () => {
    await seedClass("class-1", classDoc());
    await seedMember("class-1", "student-1", classMemberDoc());
    await assertSucceeds(getDoc(doc(studentContext("student-1").firestore(), "classes", "class-1")));
  });

  it("denies a non-member, non-owner from reading the class (even same org)", async () => {
    await seedClass("class-1", classDoc());
    await assertFails(getDoc(doc(studentContext("student-2").firestore(), "classes", "class-1")));
  });

  it("denies a direct client create of a class, even for a teacher (Cloud-Function-only)", async () => {
    const teacher = teacherContext("teacher-1");
    await assertFails(setDoc(doc(teacher.firestore(), "classes", "class-1"), classDoc()));
  });

  it("denies a direct client update of a class by its own teacher (Cloud-Function-only)", async () => {
    await seedClass("class-1", classDoc());
    const teacher = teacherContext("teacher-1");
    await assertFails(updateDoc(doc(teacher.firestore(), "classes", "class-1"), { name: "Hacked" }));
  });

  // ---- classes/{classId}/members/{memberUid} read/write ------------------

  it("lets a member read their own membership row", async () => {
    await seedClass("class-1", classDoc());
    await seedMember("class-1", "student-1", classMemberDoc());
    await assertSucceeds(
      getDoc(doc(studentContext("student-1").firestore(), "classes", "class-1", "members", "student-1")),
    );
  });

  it("lets the owning teacher read any member row", async () => {
    await seedClass("class-1", classDoc());
    await seedMember("class-1", "student-1", classMemberDoc());
    await assertSucceeds(
      getDoc(doc(teacherContext("teacher-1").firestore(), "classes", "class-1", "members", "student-1")),
    );
  });

  it("denies one student from reading another student's membership row", async () => {
    await seedClass("class-1", classDoc());
    await seedMember("class-1", "student-1", classMemberDoc());
    await assertFails(
      getDoc(doc(studentContext("student-2").firestore(), "classes", "class-1", "members", "student-1")),
    );
  });

  it("denies a student adding themselves as a member directly (Cloud-Function-only join)", async () => {
    await seedClass("class-1", classDoc());
    const student = studentContext("student-1");
    await assertFails(
      setDoc(
        doc(student.firestore(), "classes", "class-1", "members", "student-1"),
        classMemberDoc(),
      ),
    );
  });

  it("denies a teacher removing a member via a direct delete (Cloud-Function-only)", async () => {
    await seedClass("class-1", classDoc());
    await seedMember("class-1", "student-1", classMemberDoc());
    const teacher = teacherContext("teacher-1");
    await assertFails(
      deleteDoc(doc(teacher.firestore(), "classes", "class-1", "members", "student-1")),
    );
  });

  // ---- questions: visibility 'class' read/create --------------------------

  it("denies a non-member reading a class question", async () => {
    await seedClass("class-1", classDoc());
    await seedMember("class-1", "teacher-1", classMemberDoc({ uid: "teacher-1", role: "teacher" }));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "questions", "q1"),
        classQuestionDoc({ ownerId: "teacher-1", classId: "class-1", organizationId: "org-1" }),
      );
    });
    await assertFails(getDoc(doc(studentContext("student-2").firestore(), "questions", "q1")));
  });

  it("lets a class member read a class question", async () => {
    await seedClass("class-1", classDoc());
    await seedMember("class-1", "student-1", classMemberDoc());
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "questions", "q1"),
        classQuestionDoc({ ownerId: "teacher-1", classId: "class-1", organizationId: "org-1" }),
      );
    });
    await assertSucceeds(getDoc(doc(studentContext("student-1").firestore(), "questions", "q1")));
  });

  it("denies a student posting a class question", async () => {
    await seedClass("class-1", classDoc());
    const student = studentContext("student-1");
    await assertFails(
      addDoc(collection(student.firestore(), "questions"), {
        ...classQuestionDoc({ ownerId: "student-1", classId: "class-1", organizationId: "org-1" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  // Blocker 3 regression: firestore.rules' isTeacher()/organizationId()
  // read ONLY the caller's custom-claims token — never users/{uid}.role —
  // so even a Firestore document that (somehow) already says role:
  // "teacher" grants nothing until the matching custom claim is actually
  // set, which completeOnboarding only ever does after verifying
  // request.auth.token.email_verified server-side. This is what makes
  // "an unverified account can't get usable teacher privileges" a property
  // of the rules themselves, not just of what the client happens to call.
  it("denies posting a class question when the caller's own users/{uid} doc says teacher but their auth claims still say student", async () => {
    await seedClass("class-1", classDoc({ teacherId: "not-yet-a-teacher" }));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", "not-yet-a-teacher"), {
        uid: "not-yet-a-teacher",
        role: "teacher",
        organizationId: "org-1",
        onboardingStatus: "provisioning", // claims not reconciled yet
      });
    });
    // Claims (what the rule actually checks) still say student — exactly
    // the state a caller would be in between the Firestore transaction
    // committing and setCustomUserClaims ever running.
    const stillStudentClaims = testEnv.authenticatedContext("not-yet-a-teacher", {
      role: "student",
      organizationId: null,
    });
    await assertFails(
      addDoc(collection(stillStudentClaims.firestore(), "questions"), {
        ...classQuestionDoc({
          ownerId: "not-yet-a-teacher",
          classId: "class-1",
          organizationId: "org-1",
        }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("lets the owning teacher post a question to their own class", async () => {
    await seedClass("class-1", classDoc());
    const teacher = teacherContext("teacher-1");
    await assertSucceeds(
      addDoc(collection(teacher.firestore(), "questions"), {
        ...classQuestionDoc({ ownerId: "teacher-1", classId: "class-1", organizationId: "org-1" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("denies a different teacher posting into a class they don't own", async () => {
    await seedClass("class-1", classDoc());
    const otherTeacher = teacherContext("teacher-2");
    await assertFails(
      addDoc(collection(otherTeacher.firestore(), "questions"), {
        ...classQuestionDoc({ ownerId: "teacher-2", classId: "class-1", organizationId: "org-1" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("denies posting into a class from a different organization", async () => {
    await seedClass("class-1", classDoc({ organizationId: "org-1" }));
    // Same uid as the class's teacherId, but the caller's *claim* is a
    // different org than the class's own organizationId — proves the rule
    // checks the class doc's org, not just "is this uid the teacherId".
    const teacher = teacherContext("teacher-1", "org-2");
    await assertFails(
      addDoc(collection(teacher.firestore(), "questions"), {
        ...classQuestionDoc({ ownerId: "teacher-1", classId: "class-1", organizationId: "org-2" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  // ---- getClassQuestionsPage LIST query (query provability) --------------
  //
  // Regression coverage for a bug found in pre-deployment audit: the
  // production query was `where('classId','==',classId)` alone (no
  // visibility filter). Firestore's LIST-query provability check statically
  // proves the read rule using only the fields the query itself pins. With
  // only classId pinned, the read rule's `isOwner(resource.data.ownerId) ||
  // canReadQuestionData(resource.data)` couldn't be resolved: `isOwner`
  // needs `ownerId` (unconstrained by this query), and canReadQuestionData's
  // branches are each gated by `data.visibility == '...'`, which is ALSO
  // unconstrained by a classId-only query — so Firestore rejected the whole
  // query with "Property ownerId is undefined on object." before returning
  // any documents at all.
  //
  // The fix was entirely in the query (src/services/questions/questions.ts'
  // getClassQuestionsPage now also filters `where('visibility','==','class')`
  // — not the rule, which is unchanged) — see that function's comment for
  // the full provability walkthrough. Pinning visibility lets Firestore
  // constant-fold canReadQuestionData's 'private'/'public' branches to
  // `false` (their guards become `'class' == 'private'` / `'class' ==
  // 'public'`, both provably false) without ever touching `ownerId`,
  // leaving only `isClassMember(classId)` — fully resolvable from the
  // pinned classId via exists(). This is a legitimate, data-model-true
  // filter (classId is only ever non-null for a 'class'-visibility question
  // — enforced by the create rule), not a query added merely to appease the
  // rule engine, and it changes which documents match nothing.
  describe("getClassQuestionsPage LIST query (query provability)", () => {
    async function seedClassQuestion(id: string, overrides: Partial<Record<string, unknown>> = {}) {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
          doc(context.firestore(), "questions", id),
          classQuestionDoc({
            ownerId: "teacher-1",
            classId: "class-1",
            organizationId: "org-1",
            ...overrides,
          }),
        );
      });
    }

    function classQuestionListQuery(
      firestore: ReturnType<ReturnType<typeof studentContext>["firestore"]>,
      classId: string,
    ) {
      return query(
        collection(firestore, "questions"),
        where("classId", "==", classId),
        where("visibility", "==", "class"),
        orderBy("createdAt", "desc"),
      );
    }

    // Regression test: reproduces the EXACT query shape that failed before
    // the fix (classId equality alone, no visibility filter) — proves it is
    // still rejected outright (not silently empty-filtered), documenting
    // the bug this describe block exists to prevent from recurring.
    it("[regression] the pre-fix query shape (classId alone, no visibility filter) is still unprovable", async () => {
      await seedClass("class-1", classDoc());
      await seedMember("class-1", "student-1", classMemberDoc());
      await seedClassQuestion("q1");

      const unfiltered = query(
        collection(studentContext("student-1").firestore(), "questions"),
        where("classId", "==", "class-1"),
        orderBy("createdAt", "desc"),
      );
      await assertFails(getDocs(unfiltered));
    });

    it("lets a class member list the class's questions", async () => {
      await seedClass("class-1", classDoc());
      await seedMember("class-1", "student-1", classMemberDoc());
      await seedClassQuestion("q1");

      const student = studentContext("student-1");
      const snap = await assertSucceeds(getDocs(classQuestionListQuery(student.firestore(), "class-1")));
      expect(snap.docs.map((d) => d.id)).toEqual(["q1"]);
    });

    it("lets the owning teacher list their own class's questions", async () => {
      await seedClass("class-1", classDoc());
      await seedMember("class-1", "teacher-1", classMemberDoc({ uid: "teacher-1", role: "teacher" }));
      await seedClassQuestion("q1");

      const teacher = teacherContext("teacher-1");
      const snap = await assertSucceeds(getDocs(classQuestionListQuery(teacher.firestore(), "class-1")));
      expect(snap.docs.map((d) => d.id)).toEqual(["q1"]);
    });

    it("denies a non-member from listing the class's questions", async () => {
      await seedClass("class-1", classDoc());
      await seedClassQuestion("q1");

      const outsider = studentContext("student-2");
      await assertFails(getDocs(classQuestionListQuery(outsider.firestore(), "class-1")));
    });

    it("denies a removed member from continuing to list the class's questions", async () => {
      await seedClass("class-1", classDoc());
      await seedMember("class-1", "student-1", classMemberDoc());
      await seedClassQuestion("q1");

      const student = studentContext("student-1");
      // Confirm access while still a member, then simulate removeClassMember
      // deleting the membership row (Cloud-Function-only in production —
      // done here with rules disabled, matching how every other test in
      // this suite seeds/mutates state that only Cloud Functions may write).
      await assertSucceeds(getDocs(classQuestionListQuery(student.firestore(), "class-1")));
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await deleteDoc(doc(context.firestore(), "classes", "class-1", "members", "student-1"));
      });
      await assertFails(getDocs(classQuestionListQuery(student.firestore(), "class-1")));
    });

    it("never leaks another class's questions to a member of a different class", async () => {
      await seedClass("class-1", classDoc());
      await seedClass("class-2", classDoc({ teacherId: "teacher-2" }));
      await seedMember("class-1", "student-1", classMemberDoc());
      await seedMember("class-2", "student-2", classMemberDoc({ uid: "student-2" }));
      await seedClassQuestion("q1", { classId: "class-1" });
      await seedClassQuestion("q2", { classId: "class-2", ownerId: "teacher-2" });

      // Querying class-1 as a class-1 member only ever returns q1, even
      // though q2 (a different class's question) exists in the same
      // collection and the caller is a class member — of the *other* class.
      const student = studentContext("student-1");
      const snap = await assertSucceeds(getDocs(classQuestionListQuery(student.firestore(), "class-1")));
      expect(snap.docs.map((d) => d.id)).toEqual(["q1"]);
    });

    // Confirms the fix is additive, not a change to sibling query shapes —
    // both pre-existing list queries still behave exactly as before.
    it("leaves getOwnQuestionsPage's query behavior unchanged", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
          doc(context.firestore(), "questions", "own-1"),
          privateQuestionDoc({ ownerId: "student-1" }),
        );
      });
      const student = studentContext("student-1");
      const q = query(
        collection(student.firestore(), "questions"),
        where("ownerId", "==", "student-1"),
        orderBy("createdAt", "desc"),
      );
      const snap = await assertSucceeds(getDocs(q));
      expect(snap.docs.map((d) => d.id)).toEqual(["own-1"]);
    });

    it("leaves getPublicQuestionsPage's query behavior unchanged", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
          doc(context.firestore(), "questions", "pub-1"),
          publicQuestionDoc({ ownerId: "student-2" }),
        );
      });
      const student = studentContext("student-1");
      const q = query(
        collection(student.firestore(), "questions"),
        where("visibility", "==", "public"),
        orderBy("createdAt", "desc"),
      );
      const snap = await assertSucceeds(getDocs(q));
      expect(snap.docs.map((d) => d.id)).toEqual(["pub-1"]);
    });
  });
});

function organizationDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: "Ayşe Yılmaz Sınıfları",
    ownerId: "teacher-1",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

// organizations/{organizationId} — created exclusively by completeOnboarding
// (Admin SDK) when a new account picks "teacher" at registration. See
// functions/src/onboarding/completeOnboarding.ts. The transaction/claims
// logic itself isn't exercisable via rules-unit-testing (same precedent as
// createClass/joinClassByCode — verified instead by code review + the
// buildOrganizationName unit test), so this describe block covers exactly
// what the rules layer is responsible for: nobody but the owner can read
// it, and nobody — owner included — can write it directly.
describe("firestore.rules — organizations/{organizationId}", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    });
  });

  afterAll(async () => testEnv.cleanup());
  afterEach(async () => testEnv.clearFirestore());

  function teacherContext(uid: string, organizationId: string | null = null) {
    return testEnv.authenticatedContext(uid, { role: "teacher", organizationId });
  }

  async function seedOrg(id: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "organizations", id), data);
    });
  }

  it("lets the owning teacher read their own organization", async () => {
    await seedOrg("org-1", organizationDoc());
    await assertSucceeds(
      getDoc(doc(teacherContext("teacher-1").firestore(), "organizations", "org-1")),
    );
  });

  it("denies a different teacher from reading someone else's organization", async () => {
    await seedOrg("org-1", organizationDoc());
    await assertFails(
      getDoc(doc(teacherContext("teacher-2").firestore(), "organizations", "org-1")),
    );
  });

  it("denies a client creating an organization directly, even as its own owner", async () => {
    const teacher = teacherContext("teacher-1");
    await assertFails(
      setDoc(doc(teacher.firestore(), "organizations", "org-1"), organizationDoc()),
    );
  });

  it("denies the owning teacher from updating their own organization directly", async () => {
    await seedOrg("org-1", organizationDoc());
    const teacher = teacherContext("teacher-1", "org-1");
    await assertFails(
      updateDoc(doc(teacher.firestore(), "organizations", "org-1"), { name: "Hacked" }),
    );
  });
});
