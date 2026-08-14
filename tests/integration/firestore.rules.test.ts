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
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
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
    subject: "",
    description: null,
    posterRole: "student",
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

// posterRole defaults to "teacher" here (not privateQuestionDoc's "student")
// because every EXISTING class-question test in this suite creates the
// question as the class's own teacher — callers that need a
// student-authored class question override posterRole explicitly (see the
// Phase 9.1 describe block below).
function classQuestionDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return privateQuestionDoc({ visibility: "class", posterRole: "teacher", ...overrides });
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

  // Phase 17B CHANGED THIS TEST from assertSucceeds to assertFails.
  //
  // An answer is an IMAGE, so nothing about it can be judged without looking
  // at the picture. It is now created only by submitAnswerForModeration
  // (Admin SDK) after Vision SafeSearch has cleared the image AND its OCR
  // text has cleared the Turkish deterministic layer.
  //
  // Denying even a perfectly valid answer from its rightful owner is the
  // point: if this ever passes again, a modified client can write the
  // document directly, and onAnswerCreate will increment answerCount and
  // notify the question owner for content nothing has inspected.
  it("denies even a valid client answer create — publication is backend-only", async () => {
    await seedQuestion("q1", privateQuestionDoc({ ownerId: "student-1" }));
    const student = studentContext("student-1");

    await assertFails(
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
    let resolveListenerReady: () => void;
    const listenerReady = new Promise<void>((resolve) => {
      resolveListenerReady = resolve;
    });
    let resolveGotUpdateWithOneAnswer: () => void;
    const gotUpdateWithOneAnswer = new Promise<void>((resolve) => {
      resolveGotUpdateWithOneAnswer = resolve;
    });
    const unsubscribe = onSnapshot(q, (snapshot) => {
      receivedCounts.push(snapshot.size);
      // The listener's own first callback — whatever its contents — is
      // proof the client has actually subscribed to the backend, which is
      // the one thing "attach a listener, then onSnapshot(q, ...) returns"
      // does NOT guarantee: subscribing is a round trip, so writing right
      // after the call returns (the old version of this test) could
      // outrace the subscribe request itself, especially since the write
      // below travels over a separate withSecurityRulesDisabled connection.
      resolveListenerReady();
      if (snapshot.size >= 1) {
        unsubscribe();
        resolveGotUpdateWithOneAnswer();
      }
    });

    // Deterministic readiness gate, not a timer — waits for the SDK's own
    // proof of subscription instead of guessing how long that takes.
    await listenerReady;

    // Phase 17B: written through a rules-disabled context, because that is
    // now the realistic case — an answer is created by
    // submitAnswerForModeration with the Admin SDK, which bypasses rules,
    // and never by the client. What this test actually pins down is
    // unchanged and still the point: once an answer IS published, an
    // already-attached client listener receives it.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await addDoc(collection(context.firestore(), "answers"), {
        ...answerDoc({ questionId: "q1", ownerId: "student-1" }),
        createdAt: serverTimestamp(),
      });
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

  // Phase 21 — topic/gradeLevel/choices/correctChoice are new fields with
  // no dedicated allowlist entry in the create rule (same trust level as
  // subject/description already had): this proves they pass straight
  // through rather than silently causing the whole create to be denied,
  // AND that they read back exactly as written — the create rule has no
  // `hasOnly()` restricting the document to a fixed field set.
  it("allows creating and reading back a public question with Phase 21 metadata", async () => {
    const student = studentContext("student-1");
    const ref = await assertSucceeds(
      addDoc(collection(student.firestore(), "questions"), {
        ...publicQuestionDoc({ ownerId: "student-1" }),
        topic: "Denklemler",
        gradeLevel: "9",
        choices: { A: "Paris", B: "London" },
        correctChoice: "A",
        createdAt: serverTimestamp(),
      }),
    );

    const snapshot = await getDoc(doc(student.firestore(), "questions", ref.id));
    expect(snapshot.data()?.topic).toBe("Denklemler");
    expect(snapshot.data()?.gradeLevel).toBe("9");
    expect(snapshot.data()?.choices).toEqual({ A: "Paris", B: "London" });
    expect(snapshot.data()?.correctChoice).toBe("A");
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

  // Phase 17 CHANGED THIS TEST from assertSucceeds to assertFails.
  //
  // A well-formed comment from a legitimately authorized user is now denied
  // at the rules layer, on purpose: comments are published only by
  // submitQuestionCommentForModeration, after the text has passed the
  // moderation decision layer. Denying even the happy path here is what
  // makes the gate unbypassable — if this ever passes again, a modified
  // client can skip moderation entirely and its comment will still fire the
  // counter and the question-owner notification.
  it("denies even a well-formed client comment create — publication is backend-only", async () => {
    await seedQuestion("q1", publicQuestionDoc({ ownerId: "student-1" }));
    const commenter = studentContext("student-2");
    await assertFails(
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

  // Phase 17 CHANGED THIS TEST from assertSucceeds to assertFails, same
  // reason as above. The 500-character boundary itself did not move — it is
  // now enforced by isValidCommentText inside the callable and covered by
  // tests/unit/submitQuestionComment.test.ts, because the rules layer no
  // longer sees a client comment create at all.
  it("denies a client comment create at exactly 500 characters too", async () => {
    await seedQuestion("q1", publicQuestionDoc({ ownerId: "student-1" }));
    const student = studentContext("student-1");
    await assertFails(
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

    // ---- Phase 8 leakage guarantees ------------------------------------
    // The student class feed must show EXACTLY the current class's
    // questions — never a public one, never a private one, and its own
    // questions must never surface in the public feed. The cross-class case
    // is covered above; these cover the cross-VISIBILITY cases.

    it("never returns a public question from the class feed query, even one carrying this classId", async () => {
      await seedClass("class-1", classDoc());
      await seedMember("class-1", "student-1", classMemberDoc());
      await seedClassQuestion("q1");
      // A public question that also carries classId — the visibility filter
      // is what must exclude it, not luck.
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
          doc(context.firestore(), "questions", "pub-leak"),
          publicQuestionDoc({ ownerId: "teacher-1", classId: "class-1" }),
        );
      });

      const student = studentContext("student-1");
      const snap = await assertSucceeds(
        getDocs(classQuestionListQuery(student.firestore(), "class-1")),
      );
      expect(snap.docs.map((d) => d.id)).toEqual(["q1"]);
    });

    it("never returns a private question from the class feed query, even one carrying this classId", async () => {
      await seedClass("class-1", classDoc());
      await seedMember("class-1", "student-1", classMemberDoc());
      await seedClassQuestion("q1");
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
          doc(context.firestore(), "questions", "priv-leak"),
          privateQuestionDoc({ ownerId: "teacher-1", classId: "class-1" }),
        );
      });

      const student = studentContext("student-1");
      const snap = await assertSucceeds(
        getDocs(classQuestionListQuery(student.firestore(), "class-1")),
      );
      expect(snap.docs.map((d) => d.id)).toEqual(["q1"]);
    });

    it("never leaks a class question into the PUBLIC feed query", async () => {
      await seedClass("class-1", classDoc());
      await seedMember("class-1", "student-1", classMemberDoc());
      await seedClassQuestion("q1");
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(
          doc(context.firestore(), "questions", "pub-1"),
          publicQuestionDoc({ ownerId: "student-2" }),
        );
      });

      // Even for a member of that class, the public feed shows only public
      // questions — class content stays inside the class.
      const student = studentContext("student-1");
      const publicFeed = query(
        collection(student.firestore(), "questions"),
        where("visibility", "==", "public"),
        orderBy("createdAt", "desc"),
      );
      const snap = await assertSucceeds(getDocs(publicFeed));
      expect(snap.docs.map((d) => d.id)).toEqual(["pub-1"]);
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

// Phase 9 — class chat. classMemberDoc()/classDoc() are the module-level
// helpers defined above (shared with the "classes/{classId} and members"
// describe block). The teacher is seeded as a member with role "teacher"
// (createClass adds the teacher as a member — see
// functions/src/classes/createClass.ts), matching production exactly.
describe("firestore.rules — classes/{classId}/messages/{messageId}", () => {
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

  async function seedClass(classId: string, data: Record<string, unknown> = classDoc()) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "classes", classId), data);
    });
  }

  async function seedMember(classId: string, memberUid: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "classes", classId, "members", memberUid), data);
    });
  }

  function messageDoc(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      classId: "class-1",
      senderId: "student-1",
      senderName: "Student One",
      senderPhoto: null,
      senderRole: "student",
      clientMessageId: "client-msg-1",
      text: "Merhaba sınıf!",
      createdAt: serverTimestamp(),
      editedAt: null,
      deleted: false,
      ...overrides,
    };
  }

  async function seedClassWithMembers() {
    await seedClass("class-1", classDoc());
    await seedMember("class-1", "teacher-1", classMemberDoc({ uid: "teacher-1", role: "teacher" }));
    await seedMember("class-1", "student-1", classMemberDoc({ uid: "student-1", role: "student" }));
  }

  // Production incident (2026-07-29): a real send from classes/
  // oVwgiqxVmSx2W0yGi8TS failed with permission-denied. Root cause proven
  // via the Firebase Rules API: the LIVE deployed ruleset at the time had no
  // classes/{classId}/messages or classes/{classId}/messageRateLimits match
  // block at all (they existed only locally, never deployed), so both
  // writes fell through to the ruleset's final `match /{document=**} {
  // allow read, write: if false; }` catch-all. This test reproduces the
  // EXACT two-document transaction sendClassMessage performs — a `set` on
  // the message doc plus a `set` with a serverTimestamp() field transform on
  // the rate-limit doc — using the real production classId/uids, against
  // whatever ruleset the test is run with. It passes here (against this
  // repo's current firestore.rules) and is mutation-proven below to fail
  // against the ruleset shape that was actually live in production.
  it("reproduces the exact production sendClassMessage transaction (real classId/uids) and succeeds against the current rules", async () => {
    const classId = "oVwgiqxVmSx2W0yGi8TS";
    const teacherUid = "Sso7DQ2DhcUL7YoFKpAWUCzSl7I2";
    const studentUid = "s93LaE0VSyXgHIYG3VD8KYObu8w2";

    await seedClass(classId, classDoc({ teacherId: teacherUid, organizationId: teacherUid, name: "Sistem" }));
    await seedMember(classId, teacherUid, classMemberDoc({ uid: teacherUid, role: "teacher", displayName: "Erayhoca" }));
    await seedMember(classId, studentUid, classMemberDoc({ uid: studentUid, role: "student", displayName: "Toygar ateş" }));

    const student = studentContext(studentUid);
    const messageRef = doc(collection(student.firestore(), "classes", classId, "messages"));
    const rateLimitRef = doc(student.firestore(), "classes", classId, "messageRateLimits", studentUid);

    await assertSucceeds(
      runTransaction(student.firestore(), async (tx) => {
        tx.set(messageRef, {
          classId,
          senderId: studentUid,
          senderName: "Toygar ateş",
          senderPhoto: null,
          senderRole: "student",
          clientMessageId: "prod-repro-client-msg-1",
          text: "Merhaba!",
          createdAt: serverTimestamp(),
          editedAt: null,
          deleted: false,
        });
        tx.set(rateLimitRef, { lastMessageAt: serverTimestamp() });
      }),
    );
  });

  // ---- teacher send / student send ---------------------------------------

  it("lets the teacher (also a class member) send a message with senderRole 'teacher'", async () => {
    await seedClassWithMembers();
    const teacher = teacherContext("teacher-1");
    await assertSucceeds(
      addDoc(
        collection(teacher.firestore(), "classes", "class-1", "messages"),
        messageDoc({ senderId: "teacher-1", senderName: "Teacher One", senderRole: "teacher" }),
      ),
    );
  });

  it("lets a student member send a message with senderRole 'student'", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    await assertSucceeds(
      addDoc(collection(student.firestore(), "classes", "class-1", "messages"), messageDoc()),
    );
  });

  // ---- member only / permissions -----------------------------------------

  it("denies a non-member from sending a message", async () => {
    await seedClassWithMembers();
    const outsider = studentContext("student-2");
    await assertFails(
      addDoc(
        collection(outsider.firestore(), "classes", "class-1", "messages"),
        messageDoc({ senderId: "student-2" }),
      ),
    );
  });

  it("denies a non-member from reading class messages", async () => {
    await seedClassWithMembers();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await addDoc(collection(context.firestore(), "classes", "class-1", "messages"), messageDoc());
    });
    const outsider = studentContext("student-2");
    await assertFails(getDocs(collection(outsider.firestore(), "classes", "class-1", "messages")));
  });

  it("lets a class member read class messages", async () => {
    await seedClassWithMembers();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await addDoc(collection(context.firestore(), "classes", "class-1", "messages"), messageDoc());
    });
    const student = studentContext("student-1");
    await assertSucceeds(getDocs(collection(student.firestore(), "classes", "class-1", "messages")));
  });

  it("denies a student sending a message that claims senderRole 'teacher' (verified against their own membership record, not trusted from the client)", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    await assertFails(
      addDoc(
        collection(student.firestore(), "classes", "class-1", "messages"),
        messageDoc({ senderRole: "teacher" }),
      ),
    );
  });

  it("denies a member sending a message with someone else's senderId", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    await assertFails(
      addDoc(
        collection(student.firestore(), "classes", "class-1", "messages"),
        messageDoc({ senderId: "teacher-1" }),
      ),
    );
  });

  // ---- validation ----------------------------------------------------------

  it("denies an empty message", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    await assertFails(
      addDoc(collection(student.firestore(), "classes", "class-1", "messages"), messageDoc({ text: "" })),
    );
  });

  it("denies a message over 1000 characters (long message)", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    await assertFails(
      addDoc(
        collection(student.firestore(), "classes", "class-1", "messages"),
        messageDoc({ text: "a".repeat(1001) }),
      ),
    );
  });

  it("accepts a message at exactly the 1000 character limit", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    await assertSucceeds(
      addDoc(
        collection(student.firestore(), "classes", "class-1", "messages"),
        messageDoc({ text: "a".repeat(1000) }),
      ),
    );
  });

  // ---- immutability ---------------------------------------------------------

  it("denies updating a message (no edit feature this phase)", async () => {
    await seedClassWithMembers();
    let messageId = "";
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const ref = await addDoc(collection(context.firestore(), "classes", "class-1", "messages"), messageDoc());
      messageId = ref.id;
    });
    const student = studentContext("student-1");
    await assertFails(
      updateDoc(doc(student.firestore(), "classes", "class-1", "messages", messageId), { text: "Hacked" }),
    );
  });

  it("denies deleting a message", async () => {
    await seedClassWithMembers();
    let messageId = "";
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const ref = await addDoc(collection(context.firestore(), "classes", "class-1", "messages"), messageDoc());
      messageId = ref.id;
    });
    const student = studentContext("student-1");
    await assertFails(deleteDoc(doc(student.firestore(), "classes", "class-1", "messages", messageId)));
  });

  // ---- ordering ---------------------------------------------------------

  it("lists messages oldest-first via orderBy(createdAt) — no composite index required", async () => {
    await seedClassWithMembers();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "classes", "class-1", "messages", "m1"), {
        ...messageDoc({ text: "İlk mesaj" }),
        createdAt: new Date(2026, 0, 1),
      });
      await setDoc(doc(context.firestore(), "classes", "class-1", "messages", "m2"), {
        ...messageDoc({ text: "İkinci mesaj" }),
        createdAt: new Date(2026, 0, 2),
      });
    });
    const student = studentContext("student-1");
    const q = query(collection(student.firestore(), "classes", "class-1", "messages"), orderBy("createdAt", "asc"));
    const snapshot = await assertSucceeds(getDocs(q));
    expect(snapshot.docs.map((d) => d.data().text)).toEqual(["İlk mesaj", "İkinci mesaj"]);
  });

  // ---- realtime -----------------------------------------------------------

  it("delivers a new message to an active onSnapshot listener without polling", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    const teacher = teacherContext("teacher-1");

    const q = query(
      collection(student.firestore(), "classes", "class-1", "messages"),
      orderBy("createdAt", "asc"),
    );

    const received: string[] = [];
    const delivered = new Promise<void>((resolve) => {
      const unsubscribe = onSnapshot(q, (snapshot) => {
        received.push(...snapshot.docChanges().map((change) => change.doc.data().text));
        if (received.includes("Canlı mesaj")) {
          unsubscribe();
          resolve();
        }
      });
    });

    await addDoc(
      collection(teacher.firestore(), "classes", "class-1", "messages"),
      messageDoc({ senderId: "teacher-1", senderRole: "teacher", text: "Canlı mesaj" }),
    );

    await delivered;
    expect(received).toContain("Canlı mesaj");
  });

  // ---- duplicate protection (mirrors the client's runGuardedOnce usage) ---

  it("proves the client-side guard is necessary: two concurrent unguarded sends both reach Firestore as two separate messages", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    const col = collection(student.firestore(), "classes", "class-1", "messages");

    await Promise.all([
      addDoc(col, messageDoc({ text: "Tek mesaj" })),
      addDoc(col, messageDoc({ text: "Tek mesaj" })),
    ]);

    const snapshot = await getDocs(col);
    expect(snapshot.size).toBe(2);
  });

  it("wrapping the send in runGuardedOnce (the exact hook behavior) collapses a rapid double-tap into exactly one message", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    const col = collection(student.firestore(), "classes", "class-1", "messages");
    const guardRef = { current: false };

    async function guardedSend() {
      if (guardRef.current) return;
      guardRef.current = true;
      try {
        await addDoc(col, messageDoc({ text: "Tek mesaj" }));
      } finally {
        guardRef.current = false;
      }
    }

    // Two "taps" fired in the same tick, exactly as a rapid double-tap would.
    await Promise.all([guardedSend(), guardedSend()]);

    const snapshot = await getDocs(col);
    expect(snapshot.size).toBe(1);
  });

  // ---- clientMessageId (required for optimistic-UI reconciliation) -------

  it("denies a message with no clientMessageId", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    const fullDoc = messageDoc();
    const withoutClientMessageId: Partial<typeof fullDoc> = { ...fullDoc };
    delete withoutClientMessageId.clientMessageId;
    await assertFails(
      addDoc(collection(student.firestore(), "classes", "class-1", "messages"), withoutClientMessageId),
    );
  });

  it("denies a message with an empty clientMessageId", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    await assertFails(
      addDoc(
        collection(student.firestore(), "classes", "class-1", "messages"),
        messageDoc({ clientMessageId: "" }),
      ),
    );
  });

  // ---- messageRateLimits/{uid} — 1 message/second enforcement -------------
  //
  // These tests write directly to messageRateLimits (mirroring what
  // sendClassMessage does inside its transaction) rather than relying on
  // addDoc-to-messages alone, since the rate limit only engages once that
  // document actually exists — the other tests in this suite (which only
  // ever write to `messages`) never create it, so they're deliberately
  // unaffected by this rule, matching how a real client's atomic transaction
  // is the only path that can trigger it.
  describe("rate limiting", () => {
    async function seedRateLimit(uid: string, lastMessageAt: unknown) {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "classes", "class-1", "messageRateLimits", uid), {
          lastMessageAt,
        });
      });
    }

    it("lets a member write their own rate-limit doc with the server timestamp", async () => {
      await seedClassWithMembers();
      const student = studentContext("student-1");
      await assertSucceeds(
        setDoc(doc(student.firestore(), "classes", "class-1", "messageRateLimits", "student-1"), {
          lastMessageAt: serverTimestamp(),
        }),
      );
    });

    it("denies a member writing someone else's rate-limit doc", async () => {
      await seedClassWithMembers();
      const student = studentContext("student-1");
      await assertFails(
        setDoc(doc(student.firestore(), "classes", "class-1", "messageRateLimits", "teacher-1"), {
          lastMessageAt: serverTimestamp(),
        }),
      );
    });

    it("denies backdating lastMessageAt to a client-supplied (non-server) timestamp", async () => {
      await seedClassWithMembers();
      const student = studentContext("student-1");
      await assertFails(
        setDoc(doc(student.firestore(), "classes", "class-1", "messageRateLimits", "student-1"), {
          lastMessageAt: new Date(2020, 0, 1),
        }),
      );
    });

    it("denies a message sent less than 1 second after the caller's own last recorded send", async () => {
      await seedClassWithMembers();
      await seedRateLimit("student-1", serverTimestamp()); // just now
      const student = studentContext("student-1");
      await assertFails(
        addDoc(collection(student.firestore(), "classes", "class-1", "messages"), messageDoc()),
      );
    });

    it("allows a message sent more than 1 second after the caller's own last recorded send", async () => {
      await seedClassWithMembers();
      // Firestore's `withSecurityRulesDisabled` writes still record a real
      // server timestamp for `serverTimestamp()`, but we need a value
      // provably >1s in the past — a plain past Date, allowed only because
      // rules are disabled for this seed write.
      await seedRateLimit("student-1", new Date(Date.now() - 5000));
      const student = studentContext("student-1");
      await assertSucceeds(
        addDoc(collection(student.firestore(), "classes", "class-1", "messages"), messageDoc()),
      );
    });

    it("does not rate-limit a different member of the same class", async () => {
      await seedClassWithMembers();
      await seedRateLimit("student-1", serverTimestamp()); // student-1 just sent
      const teacher = teacherContext("teacher-1"); // unrelated sender
      await assertSucceeds(
        addDoc(
          collection(teacher.firestore(), "classes", "class-1", "messages"),
          messageDoc({ senderId: "teacher-1", senderName: "Teacher One", senderRole: "teacher" }),
        ),
      );
    });
  });
});

// Phase 9.1 — students can publish class questions. classDoc()/
// classMemberDoc()/classQuestionDoc() are the module-level helpers defined
// above (shared with the earlier "classes/{classId} and members" and
// questions describe blocks).
describe("firestore.rules — questions/{questionId} student publishing (Phase 9.1)", () => {
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

  // A student's real custom claims NEVER carry an organizationId — see
  // functions/src/classes/joinClassByCode.ts's own doc comment on the
  // production incident this reproduces. Deliberately not accepting an
  // organizationId parameter here, so a test can't accidentally give a
  // student claims they'd never actually have.
  function studentContext(uid: string) {
    return testEnv.authenticatedContext(uid, { role: "student", organizationId: null });
  }

  async function seedClass(classId: string, data: Record<string, unknown> = classDoc()) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "classes", classId), data);
    });
  }

  async function seedMember(classId: string, memberUid: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "classes", classId, "members", memberUid), data);
    });
  }

  async function seedClassWithMembers() {
    await seedClass("class-1", classDoc({ teacherId: "teacher-1", organizationId: "org-1" }));
    await seedMember("class-1", "teacher-1", classMemberDoc({ uid: "teacher-1", role: "teacher" }));
    await seedMember("class-1", "student-1", classMemberDoc({ uid: "student-1", role: "student" }));
  }

  function studentClassQuestionDoc(overrides: Partial<Record<string, unknown>> = {}) {
    return classQuestionDoc({
      ownerId: "student-1",
      organizationId: "org-1",
      classId: "class-1",
      posterRole: "student",
      subject: "Matematik",
      description: "İkinci dereceden denklem",
      ...overrides,
    });
  }

  // ---- create: student member can publish -------------------------------

  it("lets a genuine class member (student) create a class question", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    await assertSucceeds(
      addDoc(collection(student.firestore(), "questions"), {
        ...studentClassQuestionDoc(),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("denies a non-member from creating a class question, even with a valid classId", async () => {
    await seedClassWithMembers();
    const outsider = studentContext("student-2");
    await assertFails(
      addDoc(collection(outsider.firestore(), "questions"), {
        ...studentClassQuestionDoc({ ownerId: "student-2" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("denies a student claiming posterRole 'teacher' (verified against their own membership record, not trusted from the client)", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    await assertFails(
      addDoc(collection(student.firestore(), "questions"), {
        ...studentClassQuestionDoc({ posterRole: "teacher" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("denies a student posting with someone else's ownerId", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    await assertFails(
      addDoc(collection(student.firestore(), "questions"), {
        ...studentClassQuestionDoc({ ownerId: "teacher-1" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  // The exact production incident this reproduces: a student's claims NEVER
  // carry an organizationId, only the class's own organizationId is
  // meaningful here. This proves the rule checks classData(classId).
  // organizationId, not organizationId() (the caller's claim, always null
  // for a student) — a rule that checked the latter would make this
  // ALWAYS fail, for every student, permanently.
  it("succeeds even though the student's own organizationId claim is null, using the class's organizationId instead", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    await assertSucceeds(
      addDoc(collection(student.firestore(), "questions"), {
        ...studentClassQuestionDoc(),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("denies a class question whose organizationId doesn't match the class's own organizationId", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    await assertFails(
      addDoc(collection(student.firestore(), "questions"), {
        ...studentClassQuestionDoc({ organizationId: "some-other-org" }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  // ---- create: subject/description validation ----------------------------

  it("denies a subject over 40 characters", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    await assertFails(
      addDoc(collection(student.firestore(), "questions"), {
        ...studentClassQuestionDoc({ subject: "a".repeat(41) }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("accepts a subject at exactly 40 characters", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    await assertSucceeds(
      addDoc(collection(student.firestore(), "questions"), {
        ...studentClassQuestionDoc({ subject: "a".repeat(40) }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("denies a description over 300 characters", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    await assertFails(
      addDoc(collection(student.firestore(), "questions"), {
        ...studentClassQuestionDoc({ description: "a".repeat(301) }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("accepts a null description (optional field, omitted)", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    await assertSucceeds(
      addDoc(collection(student.firestore(), "questions"), {
        ...studentClassQuestionDoc({ description: null }),
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("denies a missing subject field entirely", async () => {
    await seedClassWithMembers();
    const student = studentContext("student-1");
    const fullDoc = studentClassQuestionDoc();
    const withoutSubject: Partial<typeof fullDoc> = { ...fullDoc };
    delete withoutSubject.subject;
    await assertFails(
      addDoc(collection(student.firestore(), "questions"), {
        ...withoutSubject,
        createdAt: serverTimestamp(),
      }),
    );
  });

  // ---- update: own question only, posterRole/classId frozen --------------

  async function seedQuestion(id: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "questions", id), data);
    });
  }

  it("lets a student edit their own class question's subject/description", async () => {
    await seedClassWithMembers();
    await seedQuestion("q1", studentClassQuestionDoc());
    const student = studentContext("student-1");
    await assertSucceeds(
      updateDoc(doc(student.firestore(), "questions", "q1"), { subject: "Fizik" }),
    );
  });

  it("denies a student editing someone else's question", async () => {
    await seedClassWithMembers();
    await seedQuestion("q1", studentClassQuestionDoc());
    const otherStudent = studentContext("student-2");
    await assertFails(
      updateDoc(doc(otherStudent.firestore(), "questions", "q1"), { subject: "Fizik" }),
    );
  });

  it("denies a student changing their own question's posterRole via update (frozen field)", async () => {
    await seedClassWithMembers();
    await seedQuestion("q1", studentClassQuestionDoc());
    const student = studentContext("student-1");
    await assertFails(
      updateDoc(doc(student.firestore(), "questions", "q1"), { posterRole: "teacher" }),
    );
  });

  // ---- delete: own question, or own class's teacher, or org admin --------

  it("lets a student delete their own class question", async () => {
    await seedClassWithMembers();
    await seedQuestion("q1", studentClassQuestionDoc());
    const student = studentContext("student-1");
    await assertSucceeds(deleteDoc(doc(student.firestore(), "questions", "q1")));
  });

  it("denies a student deleting another student's question", async () => {
    await seedClassWithMembers();
    await seedMember("class-1", "student-2", classMemberDoc({ uid: "student-2", role: "student" }));
    await seedQuestion("q1", studentClassQuestionDoc());
    const otherStudent = studentContext("student-2");
    await assertFails(deleteDoc(doc(otherStudent.firestore(), "questions", "q1")));
  });

  it("lets the class's OWN teacher delete a student's question in that class", async () => {
    await seedClassWithMembers();
    await seedQuestion("q1", studentClassQuestionDoc());
    const teacher = teacherContext("teacher-1");
    await assertSucceeds(deleteDoc(doc(teacher.firestore(), "questions", "q1")));
  });

  // Regression test for the scope-tightening this phase makes: before
  // Phase 9.1, `isTeacher()` alone let ANY teacher anywhere delete ANY
  // class's question — never intentionally granted, just never scoped.
  it("denies a DIFFERENT teacher (not this class's own) from deleting a student's question", async () => {
    await seedClassWithMembers();
    await seedQuestion("q1", studentClassQuestionDoc());
    const otherTeacher = teacherContext("teacher-2", "org-2");
    await assertFails(deleteDoc(doc(otherTeacher.firestore(), "questions", "q1")));
  });

  // ---- backward compatibility: pre-Phase-9.1 class questions still read --

  it("still reads a pre-existing class question that has no subject/description/posterRole fields at all", async () => {
    await seedClassWithMembers();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      // Deliberately the OLD shape — exactly what every class question
      // looked like before this phase (no subject/description/posterRole).
      await setDoc(doc(context.firestore(), "questions", "legacy-q1"), {
        ownerId: "teacher-1",
        organizationId: "org-1",
        visibility: "class",
        imageUrl: "https://example.com/legacy.jpg",
        classId: "class-1",
        likeCount: 0,
        commentCount: 0,
        answerCount: 0,
        createdAt: new Date(),
      });
    });
    const student = studentContext("student-1");
    await assertSucceeds(getDoc(doc(student.firestore(), "questions", "legacy-q1")));
  });
});

// Phase 10 — friendships/{pairId} and users/{uid}/socialMeta/{docId}. All
// mutations go through friends/* callables (Admin SDK, bypasses these
// rules) — client access here is read-only, and only for a document's own
// participant/owner. Real getDocs() query shapes are used throughout
// (never a bare single-document get standing in for a list query), per
// this session's established "query provability" discipline.
describe("firestore.rules — friendships/{pairId} and socialMeta", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    });
  });

  afterAll(async () => testEnv.cleanup());
  afterEach(async () => testEnv.clearFirestore());

  function studentCtx(uid: string) {
    return testEnv.authenticatedContext(uid, { role: "student", organizationId: null });
  }

  function pairId(a: string, b: string): string {
    return [a, b].sort().join("_");
  }

  async function seedFriendship(
    uidA: string,
    uidB: string,
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "friendships", pairId(uidA, uidB)), {
        participantIds: [uidA, uidB].sort(),
        requesterId: uidA,
        recipientId: uidB,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        acceptedAt: null,
        schemaVersion: 1,
        ...overrides,
      });
    });
  }

  async function seedSocialMeta(uid: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid, "socialMeta", "summary"), data);
    });
  }

  // ---- read: own relationship only ----------------------------------

  it("lets a participant read their own friendship document", async () => {
    await seedFriendship("student-1", "student-2");
    const student1 = studentCtx("student-1");
    await assertSucceeds(getDoc(doc(student1.firestore(), "friendships", pairId("student-1", "student-2"))));
  });

  it("denies reading a friendship between two OTHER users", async () => {
    await seedFriendship("student-1", "student-2");
    const outsider = studentCtx("student-3");
    await assertFails(getDoc(doc(outsider.firestore(), "friendships", pairId("student-1", "student-2"))));
  });

  it("denies an unauthenticated read", async () => {
    const unauthed = testEnv.unauthenticatedContext();
    await seedFriendship("student-1", "student-2");
    await assertFails(getDoc(doc(unauthed.firestore(), "friendships", pairId("student-1", "student-2"))));
  });

  // ---- real getDocs() query shapes — never a bare get() standing in ---

  it("runs the caller's own accepted-friends query (participantIds array-contains + status)", async () => {
    await seedFriendship("student-1", "student-2", { status: "accepted" });
    await seedFriendship("student-1", "student-3", { status: "accepted" });
    // Unrelated pair — must never appear in student-1's results.
    await seedFriendship("student-4", "student-5", { status: "accepted" });

    const student1 = studentCtx("student-1");
    const q = query(
      collection(student1.firestore(), "friendships"),
      where("participantIds", "array-contains", "student-1"),
      where("status", "==", "accepted"),
    );
    const snapshot = await assertSucceeds(getDocs(q));
    expect(snapshot.docs.map((d) => d.id).sort()).toEqual(
      [pairId("student-1", "student-2"), pairId("student-1", "student-3")].sort(),
    );
  });

  it("runs the caller's own incoming-pending query (recipientId + status) with no cross-user leakage", async () => {
    await seedFriendship("student-2", "student-1", { status: "pending" }); // student-1 is recipient
    await seedFriendship("student-3", "student-4", { status: "pending" }); // unrelated

    const student1 = studentCtx("student-1");
    const q = query(
      collection(student1.firestore(), "friendships"),
      where("recipientId", "==", "student-1"),
      where("status", "==", "pending"),
    );
    const snapshot = await assertSucceeds(getDocs(q));
    expect(snapshot.docs.map((d) => d.id)).toEqual([pairId("student-1", "student-2")]);
  });

  it("runs the caller's own outgoing-pending query (requesterId + status) with no cross-user leakage", async () => {
    await seedFriendship("student-1", "student-2", { status: "pending" }); // student-1 is requester
    await seedFriendship("student-3", "student-4", { status: "pending" }); // unrelated

    const student1 = studentCtx("student-1");
    const q = query(
      collection(student1.firestore(), "friendships"),
      where("requesterId", "==", "student-1"),
      where("status", "==", "pending"),
    );
    const snapshot = await assertSucceeds(getDocs(q));
    expect(snapshot.docs.map((d) => d.id)).toEqual([pairId("student-1", "student-2")]);
  });

  // ---- write: always denied — every mutation goes through a callable --

  it("denies a client creating a friendship document directly", async () => {
    const student1 = studentCtx("student-1");
    await assertFails(
      setDoc(doc(student1.firestore(), "friendships", pairId("student-1", "student-2")), {
        participantIds: ["student-1", "student-2"],
        requesterId: "student-1",
        recipientId: "student-2",
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        acceptedAt: null,
        schemaVersion: 1,
      }),
    );
  });

  it("denies a client changing a friendship's status directly", async () => {
    await seedFriendship("student-1", "student-2");
    const student1 = studentCtx("student-1");
    await assertFails(
      updateDoc(doc(student1.firestore(), "friendships", pairId("student-1", "student-2")), {
        status: "accepted",
      }),
    );
  });

  it("denies a client deleting a friendship document directly", async () => {
    await seedFriendship("student-1", "student-2");
    const student1 = studentCtx("student-1");
    await assertFails(
      deleteDoc(doc(student1.firestore(), "friendships", pairId("student-1", "student-2"))),
    );
  });

  // ---- users/{uid}/socialMeta/summary ---------------------------------

  it("lets the owner read their own socialMeta summary", async () => {
    await seedSocialMeta("student-1", {
      friendCount: 2,
      incomingRequestCount: 1,
      outgoingRequestCount: 0,
      updatedAt: serverTimestamp(),
    });
    const student1 = studentCtx("student-1");
    await assertSucceeds(getDoc(doc(student1.firestore(), "users", "student-1", "socialMeta", "summary")));
  });

  it("denies reading another user's socialMeta summary", async () => {
    await seedSocialMeta("student-1", {
      friendCount: 2,
      incomingRequestCount: 1,
      outgoingRequestCount: 0,
      updatedAt: serverTimestamp(),
    });
    const outsider = studentCtx("student-2");
    await assertFails(getDoc(doc(outsider.firestore(), "users", "student-1", "socialMeta", "summary")));
  });

  it("denies a client writing their own socialMeta summary directly", async () => {
    const student1 = studentCtx("student-1");
    await assertFails(
      setDoc(doc(student1.firestore(), "users", "student-1", "socialMeta", "summary"), {
        friendCount: 999,
        incomingRequestCount: 0,
        outgoingRequestCount: 0,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("denies an unauthenticated read of socialMeta", async () => {
    await seedSocialMeta("student-1", {
      friendCount: 0,
      incomingRequestCount: 0,
      outgoingRequestCount: 0,
      updatedAt: serverTimestamp(),
    });
    const unauthed = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(unauthed.firestore(), "users", "student-1", "socialMeta", "summary")));
  });
});

// Phase 15 — users/{uid}/notifications/{notificationId} and
// users/{uid}/notificationMeta/{docId}. All CREATE/DELETE and every field
// except isRead/readAt go through createNotificationInTransaction /
// deleteNotificationInTransaction / markAllNotificationsRead (Admin SDK,
// bypasses these rules) — client access here is read-only plus the one
// narrow isRead/readAt update. Real getDocs() queries are used for the
// list-query cases, never a bare get() standing in.
describe("firestore.rules — users/{uid}/notifications and notificationMeta", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    });
  });

  afterAll(async () => testEnv.cleanup());
  afterEach(async () => testEnv.clearFirestore());

  function studentCtx(uid: string) {
    return testEnv.authenticatedContext(uid, { role: "student", organizationId: null });
  }

  function notificationDoc(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      recipientId: "student-1",
      actorId: "student-2",
      actorDisplayName: "Ayşe",
      actorUsername: "ayse",
      actorPhotoURL: null,
      type: "question_liked",
      entityType: "question",
      entityId: "q1",
      parentEntityId: null,
      classId: null,
      messagePreview: null,
      createdAt: serverTimestamp(),
      readAt: null,
      isRead: false,
      dedupeKey: "student-1_question_liked_student-2_q1",
      ...overrides,
    };
  }

  async function seedNotification(
    uid: string,
    notificationId: string,
    overrides: Partial<Record<string, unknown>> = {},
  ) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "users", uid, "notifications", notificationId),
        notificationDoc(overrides),
      );
    });
  }

  async function seedNotificationMeta(uid: string, unreadCount: number) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid, "notificationMeta", "summary"), {
        unreadCount,
        updatedAt: serverTimestamp(),
      });
    });
  }

  // ---- owner read ------------------------------------------------------

  it("lets the owner read their own notification", async () => {
    await seedNotification("student-1", "n1");
    const owner = studentCtx("student-1");
    await assertSucceeds(getDoc(doc(owner.firestore(), "users", "student-1", "notifications", "n1")));
  });

  it("denies another user reading someone else's notification", async () => {
    await seedNotification("student-1", "n1");
    const outsider = studentCtx("student-2");
    await assertFails(getDoc(doc(outsider.firestore(), "users", "student-1", "notifications", "n1")));
  });

  it("denies an unauthenticated read", async () => {
    await seedNotification("student-1", "n1");
    const unauthed = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(unauthed.firestore(), "users", "student-1", "notifications", "n1")));
  });

  // ---- owner LIST query (real getDocs(), never a bare get()) -----------

  it("runs the owner's own notification list query successfully", async () => {
    await seedNotification("student-1", "n1");
    await seedNotification("student-1", "n2");
    const owner = studentCtx("student-1");
    const snap = await assertSucceeds(
      getDocs(
        query(collection(owner.firestore(), "users", "student-1", "notifications"), orderBy("createdAt", "desc")),
      ),
    );
    expect(snap.docs).toHaveLength(2);
  });

  it("denies another user's list query against this owner's notifications collection", async () => {
    await seedNotification("student-1", "n1");
    const outsider = studentCtx("student-2");
    await assertFails(
      getDocs(
        query(
          collection(outsider.firestore(), "users", "student-1", "notifications"),
          orderBy("createdAt", "desc"),
        ),
      ),
    );
  });

  // ---- client create denial ---------------------------------------------

  it("denies a client creating a notification for itself", async () => {
    const student1 = studentCtx("student-1");
    await assertFails(
      setDoc(
        doc(student1.firestore(), "users", "student-1", "notifications", "fake1"),
        notificationDoc({ recipientId: "student-1", actorId: "student-1" }),
      ),
    );
  });

  it("denies a client creating a notification for someone else (fabricating a fake event)", async () => {
    const attacker = studentCtx("student-2");
    await assertFails(
      setDoc(
        doc(attacker.firestore(), "users", "student-1", "notifications", "fake1"),
        notificationDoc({ recipientId: "student-1", actorId: "student-2" }),
      ),
    );
  });

  // ---- client update is fully denied (Pre-commit hardening) -------------
  //
  // Reading a notification is now EXCLUSIVELY the markNotificationRead
  // callable (see its own doc comment for the incident this closes: a
  // client-writable isRead/readAt never reconciled
  // notificationMeta/summary.unreadCount, silently desyncing the badge).
  // Every field is therefore immutable from a client's perspective —
  // there is no longer a narrower "only isRead/readAt" case to test,
  // because there is no client update path left at all.

  it("denies the owner marking isRead/readAt directly (must go through the callable)", async () => {
    await seedNotification("student-1", "n1");
    const owner = studentCtx("student-1");
    await assertFails(
      updateDoc(doc(owner.firestore(), "users", "student-1", "notifications", "n1"), {
        isRead: true,
        readAt: serverTimestamp(),
      }),
    );
  });

  it.each([
    ["recipientId", "someone-else"],
    ["actorId", "someone-else"],
    ["actorDisplayName", "Someone Else"],
    ["actorUsername", "someone_else"],
    ["actorPhotoURL", "https://example.com/x.png"],
    ["type", "friend_request_accepted"],
    ["entityType", "answer"],
    ["entityId", "some-other-question"],
    ["parentEntityId", "some-other-parent"],
    ["classId", "some-other-class"],
    ["messagePreview", "rewritten preview"],
    ["dedupeKey", "tampered-key"],
  ] as const)("denies the owner rewriting the immutable field %s", async (field, value) => {
    await seedNotification("student-1", "n1");
    const owner = studentCtx("student-1");
    await assertFails(
      updateDoc(doc(owner.firestore(), "users", "student-1", "notifications", "n1"), {
        [field]: value,
      }),
    );
  });

  it("denies the owner adding a brand-new field", async () => {
    await seedNotification("student-1", "n1");
    const owner = studentCtx("student-1");
    await assertFails(
      updateDoc(doc(owner.firestore(), "users", "student-1", "notifications", "n1"), {
        pinned: true,
      }),
    );
  });

  it("denies the owner deleting an existing field via merge-less set", async () => {
    await seedNotification("student-1", "n1");
    const owner = studentCtx("student-1");
    const { entityId: _entityId, ...withoutEntityId } = notificationDoc();
    void _entityId;
    await assertFails(
      setDoc(doc(owner.firestore(), "users", "student-1", "notifications", "n1"), withoutEntityId),
    );
  });

  it("denies another user changing this owner's notification at all", async () => {
    await seedNotification("student-1", "n1");
    const outsider = studentCtx("student-2");
    await assertFails(
      updateDoc(doc(outsider.firestore(), "users", "student-1", "notifications", "n1"), {
        isRead: true,
        readAt: serverTimestamp(),
      }),
    );
  });

  // ---- client delete denial ---------------------------------------------

  it("denies the owner deleting their own notification", async () => {
    await seedNotification("student-1", "n1");
    const owner = studentCtx("student-1");
    await assertFails(deleteDoc(doc(owner.firestore(), "users", "student-1", "notifications", "n1")));
  });

  // ---- notificationMeta/summary ------------------------------------------

  it("lets the owner read their own notificationMeta summary", async () => {
    await seedNotificationMeta("student-1", 3);
    const owner = studentCtx("student-1");
    await assertSucceeds(getDoc(doc(owner.firestore(), "users", "student-1", "notificationMeta", "summary")));
  });

  it("denies another user reading this owner's notificationMeta summary", async () => {
    await seedNotificationMeta("student-1", 3);
    const outsider = studentCtx("student-2");
    await assertFails(
      getDoc(doc(outsider.firestore(), "users", "student-1", "notificationMeta", "summary")),
    );
  });

  it("denies a client writing their own notificationMeta summary directly", async () => {
    const student1 = studentCtx("student-1");
    await assertFails(
      setDoc(doc(student1.firestore(), "users", "student-1", "notificationMeta", "summary"), {
        unreadCount: 999,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("denies an unauthenticated read of notificationMeta", async () => {
    await seedNotificationMeta("student-1", 1);
    const unauthed = testEnv.unauthenticatedContext();
    await assertFails(
      getDoc(doc(unauthed.firestore(), "users", "student-1", "notificationMeta", "summary")),
    );
  });
});

// Phase 16 — users/{uid}/studyItems, studyMeta and studyDays. All three are
// written exclusively by the recordStudyOutcome / setStudyDailyGoal
// callables (Admin SDK, bypassing these rules). A client that could write
// any of them could fabricate mastery, backdate a review to skip a wait, or
// mint an unlimited streak by replaying the same day key.
describe("firestore.rules — study collections (Phase 16)", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    });
  });

  afterAll(async () => testEnv.cleanup());
  afterEach(async () => testEnv.clearFirestore());

  function studentCtx(uid: string) {
    return testEnv.authenticatedContext(uid, { role: "student", organizationId: null });
  }

  async function seedStudyItem(uid: string, questionId: string) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid, "studyItems", questionId), {
        questionId,
        status: "review",
        lastOutcome: "solved",
        intervalDays: 4,
        successfulReviews: 2,
        attemptCount: 2,
        nextReviewAt: 1760000000000,
        source: "public",
        sourceClassId: null,
        questionOwnerId: "owner1",
        schemaVersion: 1,
      });
    });
  }

  async function seedSummary(uid: string) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid, "studyMeta", "summary"), {
        totalReviewActions: 5,
        masteredCount: 1,
        currentStreak: 3,
        longestStreak: 7,
        dailyGoal: 10,
        reviewedToday: 2,
      });
    });
  }

  async function seedDay(uid: string, dayKey: string) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid, "studyDays", dayKey), {
        dayKey,
        reviewCount: 3,
        solvedCount: 2,
        goalCompleted: false,
      });
    });
  }

  // ---- studyItems -------------------------------------------------------

  it("lets the owner read their own study item", async () => {
    await seedStudyItem("student-1", "q1");
    const owner = studentCtx("student-1");
    await assertSucceeds(getDoc(doc(owner.firestore(), "users", "student-1", "studyItems", "q1")));
  });

  it("lets the owner LIST their own due-review queue (the real query shape)", async () => {
    await seedStudyItem("student-1", "q1");
    await seedStudyItem("student-1", "q2");
    const owner = studentCtx("student-1");
    const snap = await assertSucceeds(
      getDocs(
        query(
          collection(owner.firestore(), "users", "student-1", "studyItems"),
          where("nextReviewAt", "<=", 1760000000001),
          orderBy("nextReviewAt", "asc"),
        ),
      ),
    );
    expect(snap.docs).toHaveLength(2);
  });

  it("denies reading another student's study item", async () => {
    await seedStudyItem("student-1", "q1");
    const outsider = studentCtx("student-2");
    await assertFails(getDoc(doc(outsider.firestore(), "users", "student-1", "studyItems", "q1")));
  });

  it("denies another student's LIST query against this owner's queue", async () => {
    await seedStudyItem("student-1", "q1");
    const outsider = studentCtx("student-2");
    await assertFails(getDocs(collection(outsider.firestore(), "users", "student-1", "studyItems")));
  });

  it("denies an unauthenticated read", async () => {
    await seedStudyItem("student-1", "q1");
    const unauthed = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(unauthed.firestore(), "users", "student-1", "studyItems", "q1")));
  });

  it("denies the owner CREATING a study item (would fabricate progress)", async () => {
    const owner = studentCtx("student-1");
    await assertFails(
      setDoc(doc(owner.firestore(), "users", "student-1", "studyItems", "q-fake"), {
        questionId: "q-fake",
        status: "mastered",
        intervalDays: 60,
        successfulReviews: 99,
      }),
    );
  });

  it("denies the owner UPDATING nextReviewAt to skip the wait", async () => {
    await seedStudyItem("student-1", "q1");
    const owner = studentCtx("student-1");
    await assertFails(
      updateDoc(doc(owner.firestore(), "users", "student-1", "studyItems", "q1"), {
        nextReviewAt: 0,
      }),
    );
  });

  it("denies the owner forging mastery", async () => {
    await seedStudyItem("student-1", "q1");
    const owner = studentCtx("student-1");
    await assertFails(
      updateDoc(doc(owner.firestore(), "users", "student-1", "studyItems", "q1"), {
        status: "mastered",
        successfulReviews: 99,
      }),
    );
  });

  it("denies the owner deleting a study item", async () => {
    await seedStudyItem("student-1", "q1");
    const owner = studentCtx("student-1");
    await assertFails(deleteDoc(doc(owner.firestore(), "users", "student-1", "studyItems", "q1")));
  });

  // ---- studyItems: Phase 27 teacher read (Class Performance dashboard) --
  //
  // Every case below hinges on `sourceClassId` — server-written by
  // recordStudyOutcome, never client-settable (the write-path tests above
  // already prove studyItems is fully client-write-denied). A teacher may
  // read a class-sourced item ONLY if they own THAT class AND the item's
  // student is a genuine 'student'-role member of it — never any other
  // teacher, never a student's private/public items, never a different
  // class's roster.

  function teacherCtx(uid: string) {
    return testEnv.authenticatedContext(uid, { role: "teacher", organizationId: "org-1" });
  }

  async function seedClassSourcedStudyItem(
    studentUid: string,
    questionId: string,
    classId: string | null,
  ) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", studentUid, "studyItems", questionId), {
        questionId,
        status: "review",
        lastOutcome: "struggled",
        intervalDays: 1,
        successfulReviews: 0,
        attemptCount: 1,
        nextReviewAt: 1760000000000,
        source: classId ? "class" : "public",
        sourceClassId: classId,
        questionOwnerId: "teacher-1",
        schemaVersion: 1,
      });
    });
  }

  async function seedTeacherClass(classId: string, teacherId: string) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "classes", classId), {
        name: "Test Class",
        organizationId: "org-1",
        teacherId,
        joinCode: "ABC123",
        createdAt: 1,
        updatedAt: 1,
        memberCount: 1,
        status: "active",
      });
    });
  }

  async function seedClassMemberRow(classId: string, uid: string, role: "student" | "teacher") {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "classes", classId, "members", uid), {
        uid,
        role,
        joinedAt: 1,
        displayName: "Member",
        photoURL: null,
      });
    });
  }

  it("lets the class's own teacher read a class-sourced study item belonging to a real student member", async () => {
    await seedTeacherClass("class-1", "teacher-1");
    await seedClassMemberRow("class-1", "student-1", "student");
    await seedClassSourcedStudyItem("student-1", "q1", "class-1");

    const teacher = teacherCtx("teacher-1");
    await assertSucceeds(
      getDoc(doc(teacher.firestore(), "users", "student-1", "studyItems", "q1")),
    );
  });

  it("lets the class's own teacher LIST a student's items filtered to that class (the real dashboard query)", async () => {
    await seedTeacherClass("class-1", "teacher-1");
    await seedClassMemberRow("class-1", "student-1", "student");
    await seedClassSourcedStudyItem("student-1", "q1", "class-1");
    await seedClassSourcedStudyItem("student-1", "q2", "class-1");
    // A different (non-class) item must never come back from this query.
    await seedStudyItem("student-1", "q-private");

    const teacher = teacherCtx("teacher-1");
    const snap = await assertSucceeds(
      getDocs(
        query(
          collection(teacher.firestore(), "users", "student-1", "studyItems"),
          where("sourceClassId", "==", "class-1"),
        ),
      ),
    );
    expect(snap.docs.map((d) => d.id).sort()).toEqual(["q1", "q2"]);
  });

  it("denies a DIFFERENT teacher (not this class's own) reading a class-sourced study item", async () => {
    await seedTeacherClass("class-1", "teacher-1");
    await seedClassMemberRow("class-1", "student-1", "student");
    await seedClassSourcedStudyItem("student-1", "q1", "class-1");

    const otherTeacher = teacherCtx("teacher-2");
    await assertFails(
      getDoc(doc(otherTeacher.firestore(), "users", "student-1", "studyItems", "q1")),
    );
  });

  it("denies the SAME teacher reading a study item sourced from a class they do NOT own", async () => {
    await seedTeacherClass("class-1", "teacher-1");
    await seedTeacherClass("class-2", "teacher-2");
    await seedClassMemberRow("class-2", "student-1", "student");
    // Item sourced from class-2, which teacher-1 does not teach.
    await seedClassSourcedStudyItem("student-1", "q1", "class-2");

    const teacher1 = teacherCtx("teacher-1");
    await assertFails(getDoc(doc(teacher1.firestore(), "users", "student-1", "studyItems", "q1")));
  });

  it("denies the class's own teacher reading a student's PRIVATE (non-class-sourced) study item", async () => {
    await seedTeacherClass("class-1", "teacher-1");
    await seedClassMemberRow("class-1", "student-1", "student");
    // sourceClassId: null — a private/public item, never class-sourced.
    await seedStudyItem("student-1", "q-private");

    const teacher = teacherCtx("teacher-1");
    await assertFails(
      getDoc(doc(teacher.firestore(), "users", "student-1", "studyItems", "q-private")),
    );
  });

  it("denies a teacher reading a class-sourced item for a uid who isn't actually a member of that class", async () => {
    await seedTeacherClass("class-1", "teacher-1");
    // No membership row seeded for "student-1" at all — sourceClassId lies
    // about the relationship (or membership was later removed).
    await seedClassSourcedStudyItem("student-1", "q1", "class-1");

    const teacher = teacherCtx("teacher-1");
    await assertFails(getDoc(doc(teacher.firestore(), "users", "student-1", "studyItems", "q1")));
  });

  it("denies a teacher reading a class-sourced item for a uid whose membership row says 'teacher', not 'student'", async () => {
    await seedTeacherClass("class-1", "teacher-1");
    // co-teacher scenario / data anomaly: membership role is 'teacher'.
    await seedClassMemberRow("class-1", "assistant-1", "teacher");
    await seedClassSourcedStudyItem("assistant-1", "q1", "class-1");

    const teacher = teacherCtx("teacher-1");
    await assertFails(getDoc(doc(teacher.firestore(), "users", "assistant-1", "studyItems", "q1")));
  });

  it("denies a STUDENT (not a teacher at all) using the teacher branch to read a classmate's study item", async () => {
    await seedTeacherClass("class-1", "teacher-1");
    await seedClassMemberRow("class-1", "student-1", "student");
    await seedClassMemberRow("class-1", "student-2", "student");
    await seedClassSourcedStudyItem("student-1", "q1", "class-1");

    const classmate = studentCtx("student-2");
    await assertFails(getDoc(doc(classmate.firestore(), "users", "student-1", "studyItems", "q1")));
  });

  // ---- studyMeta --------------------------------------------------------
  //
  // Deliberately UNCHANGED by Phase 27 — see studentPerformance.ts's own
  // doc comment on why streak/dailyGoal stay owner-only: there is no field
  // on this document (or a companion one) a rule could use to prove a
  // specific teacher/class relationship without either a schema change or
  // granting broader-than-classroom access. The dashboard never reads this
  // collection.

  it("lets the owner read their own study summary", async () => {
    await seedSummary("student-1");
    const owner = studentCtx("student-1");
    await assertSucceeds(
      getDoc(doc(owner.firestore(), "users", "student-1", "studyMeta", "summary")),
    );
  });

  it("denies reading another student's summary", async () => {
    await seedSummary("student-1");
    const outsider = studentCtx("student-2");
    await assertFails(
      getDoc(doc(outsider.firestore(), "users", "student-1", "studyMeta", "summary")),
    );
  });

  it("denies the owner writing their own streak or mastered count", async () => {
    await seedSummary("student-1");
    const owner = studentCtx("student-1");
    await assertFails(
      updateDoc(doc(owner.firestore(), "users", "student-1", "studyMeta", "summary"), {
        currentStreak: 999,
        masteredCount: 999,
      }),
    );
  });

  it("denies the owner setting the daily goal directly (must use the callable)", async () => {
    await seedSummary("student-1");
    const owner = studentCtx("student-1");
    await assertFails(
      updateDoc(doc(owner.firestore(), "users", "student-1", "studyMeta", "summary"), {
        dailyGoal: 1,
      }),
    );
  });

  // ---- studyDays --------------------------------------------------------

  it("lets the owner read their own daily stats", async () => {
    await seedDay("student-1", "2026-08-06");
    const owner = studentCtx("student-1");
    await assertSucceeds(
      getDoc(doc(owner.firestore(), "users", "student-1", "studyDays", "2026-08-06")),
    );
  });

  it("denies reading another student's daily stats", async () => {
    await seedDay("student-1", "2026-08-06");
    const outsider = studentCtx("student-2");
    await assertFails(
      getDoc(doc(outsider.firestore(), "users", "student-1", "studyDays", "2026-08-06")),
    );
  });

  it("denies the owner minting a day document (streak farming)", async () => {
    const owner = studentCtx("student-1");
    await assertFails(
      setDoc(doc(owner.firestore(), "users", "student-1", "studyDays", "2026-08-07"), {
        dayKey: "2026-08-07",
        reviewCount: 100,
        goalCompleted: true,
      }),
    );
  });

  it("denies the owner inflating an existing day's review count", async () => {
    await seedDay("student-1", "2026-08-06");
    const owner = studentCtx("student-1");
    await assertFails(
      updateDoc(doc(owner.firestore(), "users", "student-1", "studyDays", "2026-08-06"), {
        reviewCount: 999,
      }),
    );
  });

  // Phase 25 — the exact query shape getRecentStudyDays (studyService.ts)
  // uses for the Learning Hub's trend engine. `orderBy(documentId(), desc)`
  // (and even the ascending + limitToLast workaround) were tried FIRST and
  // are BOTH rejected outright by the Firestore JS SDK ("Firestore does
  // not support descending key scans") — reproduced against the real rules
  // emulator before studyService.ts settled on ordering by the `dayKey`
  // FIELD instead (also written onto every day doc by recordStudyOutcome),
  // which has no such restriction.
  it("lets the owner LIST their own recent daily stats, newest dayKey first", async () => {
    await seedDay("student-1", "2026-08-05");
    await seedDay("student-1", "2026-08-06");
    await seedDay("student-1", "2026-08-07");
    const owner = studentCtx("student-1");
    const snapshot = await assertSucceeds(
      getDocs(
        query(
          collection(owner.firestore(), "users", "student-1", "studyDays"),
          orderBy("dayKey", "desc"),
          limit(14),
        ),
      ),
    );
    expect(snapshot.docs.map((d) => d.id)).toEqual(["2026-08-07", "2026-08-06", "2026-08-05"]);
  });

  it("denies another student LISTing someone else's daily stats", async () => {
    await seedDay("student-1", "2026-08-06");
    const outsider = studentCtx("student-2");
    await assertFails(
      getDocs(
        query(
          collection(outsider.firestore(), "users", "student-1", "studyDays"),
          orderBy("dayKey", "desc"),
          limit(14),
        ),
      ),
    );
  });
});

// ---- Phase 17: content safety, moderation & abuse prevention -----------
//
// The guarantee under test: no user-generated content becomes visible to
// another user before it passes the server-side publication gate, and no
// client can reach into the machinery that makes that decision.
describe("firestore.rules — moderationSubmissions/{submissionId}", () => {
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

  function teacherContext(uid: string, organizationId: string | null = "org-1") {
    return testEnv.authenticatedContext(uid, { role: "teacher", organizationId });
  }

  function submissionDoc(overrides: Record<string, unknown> = {}) {
    return {
      submissionId: "student-1_op-abcdefgh",
      authorId: "student-1",
      targetType: "question_comment",
      questionId: "q1",
      classId: null,
      organizationId: "org-1",
      text: "merhaba",
      status: "manual_review",
      riskCategories: ["possible_insult"],
      decisionReason: "uncertain",
      operationId: "op-abcdefgh",
      publishedEntityId: null,
      createdAt: 1,
      updatedAt: 1,
      reviewedAt: null,
      reviewedBy: null,
      schemaVersion: 1,
      ...overrides,
    };
  }

  async function seedSubmission(id: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "moderationSubmissions", id), data);
    });
  }

  it("denies a signed-out user reading a submission", async () => {
    await seedSubmission("s1", submissionDoc());
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), "moderationSubmissions", "s1")),
    );
  });

  it("denies a signed-out user creating a submission", async () => {
    await assertFails(
      setDoc(
        doc(testEnv.unauthenticatedContext().firestore(), "moderationSubmissions", "s1"),
        submissionDoc(),
      ),
    );
  });

  it("lets the author read their own submission", async () => {
    await seedSubmission("s1", submissionDoc());
    await assertSucceeds(
      getDoc(doc(studentContext("student-1").firestore(), "moderationSubmissions", "s1")),
    );
  });

  it("denies another student reading a pending submission that is not theirs", async () => {
    // Pending content must never be visible to anyone but its author.
    await seedSubmission("s1", submissionDoc({ status: "manual_review" }));
    await assertFails(
      getDoc(doc(studentContext("student-2").firestore(), "moderationSubmissions", "s1")),
    );
  });

  it("denies another student reading a REJECTED submission that is not theirs", async () => {
    await seedSubmission("s1", submissionDoc({ status: "rejected" }));
    await assertFails(
      getDoc(doc(studentContext("student-2").firestore(), "moderationSubmissions", "s1")),
    );
  });

  it("denies a student listing the moderation queue", async () => {
    // A query is a different operation from a get; prove the real shape.
    await seedSubmission("s1", submissionDoc());
    await seedSubmission("s2", submissionDoc({ authorId: "student-2", submissionId: "s2" }));
    await assertFails(
      getDocs(query(collection(studentContext("student-1").firestore(), "moderationSubmissions"))),
    );
  });

  it("denies a student querying another author's submissions", async () => {
    await seedSubmission("s1", submissionDoc({ authorId: "student-2" }));
    await assertFails(
      getDocs(
        query(
          collection(studentContext("student-1").firestore(), "moderationSubmissions"),
          where("authorId", "==", "student-2"),
        ),
      ),
    );
  });

  it("denies a teacher reading a submission they did not author", async () => {
    // Reviewer access is a server-side callable, not a client read — a
    // teacher-wide read rule here could not be scoped to one class.
    await seedSubmission("s1", submissionDoc());
    await assertFails(
      getDoc(doc(teacherContext("teacher-1").firestore(), "moderationSubmissions", "s1")),
    );
  });

  it("denies a teacher from another organization reading the queue", async () => {
    await seedSubmission("s1", submissionDoc({ organizationId: "org-1" }));
    await assertFails(
      getDoc(doc(teacherContext("teacher-2", "org-2").firestore(), "moderationSubmissions", "s1")),
    );
  });

  it("denies the author creating their own submission", async () => {
    // Only the callable may create one; a client-created submission could
    // carry any status it liked.
    await assertFails(
      setDoc(
        doc(studentContext("student-1").firestore(), "moderationSubmissions", "s1"),
        submissionDoc(),
      ),
    );
  });

  it("denies the author setting status to approved", async () => {
    await seedSubmission("s1", submissionDoc());
    await assertFails(
      updateDoc(doc(studentContext("student-1").firestore(), "moderationSubmissions", "s1"), {
        status: "approved",
      }),
    );
  });

  it("denies the author setting status to rejected or manual_review", async () => {
    await seedSubmission("s1", submissionDoc());
    const author = studentContext("student-1").firestore();
    await assertFails(updateDoc(doc(author, "moderationSubmissions", "s1"), { status: "rejected" }));
    await assertFails(
      updateDoc(doc(author, "moderationSubmissions", "s1"), { status: "manual_review" }),
    );
  });

  it("denies the author setting publishedEntityId", async () => {
    // Forging this would make a replay return a comment id that the gate
    // never created.
    await seedSubmission("s1", submissionDoc());
    await assertFails(
      updateDoc(doc(studentContext("student-1").firestore(), "moderationSubmissions", "s1"), {
        publishedEntityId: "forged-comment",
      }),
    );
  });

  it("denies the author writing reviewer fields", async () => {
    await seedSubmission("s1", submissionDoc());
    const author = studentContext("student-1").firestore();
    await assertFails(
      updateDoc(doc(author, "moderationSubmissions", "s1"), { reviewedBy: "student-1" }),
    );
    await assertFails(updateDoc(doc(author, "moderationSubmissions", "s1"), { reviewedAt: 999 }));
  });

  it("denies the author editing the submitted text after the decision", async () => {
    await seedSubmission("s1", submissionDoc());
    await assertFails(
      updateDoc(doc(studentContext("student-1").firestore(), "moderationSubmissions", "s1"), {
        text: "rewritten after the fact",
      }),
    );
  });

  it("denies the author deleting their submission", async () => {
    // The audit trail is not the author's to erase.
    await seedSubmission("s1", submissionDoc());
    await assertFails(
      deleteDoc(doc(studentContext("student-1").firestore(), "moderationSubmissions", "s1")),
    );
  });
});

describe("firestore.rules — users/{uid}/moderationMeta/{docId}", () => {
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

  async function seedThrottle(uid: string, data: Record<string, unknown>) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", uid, "moderationMeta", "throttle"), data);
    });
  }

  it("lets the owner read their own throttle record", async () => {
    await seedThrottle("student-1", { lastSubmissionAt: 100, updatedAt: 100 });
    await assertSucceeds(
      getDoc(
        doc(
          studentContext("student-1").firestore(),
          "users",
          "student-1",
          "moderationMeta",
          "throttle",
        ),
      ),
    );
  });

  it("denies another user reading it", async () => {
    await seedThrottle("student-1", { lastSubmissionAt: 100, updatedAt: 100 });
    await assertFails(
      getDoc(
        doc(
          studentContext("student-2").firestore(),
          "users",
          "student-1",
          "moderationMeta",
          "throttle",
        ),
      ),
    );
  });

  it("denies the owner rewinding their own rate limit", async () => {
    // The whole point of a server-owned throttle: a client that could write
    // lastSubmissionAt would grant itself unlimited submissions.
    await seedThrottle("student-1", { lastSubmissionAt: 100, updatedAt: 100 });
    await assertFails(
      updateDoc(
        doc(
          studentContext("student-1").firestore(),
          "users",
          "student-1",
          "moderationMeta",
          "throttle",
        ),
        { lastSubmissionAt: 0 },
      ),
    );
  });

  it("denies the owner creating a throttle record", async () => {
    await assertFails(
      setDoc(
        doc(
          studentContext("student-1").firestore(),
          "users",
          "student-1",
          "moderationMeta",
          "throttle",
        ),
        { lastSubmissionAt: 0, updatedAt: 0 },
      ),
    );
  });

  it("denies the owner deleting it to reset the limit", async () => {
    await seedThrottle("student-1", { lastSubmissionAt: 100, updatedAt: 100 });
    await assertFails(
      deleteDoc(
        doc(
          studentContext("student-1").firestore(),
          "users",
          "student-1",
          "moderationMeta",
          "throttle",
        ),
      ),
    );
  });

  it("denies writing to another user's moderation meta", async () => {
    await assertFails(
      setDoc(
        doc(
          studentContext("student-2").firestore(),
          "users",
          "student-1",
          "moderationMeta",
          "throttle",
        ),
        { lastSubmissionAt: 0 },
      ),
    );
  });
});

describe("firestore.rules — assignments/{assignmentId} and submissions (Phase 29)", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: fs.readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    });
  });

  afterAll(async () => testEnv.cleanup());
  afterEach(async () => testEnv.clearFirestore());

  function teacherCtx(uid: string, organizationId: string | null = "org-1") {
    return testEnv.authenticatedContext(uid, { role: "teacher", organizationId });
  }

  function studentCtx(uid: string) {
    return testEnv.authenticatedContext(uid, { role: "student", organizationId: null });
  }

  async function seedClass(classId: string, teacherId: string, organizationId = "org-1") {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "classes", classId), {
        name: "Test Class",
        organizationId,
        teacherId,
        joinCode: "ABC123",
        createdAt: 1,
        updatedAt: 1,
        memberCount: 1,
        status: "active",
      });
    });
  }

  function assignmentDoc(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      classId: "class-1",
      organizationId: "org-1",
      teacherId: "teacher-1",
      title: "Denklemler Tekrarı",
      description: null,
      subject: "Matematik",
      topic: "Denklemler",
      gradeLevel: "9",
      targetStudentIds: ["student-1", "student-2"],
      questionIds: ["q1", "q2", "q3"],
      targetCount: 3,
      dueAt: null,
      status: "published",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...overrides,
    };
  }

  async function seedAssignment(assignmentId: string, overrides: Partial<Record<string, unknown>> = {}) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "assignments", assignmentId), assignmentDoc(overrides));
    });
  }

  // ---- create -------------------------------------------------------------

  it("lets a teacher create an assignment for their own class", async () => {
    await seedClass("class-1", "teacher-1");
    const teacher = teacherCtx("teacher-1");
    await assertSucceeds(addDoc(collection(teacher.firestore(), "assignments"), assignmentDoc()));
  });

  it("denies a teacher creating an assignment for a class they do not own", async () => {
    await seedClass("class-1", "teacher-2");
    const teacher = teacherCtx("teacher-1");
    await assertFails(addDoc(collection(teacher.firestore(), "assignments"), assignmentDoc()));
  });

  it("denies a student creating an assignment", async () => {
    await seedClass("class-1", "teacher-1");
    const student = studentCtx("student-1");
    await assertFails(addDoc(collection(student.firestore(), "assignments"), assignmentDoc()));
  });

  it("denies creating with a teacherId that doesn't match the caller", async () => {
    await seedClass("class-1", "teacher-1");
    const teacher = teacherCtx("teacher-1");
    await assertFails(
      addDoc(collection(teacher.firestore(), "assignments"), assignmentDoc({ teacherId: "teacher-1-fake" })),
    );
  });

  it("denies more questionIds than the cap", async () => {
    await seedClass("class-1", "teacher-1");
    const teacher = teacherCtx("teacher-1");
    const tooMany = Array.from({ length: 31 }, (_, i) => `q${i}`);
    await assertFails(
      addDoc(
        collection(teacher.firestore(), "assignments"),
        assignmentDoc({ questionIds: tooMany, targetCount: tooMany.length }),
      ),
    );
  });

  it("denies targetCount that doesn't match questionIds.length", async () => {
    await seedClass("class-1", "teacher-1");
    const teacher = teacherCtx("teacher-1");
    await assertFails(
      addDoc(collection(teacher.firestore(), "assignments"), assignmentDoc({ targetCount: 999 })),
    );
  });

  it("denies an empty targetStudentIds list", async () => {
    await seedClass("class-1", "teacher-1");
    const teacher = teacherCtx("teacher-1");
    await assertFails(
      addDoc(collection(teacher.firestore(), "assignments"), assignmentDoc({ targetStudentIds: [] })),
    );
  });

  // ---- read -----------------------------------------------------------------

  it("lets the owning teacher read their own class's assignment", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    const teacher = teacherCtx("teacher-1");
    await assertSucceeds(getDoc(doc(teacher.firestore(), "assignments", "a1")));
  });

  it("denies a DIFFERENT teacher reading another teacher's assignment (cross-class denial)", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    const otherTeacher = teacherCtx("teacher-2");
    await assertFails(getDoc(doc(otherTeacher.firestore(), "assignments", "a1")));
  });

  it("lets a TARGETED student read the assignment", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    const student = studentCtx("student-1");
    await assertSucceeds(getDoc(doc(student.firestore(), "assignments", "a1")));
  });

  it("denies a student who is NOT targeted from reading the assignment", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    const outsider = studentCtx("student-9");
    await assertFails(getDoc(doc(outsider.firestore(), "assignments", "a1")));
  });

  it("lets the owning teacher LIST their own class's assignments (the real query shape)", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    await seedAssignment("a2");
    const teacher = teacherCtx("teacher-1");
    const snap = await assertSucceeds(
      getDocs(query(collection(teacher.firestore(), "assignments"), where("classId", "==", "class-1"))),
    );
    expect(snap.docs).toHaveLength(2);
  });

  it("lets a targeted student LIST their own assignments (the real array-contains query shape)", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    await seedAssignment("a2", { targetStudentIds: ["student-9"] }); // not targeting student-1
    const student = studentCtx("student-1");
    const snap = await assertSucceeds(
      getDocs(
        query(collection(student.firestore(), "assignments"), where("targetStudentIds", "array-contains", "student-1")),
      ),
    );
    expect(snap.docs.map((d) => d.id)).toEqual(["a1"]);
  });

  // ---- update / delete --------------------------------------------------

  it("lets the owning teacher archive their own assignment", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    const teacher = teacherCtx("teacher-1");
    await assertSucceeds(
      updateDoc(doc(teacher.firestore(), "assignments", "a1"), { status: "archived" }),
    );
  });

  it("denies a different teacher updating another teacher's assignment", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    const otherTeacher = teacherCtx("teacher-2");
    await assertFails(
      updateDoc(doc(otherTeacher.firestore(), "assignments", "a1"), { status: "archived" }),
    );
  });

  it("denies changing questionIds on update (the snapshot must stay frozen)", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    const teacher = teacherCtx("teacher-1");
    await assertFails(
      updateDoc(doc(teacher.firestore(), "assignments", "a1"), { questionIds: ["q-new"] }),
    );
  });

  it("denies a student updating an assignment", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    const student = studentCtx("student-1");
    await assertFails(updateDoc(doc(student.firestore(), "assignments", "a1"), { status: "archived" }));
  });

  it("lets the owning teacher delete their own assignment", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    const teacher = teacherCtx("teacher-1");
    await assertSucceeds(deleteDoc(doc(teacher.firestore(), "assignments", "a1")));
  });

  it("denies a different teacher deleting another teacher's assignment", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    const otherTeacher = teacherCtx("teacher-2");
    await assertFails(deleteDoc(doc(otherTeacher.firestore(), "assignments", "a1")));
  });

  // ---- submissions --------------------------------------------------------

  function submissionDoc(studentId: string, overrides: Partial<Record<string, unknown>> = {}) {
    return {
      studentId,
      completedQuestionIds: ["q1"],
      completedCount: 1,
      startedAt: 1,
      lastCompletedAt: 1,
      completedAt: null,
      ...overrides,
    };
  }

  it("lets a targeted student write their OWN submission", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    const student = studentCtx("student-1");
    await assertSucceeds(
      setDoc(
        doc(student.firestore(), "assignments", "a1", "submissions", "student-1"),
        submissionDoc("student-1"),
      ),
    );
  });

  it("denies a student writing to ANOTHER student's submission (cross-student denial)", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    const attacker = studentCtx("student-2");
    await assertFails(
      setDoc(
        doc(attacker.firestore(), "assignments", "a1", "submissions", "student-1"),
        submissionDoc("student-1"),
      ),
    );
  });

  it("denies a student writing a submission with their studentId field spoofed to someone else", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    const student = studentCtx("student-1");
    await assertFails(
      setDoc(
        doc(student.firestore(), "assignments", "a1", "submissions", "student-1"),
        submissionDoc("student-2"),
      ),
    );
  });

  it("denies a non-targeted student writing a submission for an assignment they're not part of", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1"); // targets student-1, student-2 only
    const outsider = studentCtx("student-9");
    await assertFails(
      setDoc(
        doc(outsider.firestore(), "assignments", "a1", "submissions", "student-9"),
        submissionDoc("student-9"),
      ),
    );
  });

  it("denies claiming a completed questionId that isn't actually in the assignment", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1"); // questionIds: q1, q2, q3
    const student = studentCtx("student-1");
    await assertFails(
      setDoc(
        doc(student.firestore(), "assignments", "a1", "submissions", "student-1"),
        submissionDoc("student-1", { completedQuestionIds: ["q-not-in-assignment"] }),
      ),
    );
  });

  it("denies a completedCount that doesn't match completedQuestionIds.length", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    const student = studentCtx("student-1");
    await assertFails(
      setDoc(
        doc(student.firestore(), "assignments", "a1", "submissions", "student-1"),
        submissionDoc("student-1", { completedCount: 999 }),
      ),
    );
  });

  // ---- questionOutcomes (Phase 31) -----------------------------------

  it("lets a student write a submission that includes valid questionOutcomes", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1"); // questionIds: q1, q2, q3
    const student = studentCtx("student-1");
    await assertSucceeds(
      setDoc(
        doc(student.firestore(), "assignments", "a1", "submissions", "student-1"),
        submissionDoc("student-1", { questionOutcomes: { q1: "struggled" } }),
      ),
    );
  });

  it("still lets a student write a submission with NO questionOutcomes field at all (backward compatible)", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    const student = studentCtx("student-1");
    const doc_ = submissionDoc("student-1");
    await assertSucceeds(
      setDoc(doc(student.firestore(), "assignments", "a1", "submissions", "student-1"), doc_),
    );
  });

  it("denies questionOutcomes keyed by a questionId that isn't in the assignment", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    const student = studentCtx("student-1");
    await assertFails(
      setDoc(
        doc(student.firestore(), "assignments", "a1", "submissions", "student-1"),
        submissionDoc("student-1", { questionOutcomes: { "q-not-in-assignment": "struggled" } }),
      ),
    );
  });

  it("denies questionOutcomes that isn't a map", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    const student = studentCtx("student-1");
    await assertFails(
      setDoc(
        doc(student.firestore(), "assignments", "a1", "submissions", "student-1"),
        submissionDoc("student-1", { questionOutcomes: "struggled" }),
      ),
    );
  });

  it("lets the owning teacher read a student's submission", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "assignments", "a1", "submissions", "student-1"),
        submissionDoc("student-1"),
      );
    });
    const teacher = teacherCtx("teacher-1");
    await assertSucceeds(getDoc(doc(teacher.firestore(), "assignments", "a1", "submissions", "student-1")));
  });

  it("lets the owning teacher LIST all submissions for their own assignment", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "assignments", "a1", "submissions", "student-1"),
        submissionDoc("student-1"),
      );
      await setDoc(
        doc(context.firestore(), "assignments", "a1", "submissions", "student-2"),
        submissionDoc("student-2"),
      );
    });
    const teacher = teacherCtx("teacher-1");
    const snap = await assertSucceeds(
      getDocs(collection(teacher.firestore(), "assignments", "a1", "submissions")),
    );
    expect(snap.docs).toHaveLength(2);
  });

  it("denies a DIFFERENT teacher reading another teacher's assignment submissions", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "assignments", "a1", "submissions", "student-1"),
        submissionDoc("student-1"),
      );
    });
    const otherTeacher = teacherCtx("teacher-2");
    await assertFails(
      getDoc(doc(otherTeacher.firestore(), "assignments", "a1", "submissions", "student-1")),
    );
  });

  it("denies a student reading ANOTHER student's submission (cross-student read denial)", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "assignments", "a1", "submissions", "student-1"),
        submissionDoc("student-1"),
      );
    });
    const otherStudent = studentCtx("student-2");
    await assertFails(
      getDoc(doc(otherStudent.firestore(), "assignments", "a1", "submissions", "student-1")),
    );
  });

  it("denies deleting a submission entirely (even the owner)", async () => {
    await seedClass("class-1", "teacher-1");
    await seedAssignment("a1");
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "assignments", "a1", "submissions", "student-1"),
        submissionDoc("student-1"),
      );
    });
    const student = studentCtx("student-1");
    await assertFails(
      deleteDoc(doc(student.firestore(), "assignments", "a1", "submissions", "student-1")),
    );
  });
});
