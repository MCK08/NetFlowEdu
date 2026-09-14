import { useMemo } from "react";

import { Assignment } from "@features/assignments/domain/assignmentTypes";

import { ClassStudentEvidence } from "../services/classConceptHeatmap";
import { ClassTopicHotspot } from "../services/classTopicInsights";
import { StudentAttentionCard } from "../services/studentAttention";
import {
  buildTeacherActionCenter,
  summarizeTeacherActionCenter,
  TeacherActionCenterItem,
  TeacherActionCenterSummary,
} from "../services/teacherActionCenter";
import { buildTeacherActionSummary } from "../services/teacherActionSummary";
import { useClassInterventionOutcomes } from "./useClassInterventionOutcomes";

// Phase 101 — the Phase 73 Action Center, composed in one place.
//
// Sınıf Performansı and the dedicated "Bugün Öne Çıkanlar" route both show
// this list. If each screen assembled it, the two could disagree about which
// actions exist the moment either one changed. So the assembly — Phase 47
// outcomes, Phase 27/43 hotspot and student actions, the Phase 73 builder, the
// summary cut — lives here and nowhere else.
//
// NO NEW DATA
//
// Everything is passed IN from hooks the caller already runs
// (useClassPerformance, useClassAssignments). The only fetch is the one
// useClassInterventionOutcomes has always made: at most MAX_INSPECTED_ASSIGNMENTS
// submission queries, never one per student. No classifier, no score, no
// ordering of its own: this hook calls the builders and returns what they say.

export interface ClassActionCenterView {
  /** The complete canonical list — what the full route renders. */
  items: TeacherActionCenterItem[];
  /** Its first MAX_ACTION_CENTER_ITEMS, plus whether anything was cut. */
  summary: TeacherActionCenterSummary;
  /** Phase 47 verdicts still loading. The hotspot and student actions do not
   *  wait on this, as before. */
  isLoadingOutcomes: boolean;
  /** Non-fatal, as before: without outcomes the list still holds its hotspot
   *  and student actions, but it is missing any escalation or follow-up. A
   *  surface that claims to be complete must say so. */
  outcomesError: string | null;
  refreshOutcomes: () => Promise<void>;
}

export function useClassActionCenter(params: {
  classId: string | undefined;
  topicHotspots: readonly ClassTopicHotspot[];
  attentionCards: readonly StudentAttentionCard[];
  assignments: readonly Assignment[];
  studentEvidence: readonly ClassStudentEvidence[];
}): ClassActionCenterView {
  const { classId, topicHotspots, attentionCards, assignments, studentEvidence } = params;

  const summaryActions = useMemo(
    () => buildTeacherActionSummary(topicHotspots, attentionCards),
    [topicHotspots, attentionCards],
  );

  const {
    outcomes,
    isLoading: isLoadingOutcomes,
    error: outcomesError,
    refresh: refreshOutcomes,
  } = useClassInterventionOutcomes(classId, assignments, studentEvidence);

  const items = useMemo(
    () => buildTeacherActionCenter({ outcomes, summaryActions }),
    [outcomes, summaryActions],
  );

  const summary = useMemo(() => summarizeTeacherActionCenter(items), [items]);

  return { items, summary, isLoadingOutcomes, outcomesError, refreshOutcomes };
}
