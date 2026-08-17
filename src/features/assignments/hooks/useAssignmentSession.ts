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
      // Deduped BEFORE resolving: questionIds is a snapshot array and
      // firestore.rules only constrains its size and membership, not its
      // uniqueness. A repeated id used to resolve to the same Question
      // twice, which FlatList then rendered under two identical keys — a
      // duplicate-key warning plus genuinely unstable virtualization
      // (removeClippedSubviews recycling the wrong row).
      const uniqueQuestionIds = [...new Set(assignment.questionIds)];
      const resolved = uniqueQuestionIds
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
      // Phase 38 — ONE bounded retry rather than a bare `catch {}`. The
      // write is idempotent by construction (applyAssignmentCompletion
      // returns the previous submission unchanged for an already-completed
      // questionId), so retrying can never double-count; what it does fix
      // is the common case this used to swallow completely — a single
      // transient network failure leaving the student's visible progress
      // behind the outcome they just successfully recorded.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const next = await recordAssignmentProgress(assignmentId, uid, questionId, targetCount, outcome);
          setSubmission(next);
          return;
        } catch (error) {
          if (attempt === 1) {
            // Still not swallowed silently: surfaced in dev, and the next
            // session load re-reads the authoritative submission from the
            // server, so the student's real progress is never lost — only
            // this render's optimistic copy of it is stale.
            if (__DEV__) {
              // eslint-disable-next-line no-console
              console.warn("[ASSIGNMENT_PROGRESS] write failed after retry", questionId, error);
            }
          }
        }
      }
    },
    [assignmentId, uid, targetCount],
  );

  return { questions, targetCount, submission, isLoading, error, refresh: load, recordProgress };
}
