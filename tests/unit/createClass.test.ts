// Unit-tests the REAL createClass handler (imported straight from
// functions/src, not reimplemented) — same pattern as completeOnboarding.test.ts:
// onCall's CallableFunction.run(request) lets this run against in-memory
// fakes of firebase-admin's Firestore, no emulator needed.
//
// This is the direct regression coverage for the production bug traced in
// this session: createClass authorizes EXCLUSIVELY via
// request.auth.token.role/organizationId (custom claims) — never Firestore
// users/{uid} — so a caller whose ID token predates completeOnboarding's
// claims grant is correctly rejected, even though users/{uid}.role/
// organizationId/onboardingStatus are already all correct in Firestore.
// That gap between "Firestore says teacher" and "this specific caller's
// token says teacher" is exactly what the RouteGuard/AuthProvider
// `claimsSynced` fix (routing.ts, AuthProvider.tsx) closes on the client
// side — this file proves the server side of the same fact: fresh claims
// succeed, stale/missing claims fail, and a student's claims always fail,
// regardless of what Firestore says.

const mockClassesStore = new Map<string, Record<string, unknown>>();
const mockMembersStore = new Map<string, Map<string, Record<string, unknown>>>();
const mockJoinCodesStore = new Map<string, Record<string, unknown>>();
const mockUsersStore = new Map<string, Record<string, unknown> | undefined>();
const mockOrgsStore = new Map<string, Record<string, unknown> | undefined>();

const SERVER_TIMESTAMP = "__SERVER_TIMESTAMP__";
let autoIdCounter = 0;

function membersFor(classId: string) {
  if (!mockMembersStore.has(classId)) mockMembersStore.set(classId, new Map());
  return mockMembersStore.get(classId)!;
}

function classDocRef(id: string) {
  return {
    id,
    collection: (name: string) => {
      if (name !== "members") throw new Error(`unexpected sub-collection ${name}`);
      return {
        doc: (uid: string) => ({
          id: uid,
          async set(data: Record<string, unknown>) {
            membersFor(id).set(uid, { ...data });
          },
        }),
      };
    },
    async get() {
      const data = mockClassesStore.get(id);
      return { exists: data !== undefined, data: () => data, id };
    },
    async set(data: Record<string, unknown>) {
      mockClassesStore.set(id, { ...data });
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
    async set(data: Record<string, unknown>) {
      mockJoinCodesStore.set(code, { ...data });
    },
  };
}

function userDocRef(uid: string) {
  return {
    id: uid,
    async get() {
      const data = mockUsersStore.get(uid);
      return { exists: data !== undefined, data: () => data, id: uid };
    },
    async update(data: Record<string, unknown>) {
      const existing = mockUsersStore.get(uid) ?? {};
      mockUsersStore.set(uid, { ...existing, ...data });
    },
  };
}

function orgDocRef(id: string) {
  return {
    id,
    async get() {
      const data = mockOrgsStore.get(id);
      return { exists: data !== undefined, data: () => data, id };
    },
    async set(data: Record<string, unknown>) {
      mockOrgsStore.set(id, { ...data });
    },
  };
}

function mockMakeFakeDb() {
  return {
    collection: (name: string) => ({
      doc: (id?: string) => {
        if (name === "classes") return classDocRef(id ?? `auto-class-${++autoIdCounter}`);
        if (name === "classJoinCodes") return joinCodeDocRef(id!);
        if (name === "users") return userDocRef(id!);
        if (name === "organizations") return orgDocRef(id!);
        throw new Error(`unexpected collection ${name}`);
      },
    }),
    async runTransaction(fn: (tx: unknown) => Promise<void>) {
      const tx = {
        get: (ref: { get: () => unknown }) => ref.get(),
        set: (ref: { set: (data: Record<string, unknown>) => unknown }, data: Record<string, unknown>) =>
          ref.set(data),
        update: (ref: { update: (data: Record<string, unknown>) => unknown }, data: Record<string, unknown>) =>
          ref.update(data),
      };
      return fn(tx);
    },
  };
}

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: () => mockMakeFakeDb(),
  FieldValue: { serverTimestamp: () => SERVER_TIMESTAMP },
}));

// eslint-disable-next-line import/first
import { createClass } from "../../functions/src/classes/createClass";
// eslint-disable-next-line import/first
import { completeOnboarding } from "../../functions/src/onboarding/completeOnboarding";

const mockClaimsStore = new Map<string, Record<string, unknown> | undefined>();

jest.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    async getUser(uid: string) {
      return { customClaims: mockClaimsStore.get(uid) };
    },
    async setCustomUserClaims(uid: string, claims: Record<string, unknown>) {
      mockClaimsStore.set(uid, claims);
    },
  }),
}));

jest.mock("firebase-functions/v2", () => ({
  logger: { info: () => undefined, error: () => undefined },
}));

function resetStores() {
  mockClassesStore.clear();
  mockMembersStore.clear();
  mockJoinCodesStore.clear();
  mockUsersStore.clear();
  mockOrgsStore.clear();
  mockClaimsStore.clear();
  autoIdCounter = 0;
}

function callerRequest(uid: string, data: Record<string, unknown>, token: Record<string, unknown>) {
  return { data, auth: { uid, token } } as never;
}

describe("createClass — authorizes on custom claims ONLY, never Firestore", () => {
  beforeEach(resetStores);

  it("succeeds for a caller whose token already carries fresh teacher/organizationId claims", async () => {
    mockUsersStore.set("teacher-1", { displayName: "Ayşe Yılmaz", username: "ayse" });

    const result = await createClass.run(
      callerRequest("teacher-1", { name: "9-A Matematik" }, { role: "teacher", organizationId: "org-1" }),
    );

    expect(result.classId).toBeTruthy();
    expect(result.joinCode).toHaveLength(6);
    expect(mockClassesStore.get(result.classId)).toMatchObject({
      name: "9-A Matematik",
      organizationId: "org-1",
      teacherId: "teacher-1",
    });
    expect(membersFor(result.classId).get("teacher-1")).toMatchObject({ role: "teacher", displayName: "Ayşe Yılmaz" });
  });

  // THE production bug, reproduced directly against the real handler: even
  // though Firestore already has everything right (users/{uid}.role ==
  // "teacher", organizationId set, onboardingStatus == "complete"), a
  // caller whose ID TOKEN is stale (predates the claims grant — the exact
  // state a just-promoted teacher's client has until its own force-refresh
  // completes) is rejected. createClass never reads users/{uid} for
  // authorization, so Firestore being correct does not help here at all.
  it("rejects a caller with a stale token (Firestore already says teacher, but the token doesn't yet) — the exact production failure", async () => {
    mockUsersStore.set("teacher-1", {
      role: "teacher",
      organizationId: "org-1",
      onboardingStatus: "complete",
      displayName: "Ayşe Yılmaz",
    });

    await expect(
      createClass.run(callerRequest("teacher-1", { name: "9-A Matematik" }, {})),
    ).rejects.toThrow();

    expect(mockClassesStore.size).toBe(0);
  });

  it("rejects a caller with organizationId missing from the token even if role is teacher", async () => {
    await expect(
      createClass.run(callerRequest("teacher-1", { name: "9-A" }, { role: "teacher" })),
    ).rejects.toThrow();
    expect(mockClassesStore.size).toBe(0);
  });

  it("a student's token, however fresh, can never create a class", async () => {
    await expect(
      createClass.run(
        callerRequest("student-1", { name: "Hack Sınıfı" }, { role: "student", organizationId: null }),
      ),
    ).rejects.toThrow();
    expect(mockClassesStore.size).toBe(0);
  });

  // The end-to-end guarantee the fix restores: take the REAL claims
  // completeOnboarding produces for a brand-new teacher (not hand-crafted),
  // feed them straight into createClass in the same test — no intermediate
  // "logout/login" or "app restart" concept exists at this layer, so this
  // proves the two real handlers compose correctly the instant fresh claims
  // exist, exactly matching what AuthProvider's second refreshIdToken(user)
  // call (after completeOnboarding resolves) hands the client.
  it("a brand-new teacher can create a class immediately with the exact claims completeOnboarding just granted", async () => {
    mockUsersStore.set("uid-1", {
      uid: "uid-1",
      displayName: "Ayşe Yılmaz",
      role: "student",
      organizationId: null,
      onboardingStatus: "pending",
      requestedRole: "teacher",
      accountStatus: "active",
    });
    mockClaimsStore.set("uid-1", { role: "student", organizationId: null });

    const onboardingResult = await completeOnboarding.run({
      data: {},
      auth: { uid: "uid-1", token: { email_verified: true } },
    } as never);
    expect(onboardingResult.role).toBe("teacher");

    // Simulates the client's post-completeOnboarding refreshIdToken(true):
    // the fresh token now carries exactly what reconcileClaimsAndComplete
    // just set — read back from the same mockClaimsStore createClass's own
    // authorization check would see on a real, freshly-fetched ID token.
    const freshToken = mockClaimsStore.get("uid-1")!;

    const result = await createClass.run(
      callerRequest("uid-1", { name: "İlk Sınıfım" }, freshToken),
    );

    expect(result.classId).toBeTruthy();
    expect(mockClassesStore.get(result.classId)).toMatchObject({
      organizationId: onboardingResult.organizationId,
      teacherId: "uid-1",
    });
  });

  it("rejects an unauthenticated caller", async () => {
    await expect(
      createClass.run({ data: { name: "X" }, auth: null } as never),
    ).rejects.toThrow();
  });

  it("rejects an empty/whitespace-only class name", async () => {
    await expect(
      createClass.run(callerRequest("teacher-1", { name: "   " }, { role: "teacher", organizationId: "org-1" })),
    ).rejects.toThrow();
    expect(mockClassesStore.size).toBe(0);
  });
});
