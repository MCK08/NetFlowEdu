import { PublicProfile } from "@/types/publicProfile";

const mockGetPublicProfileOnce = jest.fn();

jest.mock("@services/firebase/publicProfile", () => ({
  getPublicProfileOnce: (uid: string) => mockGetPublicProfileOnce(uid),
}));

// Imported after the mock so the module under test picks up the mocked
// dependency instead of the real Firestore-backed one.
// eslint-disable-next-line import/first
import {
  clearProfileCache,
  getCachedProfile,
  getPublicIdentity,
} from "@features/profiles/services/profileCacheService";

function makeProfile(overrides: Partial<PublicProfile> = {}): PublicProfile {
  return {
    uid: "user-1",
    displayName: "User One",
    username: "userone",
    role: "student",
    organizationId: null,
    photoURL: null,
    totalPoints: 0,
    weeklyPoints: 0,
    createdAt: 0,
    ...overrides,
  };
}

describe("getPublicIdentity", () => {
  it("uses displayName as primary and @username as secondary", () => {
    expect(getPublicIdentity(makeProfile({ displayName: "Sinem Hoca", username: "sinemmat" }))).toEqual(
      { primaryName: "Sinem Hoca", usernameHandle: "@sinemmat" },
    );
  });

  it("falls back to @username as primary when displayName is missing", () => {
    expect(getPublicIdentity(makeProfile({ username: "ayse123", displayName: "" }))).toEqual({
      primaryName: "@ayse123",
      usernameHandle: null,
    });
  });

  it("falls back to Kullanıcı when both username and displayName are missing", () => {
    expect(getPublicIdentity(makeProfile({ username: null, displayName: "" }))).toEqual({
      primaryName: "Kullanıcı",
      usernameHandle: null,
    });
  });

  // The exact production bug this whole fallback chain exists to prevent:
  // a bare "@" with nothing after it must never render.
  it("never returns a bare '@' with nothing after it", () => {
    const result = getPublicIdentity(makeProfile({ username: null, displayName: "" }));
    expect(result.primaryName).not.toBe("@");
  });

  it("falls back to Kullanıcı when the profile itself is null", () => {
    expect(getPublicIdentity(null)).toEqual({ primaryName: "Kullanıcı", usernameHandle: null });
  });

  it("never returns the uid, even when it is the only identifying field available", () => {
    const profile = makeProfile({ uid: "some-raw-uid-value", username: null, displayName: "" });
    expect(getPublicIdentity(profile).primaryName).not.toBe("some-raw-uid-value");
    expect(getPublicIdentity(profile).primaryName).toBe("Kullanıcı");
  });
});

describe("getCachedProfile", () => {
  beforeEach(() => {
    clearProfileCache();
    mockGetPublicProfileOnce.mockReset();
  });

  it("fetches a profile once and returns it", async () => {
    mockGetPublicProfileOnce.mockResolvedValue(makeProfile());
    const profile = await getCachedProfile("user-1");
    expect(profile?.uid).toBe("user-1");
    expect(mockGetPublicProfileOnce).toHaveBeenCalledTimes(1);
  });

  it("prevents duplicate reads for the same uid", async () => {
    mockGetPublicProfileOnce.mockResolvedValue(makeProfile());

    await getCachedProfile("user-1");
    await getCachedProfile("user-1");
    await getCachedProfile("user-1");

    expect(mockGetPublicProfileOnce).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent in-flight requests for the same uid", async () => {
    mockGetPublicProfileOnce.mockResolvedValue(makeProfile());

    const [a, b] = await Promise.all([getCachedProfile("user-1"), getCachedProfile("user-1")]);

    expect(a).toEqual(b);
    expect(mockGetPublicProfileOnce).toHaveBeenCalledTimes(1);
  });

  it("still reads separately for different uids", async () => {
    mockGetPublicProfileOnce.mockImplementation((uid: string) =>
      Promise.resolve(makeProfile({ uid })),
    );

    await getCachedProfile("user-1");
    await getCachedProfile("user-2");

    expect(mockGetPublicProfileOnce).toHaveBeenCalledTimes(2);
  });

  it("handles a denied/missing profile safely, caching null instead of throwing", async () => {
    mockGetPublicProfileOnce.mockRejectedValue(
      Object.assign(new Error("Missing or insufficient permissions"), {
        code: "permission-denied",
      }),
    );

    const profile = await getCachedProfile("someone-elses-uid");
    expect(profile).toBeNull();
    expect(getPublicIdentity(profile).primaryName).toBe("Kullanıcı");

    // A second call must not retry the failed fetch.
    await getCachedProfile("someone-elses-uid");
    expect(mockGetPublicProfileOnce).toHaveBeenCalledTimes(1);
  });

  // Root cause of the "username shows Kullanıcı right after upload, fixed
  // only by restarting the app" bug: publicProfiles/{uid} not existing YET
  // (syncPublicProfile hasn't finished) resolves successfully with null —
  // that's a transient state, not a permanent denial, so (unlike the
  // rejected-promise case above) it must be retried on the next call
  // instead of being cached forever.
  it("retries on the next call when the profile doesn't exist yet (resolved null, not an error)", async () => {
    mockGetPublicProfileOnce.mockResolvedValueOnce(null).mockResolvedValueOnce(makeProfile());

    const first = await getCachedProfile("brand-new-uid");
    expect(first).toBeNull();

    const second = await getCachedProfile("brand-new-uid");
    expect(second?.uid).toBe("user-1");
    expect(mockGetPublicProfileOnce).toHaveBeenCalledTimes(2);
  });
});
