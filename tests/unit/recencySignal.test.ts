import {
  buildRecencySignal,
  RECENCY_PRIORITY,
  recencyPriorityIndex,
} from "../../src/features/study/services/recencySignal";

const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

describe("buildRecencySignal", () => {
  it("is 'never_practiced' when lastReviewedAt is zero (no record at all)", () => {
    expect(buildRecencySignal(0, NOW)).toBe("never_practiced");
  });

  it("is 'never_practiced' for a negative/garbage timestamp", () => {
    expect(buildRecencySignal(-1, NOW)).toBe("never_practiced");
    expect(buildRecencySignal(NaN, NOW)).toBe("never_practiced");
  });

  it("is 'recently_practiced' for right now", () => {
    expect(buildRecencySignal(NOW, NOW)).toBe("recently_practiced");
  });

  it("is 'recently_practiced' within the recent window", () => {
    expect(buildRecencySignal(NOW - 1 * DAY_MS, NOW)).toBe("recently_practiced");
    expect(buildRecencySignal(NOW - 3 * DAY_MS, NOW)).toBe("recently_practiced");
  });

  it("is 'aging' between the recent window and the stale threshold", () => {
    expect(buildRecencySignal(NOW - 7 * DAY_MS, NOW)).toBe("aging");
  });

  it("is 'stale' at and beyond the stale threshold", () => {
    expect(buildRecencySignal(NOW - 14 * DAY_MS, NOW)).toBe("stale");
    expect(buildRecencySignal(NOW - 30 * DAY_MS, NOW)).toBe("stale");
  });

  it("clamps a future timestamp to 'recently_practiced' rather than negative days", () => {
    expect(buildRecencySignal(NOW + DAY_MS, NOW)).toBe("recently_practiced");
  });

  it("falls back to Date.now() for an invalid `now`, never throwing", () => {
    expect(() => buildRecencySignal(NOW, NaN)).not.toThrow();
  });

  it("is deterministic for the same inputs", () => {
    expect(buildRecencySignal(NOW - 5 * DAY_MS, NOW)).toBe(buildRecencySignal(NOW - 5 * DAY_MS, NOW));
  });
});

describe("recencyPriorityIndex", () => {
  it("orders 'stale' as the most urgent", () => {
    expect(recencyPriorityIndex("stale")).toBe(0);
  });

  it("orders 'recently_practiced' as the least urgent", () => {
    expect(recencyPriorityIndex("recently_practiced")).toBe(RECENCY_PRIORITY.length - 1);
  });

  it("gives every signal a distinct index", () => {
    const indexes = RECENCY_PRIORITY.map((signal) => recencyPriorityIndex(signal));
    expect(new Set(indexes).size).toBe(RECENCY_PRIORITY.length);
  });
});
