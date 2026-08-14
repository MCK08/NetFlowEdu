import { buildTeacherAssignmentProgress } from "../../src/features/assignments/services/teacherAssignmentProgress";
import { AssignmentSubmission } from "../../src/features/assignments/domain/assignmentTypes";

const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function sub(overrides: Partial<AssignmentSubmission> = {}): AssignmentSubmission {
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

describe("buildTeacherAssignmentProgress", () => {
  it("shows a targeted student with no submission doc as not_started, not missing", () => {
    const result = buildTeacherAssignmentProgress({
      targetStudents: [{ uid: "s1", displayName: "Ayşe" }],
      submissionsByStudent: new Map(),
      targetCount: 5,
      dueAt: null,
      now: NOW,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ studentUid: "s1", status: "not_started", completedCount: 0 });
  });

  it("classifies every real status across a mixed class", () => {
    const submissions = new Map<string, AssignmentSubmission>([
      ["completed", sub({ studentId: "completed", completedCount: 5 })],
      ["partial", sub({ studentId: "partial", completedCount: 2 })],
    ]);
    const result = buildTeacherAssignmentProgress({
      targetStudents: [
        { uid: "completed", displayName: "Tamamladı" },
        { uid: "partial", displayName: "Devam Ediyor" },
        { uid: "none", displayName: "Başlamadı" },
      ],
      submissionsByStudent: submissions,
      targetCount: 5,
      dueAt: null,
      now: NOW,
    });
    const byUid = Object.fromEntries(result.rows.map((r) => [r.studentUid, r.status]));
    expect(byUid).toEqual({ completed: "completed", partial: "in_progress", none: "not_started" });
  });

  it("marks a not-yet-complete student past_due once the deadline has passed", () => {
    const result = buildTeacherAssignmentProgress({
      targetStudents: [{ uid: "s1", displayName: "Ayşe" }],
      submissionsByStudent: new Map([["s1", sub({ studentId: "s1", completedCount: 1 })]]),
      targetCount: 5,
      dueAt: NOW - DAY_MS,
      now: NOW,
    });
    expect(result.rows[0]?.status).toBe("past_due");
  });

  it("counts startedCount and completedCount correctly across the class", () => {
    const submissions = new Map<string, AssignmentSubmission>([
      ["a", sub({ studentId: "a", completedCount: 5 })],
      ["b", sub({ studentId: "b", completedCount: 1 })],
    ]);
    const result = buildTeacherAssignmentProgress({
      targetStudents: [
        { uid: "a", displayName: "A" },
        { uid: "b", displayName: "B" },
        { uid: "c", displayName: "C" },
      ],
      submissionsByStudent: submissions,
      targetCount: 5,
      dueAt: null,
      now: NOW,
    });
    expect(result.totalStudents).toBe(3);
    expect(result.startedCount).toBe(2); // a and b have completedCount > 0
    expect(result.completedCount).toBe(1); // only a reached the target
  });

  it("handles an empty target list", () => {
    const result = buildTeacherAssignmentProgress({
      targetStudents: [],
      submissionsByStudent: new Map(),
      targetCount: 5,
      dueAt: null,
      now: NOW,
    });
    expect(result).toEqual({ totalStudents: 0, startedCount: 0, completedCount: 0, rows: [] });
  });

  it("is deterministic and preserves the given target-student order", () => {
    const students = [
      { uid: "b", displayName: "B" },
      { uid: "a", displayName: "A" },
    ];
    const result = buildTeacherAssignmentProgress({
      targetStudents: students,
      submissionsByStudent: new Map(),
      targetCount: 5,
      dueAt: null,
      now: NOW,
    });
    expect(result.rows.map((r) => r.studentUid)).toEqual(["b", "a"]);
  });
});
