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

  // Returns whether the mutation actually succeeded — additive (every
  // existing caller that ignores the return value keeps working unchanged).
  // Phase 18 needs this: the class feed only advances/reinjects a struggled
  // question for its session-local "second chance" after the write is
  // CONFIRMED, not merely attempted — `mutationError` is React state and
  // isn't readable synchronously right after `await submit()` in the
  // caller's own closure, so a boolean return is the only race-free signal.
  const submit = useCallback(
    async (outcome: StudyOutcome): Promise<boolean> => {
      if (!questionId || !enabled || lockRef.current) return false;
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
        return true;
      } catch (caught) {
        // Previous state is deliberately NOT touched: a failed write must
        // not make the UI claim a status the server never accepted. The id
        // is kept so an explicit retry of this same gesture stays idempotent.
        setError(scopeToQuestion(questionId, mapStudyErrorToMessage(caught)));
        return false;
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
