import * as fs from "fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

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
