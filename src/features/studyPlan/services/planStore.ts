import { clampPlanSteps, DEFAULT_PLAN_PREFERENCES, PlanPreferences } from "./dailyPlan";

// Phase 108 — the plan's own, plan-local state. Pure parse/serialise; the
// device storage layer lives in planStorage.ts.
//
// WHAT IS STORED, AND WHY IT IS ALLOWED TO BE LOCAL
//
// Nothing here is learning evidence. "Skipped today" is a display choice;
// "completed plan days" is a record of the plan's own completion; the
// preferences are the student's wishes about the plan's shape. None of it
// changes a study item, a schedule or a verdict, none of it is read by a
// teacher, and losing it costs the student nothing but a skipped-step mark.
// That is exactly what keeps it out of Firestore: the canonical scheduler
// and Phase 42 stay the only truths, and the plan re-derives itself from
// them on every open.

export const PLAN_STORE_VERSION = 1;

export interface CompletedPlanDay {
  dayKey: string;
  stepsTotal: number;
  stepsCompleted: number;
  /** Real count of revisit questions worked on that day. */
  revisitWorked: number;
}

export interface PlanStore {
  version: number;
  /** Steps skipped on `skippedDayKey`; discarded on any other day. */
  skippedDayKey: string | null;
  skippedStepIds: string[];
  /** Days on which every step of that day's plan was completed or skipped. */
  completedDays: CompletedPlanDay[];
  preferences: PlanPreferences;
}

export const EMPTY_PLAN_STORE: PlanStore = {
  version: PLAN_STORE_VERSION,
  skippedDayKey: null,
  skippedStepIds: [],
  completedDays: [],
  preferences: DEFAULT_PLAN_PREFERENCES,
};

/** Bounded so the store cannot grow for the life of the account. */
export const MAX_COMPLETED_DAYS = 60;

function isDayKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function nonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

/** Tolerant: anything malformed falls back to the empty store, never throws. */
export function parsePlanStore(raw: string | null | undefined): PlanStore {
  if (!raw) return EMPTY_PLAN_STORE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_PLAN_STORE;
  }
  if (!parsed || typeof parsed !== "object") return EMPTY_PLAN_STORE;
  const data = parsed as Record<string, unknown>;

  const skippedDayKey = isDayKey(data.skippedDayKey) ? data.skippedDayKey : null;
  const skippedStepIds = Array.isArray(data.skippedStepIds)
    ? data.skippedStepIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const completedDays: CompletedPlanDay[] = Array.isArray(data.completedDays)
    ? data.completedDays
        .filter((day): day is Record<string, unknown> => Boolean(day) && typeof day === "object")
        .filter((day) => isDayKey(day.dayKey))
        .map((day) => ({
          dayKey: day.dayKey as string,
          stepsTotal: nonNegativeInt(day.stepsTotal),
          stepsCompleted: nonNegativeInt(day.stepsCompleted),
          revisitWorked: nonNegativeInt(day.revisitWorked),
        }))
    : [];
  const prefs = data.preferences && typeof data.preferences === "object" ? (data.preferences as Record<string, unknown>) : {};
  const preferences: PlanPreferences = {
    maxSteps: clampPlanSteps(typeof prefs.maxSteps === "number" ? prefs.maxSteps : DEFAULT_PLAN_PREFERENCES.maxSteps),
    focusSubjects: Array.isArray(prefs.focusSubjects)
      ? prefs.focusSubjects.filter((subject): subject is string => typeof subject === "string" && subject.length > 0)
      : [],
  };

  return {
    version: PLAN_STORE_VERSION,
    skippedDayKey: skippedStepIds.length > 0 ? skippedDayKey : null,
    skippedStepIds: skippedDayKey ? skippedStepIds : [],
    completedDays: completedDays.slice(-MAX_COMPLETED_DAYS),
    preferences,
  };
}

export function serializePlanStore(store: PlanStore): string {
  return JSON.stringify(store);
}

/** Today's skipped steps only; yesterday's skips do not carry over. */
export function skippedStepsForDay(store: PlanStore, dayKey: string): string[] {
  return store.skippedDayKey === dayKey ? store.skippedStepIds : [];
}

export function withSkippedStep(store: PlanStore, dayKey: string, stepId: string): PlanStore {
  const current = skippedStepsForDay(store, dayKey);
  if (current.includes(stepId)) return store;
  return { ...store, skippedDayKey: dayKey, skippedStepIds: [...current, stepId] };
}

export function withoutSkippedStep(store: PlanStore, dayKey: string, stepId: string): PlanStore {
  const current = skippedStepsForDay(store, dayKey);
  if (!current.includes(stepId)) return store;
  const next = current.filter((id) => id !== stepId);
  return { ...store, skippedDayKey: next.length > 0 ? dayKey : null, skippedStepIds: next };
}

/** Records (or updates) a completed day; one entry per day key. */
export function withCompletedDay(store: PlanStore, day: CompletedPlanDay): PlanStore {
  const others = store.completedDays.filter((entry) => entry.dayKey !== day.dayKey);
  const completedDays = [...others, day].sort((a, b) => a.dayKey.localeCompare(b.dayKey)).slice(-MAX_COMPLETED_DAYS);
  return { ...store, completedDays };
}

export function withPreferences(store: PlanStore, preferences: PlanPreferences): PlanStore {
  return {
    ...store,
    preferences: { maxSteps: clampPlanSteps(preferences.maxSteps), focusSubjects: [...preferences.focusSubjects] },
  };
}
