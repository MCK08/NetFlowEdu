import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAssignmentSubmissions } from "@features/assignments/services/assignmentService";
import { Assignment } from "@features/assignments/domain/assignmentTypes";
import { StudyOutcome } from "@features/study/domain/studyTypes";
import { shouldApplyStaleResponse } from "@features/study/services/staleResponseGuard";

import { ClassStudentEvidence } from "../services/classConceptHeatmap";
import {
  buildInterventionEffectiveness,
  InterventionAssignment,
  selectMostRecentIntervention,
  toInterventionEvidence,
} from "../services/interventionEffectiveness";
import { resolvePostInterventionAction } from "../services/postInterventionAction";
import { StudentInterventionOutcome } from "../services/teacherActionCenter";

// Phase 73 — Phase 47's verdicts, for the whole class, at bounded cost.
//
// WHY THIS EXISTS
//
// useInterventionEffectiveness answers the same question for ONE student, and
// it is what StudentPerformanceScreen uses. Running it per student to build a
// class view would be exactly the fan-out this phase forbids: one submission
// read for every student on the roster.
//
// THE COST ARGUMENT
//
// Submissions live under the ASSIGNMENT, not under the student, so one
// getAssignmentSubmissions call returns every student's submission for that
// intervention at once. The read count therefore scales with how many
// interventions are inspected — never with class size — and is capped below.
//
//   assignments      0 — ClassPerformanceScreen already loads them
//   submissions      at most MAX_INSPECTED_INTERVENTIONS queries
//   per student      0
//   per topic        0
//
// Study items are passed IN, from the rows useClassPerformance already
// fetched, so nothing here re-reads a student's learning history.

// The window of recent assignments Phase 44's selector is allowed to see.
// Fixed, so the read count depends on a class's recent assignment history and
// never on how many students are enrolled.
//
// The window holds ASSIGNMENTS, not just explicit interventions, because
// selectMostRecentIntervention's own contract is "explicit markers first,
// legacy assignments only when no explicit candidate exists". Pre-filtering to
// explicit ones here would silently disable that fallback at class level while
// leaving it active on the student's own screen — two different answers to the
// same question.
//
// A student whose newest relevant assignment falls outside the window keeps
// their verdict on their own Student Performance screen, which is unchanged; it
// simply does not surface in the class action list.
export const MAX_INSPECTED_ASSIGNMENTS = 8;

export interface ClassInterventionOutcomesView {
  outcomes: StudentInterventionOutcome[];
  isLoading: boolean;
  /** Non-fatal by design: the action center still renders its hotspot and
   *  student actions when this fails. */
  error: string | null;
  refresh: () => Promise<void>;
}

export function useClassInterventionOutcomes(
  classId: string | undefined,
  assignments: readonly Assignment[],
  studentEvidence: readonly ClassStudentEvidence[],
): ClassInterventionOutcomesView {
  const [submissionsByAssignment, setSubmissionsByAssignment] = useState<
    ReadonlyMap<string, ReadonlyMap<string, Readonly<Record<string, StudyOutcome>>>>
  >(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  // The window of recent assignments, newest first and capped. Derived from
  // assignments the caller already holds — no read.
  const inspected = useMemo(
    () =>
      assignments
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_INSPECTED_ASSIGNMENTS),
    [assignments],
  );

  // Phase 44's own selector decides, per student, which assignment their
  // verdict is about — explicit interventions first, legacy fallback second.
  // Running it BEFORE fetching is what keeps the read count down to the
  // assignments actually referenced, rather than the whole window.
  const selectedByStudent = useMemo(() => {
    const candidates = inspected as unknown as InterventionAssignment[];
    const map = new Map<string, InterventionAssignment>();
    for (const student of studentEvidence) {
      const selected = selectMostRecentIntervention(candidates, student.studentUid);
      if (selected) map.set(student.studentUid, selected);
    }
    return map;
  }, [inspected, studentEvidence]);

  const neededAssignmentIds = useMemo(
    () => [...new Set([...selectedByStudent.values()].map((a) => a.id))].sort(),
    [selectedByStudent],
  );

  const neededKey = useMemo(() => neededAssignmentIds.join(","), [neededAssignmentIds]);

  const load = useCallback(async () => {
    if (!classId || neededAssignmentIds.length === 0) {
      setSubmissionsByAssignment(new Map());
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      // One query per REFERENCED assignment — never one per student. Several
      // students targeted by the same intervention share a single read.
      const pages = await Promise.all(
        neededAssignmentIds.map(async (assignmentId) => {
          const submissions = await getAssignmentSubmissions(assignmentId);
          const byStudent = new Map<string, Readonly<Record<string, StudyOutcome>>>();
          for (const submission of submissions) {
            byStudent.set(submission.studentId, submission.questionOutcomes ?? {});
          }
          return [assignmentId, byStudent] as const;
        }),
      );
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setSubmissionsByAssignment(new Map(pages));
    } catch {
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setError("Müdahale sonuçları yüklenemedi.");
    } finally {
      if (shouldApplyStaleResponse(requestId, requestIdRef.current)) setIsLoading(false);
    }
    // Keyed on the assignment ids themselves so a re-derived array with the
    // same contents does not re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, neededKey]);

  useEffect(() => {
    load();
  }, [load]);

  const outcomes: StudentInterventionOutcome[] = useMemo(() => {
    const result: StudentInterventionOutcome[] = [];

    for (const student of studentEvidence) {
      const selected = selectedByStudent.get(student.studentUid);
      if (!selected) continue;

      const questionOutcomes =
        submissionsByAssignment.get(selected.id)?.get(student.studentUid) ?? {};

      const effectiveness = buildInterventionEffectiveness({
        interventionId: selected.id,
        interventionAt: selected.createdAt,
        questions: toInterventionEvidence({
          questionIds: selected.questionIds,
          questionOutcomes,
          studyItems: student.items.map((item) => ({
            questionId: item.questionId,
            status: item.status,
            lastOutcome: item.lastOutcome,
            successfulReviews: item.successfulReviews,
            attemptCount: item.attemptCount,
            solvedCount: item.solvedCount ?? null,
            struggledCount: item.struggledCount ?? null,
            againCount: item.againCount ?? null,
            lastReviewedAt: item.lastReviewedAt,
          })),
        }),
      });

      result.push({
        studentUid: student.studentUid,
        displayName: student.displayName,
        // Phase 47's resolver, unchanged. This hook holds no action logic.
        action: resolvePostInterventionAction(
          effectiveness.effectiveness,
          effectiveness.confidence,
        ),
        result: effectiveness,
      });
    }

    return result;
  }, [selectedByStudent, studentEvidence, submissionsByAssignment]);

  return { outcomes, isLoading, error, refresh: load };
}
