import { UserProfile } from "@/types/user";

const mockGetUserProfileOnce = jest.fn();

jest.mock("@services/firebase/firestore", () => ({
  getUserProfileOnce: (uid: string) => mockGetUserProfileOnce(uid),
}));

// Imported after the mock so the module under test picks up the mocked
// dependency instead of the real Firestore-backed one.
// eslint-disable-next-line import/first
import {
  clearProfileCache,
  getCachedProfile,
  getDisplayHandle,
} from "@features/profiles/services/profileCacheService";

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "user-1",
    email: "user1@example.com",
    displayName: "User One",
    username: "userone",
    role: "student",
    organizationId: null,
    photoURL: null,
    totalPoints: 0,
    weeklyPoints: 0,
    accountStatus: "active",
    emailVerified: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("getDisplayHandle", () => {
  it("prefers username when present", () => {
    expect(getDisplayHandle(makeProfile({ username: "ayse123" }))).toBe("ayse123");
  });

  it("falls back to displayName when username is null", () => {
    expect(getDisplayHandle(makeProfile({ username: null, displayName: "Ayşe Yılmaz" }))).toBe(
      "Ayşe Yılmaz",
    );
  });

  it("falls back to Kullanıcı when both username and displayName are missing", () => {
    expect(getDisplayHandle(makeProfile({ username: null, displayName: "" }))).toBe("Kullanıcı");
  });

  it("falls back to Kullanıcı when the profile itself is null", () => {
    expect(getDisplayHandle(null)).toBe("Kullanıcı");
  });

  it("never returns the uid, even when it is the only identifying field available", () => {
    const profile = makeProfile({ uid: "some-raw-uid-value", username: null, displayName: "" });
    expect(getDisplayHandle(profile)).not.toBe("some-raw-uid-value");
    expect(getDisplayHandle(profile)).toBe("Kullanıcı");
  });
});

describe("getCachedProfile", () => {
  beforeEach(() => {
    clearProfileCache();
    mockGetUserProfileOnce.mockReset();
  });

  it("fetches a profile once and returns it", async () => {
    mockGetUserProfileOnce.mockResolvedValue(makeProfile());
    const profile = await getCachedProfile("user-1");
    expect(profile?.uid).toBe("user-1");
    expect(mockGetUserProfileOnce).toHaveBeenCalledTimes(1);
  });

  it("prevents duplicate reads for the same uid", async () => {
    mockGetUserProfileOnce.mockResolvedValue(makeProfile());

    await getCachedProfile("user-1");
    await getCachedProfile("user-1");
    await getCachedProfile("user-1");

    expect(mockGetUserProfileOnce).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent in-flight requests for the same uid", async () => {
    mockGetUserProfileOnce.mockResolvedValue(makeProfile());

    const [a, b] = await Promise.all([getCachedProfile("user-1"), getCachedProfile("user-1")]);

    expect(a).toEqual(b);
    expect(mockGetUserProfileOnce).toHaveBeenCalledTimes(1);
  });

  it("still reads separately for different uids", async () => {
    mockGetUserProfileOnce.mockImplementation((uid: string) =>
      Promise.resolve(makeProfile({ uid })),
    );

    await getCachedProfile("user-1");
    await getCachedProfile("user-2");

    expect(mockGetUserProfileOnce).toHaveBeenCalledTimes(2);
  });

  it("handles a denied/missing profile safely, caching null instead of throwing", async () => {
    mockGetUserProfileOnce.mockRejectedValue(
      Object.assign(new Error("Missing or insufficient permissions"), {
        code: "permission-denied",
      }),
    );

    const profile = await getCachedProfile("someone-elses-uid");
    expect(profile).toBeNull();
    expect(getDisplayHandle(profile)).toBe("Kullanıcı");

    // A second call must not retry the failed fetch.
    await getCachedProfile("someone-elses-uid");
    expect(mockGetUserProfileOnce).toHaveBeenCalledTimes(1);
  });
});
