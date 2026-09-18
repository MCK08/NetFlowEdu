import { StudyDay } from "@features/study/services/studyService";
import { startOfLocalWeek } from "@features/study/services/studyWeek";

import { DAY_MS, localDayKey, startOfLocalDay } from "./planDay";
import { CompletedPlanDay } from "./planStore";

// Phase 108 — "Haftalık Plan", Monday to Sunday of the current week.
//
// The week is a frame, not a forecast. A past day shows what was recorded
// for it (the plan-local completed-day record, and the server-written study
// day if any); today shows the live plan; a future day shows nothing but a
// placeholder, because a plan is built from the learning state of the
// morning it is opened on and this module refuses to guess it earlier.

export type WeekDayKind = "past" | "today" | "future";

export interface WeekDayEntry {
  dayKey: string;
  /** Local midnight of the day. */
  startsAt: number;
  kind: WeekDayKind;
  /** Plan-local record, when the plan completed that day. */
  completedPlan: CompletedPlanDay | null;
  /** Server-written study activity for that day, when there was any. */
  studyDay: StudyDay | null;
}

export interface WeekView {
  /** Seven entries, Monday first. */
  days: WeekDayEntry[];
  todayKey: string;
  /** Past days of this week with a completed plan. */
  completedCount: number;
  /** Past days of this week with any recorded review. */
  activeCount: number;
}

export const FUTURE_DAY_PLACEHOLDER = "Plan o gün öğrenme durumuna göre hazırlanacak.";

export function buildWeekView(params: {
  now: number;
  completedDays: readonly CompletedPlanDay[];
  studyDays: readonly StudyDay[];
}): WeekView {
  const todayStart = startOfLocalDay(params.now);
  const todayKey = localDayKey(params.now);
  const weekStart = startOfLocalWeek(params.now);
  const completedByKey = new Map(params.completedDays.map((day) => [day.dayKey, day] as const));
  const studyByKey = new Map(params.studyDays.map((day) => [day.dayKey, day] as const));

  const days: WeekDayEntry[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    // Build from a Date so a DST week still lands on real local midnights.
    const date = new Date(weekStart);
    date.setDate(date.getDate() + offset);
    const startsAt = date.getTime();
    const dayKey = localDayKey(startsAt + DAY_MS / 2);
    const kind: WeekDayKind = startsAt < todayStart ? "past" : startsAt === todayStart ? "today" : "future";
    days.push({
      dayKey,
      startsAt,
      kind,
      completedPlan: kind === "future" ? null : (completedByKey.get(dayKey) ?? null),
      studyDay: kind === "future" ? null : (studyByKey.get(dayKey) ?? null),
    });
  }

  const past = days.filter((day) => day.kind === "past");
  return {
    days,
    todayKey,
    completedCount: past.filter((day) => day.completedPlan !== null).length,
    activeCount: past.filter((day) => (day.studyDay?.reviewCount ?? 0) > 0).length,
  };
}

/** The one-line fact for a past day, from records only. */
export function pastDaySentence(day: WeekDayEntry): string {
  if (day.completedPlan) {
    const parts = [`Plan tamamlandı · ${day.completedPlan.stepsCompleted} adım`];
    if (day.completedPlan.revisitWorked > 0) parts.push(`${day.completedPlan.revisitWorked} çözemediğin soruya döndün`);
    return parts.join(" · ");
  }
  if (day.studyDay && day.studyDay.reviewCount > 0) {
    return `${day.studyDay.reviewCount} tekrar kaydedildi`;
  }
  return "Kayıtlı çalışma yok";
}
