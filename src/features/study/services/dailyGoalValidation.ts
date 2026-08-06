// Client mirror of the server's daily-goal bounds
// (functions/src/study/studyTypes.ts). Duplicated for the same reason as the
// scheduler types — functions/ is a separate TS project the app cannot
// import across. The SERVER remains authoritative: it re-validates and
// rejects, so this copy only exists to give immediate, local feedback
// instead of a round-trip for an obviously-bad value.
export const MIN_DAILY_GOAL = 1;
export const MAX_DAILY_GOAL = 100;
export const DAILY_GOAL_PRESETS = [5, 10, 20] as const;

export type DailyGoalValidation =
  | { valid: true; value: number }
  | { valid: false; message: string };

// Accepts only a whole number inside the range. Deliberately does NOT clamp:
// silently turning "500" into 100 would change what the user asked for
// without telling them, and the server rejects it anyway.
export function validateDailyGoal(raw: string): DailyGoalValidation {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { valid: false, message: "Bir hedef gir." };
  }
  // Rejects "1.5", "1e3", "12abc", "-3" — Number() alone would accept several
  // of these.
  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, message: "Hedef tam sayı olmalı." };
  }
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < MIN_DAILY_GOAL || value > MAX_DAILY_GOAL) {
    return {
      valid: false,
      message: `Hedef ${MIN_DAILY_GOAL} ile ${MAX_DAILY_GOAL} arasında olmalı.`,
    };
  }
  return { valid: true, value };
}
