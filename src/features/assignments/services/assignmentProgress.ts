import { StudyOutcome } from "@features/study/domain/studyTypes";

import { AssignmentSubmission } from "../domain/assignmentTypes";
import { isPastDue } from "./assignmentDueDate";

export interface AssignmentProgressSummary {
  completedCount: number;
  targetCount: number;
  remainingCount: number;
  isComplete: boolean;
}

// The single source of truth for "is this student done" — always
// completedCount >= targetCount, never AssignmentSubmission.completedAt
// alone (that field is write-time informational, see assignmentTypes.ts).
export function computeAssignmentProgress(
  submission: AssignmentSubmission | null,
  targetCount: number,
): AssignmentProgressSummary {
  const completedCount = submission ? submission.completedCount : 0;
  const safeTarget = Number.isFinite(targetCount) && targetCount > 0 ? Math.floor(targetCount) : 0;
  return {
    completedCount,
    targetCount: safeTarget,
    remainingCount: Math.max(0, safeTarget - completedCount),
    isComplete: safeTarget > 0 && completedCount >= safeTarget,
  };
}

export type StudentAssignmentStatus = "not_started" | "in_progress" | "completed" | "past_due";

// Completion always wins over a passed deadline — finishing late is still
// finishing, never re-labeled "past_due" after the fact (§10 "Deadline
// geçti diye progress kaybolmamalı").
export function resolveStudentAssignmentStatus(params: {
  submission: AssignmentSubmission | null;
  targetCount: number;
  dueAt: number | null;
  now: number;
}): StudentAssignmentStatus {
  const progress = computeAssignmentProgress(params.submission, params.targetCount);
  if (progress.isComplete) return "completed";
  if (isPastDue(params.dueAt, params.now)) return "past_due";
  if (progress.completedCount > 0) return "in_progress";
  return "not_started";
}

// Pure state transition mirroring exactly what Firestore's own
// arrayUnion(questionId) write does (see assignmentService.ts) —
// idempotent by construction: completing the same questionId twice (a
// duplicate submit retry, or the same question opened twice) is a no-op,
// never double-counted. Used by the client for optimistic state and
// directly by tests; the real persisted write goes through arrayUnion
// itself, not this function, so the two can never drift.
export function applyAssignmentCompletion(
  submission: AssignmentSubmission | null,
  questionId: string,
  targetCount: number,
  now: number,
  outcome?: StudyOutcome,
): AssignmentSubmission {
  const previous: AssignmentSubmission = submission ?? {
    studentId: "",
    completedQuestionIds: [],
    completedCount: 0,
    startedAt: null,
    lastCompletedAt: null,
    completedAt: null,
    questionOutcomes: {},
  };

  if (previous.completedQuestionIds.includes(questionId)) {
    return previous;
  }

  const completedQuestionIds = [...previous.completedQuestionIds, questionId];
  const safeTarget = Number.isFinite(targetCount) && targetCount > 0 ? Math.floor(targetCount) : 0;
  const isNowComplete = safeTarget > 0 && completedQuestionIds.length >= safeTarget;
  // Only ever SET on first completion (the branch above already returns
  // early for a repeat) — never overwritten, so this stays a true,
  // permanent record of "what happened the first time, in this
  // assignment" (see the questionOutcomes doc comment in assignmentTypes.ts).
  const questionOutcomes =
    outcome !== undefined ? { ...previous.questionOutcomes, [questionId]: outcome } : previous.questionOutcomes;

  return {
    ...previous,
    completedQuestionIds,
    completedCount: completedQuestionIds.length,
    startedAt: previous.startedAt ?? now,
    lastCompletedAt: now,
    completedAt: isNowComplete ? (previous.completedAt ?? now) : previous.completedAt,
    questionOutcomes,
  };
}
