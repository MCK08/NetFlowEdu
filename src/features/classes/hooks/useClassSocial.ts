import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@features/authentication";
import type { Assignment } from "@features/assignments/domain/assignmentTypes";
import { getStudentAssignments } from "@features/assignments/services/assignmentService";
import { getClassMembers } from "@services/firebase/classes";
import type { ClassMember } from "@/types/class";

import type { ClassPulse } from "../services/classSocial";
import { getClassPulse, getCongratulatedQuestionIds, sendClassKudos } from "../services/classSocialService";

const KUDOS_ERROR = "Tebrik gönderilemedi. Lütfen tekrar dene.";

/** Phase 118 — named so the screen can hand this one load to the sections
 *  that read from it (the class's assignments, its classmates, its week and
 *  its activity) instead of each of them starting a load of its own. */
export type ClassSocial = ReturnType<typeof useClassSocial>;

// Phase 110 — one bounded load for the class screen's social sections.
//
// Four reads in parallel, each allowed to fail ALONE: a missing week, or a
// kudos history that could not be read, must never blank out the classmates
// list. Only the roster decides whether the section reports an error.
export function useClassSocial(classId: string) {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid ?? null;

  const [members, setMembers] = useState<ClassMember[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [pulse, setPulse] = useState<ClassPulse | null>(null);
  const [congratulated, setCongratulated] = useState<ReadonlySet<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingQuestionId, setPendingQuestionId] = useState<string | null>(null);
  const [kudosError, setKudosError] = useState<string | null>(null);
  // When the data on screen was read — the "now" for its day labels, so they
  // move with each reload yet stay stable between renders of one snapshot.
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!uid || !classId) {
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    const [membersResult, assignmentsResult, pulseResult, kudosResult] = await Promise.allSettled([
      getClassMembers(classId),
      getStudentAssignments(uid),
      getClassPulse(classId, Date.now()),
      getCongratulatedQuestionIds(uid, classId),
    ]);
    if (requestIdRef.current !== requestId) return;

    if (membersResult.status === "fulfilled") setMembers(membersResult.value);
    else setError("Sınıf arkadaşların şu an yüklenemedi.");
    // Only this class's assignments are kept; the model filters further.
    if (assignmentsResult.status === "fulfilled") {
      setAssignments(assignmentsResult.value.filter((assignment) => assignment.classId === classId));
    }
    setPulse(pulseResult.status === "fulfilled" ? pulseResult.value : null);
    if (kudosResult.status === "fulfilled") setCongratulated(kudosResult.value);
    setLoadedAt(Date.now());
    setIsLoading(false);
  }, [classId, uid]);

  useEffect(() => {
    load();
  }, [load]);

  const congratulate = useCallback(
    async (questionId: string) => {
      if (pendingQuestionId || congratulated.has(questionId)) return;
      setPendingQuestionId(questionId);
      setKudosError(null);
      try {
        await sendClassKudos(classId, questionId);
        // "already_sent" is also a success: the button's state is the truth.
        setCongratulated((previous) => new Set(previous).add(questionId));
      } catch {
        setKudosError(KUDOS_ERROR);
      } finally {
        setPendingQuestionId(null);
      }
    },
    [classId, congratulated, pendingQuestionId],
  );

  return {
    uid,
    loadedAt,
    members,
    assignments,
    pulse,
    congratulated,
    isLoading,
    error,
    pendingQuestionId,
    kudosError,
    congratulate,
    refresh: load,
  };
}
