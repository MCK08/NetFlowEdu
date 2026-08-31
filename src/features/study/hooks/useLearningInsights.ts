import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LearningEvent } from "@features/learningStory/services/learningTrail";
import { buildChronologyProfiles } from "../services/chronologyTieBreak";
import {
  ChronologyExplanation,
  resolveChronologyExplanation,
} from "../services/chronologyExplanation";
import { buildAdaptivePracticePlan } from "../services/dailyPracticePlan";
import { buildLearningInsights, LearningInsightItem } from "../services/learningInsights";
import { buildLearningMoment } from "../services/learningMoment";
import { buildLearningTrend, LearningTrend } from "../services/learningTrend";
import { resolveOutcomeHistory } from "../services/outcomeCounters";
import { mapStudyErrorToMessage } from "../services/studyErrorMapper";
import { getAllStudyItems, getRecentStudyDays, StudyDay, StudySummary } from "../services/studyService";
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
//
// Phase 25 — ONE additional bounded read per load() (getRecentStudyDays,
// limit 14 — see studyService.ts's own doc comment) fetched in the SAME
// Promise.all as the existing metadata resolution, so `load` still makes
// exactly one round trip's worth of latency, not a second sequential
// fetch. Everything else (mastery/recency/trend/adaptive plan/moment) is
// derived via useMemo from data already in state — no new listeners, no
// new fetch triggers beyond the ones this hook already had.
// Phase 61 — `chronologyEvents` is passed IN rather than fetched here.
//
// This hook has three mounts (Study Hub, the adaptive session, and Learning
// Story), and Learning Story already loads exactly these events through
// useLearningTrail. Fetching them here too would have read the same bounded
// query twice on that screen. Passing them in also keeps the fetch off any
// surface that only wants insights, so no new read reaches app launch or the
// student feed.
//
// Omitting it is fully supported: the plan then receives no chronology map
// and its ordering is byte-identical to Phase 60.
export function useLearningInsights(
  uid: string | undefined,
  summary: StudySummary,
  chronologyEvents: readonly LearningEvent[] = [],
) {
  const [items, setItems] = useState<LearningInsightItem[]>([]);
  const [recentDays, setRecentDays] = useState<StudyDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const activeUidRef = useRef(uid);
  activeUidRef.current = uid;

  const load = useCallback(async () => {
    if (!uid) {
      setItems([]);
      setRecentDays([]);
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const studyItems = await getAllStudyItems(uid);
      const [metadata, days] = await Promise.all([
        resolveQuestionMetadata(studyItems.map((item) => item.questionId)),
        getRecentStudyDays(uid),
      ]);
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
            successfulReviews: item.successfulReviews,
            lastReviewedAt: item.lastReviewedAt,
            // Phase 41 — resolved from fields the SAME getAllStudyItems call
            // above already returned. Zero additional Firestore reads.
            outcomeHistory: resolveOutcomeHistory({
              attemptCount: item.attemptCount,
              solvedCount: item.solvedCount ?? null,
              struggledCount: item.struggledCount ?? null,
              againCount: item.againCount ?? null,
            }),
          };
        }),
      );
      setRecentDays(days);
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

  // Phase 23 — derived from the SAME `items` and the insights' own
  // weakTopics/allTopics, so a plan is never a second fetch: it refreshes
  // on exactly the triggers insights already refreshes on (focus, outcome
  // recorded). Phase 25: buildAdaptivePracticePlan (not the plain
  // buildDailyPracticePlan) — same 4 tiers, same claim/dedupe, mastery- and
  // recency-aware ordering WITHIN each tier only (see its own doc comment).
  // Phase 61 — indexed ONCE per event set, not per comparison. The
  // comparator runs O(n log n) times, so filtering the event list inside it
  // would turn one bounded read into repeated work for no benefit.
  const chronologyByQuestionId = useMemo(
    () => buildChronologyProfiles(chronologyEvents),
    [chronologyEvents],
  );

  const plan = useMemo(
    () =>
      buildAdaptivePracticePlan({
        items,
        weakTopics: insights.weakTopics,
        topicInsights: insights.allTopics,
        now: Date.now(),
        reviewedToday: summary.reviewedToday,
        dailyGoal: summary.dailyGoal,
        chronologyByQuestionId,
      }),
    [
      items,
      insights.weakTopics,
      insights.allTopics,
      summary.reviewedToday,
      summary.dailyGoal,
      chronologyByQuestionId,
    ],
  );

  // Phase 61 — the counterfactual: the SAME plan with no chronology at all.
  // Pure and bounded, and the only way to know whether the timeline actually
  // changed the leading question or merely agreed with what Phase 41 had
  // already decided. See chronologyExplanation.ts.
  const baselinePlan = useMemo(
    () =>
      buildAdaptivePracticePlan({
        items,
        weakTopics: insights.weakTopics,
        topicInsights: insights.allTopics,
        now: Date.now(),
        reviewedToday: summary.reviewedToday,
        dailyGoal: summary.dailyGoal,
      }),
    [items, insights.weakTopics, insights.allTopics, summary.reviewedToday, summary.dailyGoal],
  );

  const chronologyExplanation: ChronologyExplanation | null = useMemo(
    () =>
      resolveChronologyExplanation({
        planItems: plan.planItems,
        baselinePlanItems: baselinePlan.planItems,
        chronologyByQuestionId,
      }),
    [plan.planItems, baselinePlan.planItems, chronologyByQuestionId],
  );

  // Phase 25 — real per-day server counters in, an honest trend out (see
  // learningTrend.ts: "insufficient_data" rather than a guess whenever the
  // sample is too thin or too short a span).
  const trend: LearningTrend = useMemo(() => buildLearningTrend(recentDays), [recentDays]);

  // A single deterministic sentence built from the SAME trend + weakTopics
  // already computed above — no new data, no invented text.
  const moment = useMemo(() => buildLearningMoment(trend, insights.weakTopics), [trend, insights.weakTopics]);

  return {
    // Exposed so callers can re-verify time-sensitive decisions (e.g. "is
    // anything due right now") against a fresher clock reading than
    // `plan`/`insights`' own memoized `now` — see studyDueCheck.ts. This is
    // the SAME array already held in this hook's state, not a new fetch.
    items,
    insights,
    plan,
    chronologyExplanation,
    trend,
    moment,
    isLoading,
    error,
    refresh: load,
  };
}
