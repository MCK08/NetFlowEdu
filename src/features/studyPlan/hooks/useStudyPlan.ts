import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useStudentAssignments } from "@features/assignments/hooks/useStudentAssignments";
import { buildAdaptivePracticePlan } from "@features/study/services/dailyPracticePlan";
import { buildLearningInsights } from "@features/study/services/learningInsights";
import { EMPTY_SUMMARY, StudySummary, subscribeToStudySummary } from "@features/study/services/studyService";
import { useStudentAnalytics } from "@features/studentAnalytics/hooks/useStudentAnalytics";

import { buildDailyPlan, DailyPlan, PlanPreferences } from "../services/dailyPlan";
import { localDayKey } from "../services/planDay";
import { loadPlanStore, savePlanStore } from "../services/planStorage";
import {
  EMPTY_PLAN_STORE,
  PlanStore,
  skippedStepsForDay,
  withCompletedDay,
  withPreferences,
  withSkippedStep,
  withoutSkippedStep,
} from "../services/planStore";

// Phase 108 — the one data path behind every "Çalışma Planım" screen.
//
// DATA COST — nothing new
//
// The study items and their metadata come from useStudentAnalytics (Phase
// 107's single bounded query + the shared metadata cache); the assignments
// from useStudentAssignments; the daily goal and today's count from the
// summary listener the Hub already holds. The plan, the adaptive plan it
// consults and the insights it needs are derived in memory. No listener on
// study items, no per-step read, no community read at all (the community
// tie-breaker is optional and this hook never fetches it — the plan is
// personal by construction).
//
// STABILITY
//
// The plan is a pure function of (items, adaptive plan, assignments, day,
// preferences, today's skips). Reopening the screen re-derives the same
// plan; recording an outcome changes exactly the step that outcome touched
// (its worked-today count, or its completion) and nothing else, because the
// ordering keys are topics and ids, not scores that drift.
export function useStudyPlan(uid: string | undefined) {
  const analytics = useStudentAnalytics(uid);
  const assignments = useStudentAssignments(uid);
  const [summary, setSummary] = useState<StudySummary>(EMPTY_SUMMARY);
  const [store, setStore] = useState<PlanStore>(EMPTY_PLAN_STORE);
  const [isStoreLoaded, setIsStoreLoaded] = useState(false);
  const activeUidRef = useRef(uid);
  activeUidRef.current = uid;

  useEffect(() => {
    if (!uid) {
      setSummary(EMPTY_SUMMARY);
      return;
    }
    return subscribeToStudySummary(uid, setSummary);
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    setIsStoreLoaded(false);
    if (!uid) {
      setStore(EMPTY_PLAN_STORE);
      setIsStoreLoaded(true);
      return;
    }
    loadPlanStore(uid).then((loaded) => {
      if (cancelled || activeUidRef.current !== uid) return;
      setStore(loaded);
      setIsStoreLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const persist = useCallback(
    (next: PlanStore) => {
      setStore(next);
      if (uid) void savePlanStore(uid, next);
    },
    [uid],
  );

  // "Now" is when the items were read (see useStudentAnalytics), so the
  // plan is stable between renders of one snapshot and moves on reload.
  const now = analytics.loadedAt;

  const adaptivePlan = useMemo(() => {
    const insights = buildLearningInsights({
      items: analytics.items,
      now,
      reviewedToday: summary.reviewedToday,
      dailyGoal: summary.dailyGoal,
    });
    return buildAdaptivePracticePlan({
      items: analytics.items,
      weakTopics: insights.weakTopics,
      topicInsights: insights.allTopics,
      now,
      reviewedToday: summary.reviewedToday,
      dailyGoal: summary.dailyGoal,
    });
  }, [analytics.items, now, summary.reviewedToday, summary.dailyGoal]);

  const plan: DailyPlan = useMemo(
    () =>
      buildDailyPlan({
        items: analytics.items,
        adaptivePlan,
        assignmentCards: assignments.cards,
        now,
        preferences: store.preferences,
        skippedStepIds: skippedStepsForDay(store, localDayKey(now)),
      }),
    [analytics.items, adaptivePlan, assignments.cards, now, store],
  );

  // Record a completed day once, from evidence: every step completed or
  // skipped, and at least one completed.
  useEffect(() => {
    if (!isStoreLoaded || !analytics.hasLoaded || !plan.isComplete) return;
    const existing = store.completedDays.find((day) => day.dayKey === plan.dayKey);
    if (
      existing &&
      existing.stepsCompleted === plan.completedCount &&
      existing.stepsTotal === plan.steps.length &&
      existing.revisitWorked === plan.revisitWorkedToday
    ) {
      return;
    }
    persist(
      withCompletedDay(store, {
        dayKey: plan.dayKey,
        stepsTotal: plan.steps.length,
        stepsCompleted: plan.completedCount,
        revisitWorked: plan.revisitWorkedToday,
      }),
    );
  }, [isStoreLoaded, analytics.hasLoaded, plan, store, persist]);

  const skipStep = useCallback((stepId: string) => persist(withSkippedStep(store, plan.dayKey, stepId)), [persist, store, plan.dayKey]);
  const unskipStep = useCallback(
    (stepId: string) => persist(withoutSkippedStep(store, plan.dayKey, stepId)),
    [persist, store, plan.dayKey],
  );
  const setPreferences = useCallback(
    (preferences: PlanPreferences) => persist(withPreferences(store, preferences)),
    [persist, store],
  );

  const refreshAnalytics = analytics.refresh;
  const refreshAssignments = assignments.refresh;
  const refresh = useCallback(() => {
    refreshAnalytics();
    refreshAssignments();
  }, [refreshAnalytics, refreshAssignments]);

  return {
    plan,
    items: analytics.items,
    summary,
    preferences: store.preferences,
    completedDays: store.completedDays,
    now,
    isLoading: analytics.isLoading || assignments.isLoading || !isStoreLoaded,
    hasLoaded: analytics.hasLoaded && isStoreLoaded,
    error: analytics.error ?? assignments.error,
    refresh,
    skipStep,
    unskipStep,
    setPreferences,
  };
}
