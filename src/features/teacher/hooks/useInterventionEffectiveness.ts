import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getClassAssignments, getMySubmission } from "@features/assignments/services/assignmentService";
import { StudyOutcome } from "@features/study/domain/studyTypes";
import { shouldApplyStaleResponse } from "@features/study/services/staleResponseGuard";

import {
  buildInterventionEffectiveness,
  InterventionAssignment,
  InterventionEffectivenessResult,
  InterventionStudyItem,
  selectMostRecentIntervention,
  toInterventionEvidence,
} from "../services/interventionEffectiveness";

// Phase 44 — "did the intervention work?", wired to the screen that offers
// the intervention in the first place (StudentPerformanceScreen, Phase 43).
//
// READS: exactly 2, both bounded and both through existing service
// functions — getClassAssignments (one single-field query, no composite
// index, the same one ClassPerformanceScreen already calls) and ONE
// submission document for this student. No per-question read, no fan-out
// across the class, no new collection, no new Cloud Function, no rules
// change. `getMySubmission` is a plain path read whose "my" name comes from
// the student flow it was written for; a teacher reading one of their own
// class's submissions is already permitted by firestore.rules' existing
// teacher branch, so this needs nothing new there either.
//
// The student's live study items are NOT fetched here. They are passed in,
// because useStudentPerformanceDetail has already loaded exactly that set
// for the same screen — re-reading them would be a second copy of the same
// data and a second source of truth for what "now" looks like.
//
// This hook holds no learning logic of its own: it fetches, then hands
// everything to the pure services (selectMostRecentIntervention →
// toInterventionEvidence → buildInterventionEffectiveness). Everything the
// verdict depends on is unit-testable without Firebase.

export interface InterventionEffectivenessView {
  // The assignment the verdict is about, so a caller can name it without a
  // second lookup. Null whenever there is no verdict to show.
  intervention: InterventionAssignment | null;
  result: InterventionEffectivenessResult | null;
  isLoading: boolean;
  // Non-fatal by design: this is a supplementary card on a screen that must
  // keep working without it, so the caller renders nothing rather than
  // replacing the whole screen with an error.
  error: string | null;
  refresh: () => Promise<void>;
}

export function useInterventionEffectiveness(
  classId: string | undefined,
  studentUid: string | undefined,
  studyItems: readonly InterventionStudyItem[],
): InterventionEffectivenessView {
  const [intervention, setIntervention] = useState<InterventionAssignment | null>(null);
  const [questionOutcomes, setQuestionOutcomes] = useState<Readonly<Record<string, StudyOutcome>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!classId || !studentUid) {
      setIntervention(null);
      setQuestionOutcomes({});
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const assignments = await getClassAssignments(classId);
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;

      const selected = selectMostRecentIntervention(assignments, studentUid);
      if (!selected) {
        // No delivered assignment ever targeted this student — nothing to
        // measure, and not an error.
        setIntervention(null);
        setQuestionOutcomes({});
        return;
      }

      const submission = await getMySubmission(selected.id, studentUid);
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;

      setIntervention(selected);
      // A student who never started the assignment has no submission at all
      // — an empty record, which resolveStateAtIntervention correctly reads
      // as "insufficient_data" rather than as a struggle-free result.
      setQuestionOutcomes(submission?.questionOutcomes ?? {});
    } catch {
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setError("Müdahale sonucu yüklenemedi.");
    } finally {
      if (shouldApplyStaleResponse(requestId, requestIdRef.current)) setIsLoading(false);
    }
  }, [classId, studentUid]);

  useEffect(() => {
    load();
  }, [load]);

  // Recomputed when the caller's study items change (e.g. the screen
  // refreshed) WITHOUT re-reading the assignment — the frozen side of the
  // comparison cannot change, so there is nothing to re-fetch for it.
  const result = useMemo(() => {
    if (!intervention) return null;
    return buildInterventionEffectiveness({
      interventionId: intervention.id,
      interventionAt: intervention.createdAt,
      questions: toInterventionEvidence({
        questionIds: intervention.questionIds,
        questionOutcomes,
        studyItems,
      }),
    });
  }, [intervention, questionOutcomes, studyItems]);

  return { intervention, result, isLoading, error, refresh: load };
}
