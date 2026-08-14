import { buildAssignmentOutcomeInsights } from "../../src/features/assignments/services/assignmentOutcomeInsights";
import { Assignment, AssignmentSubmission } from "../../src/features/assignments/domain/assignmentTypes";

function assignment(overrides: Partial<Assignment> = {}): Pick<
  Assignment,
  "questionIds" | "targetStudentIds" | "topic" | "targetCount"
> {
  return {
    questionIds: ["q1", "q2", "q3"],
    targetStudentIds: ["s1", "s2", "s3"],
    topic: "Denklemler",
    targetCount: 3,
    ...overrides,
  };
}

function submission(overrides: Partial<AssignmentSubmission> = {}): AssignmentSubmission {
  return {
    studentId: "s1",
    completedQuestionIds: [],
    completedCount: 0,
    startedAt: null,
    lastCompletedAt: null,
    completedAt: null,
    questionOutcomes: {},
    ...overrides,
  };
}

describe("buildAssignmentOutcomeInsights — no submissions", () => {
  it("is insufficient_data with zero submissions", () => {
    const result = buildAssignmentOutcomeInsights({ assignment: assignment(), submissions: [] });
    expect(result.effectiveness).toBe("insufficient_data");
    expect(result.topicOutcome.status).toBe("insufficient_data");
    expect(result.completedStudentCount).toBe(0);
    expect(result.attemptedStudentCount).toBe(0);
  });

  it("never mutates the assignment or submissions inputs", () => {
    const a = assignment();
    const subs = [submission({ studentId: "s1", questionOutcomes: { q1: "solved" }, completedCount: 1 })];
    const frozenA = JSON.parse(JSON.stringify(a));
    const frozenSubs = JSON.parse(JSON.stringify(subs));
    buildAssignmentOutcomeInsights({ assignment: a, submissions: subs });
    expect(a).toEqual(frozenA);
    expect(subs).toEqual(frozenSubs);
  });
});

describe("buildAssignmentOutcomeInsights — completion counts", () => {
  it("counts one fully complete student", () => {
    const result = buildAssignmentOutcomeInsights({
      assignment: assignment(),
      submissions: [
        submission({
          studentId: "s1",
          completedQuestionIds: ["q1", "q2", "q3"],
          completedCount: 3,
          questionOutcomes: { q1: "solved", q2: "solved", q3: "solved" },
        }),
      ],
    });
    expect(result.completedStudentCount).toBe(1);
    expect(result.attemptedStudentCount).toBe(1);
    expect(result.completionRate).toBeCloseTo(1 / 3);
  });

  it("counts a partial submission as attempted but not completed", () => {
    const result = buildAssignmentOutcomeInsights({
      assignment: assignment(),
      submissions: [submission({ studentId: "s1", completedCount: 1, questionOutcomes: { q1: "struggled" } })],
    });
    expect(result.completedStudentCount).toBe(0);
    expect(result.attemptedStudentCount).toBe(1);
  });

  it("is deterministic for the same input", () => {
    const subs = [submission({ studentId: "s1", completedCount: 1, questionOutcomes: { q1: "solved" } })];
    const a = buildAssignmentOutcomeInsights({ assignment: assignment(), submissions: subs });
    const b = buildAssignmentOutcomeInsights({ assignment: assignment(), submissions: subs });
    expect(a).toEqual(b);
  });
});

describe("buildAssignmentOutcomeInsights — question-level insight", () => {
  it("aggregates struggled/successful/never-attempted across many students", () => {
    const result = buildAssignmentOutcomeInsights({
      assignment: assignment({ targetStudentIds: ["s1", "s2", "s3", "s4"] }),
      submissions: [
        submission({ studentId: "s1", questionOutcomes: { q1: "struggled" } }),
        submission({ studentId: "s2", questionOutcomes: { q1: "again" } }),
        submission({ studentId: "s3", questionOutcomes: { q1: "solved" } }),
      ],
    });
    const q1 = result.questionInsights.find((q) => q.questionId === "q1")!;
    expect(q1.attemptedCount).toBe(3);
    expect(q1.struggledCount).toBe(2);
    expect(q1.successfulCount).toBe(1);
    expect(q1.neverAttemptedCount).toBe(1);
  });

  it("handles a question no one ever attempted", () => {
    const result = buildAssignmentOutcomeInsights({
      assignment: assignment(),
      submissions: [submission({ studentId: "s1", questionOutcomes: { q1: "solved" } })],
    });
    const q3 = result.questionInsights.find((q) => q.questionId === "q3")!;
    expect(q3.attemptedCount).toBe(0);
    expect(q3.neverAttemptedCount).toBe(3);
  });

  it("handles a duplicate-completion submission honestly (outcome recorded once, not twice)", () => {
    // questionOutcomes only ever has ONE entry per questionId by
    // construction (see applyAssignmentCompletion) — this asserts the
    // insight builder doesn't attempt to double-count from any other field.
    const result = buildAssignmentOutcomeInsights({
      assignment: assignment(),
      submissions: [submission({ studentId: "s1", completedQuestionIds: ["q1", "q1"], questionOutcomes: { q1: "solved" } })],
    });
    const q1 = result.questionInsights.find((q) => q.questionId === "q1")!;
    expect(q1.attemptedCount).toBe(1);
  });

  it("handles a question that was later deleted (still listed by id, just no metadata concern here)", () => {
    const result = buildAssignmentOutcomeInsights({
      assignment: assignment({ questionIds: ["q-deleted"] }),
      submissions: [submission({ studentId: "s1", questionOutcomes: { "q-deleted": "struggled" } })],
    });
    expect(result.questionInsights).toHaveLength(1);
    expect(result.questionInsights[0]!.struggledCount).toBe(1);
  });
});

describe("buildAssignmentOutcomeInsights — topic outcome", () => {
  it("is insufficient_data below the minimum outcome sample", () => {
    const result = buildAssignmentOutcomeInsights({
      assignment: assignment(),
      submissions: [submission({ studentId: "s1", questionOutcomes: { q1: "struggled" } })],
    });
    expect(result.topicOutcome.status).toBe("insufficient_data");
  });

  it("is still_weak with a high struggle rate", () => {
    const result = buildAssignmentOutcomeInsights({
      assignment: assignment(),
      submissions: [
        submission({ studentId: "s1", questionOutcomes: { q1: "struggled", q2: "again" } }),
        submission({ studentId: "s2", questionOutcomes: { q1: "struggled" } }),
      ],
    });
    expect(result.topicOutcome.status).toBe("still_weak");
  });

  it("is resolved with a low struggle rate", () => {
    const result = buildAssignmentOutcomeInsights({
      assignment: assignment(),
      submissions: [
        submission({ studentId: "s1", questionOutcomes: { q1: "solved", q2: "solved" } }),
        submission({ studentId: "s2", questionOutcomes: { q1: "solved" } }),
      ],
    });
    expect(result.topicOutcome.status).toBe("resolved");
  });

  it("is improving for a middling struggle rate", () => {
    const result = buildAssignmentOutcomeInsights({
      assignment: assignment(),
      submissions: [
        submission({ studentId: "s1", questionOutcomes: { q1: "solved", q2: "solved" } }),
        submission({ studentId: "s2", questionOutcomes: { q1: "struggled" } }),
      ],
    });
    expect(result.topicOutcome.status).toBe("improving");
  });
});

describe("buildAssignmentOutcomeInsights — effectiveness", () => {
  it("is insufficient_data below the minimum student count even with real outcomes", () => {
    const result = buildAssignmentOutcomeInsights({
      assignment: assignment({ targetStudentIds: ["s1", "s2"] }),
      submissions: [
        submission({ studentId: "s1", completedCount: 2, questionOutcomes: { q1: "solved", q2: "solved" } }),
      ],
    });
    expect(result.effectiveness).toBe("insufficient_data");
  });

  it("is needs_follow_up when struggle is high", () => {
    const result = buildAssignmentOutcomeInsights({
      assignment: assignment(),
      submissions: [
        submission({ studentId: "s1", questionOutcomes: { q1: "struggled", q2: "again" } }),
        submission({ studentId: "s2", questionOutcomes: { q1: "struggled" } }),
      ],
    });
    expect(result.effectiveness).toBe("needs_follow_up");
  });

  it("is effective with low struggle and good completion", () => {
    const result = buildAssignmentOutcomeInsights({
      assignment: assignment(),
      submissions: [
        submission({
          studentId: "s1",
          completedCount: 3,
          questionOutcomes: { q1: "solved", q2: "solved", q3: "solved" },
        }),
        submission({
          studentId: "s2",
          completedCount: 3,
          questionOutcomes: { q1: "solved", q2: "solved", q3: "solved" },
        }),
      ],
    });
    expect(result.effectiveness).toBe("effective");
  });

  it("is mixed with low struggle but low completion", () => {
    const result = buildAssignmentOutcomeInsights({
      assignment: assignment({ targetStudentIds: ["s1", "s2", "s3", "s4", "s5"] }),
      submissions: [
        submission({ studentId: "s1", completedCount: 1, questionOutcomes: { q1: "solved" } }),
        submission({ studentId: "s2", completedCount: 1, questionOutcomes: { q1: "solved" } }),
        submission({ studentId: "s3", completedCount: 1, questionOutcomes: { q1: "solved" } }),
      ],
    });
    expect(result.effectiveness).toBe("mixed");
  });
});
