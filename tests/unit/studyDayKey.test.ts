import {
  advanceStreak,
  DEFAULT_TIME_ZONE,
  daysBetweenDayKeys,
  isValidTimeZone,
  resolveTimeZone,
  toDayKey,
} from "../../functions/src/study/dayKey";

describe("isValidTimeZone / resolveTimeZone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimeZone("Europe/Istanbul")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects malformed, empty, absurd or non-string values", () => {
    for (const bad of ["", "Not/AZone", "'; DROP TABLE", null, undefined, 42, {}, "x".repeat(200)]) {
      expect(isValidTimeZone(bad)).toBe(false);
    }
  });

  it("falls back safely instead of throwing — a spoofed zone must not fail the review", () => {
    expect(resolveTimeZone("Mars/Olympus")).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone(123)).toBe(DEFAULT_TIME_ZONE);
  });

  it("passes a valid zone straight through", () => {
    expect(resolveTimeZone("America/New_York")).toBe("America/New_York");
  });
});

describe("toDayKey", () => {
  it("formats as ISO YYYY-MM-DD", () => {
    // 2026-08-06T09:00:00Z
    const key = toDayKey(Date.parse("2026-08-06T09:00:00Z"), "UTC");
    expect(key).toBe("2026-08-06");
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("resolves the calendar day in the GIVEN zone, not UTC", () => {
    // 22:30 UTC is already the NEXT day in Istanbul (UTC+3).
    const instant = Date.parse("2026-08-06T22:30:00Z");
    expect(toDayKey(instant, "UTC")).toBe("2026-08-06");
    expect(toDayKey(instant, "Europe/Istanbul")).toBe("2026-08-07");
  });

  it("resolves the PREVIOUS day for a zone behind UTC", () => {
    // 02:00 UTC is still the previous evening in New York.
    const instant = Date.parse("2026-08-06T02:00:00Z");
    expect(toDayKey(instant, "America/New_York")).toBe("2026-08-05");
  });
});

describe("daysBetweenDayKeys", () => {
  it("counts exact calendar days", () => {
    expect(daysBetweenDayKeys("2026-08-05", "2026-08-06")).toBe(1);
    expect(daysBetweenDayKeys("2026-08-01", "2026-08-06")).toBe(5);
    expect(daysBetweenDayKeys("2026-08-06", "2026-08-06")).toBe(0);
  });

  it("crosses month and year boundaries correctly", () => {
    expect(daysBetweenDayKeys("2026-08-31", "2026-09-01")).toBe(1);
    expect(daysBetweenDayKeys("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("returns a negative count for a backwards pair (never throws)", () => {
    expect(daysBetweenDayKeys("2026-08-06", "2026-08-05")).toBe(-1);
  });

  it("returns 0 for unparseable input rather than NaN", () => {
    expect(daysBetweenDayKeys("garbage", "2026-08-06")).toBe(0);
  });
});

describe("advanceStreak", () => {
  const base = { currentStreak: 4, longestStreak: 9, lastStudyDay: "2026-08-05" };

  it("leaves the streak untouched when studying twice on the same day", () => {
    expect(advanceStreak(base, "2026-08-05")).toEqual(base);
  });

  it("increments on a consecutive day", () => {
    const r = advanceStreak(base, "2026-08-06");
    expect(r.currentStreak).toBe(5);
    expect(r.lastStudyDay).toBe("2026-08-06");
  });

  it("resets to 1 after a gap", () => {
    expect(advanceStreak(base, "2026-08-09").currentStreak).toBe(1);
  });

  it("starts at 1 for a user who has never studied", () => {
    const r = advanceStreak(
      { currentStreak: 0, longestStreak: 0, lastStudyDay: null },
      "2026-08-06",
    );
    expect(r).toEqual({ currentStreak: 1, longestStreak: 1, lastStudyDay: "2026-08-06" });
  });

  it("raises longestStreak only when the current streak exceeds it", () => {
    const r = advanceStreak(
      { currentStreak: 9, longestStreak: 9, lastStudyDay: "2026-08-05" },
      "2026-08-06",
    );
    expect(r.currentStreak).toBe(10);
    expect(r.longestStreak).toBe(10);
  });

  it("preserves a longer historical best when the current streak resets", () => {
    const r = advanceStreak(base, "2026-08-20");
    expect(r.currentStreak).toBe(1);
    expect(r.longestStreak).toBe(9);
  });

  it("a backwards day key resets rather than inflating the streak", () => {
    // Guards against a clock/timezone anomaly being turned into free streak.
    const r = advanceStreak(base, "2026-08-01");
    expect(r.currentStreak).toBe(1);
    expect(r.longestStreak).toBe(9);
  });
});
