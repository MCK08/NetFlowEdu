import { useCallback, useEffect, useRef, useState } from "react";

import { shouldApplyStaleResponse } from "@features/study/services/staleResponseGuard";

import { Assignment, AssignmentSubmission } from "../domain/assignmentTypes";
import { getMySubmission, getStudentAssignments } from "../services/assignmentService";
import { resolveStudentAssignmentStatus, StudentAssignmentStatus } from "../services/assignmentProgress";

export interface StudentAssignmentCard {
  assignment: Assignment;
  submission: AssignmentSubmission | null;
  status: StudentAssignmentStatus;
}

function sortForStudent(cards: readonly StudentAssignmentCard[]): StudentAssignmentCard[] {
  // Not-yet-done work first (not_started/in_progress/past_due, in that
  // priority — a still-open assignment always outranks a past-due one the
  // student can no longer meaningfully act on before a completed one),
  // completed last; newest within each group first.
  const priority: Record<StudentAssignmentStatus, number> = {
    not_started: 0,
    in_progress: 0,
    past_due: 1,
    completed: 2,
  };
  return [...cards].sort((a, b) => {
    const delta = priority[a.status] - priority[b.status];
    if (delta !== 0) return delta;
    return b.assignment.createdAt - a.assignment.createdAt;
  });
}

// Spans every class the student is in — matches how their Daily Plan
// already aggregates across classes via studyItems (see
// dailyPracticePlan.ts). One extra read per assignment for its own
// submission doc — bounded by however many assignments actually target
// this student, never per-class or per-question.
export function useStudentAssignments(uid: string | undefined) {
  const [cards, setCards] = useState<StudentAssignmentCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!uid) {
      setCards([]);
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const assignments = await getStudentAssignments(uid);
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;

      const submissions = await Promise.all(
        assignments.map((assignment) => getMySubmission(assignment.id, uid)),
      );
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;

      const now = Date.now();
      const nextCards = assignments.map((assignment, index) => {
        const submission = submissions[index] ?? null;
        return {
          assignment,
          submission,
          status: resolveStudentAssignmentStatus({
            submission,
            targetCount: assignment.targetCount,
            dueAt: assignment.dueAt,
            now,
          }),
        };
      });
      setCards(sortForStudent(nextCards));
    } catch {
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setError("Ödevler yüklenemedi.");
    } finally {
      if (shouldApplyStaleResponse(requestId, requestIdRef.current)) setIsLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  return { cards, isLoading, error, refresh: load };
}
