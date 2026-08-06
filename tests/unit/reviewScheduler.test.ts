import {
  AGAIN_DELAY_MINUTES,
  DAY_MS,
  FIRST_SOLVED_INTERVAL_DAYS,
  isDueForReview,
  isStudyOutcome,
  MASTERY_MIN_INTERVAL_DAYS,
  MASTERY_MIN_SUCCESSFUL_REVIEWS,
  MAX_INTERVAL_DAYS,
  MINUTE_MS,
  SchedulerState,
  scheduleNextReview,
  STRUGGLED_INTERVAL_DAYS,
} from "../../functions/src/study/reviewScheduler";

const NOW = 1_760_000_000_000;

function state(
  intervalDays: number,
  successfulReviews: number,
  status: SchedulerState["status"] = "review",
): SchedulerState {
  return { status, intervalDays, successfulReviews };
}

describe("scheduleNextReview — again", () => {
  it("resets to learning with a 10-minute delay", () => {
    const r = scheduleNextReview(state(30, 5, "mastered"), "again", NOW);
    expect(r.status).toBe("learning");
    expect(r.intervalDays).toBe(0);
    expect(r.successfulReviews).toBe(0);
    expect(r.nextReviewAt).toBe(NOW + AGAIN_DELAY_MINUTES * MINUTE_MS);
    expect(r.lastOutcome).toBe("again");
  });

  it("drops a mastered question back out of mastery — the product thesis", () => {
    const r = scheduleNextReview(state(60, 9, "mastered"), "again", NOW);
    expect(r.status).toBe("learning");
  });

  it("behaves identically for a brand-new item", () => {
    const r = scheduleNextReview(null, "again", NOW);
    expect(r).toEqual({
      status: "learning",
      intervalDays: 0,
      successfulReviews: 0,
      nextReviewAt: NOW + AGAIN_DELAY_MINUTES * MINUTE_MS,
      lastOutcome: "again",
    });
  });
});

describe("scheduleNextReview — struggled", () => {
  it("schedules tomorrow and decrements successfulReviews", () => {
    const r = scheduleNextReview(state(8, 3), "struggled", NOW);
    expect(r.status).toBe("learning");
    expect(r.intervalDays).toBe(STRUGGLED_INTERVAL_DAYS);
    expect(r.successfulReviews).toBe(2);
    expect(r.nextReviewAt).toBe(NOW + STRUGGLED_INTERVAL_DAYS * DAY_MS);
  });

  it("never drives successfulReviews below zero", () => {
    expect(scheduleNextReview(state(0, 0), "struggled", NOW).successfulReviews).toBe(0);
  });

  it("applies to a brand-new item too", () => {
    const r = scheduleNextReview(null, "struggled", NOW);
    expect(r.intervalDays).toBe(1);
    expect(r.successfulReviews).toBe(0);
  });
});

describe("scheduleNextReview — first solved", () => {
  it("uses the 2-day first interval for a brand-new item", () => {
    const r = scheduleNextReview(null, "solved", NOW);
    expect(r.intervalDays).toBe(FIRST_SOLVED_INTERVAL_DAYS);
    expect(r.successfulReviews).toBe(1);
    expect(r.nextReviewAt).toBe(NOW + FIRST_SOLVED_INTERVAL_DAYS * DAY_MS);
    expect(r.status).toBe("review");
  });

  it("also uses it when the previous interval is 0 (e.g. right after 'again')", () => {
    const r = scheduleNextReview(state(0, 0, "learning"), "solved", NOW);
    expect(r.intervalDays).toBe(FIRST_SOLVED_INTERVAL_DAYS);
  });
});

describe("scheduleNextReview — subsequent solved", () => {
  it("doubles the interval", () => {
    expect(scheduleNextReview(state(2, 1), "solved", NOW).intervalDays).toBe(4);
    expect(scheduleNextReview(state(4, 2), "solved", NOW).intervalDays).toBe(8);
    expect(scheduleNextReview(state(8, 3), "solved", NOW).intervalDays).toBe(16);
  });

  it("caps at the 60-day ceiling", () => {
    expect(scheduleNextReview(state(40, 6), "solved", NOW).intervalDays).toBe(MAX_INTERVAL_DAYS);
    expect(scheduleNextReview(state(60, 9), "solved", NOW).intervalDays).toBe(MAX_INTERVAL_DAYS);
  });

  it("never falls below the 2-day floor", () => {
    expect(scheduleNextReview(state(1, 1), "solved", NOW).intervalDays).toBe(2);
  });

  it("sets nextReviewAt consistently with the computed interval", () => {
    const r = scheduleNextReview(state(4, 2), "solved", NOW);
    expect(r.nextReviewAt).toBe(NOW + r.intervalDays * DAY_MS);
  });
});

describe("mastery — BOTH conditions required", () => {
  it("is mastered at >=3 successful reviews AND >=14 day interval", () => {
    // 8 -> 16 days, reviews 2 -> 3. Both thresholds met exactly.
    const r = scheduleNextReview(state(8, 2), "solved", NOW);
    expect(r.intervalDays).toBeGreaterThanOrEqual(MASTERY_MIN_INTERVAL_DAYS);
    expect(r.successfulReviews).toBeGreaterThanOrEqual(MASTERY_MIN_SUCCESSFUL_REVIEWS);
    expect(r.status).toBe("mastered");
  });

  it("is NOT mastered with enough reviews but too short an interval", () => {
    // 2 -> 4 days (below 14), reviews 5 -> 6.
    const r = scheduleNextReview(state(2, 5), "solved", NOW);
    expect(r.successfulReviews).toBeGreaterThanOrEqual(MASTERY_MIN_SUCCESSFUL_REVIEWS);
    expect(r.intervalDays).toBeLessThan(MASTERY_MIN_INTERVAL_DAYS);
    expect(r.status).toBe("review");
  });

  it("is NOT mastered with a long interval but too few reviews", () => {
    // 20 -> 40 days, reviews 0 -> 1.
    const r = scheduleNextReview(state(20, 0), "solved", NOW);
    expect(r.intervalDays).toBeGreaterThanOrEqual(MASTERY_MIN_INTERVAL_DAYS);
    expect(r.successfulReviews).toBeLessThan(MASTERY_MIN_SUCCESSFUL_REVIEWS);
    expect(r.status).toBe("review");
  });
});

describe("determinism and robustness", () => {
  it("is deterministic — same input, same output", () => {
    const a = scheduleNextReview(state(4, 2), "solved", NOW);
    const b = scheduleNextReview(state(4, 2), "solved", NOW);
    expect(a).toEqual(b);
  });

  it("is timezone-independent (pure epoch arithmetic)", () => {
    const r = scheduleNextReview(state(4, 2), "solved", NOW);
    expect(r.nextReviewAt - NOW).toBe(8 * DAY_MS);
  });

  it("sanitizes NaN/negative/fractional stored values instead of propagating them", () => {
    const corrupted = {
      status: "review" as const,
      intervalDays: Number.NaN,
      successfulReviews: -5,
    };
    const r = scheduleNextReview(corrupted, "solved", NOW);
    expect(r.intervalDays).toBe(FIRST_SOLVED_INTERVAL_DAYS);
    expect(r.successfulReviews).toBe(1);
    expect(Number.isFinite(r.nextReviewAt)).toBe(true);
  });

  it("a full solve ladder reaches mastery and then stays capped", () => {
    let s: SchedulerState = { status: "learning", intervalDays: 0, successfulReviews: 0 };
    const intervals: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = scheduleNextReview(s, "solved", NOW);
      intervals.push(r.intervalDays);
      s = { status: r.status, intervalDays: r.intervalDays, successfulReviews: r.successfulReviews };
    }
    expect(intervals).toEqual([2, 4, 8, 16, 32, 60, 60, 60]);
    expect(s.status).toBe("mastered");
  });
});

describe("isDueForReview", () => {
  it("is due when nextReviewAt has passed or is exactly now", () => {
    expect(isDueForReview(NOW - 1, NOW)).toBe(true);
    expect(isDueForReview(NOW, NOW)).toBe(true);
  });

  it("is not due in the future", () => {
    expect(isDueForReview(NOW + 1, NOW)).toBe(false);
  });
});

describe("isStudyOutcome", () => {
  it("accepts exactly the three allowlisted outcomes", () => {
    expect(isStudyOutcome("again")).toBe(true);
    expect(isStudyOutcome("struggled")).toBe(true);
    expect(isStudyOutcome("solved")).toBe(true);
  });

  it("rejects anything else", () => {
    for (const bad of ["mastered", "", "SOLVED", null, undefined, 3, {}]) {
      expect(isStudyOutcome(bad)).toBe(false);
    }
  });
});
