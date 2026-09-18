// Phase 108 — the device-local calendar day a plan belongs to.
//
// Pure, Firebase/React-free. The plan is a DAILY object, so everything that
// identifies one ("is this step's question already worked on today", "which
// day did this plan complete on") needs the same idea of "today". This is the
// device-local convention studyWeek.ts and assignmentUrgency.ts already use;
// the server's timezone-validated streak key (functions/src/study/dayKey.ts)
// stays the only security-relevant day and is never re-derived here.

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight at the start of the day containing `epochMs`. */
export function startOfLocalDay(epochMs: number): number {
  const date = new Date(epochMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** "YYYY-MM-DD" in the device's own calendar — the same shape the server's
 *  day key uses, so a day read back from studyDays can be compared to one
 *  built here. */
export function localDayKey(epochMs: number): string {
  const date = new Date(epochMs);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local midnight of the day a "YYYY-MM-DD" key names; NaN for a malformed key. */
export function dayKeyToEpoch(dayKey: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return Number.NaN;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0).getTime();
}

export function isSameLocalDay(a: number, b: number): boolean {
  return startOfLocalDay(a) === startOfLocalDay(b);
}
