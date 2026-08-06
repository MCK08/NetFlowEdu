// Calendar-day resolution for streaks and daily stats.
//
// SECURITY BOUNDARY: the client may SUGGEST its IANA timezone (so a student
// in Istanbul rolls over at local midnight, not UTC), but it may never
// supply the day key, the streak, or the "is this a new day" verdict — all
// of those are computed here from SERVER time plus a validated timezone.
// A client that could pick its own day key could farm an unlimited streak
// by replaying the same day, or reset someone's progress.
//
// Pure apart from `Intl`, which is part of the JS runtime (not a network or
// Firebase dependency), so every branch is directly unit-testable.

export const DEFAULT_TIME_ZONE = "Europe/Istanbul";

// Validates by actually trying to use it — Intl throws RangeError for an
// unknown/malformed zone, which is a far more reliable check than any regex
// over the IANA name format.
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || timeZone.length === 0 || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// Never throws: an absent/garbage/spoofed value silently falls back rather
// than failing the student's whole review action over a display concern.
export function resolveTimeZone(candidate: unknown): string {
  return isValidTimeZone(candidate) ? candidate : DEFAULT_TIME_ZONE;
}

// "YYYY-MM-DD" in the given zone. en-CA is used deliberately: its short
// date format IS ISO-ordered (2026-08-06), so no manual part-shuffling is
// needed and there is no month/day ambiguity to get wrong.
export function toDayKey(epochMs: number, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(epochMs));
}

// Calendar days between two day keys. Both are midnight-anchored ISO dates,
// so parsing them as UTC and differencing is exact — no DST drift, because
// the zone-specific work already happened in toDayKey.
export function daysBetweenDayKeys(earlier: string, later: string): number {
  const a = Date.parse(`${earlier}T00:00:00Z`);
  const b = Date.parse(`${later}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastStudyDay: string | null;
}

// Streak transition for "the student studied on `todayKey`".
//
// Same day        -> unchanged (studying twice today is not a second day)
// Exactly +1 day  -> streak continues
// Any other gap   -> streak restarts at 1 (including a backwards clock,
//                    which must never inflate the streak)
export function advanceStreak(previous: StreakState, todayKey: string): StreakState {
  const { currentStreak, longestStreak, lastStudyDay } = previous;

  if (lastStudyDay === todayKey) {
    return { currentStreak, longestStreak, lastStudyDay };
  }

  const gap = lastStudyDay ? daysBetweenDayKeys(lastStudyDay, todayKey) : null;
  const nextStreak = gap === 1 ? currentStreak + 1 : 1;

  return {
    currentStreak: nextStreak,
    longestStreak: Math.max(longestStreak, nextStreak),
    lastStudyDay: todayKey,
  };
}
