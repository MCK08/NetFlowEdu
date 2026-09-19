import { createContext, ReactNode, useContext, useMemo, useState } from "react";

import { useAuth } from "@features/authentication";
import { useTeacherClasses } from "@features/classes/hooks/useTeacherClasses";
import type { ClassRoom } from "@/types/class";

import { ClassAttention, useClassAttention } from "../hooks/useClassAttention";
import { activeTeacherClasses, resolveSelectedClassId } from "../services/teacherToday";

// Phase 111 — the ONE attention load behind "Bugün" and "Aksiyonlar".
//
// Both tabs show the same class's list — Bugün its first five, Aksiyonlar all
// of it — so the list is loaded once here, above the tabs, and shared. Opening
// the second tab costs nothing; switching the class reloads exactly one class.
// Mounted in (teacher)/(tabs)/_layout.tsx, so it lives exactly as long as the
// teacher's tabs do.

interface TeacherTodayValue {
  activeClasses: ClassRoom[];
  isLoadingClasses: boolean;
  classesError: string | null;
  refreshClasses: () => Promise<void>;
  selectedClass: ClassRoom | null;
  selectClass: (classId: string) => void;
  attention: ClassAttention;
}

const TeacherTodayContext = createContext<TeacherTodayValue | null>(null);

export function TeacherTodayProvider({ children }: { children: ReactNode }) {
  const { firebaseUser } = useAuth();
  const { classes, isLoading, errorMessage, refresh } = useTeacherClasses(firebaseUser?.uid);
  const activeClasses = useMemo(() => activeTeacherClasses(classes), [classes]);

  const [chosenClassId, setChosenClassId] = useState<string | null>(null);
  const selectedClassId = resolveSelectedClassId(activeClasses, chosenClassId);
  const selectedClass = activeClasses.find((classRoom) => classRoom.id === selectedClassId) ?? null;
  const attention = useClassAttention(selectedClassId ?? undefined);

  const value = useMemo<TeacherTodayValue>(
    () => ({
      activeClasses,
      isLoadingClasses: isLoading,
      classesError: errorMessage,
      refreshClasses: refresh,
      selectedClass,
      selectClass: setChosenClassId,
      attention,
    }),
    [activeClasses, isLoading, errorMessage, refresh, selectedClass, attention],
  );

  return <TeacherTodayContext.Provider value={value}>{children}</TeacherTodayContext.Provider>;
}

export function useTeacherToday(): TeacherTodayValue {
  const value = useContext(TeacherTodayContext);
  if (!value) throw new Error("useTeacherToday must be used inside TeacherTodayProvider");
  return value;
}
