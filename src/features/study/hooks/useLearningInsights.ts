import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildLearningInsights, LearningInsightItem } from "../services/learningInsights";
import { mapStudyErrorToMessage } from "../services/studyErrorMapper";
import { getAllStudyItems, StudySummary } from "../services/studyService";
import { resolveQuestionMetadata } from "../services/studyMetadataCache";

// Phase 22 — loads every study item once, joins it with its question's
// subject/topic (via the shared metadata cache, never one read per item),
// and derives the Hub's view-model with the pure buildLearningInsights.
//
// `summary` (reviewedToday/dailyGoal) comes from the CALLER, which already
// holds it live via useStudyQueue's own summary listener — this hook adds
// no second listener on studyMeta/summary, matching the existing "exactly
// one listener total" invariant studyService.ts documents for
// subscribeToStudySummary. Insights are re-derived via useMemo whenever
// EITHER the loaded items OR the live summary changes, so a review
// completing updates dailyProgress instantly without a re-fetch, and a
// re-fetch (refresh()) never has to know or care that the summary exists.
export function useLearningInsights(uid: string | undefined, summary: StudySummary) {
  const [items, setItems] = useState<LearningInsightItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const activeUidRef = useRef(uid);
  activeUidRef.current = uid;

  const load = useCallback(async () => {
    if (!uid) {
      setItems([]);
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const studyItems = await getAllStudyItems(uid);
      const metadata = await resolveQuestionMetadata(studyItems.map((item) => item.questionId));
      if (requestIdRef.current !== requestId || activeUidRef.current !== uid) return;

      setItems(
        studyItems.map((item) => {
          const question = metadata.get(item.questionId) ?? null;
          return {
            questionId: item.questionId,
            status: item.status,
            lastOutcome: item.lastOutcome,
            nextReviewAt: item.nextReviewAt,
            subject: question?.subject ?? "",
            topic: question?.topic ?? "",
          };
        }),
      );
    } catch (err) {
      if (requestIdRef.current !== requestId || activeUidRef.current !== uid) return;
      setError(mapStudyErrorToMessage(err));
    } finally {
      if (requestIdRef.current === requestId) setIsLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  const insights = useMemo(
    () =>
      buildLearningInsights({
        items,
        now: Date.now(),
        reviewedToday: summary.reviewedToday,
        dailyGoal: summary.dailyGoal,
      }),
    [items, summary.reviewedToday, summary.dailyGoal],
  );

  return { insights, isLoading, error, refresh: load };
}
