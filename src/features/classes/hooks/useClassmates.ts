import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@features/authentication";
import { getClassMembers } from "@services/firebase/classes";

import { buildClassmates, Classmate } from "../services/classSocial";

// Phase 110 — the full roster for "Sınıf Arkadaşların": ONE bounded query of
// the class's own member rows (the public identity snapshot and nothing else).
export function useClassmates(classId: string) {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid ?? null;
  const [classmates, setClassmates] = useState<Classmate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!classId) {
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const members = await getClassMembers(classId);
      if (requestIdRef.current !== requestId) return;
      setClassmates(buildClassmates(members, uid));
    } catch {
      if (requestIdRef.current !== requestId) return;
      setError("Sınıf arkadaşların şu an yüklenemedi.");
    } finally {
      if (requestIdRef.current === requestId) setIsLoading(false);
    }
  }, [classId, uid]);

  useEffect(() => {
    load();
  }, [load]);

  return { classmates, isLoading, error, refresh: load };
}
