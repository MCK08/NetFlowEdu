import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildLearningInsights,
  LearningInsightItem,
  TopicInsight,
} from "@features/study/services/learningInsights";
import { resolveOutcomeHistory } from "@features/study/services/outcomeCounters";
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
// Phase 53 — everything Daily Flow needs about the student's own learning
// state, derived from the SAME single fetch this hook already performs.
// Exposed as its own object so a caller can pass it straight to
// buildStudentDailyFlow without reaching back into study internals.
export interface FeedLearningSnapshot {
  // buildLearningInsights' already-ranked weak topics — carried through
  // untouched, never re-ranked (see buildStudentDailyFlow's own note).
  weakTopics: TopicInsight[];
  // Study items due at the moment this snapshot was computed.
  dueCount: number;
  // Whether the student has any study item at all — separates "nothing
  // pending" from "brand new account" for the empty state.
  hasStudyHistory: boolean;
}

const EMPTY_SNAPSHOT: FeedLearningSnapshot = {
  weakTopics: [],
  dueCount: 0,
  hasStudyHistory: false,
};

export function useFeedPersonalizationSignals(uid: string | undefined) {
  const [signalsByQuestionId, setSignalsByQuestionId] = useState<Map<string, QuestionSignal>>(new Map());
  const [snapshot, setSnapshot] = useState<FeedLearningSnapshot>(EMPTY_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);

  const requestIdRef = useRef(0);
  const activeUidRef = useRef(uid);
  activeUidRef.current = uid;

  const load = useCallback(async () => {
    if (!uid) {
      setSignalsByQuestionId(new Map());
      setSnapshot(EMPTY_SNAPSHOT);
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
          // Phase 53 — resolved from fields the SAME getAllStudyItems call
          // above already returned, exactly as useLearningInsights does for
          // the Study Hub. Zero additional Firestore reads.
          //
          // Without this, every TopicInsight.struggledAttemptCount produced
          // from this hook was null — not because the student's history was
          // untrustworthy, but because the counters were never passed in. A
          // student with eight real recorded struggles therefore looked
          // identical to a legacy account with none, and Daily Flow's
          // (correct) "absence is not evidence" guard suppressed the
          // reinforcement row for them. Reproduced against the demo
          // fixtures before this was added.
          outcomeHistory: resolveOutcomeHistory({
            attemptCount: item.attemptCount,
            solvedCount: item.solvedCount ?? null,
            struggledCount: item.struggledCount ?? null,
            againCount: item.againCount ?? null,
          }),
        };
      });

      // Reuses the exact same topic bucketing/mastery/recency the Study
      // Hub renders — never a second implementation of that logic.
      //
      // Phase 53 — `weakTopics` comes out of this SAME call, which was
      // already being made and whose other outputs were already being
      // discarded. Daily Flow therefore costs zero additional Firestore
      // reads on top of what the feed already paid for personalization.
      //
      // reviewedToday/dailyGoal stay 0/0 deliberately: only the topic
      // rankings are read here, never the goal-capped plan, so passing a
      // real summary would change nothing and would require a second
      // listener this hook does not have.
      const { allTopics, weakTopics } = buildLearningInsights({
        items: insightItems,
        now,
        reviewedToday: 0,
        dailyGoal: 0,
      });
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
      setSnapshot({
        weakTopics,
        dueCount: studyItems.filter((item) => item.nextReviewAt <= now).length,
        hasStudyHistory: studyItems.length > 0,
      });
    } finally {
      if (requestIdRef.current === requestId) setIsLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  return { signalsByQuestionId, snapshot, isLoading, refresh: load };
}
