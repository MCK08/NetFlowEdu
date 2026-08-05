// Unit-tests the REAL joinClassByCode handler (imported from functions/src,
// not reimplemented) against in-memory firebase-admin fakes — same pattern
// as createClass.test.ts / completeOnboarding.test.ts.
//
// Direct regression coverage for the production bug: a student entering the
// genuinely valid code 28YPQ5 was rejected with permission-denied. The
// handler required
//   classData.organizationId === caller.token.organizationId
// but a class always carries its TEACHER's organizationId while a student's
// organizationId claim is always null (onboarding never mints an
// organization for students — verified across every production student
// account). The check was therefore unsatisfiable and rejected 100% of
// valid join codes.

const mockClassesStore = new Map<string, Record<string, unknown>>();
const mockMembersStore = new Map<string, Map<string, Record<string, unknown>>>();
const mockJoinCodesStore = new Map<string, Record<string, unknown>>();
const mockUsersStore = new Map<string, Record<string, unknown> | undefined>();
// Phase 15 — joinClassByCode now also writes a class_student_joined
// notification (+ its unread-count summary) to the class's teacher via
// users/{uid}/notifications and users/{uid}/notificationMeta. Not this
// test file's own subject, but the real handler now touches it, so the
// fake needs to support the sub-collection rather than throwing.
const mockNotificationsStore = new Map<string, Map<string, Record<string, unknown>>>();
const mockNotificationMetaStore = new Map<string, Record<string, unknown>>();

function notificationsFor(uid: string) {
  if (!mockNotificationsStore.has(uid)) mockNotificationsStore.set(uid, new Map());
  return mockNotificationsStore.get(uid)!;
}

const SERVER_TIMESTAMP = "__SERVER_TIMESTAMP__";
const INCREMENT = "__INCREMENT__";

function membersFor(classId: string) {
  if (!mockMembersStore.has(classId)) mockMembersStore.set(classId, new Map());
  return mockMembersStore.get(classId)!;
}

function memberDocRef(classId: string, uid: string) {
  return {
    id: uid,
    async get() {
      const data = membersFor(classId).get(uid);
      return { exists: data !== undefined, data: () => data, id: uid };
    },
    async set(data: Record<string, unknown>) {
      membersFor(classId).set(uid, { ...data });
    },
  };
}

function classDocRef(id: string) {
  return {
    id,
    collection: (name: string) => {
      if (name !== "members") throw new Error(`unexpected sub-collection ${name}`);
      return { doc: (uid: string) => memberDocRef(id, uid) };
    },
    async get() {
      const data = mockClassesStore.get(id);
      return { exists: data !== undefined, data: () => data, id };
    },
    async update(data: Record<string, unknown>) {
      const existing = mockClassesStore.get(id) ?? {};
      const next: Record<string, unknown> = { ...existing };
      for (const [k, v] of Object.entries(data)) {
        // Emulate FieldValue.increment(1) so memberCount double-increments
        // would actually be visible to the assertions below.
        if (v && typeof v === "object" && (v as { __op?: string }).__op === INCREMENT) {
          next[k] = ((existing[k] as number) ?? 0) + (v as { by: number }).by;
        } else {
          next[k] = v;
        }
      }
      mockClassesStore.set(id, next);
    },
  };
}

function joinCodeDocRef(code: string) {
  return {
    id: code,
    async get() {
      const data = mockJoinCodesStore.get(code);
      return { exists: data !== undefined, data: () => data, id: code };
    },
  };
}

function notificationDocRef(recipientUid: string, notificationId: string) {
  return {
    id: notificationId,
    async get() {
      const data = notificationsFor(recipientUid).get(notificationId);
      return { exists: data !== undefined, data: () => data, id: notificationId };
    },
    async set(data: Record<string, unknown>) {
      notificationsFor(recipientUid).set(notificationId, { ...data });
    },
  };
}

function notificationMetaDocRef(uid: string) {
  return {
    id: "summary",
    async get() {
      const data = mockNotificationMetaStore.get(uid);
      return { exists: data !== undefined, data: () => data, id: "summary" };
    },
    async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
      if (options?.merge) {
        mockNotificationMetaStore.set(uid, { ...(mockNotificationMetaStore.get(uid) ?? {}), ...data });
      } else {
        mockNotificationMetaStore.set(uid, { ...data });
      }
    },
  };
}

function userDocRef(uid: string) {
  return {
    id: uid,
    collection: (name: string) => {
      if (name === "notifications") return { doc: (id: string) => notificationDocRef(uid, id) };
      if (name === "notificationMeta") return { doc: () => notificationMetaDocRef(uid) };
      throw new Error(`unexpected sub-collection ${name}`);
    },
    async get() {
      const data = mockUsersStore.get(uid);
      return { exists: data !== undefined, data: () => data, id: uid };
    },
  };
}

function mockMakeFakeDb() {
  return {
    collection: (name: string) => ({
      doc: (id: string) => {
        if (name === "classes") return classDocRef(id);
        if (name === "classJoinCodes") return joinCodeDocRef(id);
        if (name === "users") return userDocRef(id);
        throw new Error(`unexpected collection ${name}`);
      },
    }),
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      // Enforces Firestore's real read-before-write rule — see the same
      // guard (and the production incident that motivated it) in
      // tests/unit/notificationCallables.test.ts.
      let hasWritten = false;
      const assertReadPhase = () => {
        if (hasWritten) {
          throw new Error(
            "Firestore transactions require all reads to be executed before all writes.",
          );
        }
      };
      const tx = {
        get: (ref: { get: () => unknown }) => {
          assertReadPhase();
          return ref.get();
        },
        set: (
          ref: { set: (d: Record<string, unknown>, o?: { merge?: boolean }) => unknown },
          d: Record<string, unknown>,
          options?: { merge?: boolean },
        ) => {
          hasWritten = true;
          return ref.set(d, options);
        },
        update: (
          ref: { update: (d: Record<string, unknown>) => unknown },
          d: Record<string, unknown>,
        ) => {
          hasWritten = true;
          return ref.update(d);
        },
      };
      return fn(tx);
    },
  };
}

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: () => mockMakeFakeDb(),
  FieldValue: {
    serverTimestamp: () => SERVER_TIMESTAMP,
    increment: (by: number) => ({ __op: INCREMENT, by }),
  },
}));

jest.mock("firebase-functions/v2", () => ({
  logger: { info: () => undefined, error: () => undefined },
}));

// eslint-disable-next-line import/first
import { joinClassByCode } from "../../functions/src/classes/joinClassByCode";

const TEACHER_ORG = "Sso7DQ2DhcUL7YoFKpAWUCzSl7I2";

function resetStores() {
  mockClassesStore.clear();
  mockMembersStore.clear();
  mockJoinCodesStore.clear();
  mockUsersStore.clear();
  mockNotificationsStore.clear();
  mockNotificationMetaStore.clear();
}

function seedClass(
  classId: string,
  code: string,
  overrides: Record<string, unknown> = {},
) {
  mockJoinCodesStore.set(code, { classId, createdAt: 1 });
  mockClassesStore.set(classId, {
    name: "Sistem",
    teacherId: "teacher-1",
    organizationId: TEACHER_ORG,
    status: "active",
    memberCount: 1,
    ...overrides,
  });
}

// A real student exactly as production has them: role student, NO
// organization. This is the shape the old check could never satisfy.
function studentRequest(uid: string, code: string, organizationId: unknown = null) {
  return {
    data: { code },
    auth: { uid, token: { role: "student", organizationId } },
  } as never;
}

beforeEach(resetStores);

describe("joinClassByCode — a student with no organization can join (the production bug)", () => {
  it("1. lets a student with organizationId=null join with a valid active code", async () => {
    seedClass("class-1", "28YPQ5");
    mockUsersStore.set("student-1", { displayName: "Ali", username: "ali" });

    const result = await joinClassByCode.run(studentRequest("student-1", "28YPQ5"));

    expect(result).toMatchObject({ classId: "class-1", className: "Sistem", alreadyMember: false });
    expect(membersFor("class-1").get("student-1")).toMatchObject({
      uid: "student-1",
      role: "student",
      displayName: "Ali",
    });
  });

  it("2. lets a student join even though the class's organizationId differs from theirs", async () => {
    // Explicitly the cross-org case the removed check rejected. Membership —
    // not organization — is the authority for class content (firestore.rules
    // gates every class resource on isClassMember).
    seedClass("class-1", "28YPQ5");
    const result = await joinClassByCode.run(
      studentRequest("student-1", "28YPQ5", "some-other-org"),
    );
    expect(result.alreadyMember).toBe(false);
    expect(membersFor("class-1").has("student-1")).toBe(true);
  });

  it("3. lets one student join classes owned by two different teachers (impossible under org-equality)", async () => {
    seedClass("class-1", "CODE01", { teacherId: "teacher-1", organizationId: "org-A" });
    seedClass("class-2", "CODE02", { teacherId: "teacher-2", organizationId: "org-B" });

    await joinClassByCode.run(studentRequest("student-1", "CODE01"));
    await joinClassByCode.run(studentRequest("student-1", "CODE02"));

    expect(membersFor("class-1").has("student-1")).toBe(true);
    expect(membersFor("class-2").has("student-1")).toBe(true);
  });

  it("4. joining a second class does not disturb the first membership", async () => {
    seedClass("class-1", "CODE01");
    seedClass("class-2", "CODE02");
    await joinClassByCode.run(studentRequest("student-1", "CODE01"));
    const firstMembership = { ...membersFor("class-1").get("student-1") };

    await joinClassByCode.run(studentRequest("student-1", "CODE02"));

    expect(membersFor("class-1").get("student-1")).toEqual(firstMembership);
  });
});

describe("joinClassByCode — guards that must still hold", () => {
  it("5. an unknown code is rejected as not-found", async () => {
    await expect(
      joinClassByCode.run(studentRequest("student-1", "NOPE12")),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("6. a code pointing at a non-active class is rejected", async () => {
    seedClass("class-1", "28YPQ5", { status: "archived" });
    await expect(
      joinClassByCode.run(studentRequest("student-1", "28YPQ5")),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("7. a non-student (teacher) cannot join via a code", async () => {
    seedClass("class-1", "28YPQ5");
    await expect(
      joinClassByCode.run({
        data: { code: "28YPQ5" },
        auth: { uid: "teacher-1", token: { role: "teacher", organizationId: TEACHER_ORG } },
      } as never),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("8. an unauthenticated caller is rejected", async () => {
    seedClass("class-1", "28YPQ5");
    await expect(
      joinClassByCode.run({ data: { code: "28YPQ5" }, auth: null } as never),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("9. an empty code is rejected as invalid-argument", async () => {
    await expect(
      joinClassByCode.run(studentRequest("student-1", "   ")),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

describe("joinClassByCode — idempotency", () => {
  it("10. re-submitting the same code reports alreadyMember and creates no duplicate", async () => {
    seedClass("class-1", "28YPQ5");
    await joinClassByCode.run(studentRequest("student-1", "28YPQ5"));
    const second = await joinClassByCode.run(studentRequest("student-1", "28YPQ5"));

    expect(second.alreadyMember).toBe(true);
    expect(membersFor("class-1").size).toBe(1);
  });

  it("11. memberCount increments exactly once no matter how many times the code is submitted", async () => {
    seedClass("class-1", "28YPQ5", { memberCount: 1 });

    await joinClassByCode.run(studentRequest("student-1", "28YPQ5"));
    await joinClassByCode.run(studentRequest("student-1", "28YPQ5"));
    await joinClassByCode.run(studentRequest("student-1", "28YPQ5"));

    expect(mockClassesStore.get("class-1")?.memberCount).toBe(2);
  });

  it("12. a second, different student increments memberCount again", async () => {
    seedClass("class-1", "28YPQ5", { memberCount: 1 });
    await joinClassByCode.run(studentRequest("student-1", "28YPQ5"));
    await joinClassByCode.run(studentRequest("student-2", "28YPQ5"));

    expect(mockClassesStore.get("class-1")?.memberCount).toBe(3);
    expect(membersFor("class-1").size).toBe(2);
  });

  it("13. only ever writes the CALLER's own membership row", async () => {
    seedClass("class-1", "28YPQ5");
    await joinClassByCode.run(studentRequest("student-1", "28YPQ5"));

    expect([...membersFor("class-1").keys()]).toEqual(["student-1"]);
    expect(membersFor("class-1").get("student-1")).toMatchObject({ uid: "student-1" });
  });

  it("14. normalizes a lowercase/padded code so the student is not blamed for formatting", async () => {
    seedClass("class-1", "28YPQ5");
    const result = await joinClassByCode.run(studentRequest("student-1", "  28ypq5 "));
    expect(result.classId).toBe("class-1");
  });
});
