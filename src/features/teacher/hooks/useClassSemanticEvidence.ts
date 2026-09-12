import { useCallback, useEffect, useRef, useState } from "react";

import { getRecentClassLearningEvents } from "@features/learningStory/services/learningEventService";
import { LearningEvent } from "@features/learningStory/services/learningTrail";
import { TEACHER_TIMELINE_QUERY_LIMIT } from "@features/learningStory/services/teacherLearningTimeline";
import { resolveQuestionMetadata } from "@features/study/services/studyMetadataCache";
import { shouldApplyStaleResponse } from "@features/study/services/staleResponseGuard";

import { mapWithConcurrency } from "../services/boundedConcurrency";
import { ClassSemanticStudentEvidence } from "../services/classSemanticCohorts";

// Caps simultaneous per-student event queries. The same number, the same
// helper and the same reasoning as useClassPerformance's own fan-out — one
// convention for "don't fire 30 queries in the same tick", not a second.
export const STUDENT_EVENT_CONCURRENCY = 8;

/** The per-student event bound, re-exported so a caller can state the exact
 *  window in its own copy rather than promising "recent". */
export const STUDENT_EVENT_BOUND = TEACHER_TIMELINE_QUERY_LIMIT;

export interface ClassSemanticStudentRef {
  studentUid: string;
  displayName: string;
}

// Phase 83 — the class's shared semantic evidence, loaded ONCE for a route.
//
// This is the LOAD half of Phase 81's useClassSemanticCohorts, lifted out
// unchanged so the vocabulary studio can read the same evidence on its own
// route without a second, drifting fan-out implementation. Phase 81's hook now
// composes this; Class Performance behaves exactly as before.
//
// COST, honestly stated. N = number of student members:
//   N bounded queries — one getRecentClassLearningEvents per student, each
//     capped at STUDENT_EVENT_BOUND and each filtered by `sourceClassId`,
//     which is what makes the read PROVABLE under firestore.rules (the teacher
//     branch resolves that exact field) as well as what scopes a teacher to
//     their own classroom.
//   + the distinct questions behind those events, resolved ONCE through the
//     shared studyMetadataCache.
//
// That is a bounded per-student fan-out, and calling it anything else would be
// dishonest. It is NOT a nested N+1: nothing is read per event, per cohort,
// per definition or per evidence row, and the theoretical ceiling is
// N x STUDENT_EVENT_BOUND documents for the whole route.
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
// LAZY, THEN CACHED
//
// `enabled` lets a route defer the fan-out until evidence is actually wanted
// (the vocabulary studio waits for a definition to be selected), and once
// loaded the evidence is held for the life of the mount: switching from one
// definition to another is a lookup in memory, never another class read.
//
// NO WRITES. Evidence is derived on read, every time. Nothing is persisted:
// there is no evidence document, no score, no cached aggregate to go stale and
// no second source of truth about what the events say.
export function useClassSemanticEvidence(params: {
  classId: string | undefined;
  /** The roster the caller already holds. Never re-fetched here. */
  students: readonly ClassSemanticStudentRef[];
  /** False keeps the fan-out from running at all. Flipping it to true starts
   *  exactly one load; flipping it back does not discard what was loaded. */
  enabled?: boolean;
}) {
  const { classId, students, enabled = true } = params;

  const [evidence, setEvidence] = useState<ClassSemanticStudentEvidence[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

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
      // Nothing to read is a settled result, not a pending one: an empty
      // roster must show the empty state, never a spinner.
      setEvidence([]);
      setIsLoading(false);
      setHasLoaded(true);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setHasError(false);

    const roster = studentsRef.current;
    try {
      const eventsByStudent = await mapWithConcurrency(roster, STUDENT_EVENT_CONCURRENCY, (student) =>
        getRecentClassLearningEvents(student.studentUid, classId, STUDENT_EVENT_BOUND),
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
      setHasLoaded(true);
    } catch {
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      // Emptied, not thrown. Whatever else the route shows is fully valid
      // without this evidence, so a failure here must cost one section and
      // never the screen. `hasLoaded` stays false so the caller can tell an
      // error apart from a genuine zero.
      setEvidence([]);
      setHasError(true);
    } finally {
      if (shouldApplyStaleResponse(requestId, requestIdRef.current)) setIsLoading(false);
    }
  }, [classId, rosterKey]);

  useEffect(() => {
    if (!enabled) return;
    load();
  }, [enabled, load]);

  return { evidence, isLoading, hasError, hasLoaded, refresh: load };
}
