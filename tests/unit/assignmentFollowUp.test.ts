import { buildAssignmentFollowUp } from "../../src/features/assignments/services/assignmentFollowUp";
import { AssignmentSubmission } from "../../src/features/assignments/domain/assignmentTypes";

const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

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

const STUDENTS = [
  { uid: "s1", displayName: "Ayşe" },
  { uid: "s2", displayName: "Mehmet" },
  { uid: "s3", displayName: "Can" },
];

describe("buildAssignmentFollowUp", () => {
  it("returns no entries when every student has completed with no struggle", () => {
    const result = buildAssignmentFollowUp({
      targetStudents: STUDENTS,
      submissionsByStudent: new Map([
        ["s1", submission({ completedCount: 3, questionOutcomes: { q1: "solved", q2: "solved", q3: "solved" } })],
        ["s2", submission({ completedCount: 3, questionOutcomes: { q1: "solved", q2: "solved", q3: "solved" } })],
        ["s3", submission({ completedCount: 3, questionOutcomes: { q1: "solved", q2: "solved", q3: "solved" } })],
      ]),
      targetCount: 3,
      dueAt: null,
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  it("flags a student with no submission at all as incomplete", () => {
    const result = buildAssignmentFollowUp({
      targetStudents: STUDENTS,
      submissionsByStudent: new Map(),
      targetCount: 3,
      dueAt: null,
      now: NOW,
    });
    expect(result).toHaveLength(3);
    expect(result.every((entry) => entry.reasons.includes("incomplete"))).toBe(true);
  });

  it("flags a past-due incomplete student as stale", () => {
    const result = buildAssignmentFollowUp({
      targetStudents: [STUDENTS[0]!],
      submissionsByStudent: new Map([["s1", submission({ completedCount: 1 })]]),
      targetCount: 3,
      dueAt: NOW - DAY_MS,
      now: NOW,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.reasons).toContain("stale");
  });

  it("flags repeated struggle when the majority of a real sample struggled", () => {
    const result = buildAssignmentFollowUp({
      targetStudents: [STUDENTS[0]!],
      submissionsByStudent: new Map([
        [
          "s1",
          submission({
            completedCount: 3,
            questionOutcomes: { q1: "struggled", q2: "again", q3: "solved" },
          }),
        ],
      ]),
      targetCount: 3,
      dueAt: null,
      now: NOW,
    });
    expect(result[0]!.reasons).toContain("repeated_struggle");
  });

  it("does not flag repeated struggle from a single outcome (no false positive)", () => {
    const result = buildAssignmentFollowUp({
      targetStudents: [STUDENTS[0]!],
      submissionsByStudent: new Map([
        ["s1", submission({ completedCount: 3, questionOutcomes: { q1: "struggled", q2: "solved", q3: "solved" } })],
      ]),
      targetCount: 3,
      dueAt: null,
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  it("never includes a student twice and preserves target-student order", () => {
    const result = buildAssignmentFollowUp({
      targetStudents: STUDENTS,
      submissionsByStudent: new Map(),
      targetCount: 3,
      dueAt: null,
      now: NOW,
    });
    expect(result.map((entry) => entry.studentUid)).toEqual(["s1", "s2", "s3"]);
  });

  it("is deterministic for the same input", () => {
    const submissionsByStudent = new Map([["s1", submission({ completedCount: 1 })]]);
    const a = buildAssignmentFollowUp({ targetStudents: STUDENTS, submissionsByStudent, targetCount: 3, dueAt: null, now: NOW });
    const b = buildAssignmentFollowUp({ targetStudents: STUDENTS, submissionsByStudent, targetCount: 3, dueAt: null, now: NOW });
    expect(a).toEqual(b);
  });
});
