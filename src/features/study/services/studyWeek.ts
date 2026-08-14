// Phase 32 — the ONE definition of "bu hafta" / "son N gün" for every
// study-activity readout. Extracted (rather than inlined a second time)
// because studentPerformance.ts already had a local `isSameLocalDay` and a
// local `localDayKey`, and Phase 32 needed two MORE time windows on top of
// them — three near-identical date helpers in one file is exactly the
// "duplicate logic" this repo's own rules forbid.
//
// Timezone convention: DEVICE-LOCAL, identical to studentPerformance.ts's
// existing localDayKey/isSameLocalDay and to assignmentDueDate.ts's
// endOfLocalDay. This is deliberately NOT a new timezone philosophy — the
// server-side, security-sensitive day key (functions/src/study/dayKey.ts,
// which gates the streak) stays the only place a validated IANA zone
// matters. A teacher reading "did this student study this week" is asking
// about their OWN calendar, which is exactly what device-local gives them.
//
// Week start: MONDAY, matching both ISO-8601 and the Turkish calendar
// convention this product's users read dates in. Stated explicitly here
// rather than left implicit in a modulo.

// Sunday=0..Saturday=6, as returned by Date.prototype.getDay().
const SUNDAY = 0;
const DAYS_PER_WEEK = 7;

// The canonical "recent" window, in local days. Defined HERE rather than in
// studyService.ts (which re-exports it under its original name for every
// existing caller) purely so that the pure, Firebase-free consumers —
// studentPerformance.ts and this file's own helpers — can import it without
// dragging studyService's Firebase imports into a unit test. One value, one
// definition; studyService.ts still owns the Firestore `limit()` that
// applies it.
export const RECENT_STUDY_DAYS_WINDOW = 14;

// Local midnight at the start of the day containing `epochMs`.
function startOfLocalDay(epochMs: number): number {
  const date = new Date(epochMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

// Local Monday 00:00:00.000 of the week containing `now`.
// Uses setDate (not a 7*DAY_MS subtraction) so a week spanning a DST
// transition still lands on real local midnight rather than drifting an
// hour — the same reason assignmentDueDate.ts builds its boundary from a
// Date rather than arithmetic on epoch millis.
export function startOfLocalWeek(now: number): number {
  const date = new Date(startOfLocalDay(now));
  const dayOfWeek = date.getDay();
  // Sunday (0) is the LAST day of a Monday-start week, so it is 6 days
  // after that week's Monday, not 0.
  const daysSinceMonday = dayOfWeek === SUNDAY ? DAYS_PER_WEEK - 1 : dayOfWeek - 1;
  date.setDate(date.getDate() - daysSinceMonday);
  return date.getTime();
}

// Exclusive upper bound — local Monday 00:00:00.000 of the NEXT week.
export function endOfLocalWeek(now: number): number {
  const date = new Date(startOfLocalWeek(now));
  date.setDate(date.getDate() + DAYS_PER_WEEK);
  return date.getTime();
}

// Half-open [weekStart, nextWeekStart) — a review recorded at exactly local
// Monday midnight belongs to the week it opens, never the one it closes.
// A missing/zero/invalid timestamp is NOT "this week" (an item that was
// never reviewed must never be counted as activity).
export function isInCurrentLocalWeek(epochMs: number, now: number): boolean {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return false;
  return epochMs >= startOfLocalWeek(now) && epochMs < endOfLocalWeek(now);
}

// Inclusive local-day window ending TODAY: `days === 14` means today plus
// the 13 preceding local days, which is what "son 14 gün" reads as (and
// what getRecentStudyDays' own limit(14) over per-day documents yields).
export function startOfRecentDayWindow(now: number, days: number): number {
  const safeDays = Number.isFinite(days) && days >= 1 ? Math.floor(days) : 1;
  const date = new Date(startOfLocalDay(now));
  date.setDate(date.getDate() - (safeDays - 1));
  return date.getTime();
}

// A future timestamp is excluded as well as an ancient one: `lastReviewedAt`
// is server-written and should never be ahead of now, so treating a future
// value as "recent activity" would be reporting something that has not
// happened.
export function isWithinRecentDays(epochMs: number, now: number, days: number): boolean {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return false;
  return epochMs >= startOfRecentDayWindow(now, days) && epochMs <= now;
}
