import * as fs from "fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collectionGroup, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";

// Bug report (real device): a student enters a VALID join code, taps
// "Katıl", and nothing happens — no error, no success, the class never
// appears in "Sınıflarım".
//
// Cloud Logging proved joinClassByCode itself returned HTTP 200 for that
// exact device attempt (latency 3.9s, userAgent Expo/CFNetwork), so the
// membership WAS created server-side. The failure is on the read-back path.
//
// getStudentClasses (src/services/firebase/classes.ts) runs a COLLECTION
// GROUP query over "members" filtered on the `uid` FIELD:
//     query(collectionGroup(db, "members"), where("uid", "==", uid))
// while firestore.rules gates that subcollection on the document ID and a
// cross-document get():
//     allow read: if isSignedIn()
//                 && (isOwner(memberUid) || classData(classId).teacherId == uid());
//
// A separate project id from firestore.rules.test.ts keeps the two suites
// from sharing state.
const PROJECT_ID = "netflow-edu-membership-rules-test";

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

function asStudent(uid: string) {
  return testEnv.authenticatedContext(uid, { role: "student", organizationId: null });
}

function asTeacher(uid: string) {
  return testEnv.authenticatedContext(uid, { role: "teacher", organizationId: "org-1" });
}

// Mirrors exactly what joinClassByCode writes: the member document's ID AND
// its `uid` field are both the joining student's uid.
async function seedMembership(classId: string, memberUid: string) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "classes", classId), {
      name: "Sistem",
      teacherId: "teacher-1",
      organizationId: "org-1",
      status: "active",
      joinCode: "28YPQ5",
      memberCount: 2,
      createdAt: 1,
      updatedAt: 1,
    });
    await setDoc(doc(db, "classes", classId, "members", memberUid), {
      uid: memberUid,
      role: "student",
      joinedAt: 1,
      displayName: "Ali",
      username: "ali",
      photoURL: null,
    });
  });
}

function membershipQuery(firestore: ReturnType<ReturnType<typeof asStudent>["firestore"]>, uid: string) {
  return query(collectionGroup(firestore, "members"), where("uid", "==", uid));
}

describe("getStudentClasses read-back path — the exact production query", () => {
  it("a student CAN read their own membership document by full path", async () => {
    await seedMembership("class-1", "student-1");
    await assertSucceeds(
      getDoc(doc(asStudent("student-1").firestore(), "classes", "class-1", "members", "student-1")),
    );
  });

  it("a student CAN read the class document once they are a member", async () => {
    await seedMembership("class-1", "student-1");
    await assertSucceeds(getDoc(doc(asStudent("student-1").firestore(), "classes", "class-1")));
  });

  it("a non-member cannot read the class document", async () => {
    await seedMembership("class-1", "student-1");
    await assertFails(getDoc(doc(asStudent("student-2").firestore(), "classes", "class-1")));
  });

  it("the owning teacher can read a member row", async () => {
    await seedMembership("class-1", "student-1");
    await assertSucceeds(
      getDoc(doc(asTeacher("teacher-1").firestore(), "classes", "class-1", "members", "student-1")),
    );
  });

  // The decisive one: this is the query getStudentClasses actually issues.
  it("the collection-group membership query getStudentClasses depends on", async () => {
    await seedMembership("class-1", "student-1");
    await assertSucceeds(getDocs(membershipQuery(asStudent("student-1").firestore(), "student-1")));
  });

  it("another student cannot list someone else's memberships via the collection group", async () => {
    await seedMembership("class-1", "student-1");
    await assertFails(getDocs(membershipQuery(asStudent("student-2").firestore(), "student-1")));
  });
});
