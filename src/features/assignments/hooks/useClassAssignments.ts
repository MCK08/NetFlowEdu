import { useCallback, useEffect, useRef, useState } from "react";

import { shouldApplyStaleResponse } from "@features/study/services/staleResponseGuard";

import { Assignment } from "../domain/assignmentTypes";
import { getClassAssignments } from "../services/assignmentService";

// Newest first — the query itself has no orderBy (see assignmentService.ts's
// own doc comment on why: avoiding a composite index), so this is where
// that sort actually happens, once, client-side.
function sortNewestFirst(assignments: readonly Assignment[]): Assignment[] {
  return [...assignments].sort((a, b) => b.createdAt - a.createdAt);
}

export function useClassAssignments(classId: string | undefined) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!classId) {
      setAssignments([]);
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getClassAssignments(classId);
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setAssignments(sortNewestFirst(result));
    } catch {
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setError("Ödevler yüklenemedi.");
    } finally {
      if (shouldApplyStaleResponse(requestId, requestIdRef.current)) setIsLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  return { assignments, isLoading, error, refresh: load };
}
