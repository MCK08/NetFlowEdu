import { useCallback, useEffect, useState } from "react";

import { getTeacherClasses } from "@services/firebase/classes";
import { createClass as createClassCallable } from "@services/firebase/functions";
import { ClassRoom } from "@/types/class";

export function useTeacherClasses(teacherId: string | undefined) {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    if (isCreating) return false;
    setIsCreating(true);
    setErrorMessage(null);
    try {
      await createClassCallable(name);
      await load();
      return true;
    } catch {
      setErrorMessage("Sınıf oluşturulamadı. Lütfen tekrar deneyin.");
      return false;
    } finally {
      setIsCreating(false);
    }
  }

  return { classes, isLoading, isCreating, errorMessage, createClass, refresh: load };
}
