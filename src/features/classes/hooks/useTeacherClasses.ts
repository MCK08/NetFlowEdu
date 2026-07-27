import { FirebaseError } from "firebase/app";
import { useCallback, useEffect, useRef, useState } from "react";

import { getTeacherClasses } from "@services/firebase/classes";
import { createClass as createClassCallable } from "@services/firebase/functions";
import { ClassRoom } from "@/types/class";

import { mapClassErrorToMessage } from "../services/classErrorMapper";

export function useTeacherClasses(teacherId: string | undefined) {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Synchronous double-submit guard. `isCreating` is React state, so it only
  // becomes true on the NEXT render — two taps landing in the same tick can
  // both pass an `isCreating` check and fire two createClass calls, creating
  // two classes. A ref flips immediately and closes that window.
  const isCreatingRef = useRef(false);

  const load = useCallback(async () => {
    if (!teacherId) {
      setClasses([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const result = await getTeacherClasses(teacherId);
      setClasses(result);
    } catch {
      setErrorMessage("Sınıflar yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setIsLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    load();
  }, [load]);

  async function createClass(name: string): Promise<boolean> {
    if (isCreatingRef.current) return false;
    isCreatingRef.current = true;
    setIsCreating(true);
    setErrorMessage(null);
    try {
      await createClassCallable(name);
      await load();
      return true;
    } catch (error) {
      // The callable raises seven distinct codes (see
      // functions/src/classes/createClass.ts). Collapsing them all into one
      // "try again" sentence was wrong for permission-denied and
      // failed-precondition: those mean the session's role/organizationId
      // claims are stale or missing, so retrying can never succeed — the
      // user has to refresh their session instead. Keep the real code, show
      // the matching instruction, and surface the code in dev.
      const code = error instanceof FirebaseError ? error.code : "unknown";
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[classes] createClass failed", { code });
      }
      setErrorMessage(mapClassErrorToMessage(code));
      return false;
    } finally {
      isCreatingRef.current = false;
      setIsCreating(false);
    }
  }

  return { classes, isLoading, isCreating, errorMessage, createClass, refresh: load };
}
