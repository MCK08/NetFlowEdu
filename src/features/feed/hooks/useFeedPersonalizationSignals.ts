import { useCallback, useEffect, useRef, useState } from "react";

import { buildLearningInsights, LearningInsightItem } from "@features/study/services/learningInsights";
import { getAllStudyItems } from "@features/study/services/studyService";
import { resolveQuestionMetadata } from "@features/study/services/studyMetadataCache";

import { QuestionSignal } from "../services/feedRanking";

// Phase 26 — the Akış feed's OWN read of the exact same data
// useLearningInsights (Phase 22/25) already reads for the Study Hub:
// getAllStudyItems + the shared studyMetadataCache. ZERO new Firestore
// queries — this is a second CONSUMER of already-existing, already-cached
// reads, not a second data source. buildLearningInsights (unmodified) does
// the topic bucketing/mastery/recency work; this hook only reshapes that
// output into the per-QUESTION lookup buildQuestionFeedRanking needs.
export function useFeedPersonalizationSignals(uid: string | undefined) {
  const [signalsByQuestionId, setSignalsByQuestionId] = useState<Map<string, QuestionSignal>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const requestIdRef = useRef(0);
  const activeUidRef = useRef(uid);
  activeUidRef.current = uid;

  const load = useCallback(async () => {
    if (!uid) {
      setSignalsByQuestionId(new Map());
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);

    try {
      const studyItems = await getAllStudyItems(uid);
      const metadata = await resolveQuestionMetadata(studyItems.map((item) => item.questionId));
      if (requestIdRef.current !== requestId || activeUidRef.current !== uid) return;

      const now = Date.now();
      const insightItems: LearningInsightItem[] = studyItems.map((item) => {
        const question = metadata.get(item.questionId) ?? null;
        return {
          questionId: item.questionId,
          status: item.status,
          lastOutcome: item.lastOutcome,
          nextReviewAt: item.nextReviewAt,
          subject: question?.subject ?? "",
          topic: question?.topic ?? "",
          successfulReviews: item.successfulReviews,
          lastReviewedAt: item.lastReviewedAt,
        };
      });

      // Reuses the exact same topic bucketing/mastery/recency the Study
      // Hub renders — never a second implementation of that logic.
      const { allTopics } = buildLearningInsights({ items: insightItems, now, reviewedToday: 0, dailyGoal: 0 });
      const topicByKey = new Map(allTopics.map((topic) => [`${topic.subject} ${topic.topic}`, topic]));

      const next = new Map<string, QuestionSignal>();
      for (const item of studyItems) {
        const question = metadata.get(item.questionId) ?? null;
        const topic =
          question && question.subject && question.topic
            ? topicByKey.get(`${question.subject} ${question.topic}`) ?? null
            : null;
        next.set(item.questionId, {
          isDue: item.nextReviewAt <= now,
          lastOutcome: item.lastOutcome,
          masteryBand: topic?.masteryBand ?? null,
          recency: topic?.recency ?? null,
        });
      }

      setSignalsByQuestionId(next);
    } finally {
      if (requestIdRef.current === requestId) setIsLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  return { signalsByQuestionId, isLoading, refresh: load };
}
