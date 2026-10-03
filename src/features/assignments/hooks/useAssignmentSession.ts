import { useCallback, useEffect, useRef, useState } from "react";

import { resolveQuestionMetadata } from "@features/study/services/studyMetadataCache";
import { shouldApplyStaleResponse } from "@features/study/services/staleResponseGuard";
import { StudyOutcome } from "@features/study/domain/studyTypes";
import { Question } from "@/types/question";

import { Assignment, AssignmentSubmission } from "../domain/assignmentTypes";
import { getAssignmentById, getMySubmission, recordAssignmentProgress } from "../services/assignmentService";
import { resolveAssignmentSessionAccess } from "../services/assignmentStatus";

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
  // Phase 130 — the document itself, kept rather than discarded once its
  // questionIds are resolved: its title, subject, deadline and the teacher's
  // description are what tell the student which assignment this is. Only ever
  // set for an assignment confirmed delivered to this student, so nothing a
  // draft or an archived assignment holds can reach the screen.
  const [deliveredAssignment, setDeliveredAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<AssignmentSubmission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Phase 129 — three answers that used to be one error string with a
  // "Tekrar Dene" under it. A deleted assignment is permanent (retrying cannot
  // bring it back); one that exists but was never sent, or was withdrawn, is
  // not this student's to solve; only a failed load is worth retrying.
  const [notFound, setNotFound] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  // Read by recordProgress, which must never write to an assignment this
  // session has not confirmed is delivered — even if a stale card were to
  // fire an outcome after the state changed.
  const deliveredRef = useRef(false);
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
    setNotFound(false);
    setUnavailable(false);
    setDeliveredAssignment(null);
    deliveredRef.current = false;
    try {
      // Phase 129 — availability FIRST. The submission and the questions are
      // only read once the assignment is known to be one this student was
      // sent, so opening a draft or an archived assignment from a stale link
      // reads no submission, resolves no question and can write nothing. It
      // costs the happy path nothing: the questions already had to wait for
      // this document, and the submission now loads alongside them.
      const assignment = await getAssignmentById(assignmentId);
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      const access = resolveAssignmentSessionAccess(assignment);
      if (access !== "open" || !assignment) {
        setQuestions([]);
        setSubmission(null);
        if (access === "not_found") setNotFound(true);
        else setUnavailable(true);
        return;
      }

      const [mySubmission, metadata] = await Promise.all([
        getMySubmission(assignmentId, uid),
        resolveQuestionMetadata(assignment.questionIds),
      ]);
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
      setDeliveredAssignment(assignment);
      setSubmission(mySubmission);
      deliveredRef.current = true;
    } catch {
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setError("Çalışma yüklenemedi.");
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
      // Phase 129 — never write progress to an assignment this session has
      // not confirmed was sent to this student.
      if (!deliveredRef.current) return;
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

  return {
    assignment: deliveredAssignment,
    questions,
    targetCount,
    submission,
    isLoading,
    error,
    notFound,
    unavailable,
    refresh: load,
    recordProgress,
  };
}
