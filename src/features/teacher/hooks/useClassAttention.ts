import { useClassAssignments } from "@features/assignments/hooks/useClassAssignments";

import { useClassActionCenter } from "./useClassActionCenter";
import { useClassPerformance } from "./useClassPerformance";

// Phase 111 — one class's attention list, composed ONCE.
//
// This is exactly what the Action Center route has always composed
// (TeacherActionCenterScreen): useClassPerformance → useClassAssignments →
// useClassActionCenter. Bugün, Aksiyonlar and the class page all need that
// same list, and three copies of the wiring could drift the day one of them
// changed. The builders stay the only authority; this adds no rule.
//
// COST — per class, unchanged from the Action Center route: the roster, one
// class-sourced study-item read per student, the shared question-metadata
// cache, one assignments query, and at most MAX_INSPECTED_ASSIGNMENTS
// submission reads. For ONE class — never fanned out across classes.
export function useClassAttention(classId: string | undefined) {
  const performance = useClassPerformance(classId);
  const classAssignments = useClassAssignments(classId);
  const actionCenter = useClassActionCenter({
    classId,
    topicHotspots: performance.topicHotspots,
    attentionCards: performance.attentionCards,
    assignments: classAssignments.assignments,
    studentEvidence: performance.studentEvidence,
  });

  // Escalations and follow-ups come from intervention outcomes, which need the
  // assignments: showing the list before both settle would present a partial
  // list as the complete one. Same gate the Action Center route uses.
  const isLoadingList = performance.isLoading || classAssignments.isLoading || actionCenter.isLoadingOutcomes;
  const outcomesMissing = Boolean(actionCenter.outcomesError || classAssignments.error);

  return {
    cards: performance.cards,
    assignments: classAssignments.assignments,
    items: actionCenter.items,
    summary: actionCenter.summary,
    isLoadingList,
    error: performance.error,
    outcomesMissing,
    studentCount: performance.cards.length,
    refresh: async () => {
      await Promise.all([performance.refresh(), classAssignments.refresh(), actionCenter.refreshOutcomes()]);
    },
  };
}

export type ClassAttention = ReturnType<typeof useClassAttention>;
