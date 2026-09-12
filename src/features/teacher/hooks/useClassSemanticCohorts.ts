import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getRecentClassLearningEvents } from "@features/learningStory/services/learningEventService";
import { LearningEvent } from "@features/learningStory/services/learningTrail";
import { TEACHER_TIMELINE_QUERY_LIMIT } from "@features/learningStory/services/teacherLearningTimeline";
import { resolveQuestionMetadata } from "@features/study/services/studyMetadataCache";
import { shouldApplyStaleResponse } from "@features/study/services/staleResponseGuard";

import { mapWithConcurrency } from "../services/boundedConcurrency";
import {
  buildClassSemanticCohorts,
  ClassSemanticCohortSummary,
  ClassSemanticStudentEvidence,
} from "../services/classSemanticCohorts";
import { InterventionCandidate } from "../services/teacherIntervention";

// Caps simultaneous per-student event queries. The same number, the same
// helper and the same reasoning as useClassPerformance's own fan-out — one
// convention for "don't fire 30 queries in the same tick", not a second.
const STUDENT_EVENT_CONCURRENCY = 8;

// Phase 81 — the class's shared semantic evidence.
//
// COST, honestly stated. N = number of student members:
//   N bounded queries — one getRecentClassLearningEvents per student, each
//     capped at TEACHER_TIMELINE_QUERY_LIMIT and each filtered by
//     `sourceClassId`, which is what makes the read PROVABLE under
//     firestore.rules (the teacher branch resolves that exact field) as well
//     as what scopes a teacher to their own classroom.
//   + the distinct questions behind those events, resolved ONCE through the
//     shared studyMetadataCache — already warm, because useClassPerformance
//     resolved this class's questions moments earlier on this same screen.
//
// That is a bounded per-student fan-out, and calling it anything else would be
// dishonest. It is NOT a nested N+1: nothing is read per event, per cohort or
// per definition, and the theoretical ceiling is N x TEACHER_TIMELINE_QUERY_LIMIT
// documents for the whole section.
//
// WHY NOT A COLLECTION-GROUP QUERY
//
// One `collectionGroup('studyEvents')` read would replace N queries with 1.
// It would also be this repository's first cross-student studyEvents surface,
// requiring a new rule that permits reading events the caller does not own
// across every user document in the database, plus a new composite index. The
// existing per-student path already has a proven rule, a declared index and a
// year of precedent. Trading that for a tidier cost table would be buying a
// number with a security boundary.
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

  const [evidence, setEvidence] = useState<ClassSemanticStudentEvidence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const requestIdRef = useRef(0);

  // The roster as a stable string, so the fetch below re-runs when WHO is in
  // the class changes and not merely because the parent re-rendered and handed
  // over a new array with the same people in it.
  const rosterKey = students.map((student) => student.studentUid).join(",");

  // Read through a ref rather than a dependency: the names are needed to label
  // the evidence, but a display-name change is not a reason to re-query every
  // student's history.
  const studentsRef = useRef(students);
  studentsRef.current = students;

  const load = useCallback(async () => {
    if (!classId || !rosterKey) {
      setEvidence([]);
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setHasError(false);

    const roster = studentsRef.current;
    try {
      const eventsByStudent = await mapWithConcurrency(roster, STUDENT_EVENT_CONCURRENCY, (student) =>
        getRecentClassLearningEvents(student.studentUid, classId, TEACHER_TIMELINE_QUERY_LIMIT),
      );
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;

      const questionIds = [...new Set(eventsByStudent.flat().map((event) => event.questionId))];
      const metadata = await resolveQuestionMetadata(questionIds);
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;

      setEvidence(
        roster.map((student, index) => ({
          studentUid: student.studentUid,
          displayName: student.displayName,
          events: (eventsByStudent[index] ?? []).map((event): LearningEvent => {
            const question = metadata.get(event.questionId) ?? null;
            return {
              id: event.id,
              questionId: event.questionId,
              outcome: event.outcome,
              occurredAt: event.occurredAt,
              // "" when metadata will not resolve — the convention every other
              // surface uses. The aggregator drops such events rather than
              // grouping them under an invented heading.
              subject: question?.subject ?? "",
              topic: question?.topic ?? "",
              semanticChoice: event.semanticChoice,
              semanticOpportunities: event.semanticOpportunities,
            };
          }),
        })),
      );
    } catch {
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      // Emptied, not thrown. Everything else on Class Performance — Phase 42
      // states, Phase 43 actions, the Action Center, the heatmap — is fully
      // valid without this section, so a failure here must cost one section
      // and never the screen.
      setEvidence([]);
      setHasError(true);
    } finally {
      if (shouldApplyStaleResponse(requestId, requestIdRef.current)) setIsLoading(false);
    }
  }, [classId, rosterKey]);

  useEffect(() => {
    load();
  }, [load]);

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

  return { summary, isLoading, hasError, refresh: load };
}
