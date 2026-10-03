import { useEffect, useRef, useState } from "react";

import { resolveQuestionMetadata } from "@features/study/services/studyMetadataCache";
import { shouldApplyStaleResponse } from "@features/study/services/staleResponseGuard";
import { Question } from "@/types/question";

export interface AssignmentQuestionEntry {
  questionId: string;
  /** null when the question has since been deleted or is no longer readable —
   *  the assignment's questionIds snapshot still names it (assignmentTypes.ts). */
  question: Question | null;
}

// Phase 128 — the assignment's own questions, in the order the teacher
// assigned them, and only when someone asks to see them.
//
// The assignment document holds question IDS, never question content, so a
// preview has to resolve them. It does so through resolveQuestionMetadata —
// the one shared, session-wide question cache every study surface already
// uses — rather than a query of its own: a question this teacher has seen
// anywhere else this session costs nothing here. That resolver is per-id on
// purpose (a batched `in` query fails WHOLE when one document is unreadable;
// see studyMetadataCache.ts), and the count is bounded by the assignment
// itself (MAX_ASSIGNMENT_QUESTIONS).
//
// `enabled` is the point of this hook. The detail screen opens on its
// overview, which needs no question content at all, so nothing is read until
// the teacher opens the questions themselves.
export function useAssignmentQuestions(questionIds: readonly string[] | null, enabled: boolean) {
  // Held WITH the ids they were resolved for, so a different assignment never
  // shows the previous one's questions while its own are still resolving.
  const [resolved, setResolved] = useState<{ key: string; entries: AssignmentQuestionEntry[] } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);
  // A stable key, so a re-render with the same ids never resolves twice.
  const key = questionIds ? questionIds.join("|") : null;

  useEffect(() => {
    if (!enabled || key === null || !questionIds) return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    resolveQuestionMetadata(questionIds)
      .then((byId) => {
        if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
        // The assignment's own order — never the resolver's, never a sort.
        setResolved({
          key,
          entries: questionIds.map((questionId) => ({ questionId, question: byId.get(questionId) ?? null })),
        });
      })
      .catch(() => {
        if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
        // The resolver already maps a per-question failure to null; reaching
        // here means the whole call failed, which reads the same way to the
        // teacher: none of these could be shown.
        setResolved({ key, entries: questionIds.map((questionId) => ({ questionId, question: null })) });
      })
      .finally(() => {
        if (shouldApplyStaleResponse(requestId, requestIdRef.current)) setIsLoading(false);
      });
    // `key` stands in for questionIds' contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  const entries = resolved !== null && resolved.key === key ? resolved.entries : null;
  return { entries, isLoading };
}
