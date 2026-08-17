// Phase 38 — when the STUDENT's assignment session is finished.
//
// Deliberately NOT the same question as computeAssignmentProgress
// (assignmentProgress.ts), and deliberately not a replacement for it: that
// one answers "how far through the assignment is this student", in the
// assignment's OWN terms (completedCount vs the teacher's targetCount), and
// it stays the single source of truth for every teacher-facing readout.
// This one answers the narrower session question "is there anything left on
// screen for this student to do", which is not the same thing the moment an
// assignment names a question the student can no longer open.
//
// Root cause this exists to fix (reproduced against the emulator): an
// assignment's questionIds are a SNAPSHOT taken at creation time and are
// never re-filtered afterwards (see assignmentTypes.ts), so a question that
// is later deleted — or that the student loses access to — still counts
// toward targetCount while being impossible to answer. A seeded assignment
// with targetCount 4 whose snapshot named 2 since-deleted questions rendered
// exactly 2 answerable cards and a header reading "0 / 4": answering both
// reached "2 / 4", `completedCount >= targetCount` stayed false forever, and
// the student hit the end of the list with no completion screen and no way
// to finish. The session must complete when everything ACTUALLY ANSWERABLE
// has been answered.
//
// The teacher's view is intentionally left alone: their "2 / 4" is the
// truth about the assignment they created, and the unanswerable remainder
// is surfaced to the student as a real, named fact rather than silently
// rounded away.

export interface AssignmentSessionCompletion {
  /** Nothing answerable is left — the session's completion screen may show. */
  isComplete: boolean;
  /** Distinct answerable questions the student has completed. */
  completedCount: number;
  /** Distinct questions that actually resolved to something openable. */
  resolvableCount: number;
  /** The teacher's own targetCount, carried through unchanged. */
  targetCount: number;
  /**
   * How many of the assignment's questions could not be resolved at all
   * (deleted, or access lost). Non-zero means completedCount can never
   * reach targetCount, which is exactly the case the old check deadlocked
   * on — surfaced so the UI can say so honestly instead of implying the
   * student left work undone.
   */
  unavailableCount: number;
}

function distinct(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

export function resolveAssignmentSessionCompletion(params: {
  /** Question ids that resolved to a real, openable question, in list order. */
  resolvableQuestionIds: readonly string[];
  /** completedQuestionIds straight off the student's own submission. */
  completedQuestionIds: readonly string[];
  /** The assignment's targetCount (its full questionIds length). */
  targetCount: number;
}): AssignmentSessionCompletion {
  const resolvable = distinct(params.resolvableQuestionIds);
  const completedSet = new Set(params.completedQuestionIds);
  // Only completions for questions still ACTUALLY in this session count —
  // a stale completedQuestionIds entry for a since-deleted question must
  // not inflate the count past what is on screen.
  const completedCount = resolvable.filter((id) => completedSet.has(id)).length;

  const safeTarget =
    Number.isFinite(params.targetCount) && params.targetCount > 0 ? Math.floor(params.targetCount) : 0;

  return {
    // A session with nothing answerable at all is NOT "complete" — that is
    // the separate empty state (see StudySessionScreen's isAssignmentEmpty),
    // which tells the student the assignment has no usable questions rather
    // than congratulating them for finishing nothing.
    isComplete: resolvable.length > 0 && completedCount >= resolvable.length,
    completedCount,
    resolvableCount: resolvable.length,
    targetCount: safeTarget,
    unavailableCount: Math.max(0, safeTarget - resolvable.length),
  };
}

/**
 * The next question the student should land on when they RESUME an
 * assignment: the first one, in the session's own order, they have not
 * completed yet. Returns 0 when everything is done (the completion screen
 * takes over) or when the list is empty.
 *
 * useAssignmentSession already orders incomplete questions first at load
 * time, so in the normal case this is simply 0 — but that ordering is
 * computed ONCE per load, and the student may complete cards out of order
 * within a live session. Deriving the index rather than assuming 0 keeps
 * "Devam Et" landing on real unfinished work in both situations.
 */
export function resolveResumeIndex(
  orderedQuestionIds: readonly string[],
  completedQuestionIds: readonly string[],
): number {
  const completedSet = new Set(completedQuestionIds);
  const index = orderedQuestionIds.findIndex((id) => !completedSet.has(id));
  return index === -1 ? 0 : index;
}
