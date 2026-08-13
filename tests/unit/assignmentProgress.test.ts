import {
  applyAssignmentCompletion,
  computeAssignmentProgress,
  resolveStudentAssignmentStatus,
} from "../../src/features/assignments/services/assignmentProgress";
import { AssignmentSubmission } from "../../src/features/assignments/domain/assignmentTypes";

const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function submission(overrides: Partial<AssignmentSubmission> = {}): AssignmentSubmission {
  return {
    studentId: "student-1",
    completedQuestionIds: [],
    completedCount: 0,
    startedAt: null,
    lastCompletedAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe("computeAssignmentProgress", () => {
  it("is 0/N for no submission at all", () => {
    expect(computeAssignmentProgress(null, 5)).toEqual({
      completedCount: 0,
      targetCount: 5,
      remainingCount: 5,
      isComplete: false,
    });
  });

  it("is a real partial fraction", () => {
    const result = computeAssignmentProgress(submission({ completedCount: 2 }), 5);
    expect(result).toEqual({ completedCount: 2, targetCount: 5, remainingCount: 3, isComplete: false });
  });

  it("is complete when completedCount reaches targetCount", () => {
    const result = computeAssignmentProgress(submission({ completedCount: 5 }), 5);
    expect(result.isComplete).toBe(true);
    expect(result.remainingCount).toBe(0);
  });

  it("is complete even if completedCount somehow exceeds targetCount", () => {
    expect(computeAssignmentProgress(submission({ completedCount: 7 }), 5).isComplete).toBe(true);
  });

  it("is never complete for a targetCount of 0", () => {
    expect(computeAssignmentProgress(submission({ completedCount: 0 }), 0).isComplete).toBe(false);
  });
});

describe("resolveStudentAssignmentStatus", () => {
  it("is not_started with no submission and no due date", () => {
    expect(
      resolveStudentAssignmentStatus({ submission: null, targetCount: 5, dueAt: null, now: NOW }),
    ).toBe("not_started");
  });

  it("is in_progress with partial completion", () => {
    expect(
      resolveStudentAssignmentStatus({
        submission: submission({ completedCount: 2 }),
        targetCount: 5,
        dueAt: null,
        now: NOW,
      }),
    ).toBe("in_progress");
  });

  it("is completed once the target is reached", () => {
    expect(
      resolveStudentAssignmentStatus({
        submission: submission({ completedCount: 5 }),
        targetCount: 5,
        dueAt: null,
        now: NOW,
      }),
    ).toBe("completed");
  });

  it("is past_due when the deadline has passed with no submission", () => {
    expect(
      resolveStudentAssignmentStatus({ submission: null, targetCount: 5, dueAt: NOW - DAY_MS, now: NOW }),
    ).toBe("past_due");
  });

  it("is past_due when the deadline has passed with partial progress", () => {
    expect(
      resolveStudentAssignmentStatus({
        submission: submission({ completedCount: 2 }),
        targetCount: 5,
        dueAt: NOW - DAY_MS,
        now: NOW,
      }),
    ).toBe("past_due");
  });

  it("completion always wins over a passed deadline — finishing late is still finishing", () => {
    expect(
      resolveStudentAssignmentStatus({
        submission: submission({ completedCount: 5 }),
        targetCount: 5,
        dueAt: NOW - DAY_MS,
        now: NOW,
      }),
    ).toBe("completed");
  });

  it("is not past_due exactly at the due instant (boundary)", () => {
    expect(
      resolveStudentAssignmentStatus({ submission: null, targetCount: 5, dueAt: NOW, now: NOW }),
    ).toBe("not_started");
  });
});

describe("applyAssignmentCompletion — idempotency and duplicate protection", () => {
  it("creates a fresh submission from null", () => {
    const result = applyAssignmentCompletion(null, "q1", 5, NOW);
    expect(result.completedQuestionIds).toEqual(["q1"]);
    expect(result.completedCount).toBe(1);
    expect(result.startedAt).toBe(NOW);
    expect(result.lastCompletedAt).toBe(NOW);
  });

  it("does not increase completedCount when the same questionId is completed twice", () => {
    const first = applyAssignmentCompletion(null, "q1", 5, NOW);
    const second = applyAssignmentCompletion(first, "q1", 5, NOW + 1000);
    expect(second.completedCount).toBe(1);
    expect(second.completedQuestionIds).toEqual(["q1"]);
  });

  it("is a true no-op on a duplicate — even lastCompletedAt does not change", () => {
    const first = applyAssignmentCompletion(null, "q1", 5, NOW);
    const second = applyAssignmentCompletion(first, "q1", 5, NOW + 1000);
    expect(second).toEqual(first);
  });

  it("does not overwrite startedAt on a second, different completion", () => {
    const first = applyAssignmentCompletion(null, "q1", 5, NOW);
    const second = applyAssignmentCompletion(first, "q2", 5, NOW + 1000);
    expect(second.startedAt).toBe(NOW);
    expect(second.lastCompletedAt).toBe(NOW + 1000);
    expect(second.completedCount).toBe(2);
  });

  it("sets completedAt only once the target is reached", () => {
    const one = applyAssignmentCompletion(null, "q1", 2, NOW);
    expect(one.completedAt).toBeNull();
    const two = applyAssignmentCompletion(one, "q2", 2, NOW + 1000);
    expect(two.completedAt).toBe(NOW + 1000);
  });

  it("never re-sets completedAt on a later duplicate after already complete", () => {
    const one = applyAssignmentCompletion(null, "q1", 1, NOW);
    expect(one.completedAt).toBe(NOW);
    const dup = applyAssignmentCompletion(one, "q1", 1, NOW + 5000);
    expect(dup.completedAt).toBe(NOW);
  });

  it("handles a retry after a failed write the same way as a fresh completion (idempotent by design)", () => {
    // Simulates: outcome recorded, progress write failed, client retries
    // with the same questionId — must never double count.
    const attempt1 = applyAssignmentCompletion(null, "q1", 3, NOW);
    const retryOfSameAttempt = applyAssignmentCompletion(attempt1, "q1", 3, NOW + 2000);
    expect(retryOfSameAttempt.completedCount).toBe(1);
  });
});
