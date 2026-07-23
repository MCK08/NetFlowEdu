import { Question } from "@/types/question";

const mockGetOwnQuestionsPage = jest.fn();
const mockGetPublicQuestionsPage = jest.fn();

jest.mock("@services/questions/questions", () => ({
  getOwnQuestionsPage: (...args: unknown[]) => mockGetOwnQuestionsPage(...args),
  getPublicQuestionsPage: (...args: unknown[]) => mockGetPublicQuestionsPage(...args),
}));

// eslint-disable-next-line import/first
import {
  INITIAL_FEED_CURSOR_STATE,
  loadNextFeedPage,
} from "@features/feed/services/socialFeedService";

function makeQuestion(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    ownerId: "student-1",
    organizationId: null,
    visibility: "private",
    imageUrl: `https://example.com/${id}.jpg`,
    classId: null,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    createdAt: 1,
    ...overrides,
  };
}

describe("loadNextFeedPage", () => {
  beforeEach(() => {
    mockGetOwnQuestionsPage.mockReset();
    mockGetPublicQuestionsPage.mockReset();
  });

  it("fetches own questions first (priority order)", async () => {
    mockGetOwnQuestionsPage.mockResolvedValue({
      questions: [makeQuestion("own-1")],
      cursor: null,
      hasMore: false,
    });

    const result = await loadNextFeedPage("uid-1", INITIAL_FEED_CURSOR_STATE, new Set());

    expect(mockGetOwnQuestionsPage).toHaveBeenCalledTimes(1);
    expect(mockGetPublicQuestionsPage).not.toHaveBeenCalled();
    expect(result.questions.map((q) => q.id)).toEqual(["own-1"]);
  });

  it("transitions to the public phase once own questions are exhausted", async () => {
    mockGetOwnQuestionsPage.mockResolvedValue({
      questions: [makeQuestion("own-1")],
      cursor: null,
      hasMore: false,
    });

    const result = await loadNextFeedPage("uid-1", INITIAL_FEED_CURSOR_STATE, new Set());

    expect(result.nextState.phase).toBe("public");
  });

  it("stays in the own phase while more own questions remain", async () => {
    mockGetOwnQuestionsPage.mockResolvedValue({
      questions: [makeQuestion("own-1")],
      cursor: { id: "own-1" },
      hasMore: true,
    });

    const result = await loadNextFeedPage("uid-1", INITIAL_FEED_CURSOR_STATE, new Set());

    expect(result.nextState.phase).toBe("own");
  });

  it("fetches public questions once in the public phase", async () => {
    mockGetPublicQuestionsPage.mockResolvedValue({
      questions: [makeQuestion("public-1", { visibility: "public", ownerId: "someone-else" })],
      cursor: null,
      hasMore: false,
    });

    const publicPhaseState = { ...INITIAL_FEED_CURSOR_STATE, phase: "public" as const };
    const result = await loadNextFeedPage("uid-1", publicPhaseState, new Set());

    expect(mockGetPublicQuestionsPage).toHaveBeenCalledTimes(1);
    expect(mockGetOwnQuestionsPage).not.toHaveBeenCalled();
    expect(result.questions.map((q) => q.id)).toEqual(["public-1"]);
    expect(result.nextState.phase).toBe("done");
  });

  it("deduplicates a question that appears in both the own and public phases", async () => {
    // A user's own public question would otherwise show up once in the
    // "own" phase and again in the "public" phase.
    const seenIds = new Set<string>();

    mockGetOwnQuestionsPage.mockResolvedValue({
      questions: [makeQuestion("shared-1", { visibility: "public" })],
      cursor: null,
      hasMore: false,
    });
    const ownResult = await loadNextFeedPage("uid-1", INITIAL_FEED_CURSOR_STATE, seenIds);
    expect(ownResult.questions.map((q) => q.id)).toEqual(["shared-1"]);

    mockGetPublicQuestionsPage.mockResolvedValue({
      questions: [makeQuestion("shared-1", { visibility: "public" }), makeQuestion("public-2")],
      cursor: null,
      hasMore: false,
    });
    const publicResult = await loadNextFeedPage("uid-1", ownResult.nextState, seenIds);

    // "shared-1" must not reappear — only the genuinely new "public-2".
    expect(publicResult.questions.map((q) => q.id)).toEqual(["public-2"]);
  });

  it("does nothing once the feed is done", async () => {
    const doneState = { ...INITIAL_FEED_CURSOR_STATE, phase: "done" as const };
    const result = await loadNextFeedPage("uid-1", doneState, new Set());

    expect(mockGetOwnQuestionsPage).not.toHaveBeenCalled();
    expect(mockGetPublicQuestionsPage).not.toHaveBeenCalled();
    expect(result.questions).toEqual([]);
  });
});
