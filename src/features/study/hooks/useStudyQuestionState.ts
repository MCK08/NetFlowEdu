import { useCallback, useRef, useState } from "react";

import { StudyOutcome } from "../domain/studyTypes";
import { GestureOperation, resolveGestureOperation } from "../services/gestureOperationId";
import { QuestionScoped, scopedValue, scopeToQuestion } from "../services/questionScopedState";
import { mapStudyErrorToMessage } from "../services/studyErrorMapper";
import { recordStudyOutcome } from "../services/studyService";
import { useStudyItemState } from "./useStudyItemState";

interface UseStudyQuestionStateOptions {
  questionId: string | null;
  enabled: boolean;
}

// The one hook a question surface needs: current study state + the mutation
// that changes it. Used by question detail and the class feed so neither
// re-implements hydration, the double-tap guard, or the operationId
// lifecycle.
//
// Both mutation-state fields are question-scoped (see questionScopedState):
// the class feed keeps this instance alive across a swipe, so unscoped state
// would render question A's spinner or error on question B's card.
export function useStudyQuestionState({ questionId, enabled }: UseStudyQuestionStateOptions) {
  const { item, isHydrating, hydrationError, applyOutcome, clear } = useStudyItemState({
    questionId,
    enabled,
  });
  const [pending, setPending] = useState<QuestionScoped<StudyOutcome> | null>(null);
  const [error, setError] = useState<QuestionScoped<string> | null>(null);

  const lockRef = useRef(false);
  // Held for the LIFETIME of one logical gesture, so a retry of that same
  // gesture reuses the id and the server collapses it to one review. Cleared
  // once the gesture succeeds, so a genuinely new press mints a new id. A
  // React re-render never touches it — it is a ref, not state. When to reuse
  // is decided by the shared resolveGestureOperation, which the review
  // session uses too, so the two surfaces cannot drift.
  const operationRef = useRef<GestureOperation | null>(null);

  // Returns the CONFIRMED operationId on success, or null on failure.
  //
  // Phase 18 needed a race-free "did the write actually land" signal here:
  // `mutationError` is React state and is not readable synchronously right
  // after `await submit()` in the caller's own closure. A boolean answered
  // that, and every existing caller tests it exactly that way
  // (`if (!succeeded) return`), which a non-empty string satisfies unchanged.
  //
  // Phase 68 returns the id itself rather than `true` because the adaptive
  // session now has to record WHICH logical outcome was confirmed, not merely
  // that one was. That id is the canonical idempotency key the write already
  // used (Phase 59), so the session receipt and the server's own replay guard
  // agree on identity by construction — the alternative was minting a second
  // key for the same event, which is how two records of one thing start to
  // disagree. Deliberately not exposed as state: only the caller that awaited
  // this exact call may have it, so a re-render can never re-deliver it.
  const submit = useCallback(
    async (outcome: StudyOutcome): Promise<string | null> => {
      if (!questionId || !enabled || lockRef.current) return null;
      lockRef.current = true;
      setPending(scopeToQuestion(questionId, outcome));
      setError(null);

      const operation = resolveGestureOperation(operationRef.current, questionId, outcome);
      operationRef.current = operation;

      try {
        const result = await recordStudyOutcome(questionId, outcome, operation.operationId);
        // The questionId this mutation was issued FOR is passed explicitly —
        // the active question may have changed while it was in flight.
        applyOutcome(questionId, outcome, result);
        // Gesture completed — the next press is a genuinely new action.
        operationRef.current = null;
        return operation.operationId;
      } catch (caught) {
        // Previous state is deliberately NOT touched: a failed write must
        // not make the UI claim a status the server never accepted. The id
        // is kept so an explicit retry of this same gesture stays idempotent.
        setError(scopeToQuestion(questionId, mapStudyErrorToMessage(caught)));
        return null;
      } finally {
        lockRef.current = false;
        setPending(null);
      }
    },
    [questionId, enabled, applyOutcome],
  );

  // Called after removeStudyItem succeeds elsewhere.
  const clearState = useCallback(() => {
    operationRef.current = null;
    setError(null);
    clear();
  }, [clear]);

  return {
    item,
    isHydrating,
    hydrationError,
    pendingOutcome: scopedValue(pending, questionId),
    mutationError: scopedValue(error, questionId),
    submit,
    clearState,
  };
}
