import { useCallback, useEffect, useRef, useState } from "react";

import { StudyOutcome } from "../domain/studyTypes";
import { mapStudyErrorToMessage } from "../services/studyErrorMapper";
import {
  applyOutcomeResult,
  HydratedStudyItem,
  parseStudyItem,
  retainItemForQuestion,
  shouldApplyHydration,
  shouldApplyOutcome,
} from "../services/studyItemParser";
import { fetchStudyItemRaw, RecordOutcomeResult } from "../services/studyService";

interface UseStudyItemStateOptions {
  questionId: string | null;
  // Study items exist only for students. Passing false means "never issue a
  // request at all" — a teacher must not even open a read.
  enabled: boolean;
}

// Hydrates the caller's OWN study state for one question.
//
// One-shot read, not a listener: the detail/feed surfaces only need the
// state as of open, and every mutation returns the authoritative new state
// inline (see applyOutcome below). This keeps the feature's listener count
// at exactly one (the dashboard summary) no matter how many cards mount.
export function useStudyItemState({ questionId, enabled }: UseStudyItemStateOptions) {
  const [item, setItem] = useState<HydratedStudyItem | null>(null);
  const [isHydrating, setIsHydrating] = useState(false);
  const [hydrationError, setHydrationError] = useState<string | null>(null);

  // Bumped per request; combined with the questionId check this is what
  // stops a slow response for question A from being written onto question B.
  const generationRef = useRef(0);
  const currentQuestionIdRef = useRef<string | null>(questionId);
  currentQuestionIdRef.current = questionId;

  useEffect(() => {
    if (!enabled || !questionId) {
      // Clearing here is what makes switching to a teacher account (or to a
      // card with no question) drop the previous student's state instead of
      // leaving it on screen.
      setItem(null);
      setIsHydrating(false);
      setHydrationError(null);
      return;
    }

    const generation = ++generationRef.current;
    const requestedQuestionId = questionId;
    // Drop state belonging to a DIFFERENT question before the new read
    // resolves. Without this, swiping in the class feed from a question
    // marked "Çözdüm" to an unstudied one left that outcome highlighted on
    // the new card for the duration of the fetch — the buttons read
    // item.lastOutcome, which isHydrating does not gate.
    setItem((previous) => retainItemForQuestion(previous, requestedQuestionId));
    setIsHydrating(true);
    setHydrationError(null);

    fetchStudyItemRaw(requestedQuestionId)
      .then((raw) => {
        if (
          !shouldApplyHydration({
            requestedQuestionId,
            currentQuestionId: currentQuestionIdRef.current ?? "",
            requestGeneration: generation,
            currentGeneration: generationRef.current,
          })
        ) {
          return;
        }
        setItem(parseStudyItem(requestedQuestionId, raw));
      })
      .catch((error) => {
        if (generationRef.current !== generation) return;
        setHydrationError(mapStudyErrorToMessage(error));
      })
      .finally(() => {
        if (generationRef.current === generation) setIsHydrating(false);
      });
  }, [questionId, enabled]);

  // Records the server's authoritative response after a successful outcome.
  // A FAILED outcome never calls this, so the previous state is preserved.
  //
  // The questionId the mutation was issued FOR is passed in explicitly and
  // re-checked here. In the class feed the active question can change while
  // a callable is in flight; resolving the target from the ref at apply time
  // would have written question A's result onto question B. The write is
  // dropped rather than misattributed — the server already recorded it, so
  // the next hydration of A shows the truth.
  const applyOutcome = useCallback(
    (targetQuestionId: string, outcome: StudyOutcome, result: RecordOutcomeResult) => {
      if (!shouldApplyOutcome({ targetQuestionId, currentQuestionId: currentQuestionIdRef.current }))
        return;
      setItem((previous) => applyOutcomeResult(previous, targetQuestionId, outcome, result));
    },
    [],
  );

  // After removeStudyItem succeeds the question is genuinely out of the
  // plan — the visible state must go back to "not in plan", not linger.
  const clear = useCallback(() => setItem(null), []);

  return { item, isHydrating, hydrationError, applyOutcome, clear };
}
