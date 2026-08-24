import {
  buildHistoricalQuestionSignals,
  mergeQuestionSignals,
  selectRecentTopicAssignments,
  MAX_HISTORY_ASSIGNMENTS,
} from "../../src/features/assignments/services/assignmentHistorySignals";
import { Assignment, AssignmentSubmission } from "../../src/features/assignments/domain/assignmentTypes";

function assignment(id: string, overrides: Partial<Assignment> = {}): Assignment {
  return {
    id,
    classId: "class-1",
    organizationId: null,
    teacherId: "teacher-1",
    title: "Ödev",
    description: null,
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "9",
    targetStudentIds: ["s1"],
    questionIds: ["q1"],
    targetCount: 1,
    dueAt: null,
    status: "published",
    createdAt: 0,
    updatedAt: 0,
    interventionOf: null,
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

describe("selectRecentTopicAssignments", () => {
  it("filters to the matching topic only", () => {
    const result = selectRecentTopicAssignments(
      [assignment("a1", { topic: "Denklemler" }), assignment("a2", { topic: "Kuvvet" })],
      "Denklemler",
      null,
    );
    expect(result.map((a) => a.id)).toEqual(["a1"]);
  });

  it("excludes drafts", () => {
    const result = selectRecentTopicAssignments([assignment("a1", { status: "draft" })], "Denklemler", null);
    expect(result).toEqual([]);
  });

  it("excludes the given assignmentId", () => {
    const result = selectRecentTopicAssignments([assignment("a1"), assignment("a2")], "Denklemler", "a1");
    expect(result.map((a) => a.id)).toEqual(["a2"]);
  });

  it("sorts most recent first and caps at MAX_HISTORY_ASSIGNMENTS", () => {
    const many = Array.from({ length: MAX_HISTORY_ASSIGNMENTS + 3 }, (_, i) =>
      assignment(`a${i}`, { createdAt: i }),
    );
    const result = selectRecentTopicAssignments(many, "Denklemler", null);
    expect(result).toHaveLength(MAX_HISTORY_ASSIGNMENTS);
    expect(result[0]!.createdAt).toBeGreaterThan(result[result.length - 1]!.createdAt);
  });

  it("never mutates the input array", () => {
    const input = [assignment("a1", { createdAt: 1 }), assignment("a2", { createdAt: 2 })];
    const copy = [...input];
    selectRecentTopicAssignments(input, "Denklemler", null);
    expect(input).toEqual(copy);
  });
});

describe("buildHistoricalQuestionSignals", () => {
  it("returns an empty map with no history", () => {
    expect(buildHistoricalQuestionSignals([], new Map()).size).toBe(0);
  });

  it("aggregates struggled/attempted counts across assignments", () => {
    const a1 = assignment("a1", { createdAt: 1 });
    const a2 = assignment("a2", { createdAt: 2 });
    const map = new Map([
      ["a1", [submission({ studentId: "s1", questionOutcomes: { q1: "struggled" }, lastCompletedAt: 100 })]],
      ["a2", [submission({ studentId: "s2", questionOutcomes: { q1: "solved" }, lastCompletedAt: 200 })]],
    ]);
    const result = buildHistoricalQuestionSignals([a1, a2], map);
    const signal = result.get("q1")!;
    expect(signal.everAttemptedCount).toBe(2);
    expect(signal.struggledCount).toBe(1);
    expect(signal.mostRecentReviewedAt).toBe(200);
  });

  it("a question absent from every past outcome is absent from the map", () => {
    const a1 = assignment("a1");
    const map = new Map([["a1", [submission({ questionOutcomes: { q1: "solved" } })]]]);
    const result = buildHistoricalQuestionSignals([a1], map);
    expect(result.has("q2")).toBe(false);
  });

  it("is deterministic and never mutates inputs", () => {
    const a1 = assignment("a1");
    const subs = [submission({ questionOutcomes: { q1: "struggled" }, lastCompletedAt: 50 })];
    const map = new Map([["a1", subs]]);
    const frozen = JSON.parse(JSON.stringify(subs));
    const a = buildHistoricalQuestionSignals([a1], map);
    const b = buildHistoricalQuestionSignals([a1], map);
    expect(a).toEqual(b);
    expect(subs).toEqual(frozen);
  });
});

describe("mergeQuestionSignals", () => {
  it("sums counts for a question present in both maps", () => {
    const live = new Map([["q1", { everAttemptedCount: 2, struggledCount: 1, mostRecentReviewedAt: 100, cumulativeStruggleCount: null }]]);
    const historical = new Map([["q1", { everAttemptedCount: 3, struggledCount: 2, mostRecentReviewedAt: 50, cumulativeStruggleCount: null }]]);
    const merged = mergeQuestionSignals(live, historical);
    expect(merged.get("q1")).toEqual({ everAttemptedCount: 5, struggledCount: 3, mostRecentReviewedAt: 100, cumulativeStruggleCount: null });
  });

  it("keeps a question present only in live signals unchanged", () => {
    const live = new Map([["q1", { everAttemptedCount: 1, struggledCount: 0, mostRecentReviewedAt: null, cumulativeStruggleCount: null }]]);
    const merged = mergeQuestionSignals(live, new Map());
    expect(merged.get("q1")).toEqual({ everAttemptedCount: 1, struggledCount: 0, mostRecentReviewedAt: null, cumulativeStruggleCount: null });
  });

  it("keeps a question present only in historical signals unchanged", () => {
    const historical = new Map([["q1", { everAttemptedCount: 4, struggledCount: 4, mostRecentReviewedAt: 10, cumulativeStruggleCount: null }]]);
    const merged = mergeQuestionSignals(new Map(), historical);
    expect(merged.get("q1")).toEqual({ everAttemptedCount: 4, struggledCount: 4, mostRecentReviewedAt: 10, cumulativeStruggleCount: null });
  });

  it("never mutates either input map", () => {
    const live = new Map([["q1", { everAttemptedCount: 1, struggledCount: 0, mostRecentReviewedAt: null, cumulativeStruggleCount: null }]]);
    const historical = new Map([["q1", { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: 5, cumulativeStruggleCount: null }]]);
    mergeQuestionSignals(live, historical);
    expect(live.get("q1")).toEqual({ everAttemptedCount: 1, struggledCount: 0, mostRecentReviewedAt: null, cumulativeStruggleCount: null });
    expect(historical.get("q1")).toEqual({ everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: 5, cumulativeStruggleCount: null });
  });

  it("is deterministic", () => {
    const live = new Map([["q1", { everAttemptedCount: 1, struggledCount: 0, mostRecentReviewedAt: null, cumulativeStruggleCount: null }]]);
    const historical = new Map([["q2", { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: 5, cumulativeStruggleCount: null }]]);
    const a = mergeQuestionSignals(live, historical);
    const b = mergeQuestionSignals(live, historical);
    expect(a).toEqual(b);
  });

  // Phase 46 — the additive cumulativeStruggleCount merge: sums whichever
  // side(s) actually know something, null only when NEITHER side does
  // (mirrors outcomeCounters.ts's own sumOutcomeCounter contract).
  it("Phase 46 — sums cumulativeStruggleCount when both sides have trustworthy evidence", () => {
    const live = new Map([["q1", { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: 100, cumulativeStruggleCount: 6 }]]);
    const historical = new Map([["q1", { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: 50, cumulativeStruggleCount: 3 }]]);
    const merged = mergeQuestionSignals(live, historical);
    expect(merged.get("q1")?.cumulativeStruggleCount).toBe(9);
  });

  it("Phase 46 — keeps the one known side's cumulativeStruggleCount when the other is null (never treats null as 0)", () => {
    const live = new Map([["q1", { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: 100, cumulativeStruggleCount: 6 }]]);
    const historical = new Map([["q1", { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: 50, cumulativeStruggleCount: null }]]);
    const merged = mergeQuestionSignals(live, historical);
    expect(merged.get("q1")?.cumulativeStruggleCount).toBe(6);
  });

  it("Phase 46 — stays null when NEITHER side has trustworthy evidence", () => {
    const live = new Map([["q1", { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: 100, cumulativeStruggleCount: null }]]);
    const historical = new Map([["q1", { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: 50, cumulativeStruggleCount: null }]]);
    const merged = mergeQuestionSignals(live, historical);
    expect(merged.get("q1")?.cumulativeStruggleCount).toBeNull();
  });
});
