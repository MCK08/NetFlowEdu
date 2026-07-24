// Unit-tests the REAL completeOnboarding/initializeOnboarding handlers
// (imported straight from functions/src, not reimplemented) against
// in-memory fakes of firebase-admin's Firestore and Auth — the only way to
// actually exercise the state-machine/retry/idempotency logic the audit
// asked to prove, since none of it is reachable via Firestore rules-unit-
// testing (Cloud Functions run under the Admin SDK, which bypasses rules
// entirely) or via the rest of this repo's existing test depth for other
// callables (which only ever covered pure helpers + rules boundaries).
//
// v2 onCall's returned CallableFunction exposes `.run(request)` specifically
// for this kind of direct unit test — no HTTP/emulator layer involved.

const mockUsersStore = new Map<string, Record<string, unknown> | undefined>();
const mockOrgsStore = new Map<string, Record<string, unknown> | undefined>();
const mockClaimsStore = new Map<string, Record<string, unknown> | undefined>();

const SERVER_TIMESTAMP = "__SERVER_TIMESTAMP__";

function mockStoreFor(collection: string) {
  if (collection === "users") return mockUsersStore;
  if (collection === "organizations") return mockOrgsStore;
  throw new Error(`unexpected collection ${collection}`);
}

function mockMakeDocRef(collection: string, id: string) {
  return {
    id,
    async get() {
      const data = mockStoreFor(collection).get(id);
      return { exists: data !== undefined, data: () => data, id };
    },
    async set(data: Record<string, unknown>) {
      mockStoreFor(collection).set(id, { ...data });
    },
    async update(data: Record<string, unknown>) {
      const existing = mockStoreFor(collection).get(id) ?? {};
      mockStoreFor(collection).set(id, { ...existing, ...data });
    },
    async create(data: Record<string, unknown>) {
      mockStoreFor(collection).set(id, { ...data });
    },
  };
}

function mockMakeCollectionRef(collection: string) {
  return { doc: (id: string) => mockMakeDocRef(collection, id) };
}

// Fakes just enough transactional behavior for this handler's shape: reads
// go straight to the live store (no snapshot isolation needed for these
// tests — nothing here tests concurrent-transaction contention), writes are
// applied immediately via the same doc-ref methods. Good enough to prove
// the actual control flow (what gets read, what gets written, in what
// order) without reimplementing Firestore's real MVCC.
function mockMakeFakeDb() {
  return {
    collection: (name: string) => mockMakeCollectionRef(name),
    async runTransaction(fn: (tx: unknown) => Promise<void>) {
      const tx = {
        get: (ref: ReturnType<typeof mockMakeDocRef>) => ref.get(),
        set: (ref: ReturnType<typeof mockMakeDocRef>, data: Record<string, unknown>) => ref.set(data),
        update: (ref: ReturnType<typeof mockMakeDocRef>, data: Record<string, unknown>) =>
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

// eslint-disable-next-line import/first
import { completeOnboarding } from "../../functions/src/onboarding/completeOnboarding";
// eslint-disable-next-line import/first
import { initializeOnboarding } from "../../functions/src/onboarding/initializeOnboarding";

function resetStores() {
  mockUsersStore.clear();
  mockOrgsStore.clear();
  mockClaimsStore.clear();
}

function callerRequest(uid: string, data: Record<string, unknown>, emailVerified = true) {
  return {
    data,
    auth: { uid, token: { email_verified: emailVerified } },
  } as never;
}

function seedUser(uid: string, data: Record<string, unknown>) {
  mockUsersStore.set(uid, data);
}

function freshPendingUser(overrides: Record<string, unknown> = {}) {
  return {
    uid: "uid-1",
    email: "test@example.com",
    displayName: "",
    role: "student",
    organizationId: null,
    onboardingStatus: "pending",
    requestedRole: null,
    accountStatus: "active",
    ...overrides,
  };
}

describe("initializeOnboarding", () => {
  beforeEach(resetStores);

  it("persists displayName and requestedRole while pending", async () => {
    seedUser("uid-1", freshPendingUser());
    const result = await initializeOnboarding.run(
      callerRequest("uid-1", { requestedRole: "teacher", displayName: "Ayşe Yılmaz" }),
    );
    expect(result).toEqual({ onboardingStatus: "pending", requestedRole: "teacher" });
    expect(mockUsersStore.get("uid-1")).toMatchObject({
      displayName: "Ayşe Yılmaz",
      requestedRole: "teacher",
    });
  });

  it("requestedRole cannot be changed by calling again with a different role", async () => {
    seedUser("uid-1", freshPendingUser({ requestedRole: "student" }));
    const result = await initializeOnboarding.run(
      callerRequest("uid-1", { requestedRole: "teacher", displayName: "Ayşe Yılmaz" }),
    );
    expect(result.requestedRole).toBe("student");
    expect(mockUsersStore.get("uid-1")).toMatchObject({ requestedRole: "student" });
  });

  it("is a no-op for a legacy account with no onboardingStatus field at all", async () => {
    seedUser("legacy-uid", {
      uid: "legacy-uid",
      displayName: "Eski Kullanıcı",
      role: "student",
      organizationId: null,
      accountStatus: "active",
      // no onboardingStatus, no requestedRole — predates the field entirely
    });
    const result = await initializeOnboarding.run(
      callerRequest("legacy-uid", { requestedRole: "teacher", displayName: "Hacker" }),
    );
    expect(result.onboardingStatus).toBe("complete");
    // Never touched — no promotion, no displayName overwrite.
    expect(mockUsersStore.get("legacy-uid")).toMatchObject({ displayName: "Eski Kullanıcı" });
    expect(mockUsersStore.get("legacy-uid")?.requestedRole).toBeUndefined();
  });
});

describe("completeOnboarding — fresh pending accounts", () => {
  beforeEach(resetStores);

  it("completes a pending student with no organization and no claim change beyond student/null", async () => {
    seedUser("uid-1", freshPendingUser({ requestedRole: "student", displayName: "Ali" }));
    mockClaimsStore.set("uid-1", { role: "student", organizationId: null });

    const result = await completeOnboarding.run(callerRequest("uid-1", {}));

    expect(result).toEqual({ role: "student", organizationId: null, onboardingStatus: "complete" });
    expect(mockUsersStore.get("uid-1")).toMatchObject({ onboardingStatus: "complete" });
    expect(mockOrgsStore.size).toBe(0);
  });

  it("completes a pending teacher: creates an organization and grants claims, only after verification", async () => {
    seedUser("uid-1", freshPendingUser({ requestedRole: "teacher", displayName: "Ayşe Yılmaz" }));
    mockClaimsStore.set("uid-1", { role: "student", organizationId: null });

    const result = await completeOnboarding.run(callerRequest("uid-1", {}, true));

    expect(result.role).toBe("teacher");
    expect(result.organizationId).toBe("uid-1"); // deterministic, uid-derived
    expect(mockOrgsStore.get("uid-1")).toMatchObject({
      name: "Ayşe Yılmaz Sınıfları",
      ownerId: "uid-1",
      status: "active",
    });
    expect(mockClaimsStore.get("uid-1")).toMatchObject({ role: "teacher", organizationId: "uid-1" });
    expect(mockUsersStore.get("uid-1")).toMatchObject({
      role: "teacher",
      organizationId: "uid-1",
      onboardingStatus: "complete",
    });
  });

  it("rejects an unverified caller and grants nothing", async () => {
    seedUser("uid-1", freshPendingUser({ requestedRole: "teacher", displayName: "Ayşe" }));
    mockClaimsStore.set("uid-1", { role: "student", organizationId: null });

    await expect(completeOnboarding.run(callerRequest("uid-1", {}, false))).rejects.toThrow();

    expect(mockUsersStore.get("uid-1")).toMatchObject({ onboardingStatus: "pending", role: "student" });
    expect(mockClaimsStore.get("uid-1")).toEqual({ role: "student", organizationId: null });
    expect(mockOrgsStore.size).toBe(0);
  });
});

describe("completeOnboarding — legacy accounts cannot self-promote (Blocker 1)", () => {
  beforeEach(resetStores);

  it("a legacy student with no onboardingStatus field stays a student, no matter what", async () => {
    seedUser("legacy-uid", {
      uid: "legacy-uid",
      displayName: "Eski Öğrenci",
      role: "student",
      organizationId: null,
      accountStatus: "active",
      // no onboardingStatus, no requestedRole
    });
    mockClaimsStore.set("legacy-uid", { role: "student", organizationId: null });

    const result = await completeOnboarding.run(callerRequest("legacy-uid", {}, true));

    expect(result.role).toBe("student");
    expect(result.organizationId).toBeNull();
    expect(mockOrgsStore.size).toBe(0);
    expect(mockClaimsStore.get("legacy-uid")).toEqual({ role: "student", organizationId: null });
  });

  it("a legacy student cannot become a teacher even if requestedRole is somehow present", async () => {
    // Simulates a forged/leftover requestedRole on an otherwise-legacy
    // (no onboardingStatus) document — resolveOnboardingStatus still
    // treats the missing status as "complete", so requestedRole is never
    // even read.
    seedUser("legacy-uid", {
      uid: "legacy-uid",
      displayName: "Eski Öğrenci",
      role: "student",
      organizationId: null,
      accountStatus: "active",
      requestedRole: "teacher",
    });
    mockClaimsStore.set("legacy-uid", { role: "student", organizationId: null });

    const result = await completeOnboarding.run(callerRequest("legacy-uid", {}, true));

    expect(result.role).toBe("student");
    expect(mockOrgsStore.size).toBe(0);
  });

  it("an already-complete account cannot switch role by calling again", async () => {
    seedUser("uid-1", {
      uid: "uid-1",
      displayName: "Ali",
      role: "student",
      organizationId: null,
      accountStatus: "active",
      onboardingStatus: "complete",
      requestedRole: "student",
    });
    mockClaimsStore.set("uid-1", { role: "student", organizationId: null });

    const result = await completeOnboarding.run(callerRequest("uid-1", {}, true));

    expect(result.role).toBe("student");
    expect(mockOrgsStore.size).toBe(0);
  });
});

describe("completeOnboarding — retry-safety and partial-failure repair (Blocker 2)", () => {
  beforeEach(resetStores);

  it("repairs claims when Firestore already advanced to 'provisioning' but claims were never set", async () => {
    // Simulates: the transaction committed (role/org/provisioning written)
    // but the process crashed before setCustomUserClaims ever ran.
    seedUser("uid-1", {
      uid: "uid-1",
      displayName: "Ayşe Yılmaz",
      role: "teacher",
      organizationId: "uid-1",
      accountStatus: "active",
      onboardingStatus: "provisioning",
      requestedRole: "teacher",
    });
    mockOrgsStore.set("uid-1", {
      name: "Ayşe Yılmaz Sınıfları",
      ownerId: "uid-1",
      status: "active",
    });
    mockClaimsStore.set("uid-1", { role: "student", organizationId: null }); // stale/unset

    const result = await completeOnboarding.run(callerRequest("uid-1", {}, true));

    expect(result.onboardingStatus).toBe("complete");
    expect(mockClaimsStore.get("uid-1")).toMatchObject({ role: "teacher", organizationId: "uid-1" });
    expect(mockUsersStore.get("uid-1")).toMatchObject({ onboardingStatus: "complete" });
    // No second organization created for the retry.
    expect(mockOrgsStore.size).toBe(1);
  });

  it("completes safely when claims already matched but the final status write never landed", async () => {
    seedUser("uid-1", {
      uid: "uid-1",
      displayName: "Ayşe Yılmaz",
      role: "teacher",
      organizationId: "uid-1",
      accountStatus: "active",
      onboardingStatus: "provisioning",
      requestedRole: "teacher",
    });
    mockOrgsStore.set("uid-1", { name: "Ayşe Yılmaz Sınıfları", ownerId: "uid-1", status: "active" });
    mockClaimsStore.set("uid-1", { role: "teacher", organizationId: "uid-1" }); // already correct

    const result = await completeOnboarding.run(callerRequest("uid-1", {}, true));

    expect(result.onboardingStatus).toBe("complete");
    expect(mockUsersStore.get("uid-1")).toMatchObject({ onboardingStatus: "complete" });
  });

  it("does not create a second organization when retried from 'pending' after a prior partial attempt already created one and advanced to 'provisioning'", async () => {
    seedUser("uid-1", freshPendingUser({ requestedRole: "teacher", displayName: "Ayşe Yılmaz" }));
    mockClaimsStore.set("uid-1", { role: "student", organizationId: null });

    const first = await completeOnboarding.run(callerRequest("uid-1", {}, true));
    const orgIdAfterFirst = first.organizationId;
    const orgCountAfterFirst = mockOrgsStore.size;

    // Full second call — simulates the client retrying (e.g. a flaky
    // network response hid the first call's success from it).
    const second = await completeOnboarding.run(callerRequest("uid-1", {}, true));

    expect(second.organizationId).toBe(orgIdAfterFirst);
    expect(mockOrgsStore.size).toBe(orgCountAfterFirst);
    expect(mockOrgsStore.get("uid-1")).toMatchObject({ name: "Ayşe Yılmaz Sınıfları" });
  });

  it("preserves unrelated existing custom claims when repairing role/organizationId", async () => {
    seedUser("uid-1", {
      uid: "uid-1",
      displayName: "Ayşe Yılmaz",
      role: "teacher",
      organizationId: "uid-1",
      accountStatus: "active",
      onboardingStatus: "provisioning",
      requestedRole: "teacher",
    });
    mockOrgsStore.set("uid-1", { name: "Ayşe Yılmaz Sınıfları", ownerId: "uid-1", status: "active" });
    mockClaimsStore.set("uid-1", {
      role: "student",
      organizationId: null,
      betaFeatureFlag: true, // unrelated legitimate claim
    });

    await completeOnboarding.run(callerRequest("uid-1", {}, true));

    expect(mockClaimsStore.get("uid-1")).toEqual({
      role: "teacher",
      organizationId: "uid-1",
      betaFeatureFlag: true,
    });
  });

  it("a repeated call once already complete is a pure no-op reconciliation, not a re-promotion", async () => {
    seedUser("uid-1", {
      uid: "uid-1",
      displayName: "Ayşe Yılmaz",
      role: "teacher",
      organizationId: "uid-1",
      accountStatus: "active",
      onboardingStatus: "complete",
      requestedRole: "teacher",
    });
    mockOrgsStore.set("uid-1", { name: "Ayşe Yılmaz Sınıfları", ownerId: "uid-1", status: "active" });
    mockClaimsStore.set("uid-1", { role: "teacher", organizationId: "uid-1" });

    const result = await completeOnboarding.run(callerRequest("uid-1", {}, true));

    expect(result).toEqual({ role: "teacher", organizationId: "uid-1", onboardingStatus: "complete" });
    expect(mockOrgsStore.size).toBe(1);
  });
});
