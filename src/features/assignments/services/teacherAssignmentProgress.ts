import { AssignmentSubmission } from "../domain/assignmentTypes";
import { resolveStudentAssignmentStatus, StudentAssignmentStatus } from "./assignmentProgress";

export interface TargetStudentIdentity {
  uid: string;
  displayName: string;
}

export interface StudentAssignmentRow {
  studentUid: string;
  displayName: string;
  status: StudentAssignmentStatus;
  completedCount: number;
}

export interface TeacherAssignmentProgressSummary {
  totalStudents: number;
  startedCount: number;
  completedCount: number;
  rows: StudentAssignmentRow[];
}

// One row per TARGETED student — never per submission document, so a
// student who never opened the assignment at all (no submission doc
// exists yet) still shows up as "not_started" rather than being silently
// missing from the list. This is the whole reason the caller passes the
// assignment's own targetStudentIds (already known, zero extra reads)
// rather than deriving the roster from whatever submission docs happen to
// exist.
export function buildTeacherAssignmentProgress(params: {
  targetStudents: readonly TargetStudentIdentity[];
  submissionsByStudent: ReadonlyMap<string, AssignmentSubmission>;
  targetCount: number;
  dueAt: number | null;
  now: number;
}): TeacherAssignmentProgressSummary {
  const rows: StudentAssignmentRow[] = params.targetStudents.map((student) => {
    const submission = params.submissionsByStudent.get(student.uid) ?? null;
    const status = resolveStudentAssignmentStatus({
      submission,
      targetCount: params.targetCount,
      dueAt: params.dueAt,
      now: params.now,
    });
    return {
      studentUid: student.uid,
      displayName: student.displayName,
      status,
      completedCount: submission?.completedCount ?? 0,
    };
  });

  return {
    totalStudents: rows.length,
    startedCount: rows.filter((row) => row.completedCount > 0).length,
    completedCount: rows.filter((row) => row.status === "completed").length,
    rows,
  };
}
