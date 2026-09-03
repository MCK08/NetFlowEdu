import { Question } from "@/types/question";

const mockGetClassQuestionsPage = jest.fn();

jest.mock("@services/questions/questions", () => ({
  getClassQuestionsPage: (...args: unknown[]) => mockGetClassQuestionsPage(...args),
}));

// eslint-disable-next-line import/first
import {
  fetchAssignmentQuestionPool,
  MAX_QUESTION_POOL_PAGES,
  QUESTION_POOL_PAGE_SIZE,
} from "../../src/features/assignments/services/assignmentQuestionPool";

function q(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    ownerId: "teacher-1",
    organizationId: "org-1",
    visibility: "class",
    imageUrl: `https://example.com/${id}.jpg`,
    classId: "class-1",
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "9",
    description: null,
    posterRole: "teacher",
    createdAt: 0,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    choices: null,
    correctChoice: null,
    hints: [],
    ...overrides,
  };
}

const CRITERIA = { subject: "Matematik", topic: "Denklemler", gradeLevel: "9" };

describe("fetchAssignmentQuestionPool — pagination", () => {
  beforeEach(() => {
    mockGetClassQuestionsPage.mockReset();
  });

  it("stops after the first page once enough eligible questions are found", async () => {
    mockGetClassQuestionsPage.mockResolvedValueOnce({
      questions: [q("a"), q("b"), q("c")],
      cursor: { id: "c" },
      hasMore: true,
    });

    const pool = await fetchAssignmentQuestionPool("class-1", CRITERIA, 2);

    expect(mockGetClassQuestionsPage).toHaveBeenCalledTimes(1);
    expect(pool.map((question) => question.id)).toEqual(["a", "b", "c"]);
  });

  it("fetches a second page when the first page isn't enough", async () => {
    mockGetClassQuestionsPage
      .mockResolvedValueOnce({ questions: [q("a")], cursor: { id: "a" }, hasMore: true })
      .mockResolvedValueOnce({ questions: [q("b"), q("c")], cursor: { id: "c" }, hasMore: true });

    const pool = await fetchAssignmentQuestionPool("class-1", CRITERIA, 3);

    expect(mockGetClassQuestionsPage).toHaveBeenCalledTimes(2);
    expect(pool.map((question) => question.id)).toEqual(["a", "b", "c"]);
  });

  it("stops at MAX_QUESTION_POOL_PAGES even if more pages are available and still not enough", async () => {
    mockGetClassQuestionsPage.mockResolvedValue({
      questions: [q(`x-${Math.random()}`)],
      cursor: { id: "x" },
      hasMore: true,
    });

    await fetchAssignmentQuestionPool("class-1", CRITERIA, 999);

    expect(mockGetClassQuestionsPage).toHaveBeenCalledTimes(MAX_QUESTION_POOL_PAGES);
  });

  it("stops early when hasMore is false, even with fewer than requested", async () => {
    mockGetClassQuestionsPage.mockResolvedValueOnce({
      questions: [q("a")],
      cursor: null,
      hasMore: false,
    });

    const pool = await fetchAssignmentQuestionPool("class-1", CRITERIA, 50);

    expect(mockGetClassQuestionsPage).toHaveBeenCalledTimes(1);
    expect(pool).toHaveLength(1);
  });

  it("never duplicates a question across pages (Firestore cursor semantics — plain concat is safe)", async () => {
    mockGetClassQuestionsPage
      .mockResolvedValueOnce({ questions: [q("a"), q("b")], cursor: { id: "b" }, hasMore: true })
      .mockResolvedValueOnce({ questions: [q("c")], cursor: { id: "c" }, hasMore: false });

    const pool = await fetchAssignmentQuestionPool("class-1", CRITERIA, 5);

    expect(pool.map((question) => question.id)).toEqual(["a", "b", "c"]);
    expect(new Set(pool.map((question) => question.id)).size).toBe(pool.length);
  });

  it("passes the page size and advancing cursor to each call correctly", async () => {
    const firstCursor = { id: "a" };
    mockGetClassQuestionsPage
      .mockResolvedValueOnce({ questions: [q("a")], cursor: firstCursor, hasMore: true })
      .mockResolvedValueOnce({ questions: [q("b")], cursor: { id: "b" }, hasMore: false });

    await fetchAssignmentQuestionPool("class-1", CRITERIA, 5);

    expect(mockGetClassQuestionsPage).toHaveBeenNthCalledWith(1, "class-1", QUESTION_POOL_PAGE_SIZE, null);
    expect(mockGetClassQuestionsPage).toHaveBeenNthCalledWith(2, "class-1", QUESTION_POOL_PAGE_SIZE, firstCursor);
  });

  it("propagates a fetch error to the caller (no silent empty pool)", async () => {
    mockGetClassQuestionsPage.mockRejectedValueOnce(new Error("network error"));
    await expect(fetchAssignmentQuestionPool("class-1", CRITERIA, 5)).rejects.toThrow("network error");
  });

  it("returns an empty pool when the class has no matching questions at all", async () => {
    mockGetClassQuestionsPage.mockResolvedValueOnce({ questions: [], cursor: null, hasMore: false });
    const pool = await fetchAssignmentQuestionPool("class-1", CRITERIA, 5);
    expect(pool).toEqual([]);
  });
});
