// Pure due-date helpers. dueAt is always epoch ms (UTC-based, like every
// other timestamp in this codebase) — this file only converts a
// teacher-picked calendar day into that representation, and answers "is
// this past due" from it. No second timezone system: end-of-day is
// computed in whatever timezone the CALLER's Date objects already are in
// (the device's local time when called from the composer UI), matching
// studentPerformance.ts's own localDayKey/isSameLocalDay precedent for day
// boundaries rather than inventing a UTC-vs-local policy debate.

// The last millisecond of the given calendar day, in the caller's local
// timezone. `month` is 1-based (matches how a date picker naturally
// presents it), not JS Date's native 0-based month.
export function endOfLocalDay(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

// Strictly after, not at-or-after — a due date is not yet "past" at the
// exact instant it lands (§6 "due exact boundary").
export function isPastDue(dueAt: number | null, now: number): boolean {
  if (dueAt === null) return false;
  if (!Number.isFinite(dueAt)) return false;
  return dueAt < now;
}
