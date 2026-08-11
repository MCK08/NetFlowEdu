import { Question } from "@/types/question";

const mockGetQuestionById = jest.fn();

jest.mock("@services/questions/questions", () => ({
  getQuestionById: (id: string) => mockGetQuestionById(id),
}));

// Imported after the mock so the module under test picks up the mocked
// dependency instead of the real Firestore-backed one — same convention as
// profileCacheService's own test.
// eslint-disable-next-line import/first
import {
  clearStudyMetadataCache,
  resolveQuestionMetadata,
} from "../../src/features/study/services/studyMetadataCache";

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    ownerId: "owner-1",
    organizationId: null,
    visibility: "public",
    imageUrl: "https://example.com/x.jpg",
    classId: null,
    subject: "Matematik",
    topic: "Türev",
    gradeLevel: "",
    description: null,
    posterRole: "teacher",
    createdAt: 0,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    choices: null,
    correctChoice: null,
    ...overrides,
  };
}

beforeEach(() => {
  clearStudyMetadataCache();
  mockGetQuestionById.mockReset();
});

describe("resolveQuestionMetadata", () => {
  it("fetches each distinct questionId exactly once", async () => {
    mockGetQuestionById.mockImplementation((id: string) => Promise.resolve(makeQuestion({ id })));

    await resolveQuestionMetadata(["q1", "q2"]);

    expect(mockGetQuestionById).toHaveBeenCalledTimes(2);
  });

  it("de-duplicates a repeated id within the SAME call", async () => {
    mockGetQuestionById.mockResolvedValue(makeQuestion());

    await resolveQuestionMetadata(["q1", "q1", "q1"]);

    expect(mockGetQuestionById).toHaveBeenCalledTimes(1);
  });

  it("reuses the cache across separate calls instead of re-fetching", async () => {
    mockGetQuestionById.mockResolvedValue(makeQuestion());

    await resolveQuestionMetadata(["q1"]);
    await resolveQuestionMetadata(["q1"]);
    await resolveQuestionMetadata(["q1"]);

    expect(mockGetQuestionById).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent in-flight requests for the same id", async () => {
    mockGetQuestionById.mockResolvedValue(makeQuestion());

    const [a, b] = await Promise.all([
      resolveQuestionMetadata(["q1"]),
      resolveQuestionMetadata(["q1"]),
    ]);

    expect(a.get("q1")).toEqual(b.get("q1"));
    expect(mockGetQuestionById).toHaveBeenCalledTimes(1);
  });

  it("returns a map keyed by the requested questionIds", async () => {
    mockGetQuestionById.mockImplementation((id: string) =>
      Promise.resolve(makeQuestion({ id, subject: `Subject-${id}` })),
    );

    const result = await resolveQuestionMetadata(["q1", "q2"]);

    expect(result.get("q1")?.subject).toBe("Subject-q1");
    expect(result.get("q2")?.subject).toBe("Subject-q2");
  });

  it("caches a null result (deleted/inaccessible question) instead of retrying", async () => {
    mockGetQuestionById.mockResolvedValue(null);

    const first = await resolveQuestionMetadata(["gone"]);
    const second = await resolveQuestionMetadata(["gone"]);

    expect(first.get("gone")).toBeNull();
    expect(second.get("gone")).toBeNull();
    expect(mockGetQuestionById).toHaveBeenCalledTimes(1);
  });

  it("treats a rejected fetch (e.g. permission-denied) as null, caching it too", async () => {
    mockGetQuestionById.mockRejectedValue(
      Object.assign(new Error("Missing or insufficient permissions"), {
        code: "permission-denied",
      }),
    );

    const result = await resolveQuestionMetadata(["denied"]);
    expect(result.get("denied")).toBeNull();

    await resolveQuestionMetadata(["denied"]);
    expect(mockGetQuestionById).toHaveBeenCalledTimes(1);
  });

  it("resolves an empty input to an empty map without calling the fetcher", async () => {
    const result = await resolveQuestionMetadata([]);
    expect(result.size).toBe(0);
    expect(mockGetQuestionById).not.toHaveBeenCalled();
  });
});

// Phase 25 §9/§15/§18 — the exact account-switch/sign-out leak this cache's
// own module doc warned about (never actually wired up before this phase —
// see AuthProvider.tsx's signOut/switchAccount, which now call
// clearStudyMetadataCache). These tests pin down the cache's OWN behavior
// that fix relies on: a clear must genuinely force a re-fetch, not merely
// appear to (e.g. because the in-flight dedupe map was left stale).
describe("clearStudyMetadataCache — account isolation (§9/§15/§18)", () => {
  it("forces a real re-fetch for a questionId that was already cached", async () => {
    mockGetQuestionById.mockResolvedValue(makeQuestion({ subject: "Matematik" }));

    await resolveQuestionMetadata(["q1"]);
    expect(mockGetQuestionById).toHaveBeenCalledTimes(1);

    clearStudyMetadataCache();

    await resolveQuestionMetadata(["q1"]);
    expect(mockGetQuestionById).toHaveBeenCalledTimes(2);
  });

  it("never lets the PREVIOUS account's resolved question leak into the NEXT account's read", async () => {
    // Account A can read a private question (e.g. their own) and it gets
    // cached under its bare questionId, with no per-user namespace.
    mockGetQuestionById.mockResolvedValueOnce(
      makeQuestion({ id: "private-q", subject: "Account A's subject", visibility: "private" }),
    );
    const asAccountA = await resolveQuestionMetadata(["private-q"]);
    expect(asAccountA.get("private-q")?.subject).toBe("Account A's subject");

    // Account switch happens — AuthProvider calls this.
    clearStudyMetadataCache();

    // Account B's own rules-enforced read of the SAME id now correctly
    // fails (they don't own it) — the cache must reflect THAT, not replay
    // account A's cached success.
    mockGetQuestionById.mockRejectedValueOnce(
      Object.assign(new Error("Missing or insufficient permissions"), { code: "permission-denied" }),
    );
    const asAccountB = await resolveQuestionMetadata(["private-q"]);
    expect(asAccountB.get("private-q")).toBeNull();
  });

  it("also clears in-flight request de-dup state, not just resolved entries", async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    mockGetQuestionById.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; }),
    );

    const pending = resolveQuestionMetadata(["q1"]);
    clearStudyMetadataCache();
    resolveFirst(makeQuestion({ id: "q1" }));
    await pending;

    mockGetQuestionById.mockResolvedValueOnce(makeQuestion({ id: "q1", subject: "Refetched" }));
    const after = await resolveQuestionMetadata(["q1"]);
    expect(after.get("q1")?.subject).toBe("Refetched");
  });

  it("is safe to call with nothing cached yet", () => {
    expect(() => clearStudyMetadataCache()).not.toThrow();
  });
});
