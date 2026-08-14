import { useCallback, useEffect, useRef, useState } from "react";

import { resolveQuestionMetadata } from "@features/study/services/studyMetadataCache";
import { shouldApplyStaleResponse } from "@features/study/services/staleResponseGuard";
import { StudyOutcome } from "@features/study/domain/studyTypes";
import { Question } from "@/types/question";

import { AssignmentSubmission } from "../domain/assignmentTypes";
import { getAssignmentById, getMySubmission, recordAssignmentProgress } from "../services/assignmentService";

// Resolves one assignment's questionIds into real Question objects (via
// the SAME shared studyMetadataCache the Learning Hub/Feed already warm —
// never a second fetch path) for StudySessionScreen's mode="assignment" to
// render through the existing StudySessionAdaptiveCard. Incomplete
// questions are ordered first, so "Devam Et" always opens on unfinished
// work — a question the student already completed is still reachable by
// swiping further, never removed from the list.
export function useAssignmentSession(assignmentId: string | undefined, uid: string | undefined) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [targetCount, setTargetCount] = useState(0);
  const [submission, setSubmission] = useState<AssignmentSubmission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!assignmentId || !uid) {
      setQuestions([]);
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const [assignment, mySubmission] = await Promise.all([
        getAssignmentById(assignmentId),
        getMySubmission(assignmentId, uid),
      ]);
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      if (!assignment) {
        setError("Bu ödev artık mevcut değil.");
        return;
      }

      const metadata = await resolveQuestionMetadata(assignment.questionIds);
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;

      const completedSet = new Set(mySubmission?.completedQuestionIds ?? []);
      const resolved = assignment.questionIds
        .map((id) => metadata.get(id))
        .filter((question): question is Question => question != null);
      const ordered = [
        ...resolved.filter((question) => !completedSet.has(question.id)),
        ...resolved.filter((question) => completedSet.has(question.id)),
      ];

      setQuestions(ordered);
      setTargetCount(assignment.targetCount);
      setSubmission(mySubmission);
    } catch {
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setError("Ödev yüklenemedi.");
    } finally {
      if (shouldApplyStaleResponse(requestId, requestIdRef.current)) setIsLoading(false);
    }
  }, [assignmentId, uid]);

  useEffect(() => {
    load();
  }, [load]);

  // Called AFTER a real recordStudyOutcome already succeeded (see
  // StudySessionScreen's mode="assignment" wiring) — a failure here never
  // undoes that outcome, and is safely retryable: the next successful call
  // for the SAME questionId is a no-op (idempotent, see
  // assignmentService.ts's recordAssignmentProgress), so no duplicate
  // completion can ever result from retrying.
  const recordProgress = useCallback(
    async (questionId: string, outcome?: StudyOutcome) => {
      if (!assignmentId || !uid) return;
      try {
        const next = await recordAssignmentProgress(assignmentId, uid, questionId, targetCount, outcome);
        setSubmission(next);
      } catch {
        // Best-effort — see doc comment above.
      }
    },
    [assignmentId, uid, targetCount],
  );

  return { questions, targetCount, submission, isLoading, error, refresh: load, recordProgress };
}
