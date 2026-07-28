import { FirebaseError } from "firebase/app";
import { useCallback, useEffect, useState } from "react";

import { getStudentClasses } from "@services/firebase/classes";
import { joinClassByCode } from "@services/firebase/functions";
import { ClassRoom } from "@/types/class";

import { mapJoinClassErrorToMessage } from "../services/classErrorMapper";

export function useStudentClasses(uid: string | undefined) {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!uid) {
      setClasses([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const result = await getStudentClasses(uid);
      setClasses(result);
    } catch {
      setErrorMessage("Sınıflar yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setIsLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  // Returns true on success (including "already a member" — that's still a
  // successful outcome from the student's point of view) so the join form
  // can clear/close; false lets it keep the code in the input for retry.
  async function joinByCode(code: string): Promise<boolean> {
    if (isJoining) return false;
    setIsJoining(true);
    setErrorMessage(null);
    try {
      await joinClassByCode(code);
      await load();
      return true;
    } catch (error) {
      // Never collapse every failure into one message: a valid code that
      // fails for a backend reason must not be reported as "invalid code"
      // (that is exactly what hid the joinClassByCode org-equality bug).
      const errorCode = error instanceof FirebaseError ? error.code : "unknown";
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[joinClass] failed", { op: "joinClassByCode", code: errorCode });
      }
      setErrorMessage(mapJoinClassErrorToMessage(errorCode));
      return false;
    } finally {
      setIsJoining(false);
    }
  }

  return { classes, isLoading, isJoining, errorMessage, joinByCode, refresh: load };
}
