import { useCallback, useEffect, useRef, useState } from "react";

import { resolveQuestionMetadata } from "@features/study/services/studyMetadataCache";

import { getRecentClassLearningEvents } from "../services/learningEventService";
import { LearningEvent } from "../services/learningTrail";
import { TEACHER_TIMELINE_QUERY_LIMIT } from "../services/teacherLearningTimeline";

// Phase 60 — one student's recent class chronology, fetched ON DEMAND.
//
// COST: exactly ONE bounded Firestore query per (student, class) the teacher
// actually opens, plus the SHARED question-metadata cache Student Performance
// already populates — subject/topic are joined from it rather than read per
// event, so there is no N+1 behind the join either.
//
// This hook is mounted only by the Student Performance screen. Teacher Feed,
// Class Performance and the class student list deliberately do NOT use it:
// running it per row would be exactly the fan-out Phase 50 avoided, and the
// timeline is only meaningful once a teacher has chosen one student.
//
// AUTHORIZATION: `classId` is not a filter of convenience. It is what makes
// the read provable under firestore.rules — the rule resolves
// `resource.data.sourceClassId` to confirm the caller teaches that class — and
// it is also what keeps a teacher scoped to their own classroom instead of a
// student's whole study life. Both ids therefore participate in the request
// identity below.
//
// FAILURE POSTURE: non-fatal by design. Student Performance's existing
// intelligence — Phase 42 state, Phase 44 evidence, Phase 47 action — is
// fully valid without a timeline, so a failure here empties this one section
// and never takes the screen down.
export function useTeacherLearningTimeline(
  studentId: string | undefined,
  classId: string | undefined,
) {
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const requestIdRef = useRef(0);
  // The pair this hook is currently showing. Checked again after every await
  // so a slow response for the previous student can never paint over the one
  // the teacher has since navigated to.
  const activeKeyRef = useRef<string | null>(null);
  const key = studentId && classId ? `${classId}|${studentId}` : null;
  activeKeyRef.current = key;

  const load = useCallback(async () => {
    if (!studentId || !classId) {
      setEvents([]);
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    const requestKey = `${classId}|${studentId}`;
    setIsLoading(true);
    setHasError(false);

    try {
      const stored = await getRecentClassLearningEvents(
        studentId,
        classId,
        TEACHER_TIMELINE_QUERY_LIMIT,
      );
      const metadata = await resolveQuestionMetadata(stored.map((event) => event.questionId));
      if (requestIdRef.current !== requestId || activeKeyRef.current !== requestKey) return;

      setEvents(
        stored.map((event) => {
          const question = metadata.get(event.questionId) ?? null;
          return {
            id: event.id,
            questionId: event.questionId,
            outcome: event.outcome,
            occurredAt: event.occurredAt,
            // "" when metadata cannot be resolved — the same legacy
            // convention learningInsights.ts uses. The timeline drops such
            // events rather than grouping them under an unnamed topic.
            subject: question?.subject ?? "",
            topic: question?.topic ?? "",
          };
        }),
      );
    } catch {
      if (requestIdRef.current !== requestId) return;
      // Emptied, not thrown: see the failure posture note above.
      setEvents([]);
      setHasError(true);
    } finally {
      if (requestIdRef.current === requestId) setIsLoading(false);
    }
  }, [studentId, classId]);

  useEffect(() => {
    // Clearing here rather than only in `load` is what prevents the previous
    // student's trail from being visible for the frame before the new query
    // resolves.
    setEvents([]);
    load();
  }, [load]);

  return { events, isLoading, hasError, refresh: load };
}
