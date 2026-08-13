import { selectAssignmentQuestions } from "../../src/features/assignments/services/assignmentQuestionSelection";
import { Question } from "@/types/question";

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
    ...overrides,
  };
}

describe("selectAssignmentQuestions — topic/subject/grade priority", () => {
  it("prefers a topic+grade match over a subject-only match", () => {
    const pool = [
      q("subject-only", { topic: "Kesirler", gradeLevel: "8" }),
      q("full-match", { topic: "Denklemler", gradeLevel: "9" }),
    ];
    const ids = selectAssignmentQuestions(pool, { subject: "Matematik", topic: "Denklemler", gradeLevel: "9" }, 2);
    expect(ids[0]).toBe("full-match");
  });

  it("prefers topic match over grade match when they conflict", () => {
    const pool = [
      q("grade-only", { topic: "Kesirler", gradeLevel: "9" }),
      q("topic-only", { topic: "Denklemler", gradeLevel: "8" }),
    ];
    const ids = selectAssignmentQuestions(pool, { subject: "Matematik", topic: "Denklemler", gradeLevel: "9" }, 2);
    expect(ids[0]).toBe("topic-only");
  });

  it("excludes a different subject entirely, even with a perfect topic/grade coincidence", () => {
    const pool = [q("wrong-subject", { subject: "Fizik", topic: "Denklemler", gradeLevel: "9" })];
    const ids = selectAssignmentQuestions(pool, { subject: "Matematik", topic: "Denklemler", gradeLevel: "9" }, 5);
    expect(ids).toEqual([]);
  });
});

describe("selectAssignmentQuestions — availability", () => {
  it("returns no matching questions when none are eligible", () => {
    const pool = [q("a", { subject: "Fizik" }), q("b", { subject: "Kimya" })];
    expect(selectAssignmentQuestions(pool, { subject: "Matematik", topic: "Denklemler", gradeLevel: "9" }, 5)).toEqual(
      [],
    );
  });

  it("returns fewer than requested when fewer are available — never padded or invented", () => {
    const pool = [q("a"), q("b")];
    const ids = selectAssignmentQuestions(pool, { subject: "Matematik", topic: "Denklemler", gradeLevel: "9" }, 10);
    expect(ids).toHaveLength(2);
  });

  it("caps at targetCount when more are available than requested", () => {
    const pool = [q("a"), q("b"), q("c"), q("d")];
    const ids = selectAssignmentQuestions(pool, { subject: "Matematik", topic: "Denklemler", gradeLevel: "9" }, 2);
    expect(ids).toHaveLength(2);
  });
});

describe("selectAssignmentQuestions — duplicate protection and legacy metadata", () => {
  it("dedupes a question id that appears twice in the pool", () => {
    const pool = [q("a"), q("a")];
    const ids = selectAssignmentQuestions(pool, { subject: "Matematik", topic: "Denklemler", gradeLevel: "9" }, 5);
    expect(ids).toEqual(["a"]);
  });

  it("excludes a legacy question with no subject at all (never matches any real subject)", () => {
    const pool = [q("legacy", { subject: "", topic: "", gradeLevel: "" })];
    const ids = selectAssignmentQuestions(pool, { subject: "Matematik", topic: "Denklemler", gradeLevel: "9" }, 5);
    expect(ids).toEqual([]);
  });
});

describe("selectAssignmentQuestions — determinism and robustness", () => {
  it("is deterministic for the same input", () => {
    const pool = [q("a"), q("b"), q("c")];
    const criteria = { subject: "Matematik", topic: "Denklemler", gradeLevel: "9" };
    expect(selectAssignmentQuestions(pool, criteria, 2)).toEqual(selectAssignmentQuestions(pool, criteria, 2));
  });

  it("breaks a full tie deterministically by id", () => {
    const pool = [q("b", { createdAt: 100 }), q("a", { createdAt: 100 })];
    const ids = selectAssignmentQuestions(pool, { subject: "Matematik", topic: "Denklemler", gradeLevel: "9" }, 2);
    expect(ids).toEqual(["a", "b"]);
  });

  it("does not mutate the input pool", () => {
    const pool = [q("a"), q("b")];
    const copy = [...pool];
    selectAssignmentQuestions(pool, { subject: "Matematik", topic: "Denklemler", gradeLevel: "9" }, 1);
    expect(pool).toEqual(copy);
  });

  it("handles an empty pool", () => {
    expect(selectAssignmentQuestions([], { subject: "Matematik", topic: "Denklemler", gradeLevel: "9" }, 5)).toEqual(
      [],
    );
  });

  it("handles a zero or negative targetCount", () => {
    const pool = [q("a")];
    const criteria = { subject: "Matematik", topic: "Denklemler", gradeLevel: "9" };
    expect(selectAssignmentQuestions(pool, criteria, 0)).toEqual([]);
    expect(selectAssignmentQuestions(pool, criteria, -1)).toEqual([]);
  });
});
