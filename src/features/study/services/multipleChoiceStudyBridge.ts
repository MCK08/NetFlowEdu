import { StudyOutcome } from "../domain/studyTypes";

// Phase 25 §13 — the pure logic multiple-choice integration needs. Nothing
// else changes: the caller (MultipleChoiceAnswer.tsx) still calls the exact
// same recordStudyOutcome (studyService.ts) that RatingCard/StudyQueueCard/
// ReviewSessionScreen already call, which still goes through the exact
// same functions/src/study/recordStudyOutcome.ts and reviewScheduler.ts.
// This file does not talk to Firebase and does not decide anything beyond:
// (1) what outcome value an evaluation maps to, and (2) whether reporting
// one is even appropriate right now — the two decisions kept here
// specifically so both are independently unit-testable without a
// component-rendering harness (this repo has none, and adding one would be
// a new dependency this phase explicitly disallows).

export function mcResultToStudyOutcome(evaluation: "correct" | "incorrect"): StudyOutcome {
  return evaluation === "correct" ? "solved" : "struggled";
}

// Whether picking an MC answer should ALSO report a study outcome at all.
// Both a real questionId and an authenticated student are required —
// recordStudyOutcome's own Cloud Function already rejects a non-student
// caller server-side, but checking here too means a teacher viewing their
// own posted question, or any call site that omits questionId entirely
// (every pre-Phase-25 caller), never even attempts the call.
export function shouldReportMcOutcome(
  questionId: string | null | undefined,
  isStudent: boolean | null | undefined,
): boolean {
  return Boolean(questionId) && isStudent === true;
}

// A tiny once-only latch: the exact "did this specific UI interaction
// already report an outcome" guard MultipleChoiceAnswer needs, extracted
// as its own pure, independently testable unit rather than inline
// component state that could only ever be exercised by rendering the
// component. `shouldProceed()` returns true (and flips permanently to
// false) on its FIRST call only — every call after that returns false,
// no matter how many times it's invoked.
export interface OnceGuard {
  shouldProceed(): boolean;
}

export function createOnceGuard(): OnceGuard {
  let used = false;
  return {
    shouldProceed(): boolean {
      if (used) return false;
      used = true;
      return true;
    },
  };
}
