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

  // Returns whether the list actually loaded. Production bug: this used to
  // swallow its own failure and return void, so joinByCode below could not
  // tell a successful refresh from a failed one — it reported success either
  // way, the screen closed the join modal, and the error message this sets
  // was destroyed along with the modal that was the only place rendering it.
  // The student saw literally nothing: no error, no success, no class.
  const load = useCallback(async (): Promise<boolean> => {
    if (!uid) {
      setClasses([]);
      setIsLoading(false);
      return false;
    }
    setIsLoading(true);
    try {
      const result = await getStudentClasses(uid);
      setClasses(result);
      return true;
    } catch (error) {
      // Raw Firestore codes here (e.g. "permission-denied"), not callable
      // "functions/*" codes — the real one goes to the dev log so a silent
      // rules failure like the collection-group one can never hide again.
      const code = error instanceof FirebaseError ? error.code : "unknown";
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[studentClasses] load failed", { op: "getStudentClasses", code });
      }
      setErrorMessage("Sınıflar yüklenemedi. Lütfen tekrar deneyin.");
      return false;
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
      // The join itself succeeded, but if the list cannot be re-read the
      // student must NOT be told everything worked — that combination
      // (successful join + failed refresh) is exactly what produced the
      // "nothing happens" report: the modal closed on a reported success
      // and took the only visible error surface with it. Reporting false
      // keeps the modal open so load()'s message is actually seen.
      const refreshed = await load();
      return refreshed;
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
