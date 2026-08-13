// Pure decision behind StudySessionScreen's beforeRemove confirmation —
// mirrors src/features/answers/services/answerExitGuard.ts's exact pattern
// for the same class of problem: a network mutation in flight when the
// student backs out.
//
// submitOutcome (useReviewSession) / submit (useStudyQuestionState, via
// StudySessionAdaptiveCard) both await recordStudyOutcome before their
// caller's own "submitting" flag clears. Leaving mid-request was previously
// unguarded — the request itself is not aborted by leaving (it almost
// certainly still lands server-side), but the student gets no confirmation
// and no feedback that anything was in flight at all, unlike every other
// in-flight-mutation exit path this codebase already guards (AnswerScreen).
export interface StudySessionExitGuardState {
  isSubmitting: boolean;
}

export interface StudySessionExitGuardResult {
  blocked: boolean;
  message: string;
}

export const OUTCOME_SUBMITTING_MESSAGE =
  "Cevabın kaydediliyor. Şimdi çıkmak istediğine emin misin?";

const NOT_BLOCKED: StudySessionExitGuardResult = { blocked: false, message: "" };

export function resolveStudySessionExitGuard(
  state: StudySessionExitGuardState,
): StudySessionExitGuardResult {
  if (state.isSubmitting) {
    return { blocked: true, message: OUTCOME_SUBMITTING_MESSAGE };
  }
  return NOT_BLOCKED;
}
