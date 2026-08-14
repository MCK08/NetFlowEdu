import {
  endOfLocalWeek,
  isInCurrentLocalWeek,
  isWithinRecentDays,
  startOfLocalWeek,
  startOfRecentDayWindow,
} from "../../src/features/study/services/studyWeek";

// Local-time constructors throughout — these helpers are device-local by
// contract (see studyWeek.ts), so the tests must construct local dates too.
// 2026-08-14 is a FRIDAY; that week's Monday is 2026-08-10.
const FRIDAY = new Date(2026, 7, 14, 10, 0, 0).getTime();
const MONDAY_MIDNIGHT = new Date(2026, 7, 10, 0, 0, 0, 0).getTime();
const NEXT_MONDAY_MIDNIGHT = new Date(2026, 7, 17, 0, 0, 0, 0).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

describe("startOfLocalWeek — Monday-start boundary", () => {
  it("returns that week's local Monday midnight for a midweek day", () => {
    expect(startOfLocalWeek(FRIDAY)).toBe(MONDAY_MIDNIGHT);
  });

  it("is idempotent when called on the week start itself", () => {
    expect(startOfLocalWeek(MONDAY_MIDNIGHT)).toBe(MONDAY_MIDNIGHT);
  });

  it("treats SUNDAY as the LAST day of the Monday-start week, not the first", () => {
    const sunday = new Date(2026, 7, 16, 23, 0, 0).getTime();
    expect(startOfLocalWeek(sunday)).toBe(MONDAY_MIDNIGHT);
  });

  it("rolls to the next week on Monday at 00:00 exactly", () => {
    expect(startOfLocalWeek(NEXT_MONDAY_MIDNIGHT)).toBe(NEXT_MONDAY_MIDNIGHT);
  });

  it("a moment before Monday midnight still belongs to the previous week", () => {
    expect(startOfLocalWeek(NEXT_MONDAY_MIDNIGHT - 1)).toBe(MONDAY_MIDNIGHT);
  });
});

describe("endOfLocalWeek", () => {
  it("is exactly the next local Monday midnight", () => {
    expect(endOfLocalWeek(FRIDAY)).toBe(NEXT_MONDAY_MIDNIGHT);
  });

  it("spans exactly one week from the start", () => {
    expect(endOfLocalWeek(FRIDAY) - startOfLocalWeek(FRIDAY)).toBe(7 * DAY_MS);
  });
});

describe("isInCurrentLocalWeek", () => {
  it("includes the week's opening instant (inclusive lower bound)", () => {
    expect(isInCurrentLocalWeek(MONDAY_MIDNIGHT, FRIDAY)).toBe(true);
  });

  it("excludes the next week's opening instant (exclusive upper bound)", () => {
    expect(isInCurrentLocalWeek(NEXT_MONDAY_MIDNIGHT, FRIDAY)).toBe(false);
  });

  it("includes the last instant of the week", () => {
    expect(isInCurrentLocalWeek(NEXT_MONDAY_MIDNIGHT - 1, FRIDAY)).toBe(true);
  });

  it("excludes the previous week", () => {
    expect(isInCurrentLocalWeek(MONDAY_MIDNIGHT - 1, FRIDAY)).toBe(false);
  });

  it("excludes a timestamp of 0 (never reviewed)", () => {
    expect(isInCurrentLocalWeek(0, FRIDAY)).toBe(false);
  });

  it("excludes a negative or non-finite timestamp", () => {
    expect(isInCurrentLocalWeek(-1, FRIDAY)).toBe(false);
    expect(isInCurrentLocalWeek(Number.NaN, FRIDAY)).toBe(false);
    expect(isInCurrentLocalWeek(Number.POSITIVE_INFINITY, FRIDAY)).toBe(false);
  });

  it("counts an earlier day of the SAME week as in-week (the Friday regression)", () => {
    const monday = new Date(2026, 7, 10, 9, 0, 0).getTime();
    // The whole point of the Phase 32 fix: a student who studied Monday is
    // still "studied this week" when the teacher looks on Friday.
    expect(isInCurrentLocalWeek(monday, FRIDAY)).toBe(true);
  });
});

describe("startOfRecentDayWindow / isWithinRecentDays", () => {
  it("a 14-day window starts 13 local days before today's midnight", () => {
    const expected = new Date(2026, 7, 1, 0, 0, 0, 0).getTime();
    expect(startOfRecentDayWindow(FRIDAY, 14)).toBe(expected);
  });

  it("a 1-day window is just today", () => {
    expect(startOfRecentDayWindow(FRIDAY, 1)).toBe(new Date(2026, 7, 14, 0, 0, 0, 0).getTime());
  });

  it("includes something reviewed today", () => {
    expect(isWithinRecentDays(FRIDAY - 3600_000, FRIDAY, 14)).toBe(true);
  });

  it("includes the oldest instant still inside the window", () => {
    expect(isWithinRecentDays(startOfRecentDayWindow(FRIDAY, 14), FRIDAY, 14)).toBe(true);
  });

  it("excludes the instant just before the window opens", () => {
    expect(isWithinRecentDays(startOfRecentDayWindow(FRIDAY, 14) - 1, FRIDAY, 14)).toBe(false);
  });

  it("excludes activity from six months ago (the false 'son 14 gün' regression)", () => {
    expect(isWithinRecentDays(FRIDAY - 180 * DAY_MS, FRIDAY, 14)).toBe(false);
  });

  it("excludes a future timestamp", () => {
    expect(isWithinRecentDays(FRIDAY + DAY_MS, FRIDAY, 14)).toBe(false);
  });

  it("excludes never-reviewed (0) and invalid timestamps", () => {
    expect(isWithinRecentDays(0, FRIDAY, 14)).toBe(false);
    expect(isWithinRecentDays(Number.NaN, FRIDAY, 14)).toBe(false);
  });

  it("clamps a nonsensical window size to at least one day rather than throwing", () => {
    expect(isWithinRecentDays(FRIDAY - 3600_000, FRIDAY, 0)).toBe(true);
    expect(isWithinRecentDays(FRIDAY - 5 * DAY_MS, FRIDAY, Number.NaN)).toBe(false);
  });
});
