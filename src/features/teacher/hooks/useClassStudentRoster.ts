import { useCallback, useEffect, useRef, useState } from "react";

import { getClassMembers } from "@services/firebase/classes";
import { ClassMember } from "@/types/class";
import { shouldApplyStaleResponse } from "@features/study/services/staleResponseGuard";

import { dedupeMembersByUid } from "../services/classRoster";

import { ClassSemanticStudentRef } from "./useClassSemanticEvidence";

// Phase 83 — the class's student roster, for a route that does not otherwise
// hold one.
//
// Class Performance already reads `classes/{classId}/members` on its own
// (useClassPerformance); the vocabulary studio never needed to, because
// authored coverage is a property of questions, not people. Verified evidence
// IS about people, so this reads the same collection through the same
// service — one query, the teacher's own class, exactly what firestore.rules
// already grants — and hands the student members to the evidence loader.
//
// Lazy, like the evidence itself: `enabled` keeps the read from happening on
// first paint, and it runs once per mount when it does.
export function useClassStudentRoster(classId: string | undefined, enabled: boolean) {
  const [students, setStudents] = useState<ClassSemanticStudentRef[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!classId) {
      setStudents([]);
      setHasLoaded(true);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setHasError(false);
    try {
      const members = await getClassMembers(classId);
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setStudents(
        dedupeMembersByUid(members.filter((member: ClassMember) => member.role === "student")).map((member) => ({
          studentUid: member.uid,
          displayName: member.displayName,
        })),
      );
      setHasLoaded(true);
    } catch {
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setStudents([]);
      setHasError(true);
    } finally {
      if (shouldApplyStaleResponse(requestId, requestIdRef.current)) setIsLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    if (!enabled || hasLoaded) return;
    load();
  }, [enabled, hasLoaded, load]);

  return { students, isLoading, hasError, hasLoaded, refresh: load };
}
