import { useMemo } from "react";

import {
  buildClassSemanticCohorts,
  ClassSemanticCohortSummary,
} from "../services/classSemanticCohorts";
import { InterventionCandidate } from "../services/teacherIntervention";

import { useClassSemanticEvidence } from "./useClassSemanticEvidence";

// Phase 81 — the class's shared semantic evidence, as cohorts.
//
// Phase 83 — the loading half (the bounded per-student fan-out, its
// concurrency cap, the metadata join and every honest word about its cost)
// moved to useClassSemanticEvidence so the vocabulary studio can read the same
// evidence on its own route. This hook now composes it and keeps only what is
// specific to cohorts: the pure build. Class Performance's behaviour, queries
// and cost are unchanged by the move.
//
// NO WRITES. Cohorts are derived on read, every time. Nothing is persisted:
// there is no cohort document, no score, no cached aggregate to go stale and
// no second source of truth about what the events say.
export function useClassSemanticCohorts(params: {
  classId: string | undefined;
  /** The roster this screen already loaded. Never re-fetched here. */
  students: readonly { studentUid: string; displayName: string }[];
  /** Phase 43's own candidate shape, passed through untouched. */
  interventionCandidates: readonly InterventionCandidate[];
  /** Phase 82 — definitionId to its CURRENT label, when the caller has the
   *  class vocabulary. Display only: it reaches the builder after every
   *  grouping decision is already made. */
  currentLabels?: ReadonlyMap<string, string>;
}) {
  const { classId, students, interventionCandidates, currentLabels } = params;

  const { evidence, isLoading, hasError, hasLoaded, refresh } = useClassSemanticEvidence({
    classId,
    students,
  });

  // Pure, and deliberately outside the fetch: Phase 43 eligibility is derived
  // from studyItems this screen already holds, so when it changes the cohorts
  // recompute against the SAME events at a cost of zero reads.
  const summary: ClassSemanticCohortSummary = useMemo(
    () =>
      buildClassSemanticCohorts({
        classId: classId ?? "",
        students: evidence,
        interventionCandidates,
        currentLabels,
      }),
    [classId, evidence, interventionCandidates, currentLabels],
  );

  // Before the first load has settled, Phase 81 reported `isLoading: true`
  // from mount; preserved so Class Performance's section never flashes an
  // empty state ahead of its data. An error is a settled state too — it must
  // reach the section's retry, not sit behind a spinner.
  return { summary, isLoading: isLoading || (!hasLoaded && !hasError), hasError, refresh };
}
