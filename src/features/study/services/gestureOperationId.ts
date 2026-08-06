import { StudyOutcome } from "../domain/studyTypes";

// Identity of one logical self-assessment gesture.
//
// The backend replay guard (functions/src/study/operationId.ts) collapses two
// calls carrying the same operationId into ONE recorded review. Deciding when
// to reuse an id is therefore a correctness decision, not a formatting one,
// and both surfaces that record outcomes (the review session and the
// question-level control) must decide it identically — hence one shared
// implementation instead of two look-alike blocks.

// One id per user GESTURE (not per network attempt). Lives here, not in
// studyService: generating an id needs no Firebase, and keeping it free of
// that import is what lets the gesture rules be unit-tested at all.
// Format must satisfy OPERATION_ID_PATTERN in
// functions/src/study/operationId.ts — a malformed id is REJECTED, not
// ignored. Not a security token; see that file for why guessing is harmless.
export function createOperationId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  const stamp = Date.now().toString(36);
  return `${stamp}-${random}`;
}

export interface GestureOperation {
  questionId: string;
  outcome: StudyOutcome;
  operationId: string;
}

/**
 * Returns the operation to use for a press, reusing the previous id only when
 * the press is a RETRY of the same gesture.
 *
 * Same question + same outcome => retry. The student pressed the same button
 * again after a failure; if the original call actually committed and only its
 * response was lost, reusing the id makes the server return the stored state
 * instead of recording a second review.
 *
 * Different outcome (or different question) => a new decision, which must be
 * recorded on its own. This is the case a questionId-only key would get
 * wrong: it would silently discard the student's changed answer.
 *
 * Known limit, stated rather than papered over: if a call commits, its
 * response is lost, AND the student then picks a DIFFERENT outcome, two
 * reviews are recorded. Distinguishing that from a genuine second decision is
 * not possible from the client, and over-collapsing would be the worse
 * failure — it would drop an answer the student actually gave.
 */
export function resolveGestureOperation(
  previous: GestureOperation | null,
  questionId: string,
  outcome: StudyOutcome,
): GestureOperation {
  if (previous && previous.questionId === questionId && previous.outcome === outcome) {
    return previous;
  }
  return { questionId, outcome, operationId: createOperationId() };
}
