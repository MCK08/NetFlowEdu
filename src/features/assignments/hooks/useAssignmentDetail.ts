import { useCallback, useEffect, useRef, useState } from "react";

import { getClassMembers } from "@services/firebase/classes";
import { shouldApplyStaleResponse } from "@features/study/services/staleResponseGuard";

import { Assignment } from "../domain/assignmentTypes";
import { getAssignmentById, getAssignmentSubmissions } from "../services/assignmentService";
import { buildTeacherAssignmentProgress, TeacherAssignmentProgressSummary } from "../services/teacherAssignmentProgress";
import { buildAssignmentOutcomeInsights, AssignmentOutcomeInsights } from "../services/assignmentOutcomeInsights";
import { buildAssignmentFollowUp, AssignmentFollowUpEntry } from "../services/assignmentFollowUp";

// Standalone (like useStudentPerformanceDetail) — works from a direct
// navigation, does not depend on useClassAssignments having already run.
// 3 reads total: the assignment doc, its full member roster (to resolve
// displayName + to list every TARGETED student even if they never
// started), and its submissions subcollection — no per-student read, no
// N+1.
export function useAssignmentDetail(assignmentId: string | undefined) {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [progress, setProgress] = useState<TeacherAssignmentProgressSummary | null>(null);
  const [outcomeInsights, setOutcomeInsights] = useState<AssignmentOutcomeInsights | null>(null);
  const [followUp, setFollowUp] = useState<AssignmentFollowUpEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!assignmentId) {
      setAssignment(null);
      setProgress(null);
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const loadedAssignment = await getAssignmentById(assignmentId);
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      if (!loadedAssignment) {
        setAssignment(null);
        setError("Bu ödev artık mevcut değil.");
        return;
      }

      const [members, submissions] = await Promise.all([
        getClassMembers(loadedAssignment.classId),
        getAssignmentSubmissions(assignmentId),
      ]);
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;

      const membersByUid = new Map(members.map((member) => [member.uid, member]));
      const targetStudents = loadedAssignment.targetStudentIds.map((uid) => ({
        uid,
        // A targeted student who has since left the class still shows up
        // (the target list is a snapshot — see assignmentTypes.ts), just
        // without a resolvable name.
        displayName: membersByUid.get(uid)?.displayName ?? "Öğrenci",
      }));
      const submissionsByStudent = new Map(submissions.map((submission) => [submission.studentId, submission]));

      const now = Date.now();
      setAssignment(loadedAssignment);
      setProgress(
        buildTeacherAssignmentProgress({
          targetStudents,
          submissionsByStudent,
          targetCount: loadedAssignment.targetCount,
          dueAt: loadedAssignment.dueAt,
          now,
        }),
      );
      // Phase 31 — zero extra reads: both derived entirely from the
      // assignment doc + submissions already fetched above.
      setOutcomeInsights(buildAssignmentOutcomeInsights({ assignment: loadedAssignment, submissions }));
      setFollowUp(
        buildAssignmentFollowUp({
          targetStudents,
          submissionsByStudent,
          targetCount: loadedAssignment.targetCount,
          dueAt: loadedAssignment.dueAt,
          now,
        }),
      );
    } catch {
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setError("Ödev bilgileri yüklenemedi.");
    } finally {
      if (shouldApplyStaleResponse(requestId, requestIdRef.current)) setIsLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    load();
  }, [load]);

  return { assignment, progress, outcomeInsights, followUp, isLoading, error, refresh: load };
}
