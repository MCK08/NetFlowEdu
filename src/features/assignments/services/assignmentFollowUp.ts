import { AssignmentSubmission } from "../domain/assignmentTypes";
import { resolveStudentAssignmentStatus } from "./assignmentProgress";

// Phase 31 — deliberately NOT a second studentAttention (src/features/
// teacher/services/studentAttention.ts): that engine needs a full
// StudentPerformanceSnapshot per student (a per-student read across the
// student's ENTIRE class history), which AssignmentDetailScreen's read
// budget explicitly forbids fetching per-student here (§14 "N+1 YOK"). This
// is a narrower, assignment-SCOPED classifier built entirely from the
// submissions already read by useAssignmentDetail.ts (zero extra reads) —
// it answers "did this student struggle or stall on THIS assignment", not
// "how is this student doing overall" (studentAttention's job).

export type FollowUpReason = "incomplete" | "stale" | "repeated_struggle";

export interface AssignmentFollowUpEntry {
  studentUid: string;
  displayName: string;
  reasons: FollowUpReason[];
}

// A single struggled outcome is not "repeated" — needs a real minimum
// sample, same reasoning as assignmentOutcomeInsights.ts's topic-level
// threshold.
const MIN_OUTCOMES_FOR_STRUGGLE_SIGNAL = 2;
const REPEATED_STRUGGLE_RATIO = 0.5;

function hasRepeatedStruggle(submission: AssignmentSubmission): boolean {
  const outcomes = Object.values(submission.questionOutcomes);
  if (outcomes.length < MIN_OUTCOMES_FOR_STRUGGLE_SIGNAL) return false;
  const struggledCount = outcomes.filter((outcome) => outcome === "again" || outcome === "struggled").length;
  return struggledCount / outcomes.length >= REPEATED_STRUGGLE_RATIO;
}

// One entry per targeted student who has a REAL reason to follow up —
// students with no reason are simply absent from the result, never padded
// in with an empty-reasons entry.
export function buildAssignmentFollowUp(params: {
  targetStudents: readonly { uid: string; displayName: string }[];
  submissionsByStudent: ReadonlyMap<string, AssignmentSubmission>;
  targetCount: number;
  dueAt: number | null;
  now: number;
}): AssignmentFollowUpEntry[] {
  const entries: AssignmentFollowUpEntry[] = [];

  for (const student of params.targetStudents) {
    const submission = params.submissionsByStudent.get(student.uid) ?? null;
    const status = resolveStudentAssignmentStatus({
      submission,
      targetCount: params.targetCount,
      dueAt: params.dueAt,
      now: params.now,
    });

    const reasons: FollowUpReason[] = [];
    if (status === "past_due") reasons.push("stale");
    if (status === "in_progress" || status === "not_started") reasons.push("incomplete");
    if (submission && hasRepeatedStruggle(submission)) reasons.push("repeated_struggle");

    if (reasons.length > 0) {
      entries.push({ studentUid: student.uid, displayName: student.displayName, reasons });
    }
  }

  return entries;
}
