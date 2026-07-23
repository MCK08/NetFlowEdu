import { Question } from "@/types/question";

const mockGetQuestionById = jest.fn();

jest.mock("@services/questions/questions", () => ({
  getQuestionById: (questionId: string) => mockGetQuestionById(questionId),
}));

// eslint-disable-next-line import/first
import {
  loadQuestionDetail,
  QUESTION_GENERIC_ERROR_MESSAGE,
  QUESTION_NOT_FOUND_MESSAGE,
  QUESTION_UNAUTHORIZED_MESSAGE,
} from "@features/questions/services/questionDetailService";

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    ownerId: "user-1",
    organizationId: null,
    visibility: "private",
    imageUrl: "https://example.com/q1.jpg",
    classId: null,
    createdAt: 1,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    ...overrides,
  };
}

describe("loadQuestionDetail", () => {
  beforeEach(() => {
    mockGetQuestionById.mockReset();
  });

  it("loads a question correctly when it exists and is readable", async () => {
    mockGetQuestionById.mockResolvedValue(makeQuestion());

    const result = await loadQuestionDetail("q1");

    expect(result.errorMessage).toBeNull();
    expect(result.question?.id).toBe("q1");
  });

  it("returns a safe not-found state when the question doesn't exist", async () => {
    mockGetQuestionById.mockResolvedValue(null);

    const result = await loadQuestionDetail("missing-question");

    expect(result.question).toBeNull();
    expect(result.errorMessage).toBe(QUESTION_NOT_FOUND_MESSAGE);
  });

  it("returns an unauthorized state when Firestore denies the read", async () => {
    mockGetQuestionById.mockRejectedValue(
      Object.assign(new Error("denied"), { code: "permission-denied" }),
    );

    const result = await loadQuestionDetail("someone-elses-question");

    expect(result.question).toBeNull();
    expect(result.errorMessage).toBe(QUESTION_UNAUTHORIZED_MESSAGE);
  });

  it("returns a generic error state for unrelated failures (e.g. network)", async () => {
    mockGetQuestionById.mockRejectedValue(new Error("network-request-failed"));

    const result = await loadQuestionDetail("q1");

    expect(result.question).toBeNull();
    expect(result.errorMessage).toBe(QUESTION_GENERIC_ERROR_MESSAGE);
  });
});
