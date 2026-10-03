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

// Phase 128 — how many targeted students sit in each canonical status.
//
// A pure count over the rows buildTeacherAssignmentProgress already resolved:
// every student lands in exactly ONE status (resolveStudentAssignmentStatus
// picks one, and completion outranks a passed deadline), so the four counts
// always add up to rows.length — a summary that reconciles with the list
// beneath it, never a second way of deciding who is done.
export function countAssignmentStatuses(
  rows: readonly StudentAssignmentRow[],
): Record<StudentAssignmentStatus, number> {
  const counts: Record<StudentAssignmentStatus, number> = {
    completed: 0,
    in_progress: 0,
    not_started: 0,
    past_due: 0,
  };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

// Phase 128 — the WORD for a student's status on one assignment. Moved out of
// AssignmentDetailScreen, which owned the only copy, so the response summary
// and the student list beneath it name each state identically. The words are
// the ones the screen has always used.
export function studentAssignmentStatusLabel(status: StudentAssignmentStatus): string {
  switch (status) {
    case "completed":
      return "Tamamladı";
    case "in_progress":
      return "Devam ediyor";
    case "past_due":
      return "Süresi geçti";
    case "not_started":
      return "Başlamadı";
  }
}
