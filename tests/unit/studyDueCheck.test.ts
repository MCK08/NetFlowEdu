import {
  countDueNow,
  isAnythingDueNow,
  resolveStudyStartTarget,
} from "../../src/features/study/services/studyDueCheck";

const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

describe("isAnythingDueNow", () => {
  it("is false for an empty list", () => {
    expect(isAnythingDueNow([], NOW)).toBe(false);
  });

  it("is true when exactly one item is due", () => {
    expect(isAnythingDueNow([{ nextReviewAt: NOW - DAY_MS }], NOW)).toBe(true);
  });

  it("is false when the only item is due in the future", () => {
    expect(isAnythingDueNow([{ nextReviewAt: NOW + DAY_MS }], NOW)).toBe(false);
  });

  it("is true for a mix of due and future items", () => {
    const items = [{ nextReviewAt: NOW + DAY_MS }, { nextReviewAt: NOW - DAY_MS }];
    expect(isAnythingDueNow(items, NOW)).toBe(true);
  });

  it("treats nextReviewAt === now as due (inclusive boundary, matches dailyPracticePlan.ts's own <= rule)", () => {
    expect(isAnythingDueNow([{ nextReviewAt: NOW }], NOW)).toBe(true);
  });

  it("ignores an item with a missing or invalid nextReviewAt rather than treating it as due", () => {
    const items = [
      { nextReviewAt: null },
      { nextReviewAt: undefined },
      { nextReviewAt: Number.NaN },
      { nextReviewAt: Number.POSITIVE_INFINITY },
    ];
    expect(isAnythingDueNow(items, NOW)).toBe(false);
  });

  it("still finds a real due item alongside invalid ones", () => {
    const items = [{ nextReviewAt: null }, { nextReviewAt: NOW - 1 }];
    expect(isAnythingDueNow(items, NOW)).toBe(true);
  });

  it("is true when multiple items are due", () => {
    const items = [{ nextReviewAt: NOW - 1 }, { nextReviewAt: NOW - 2 }, { nextReviewAt: NOW - 3 }];
    expect(isAnythingDueNow(items, NOW)).toBe(true);
  });

  it("does not mutate the input array", () => {
    const items = [{ nextReviewAt: NOW - DAY_MS }, { nextReviewAt: NOW + DAY_MS }];
    const copy = items.map((item) => ({ ...item }));
    isAnythingDueNow(items, NOW);
    expect(items).toEqual(copy);
  });

  it("is deterministic — the same input always produces the same output", () => {
    const items = [{ nextReviewAt: NOW - DAY_MS }, { nextReviewAt: NOW + DAY_MS }];
    expect(isAnythingDueNow(items, NOW)).toBe(isAnythingDueNow(items, NOW));
  });
});

describe("resolveStudyStartTarget — tap-time routing, overrides any stale snapshot", () => {
  it("routes to mandatory when something is due, even if the caller thought nothing was (stale dueCount=0)", () => {
    const items = [{ nextReviewAt: NOW - 1 }];
    const target = resolveStudyStartTarget({ items, now: NOW, hasPlanItems: false });
    expect(target).toBe("mandatory");
  });

  it("routes to adaptive when the caller's stale snapshot said something was due but the live check disagrees", () => {
    // The caller's own stale `plan.dueCount > 0` is irrelevant here — this
    // function never receives it, by design: it re-derives due-ness itself.
    const items = [{ nextReviewAt: NOW + DAY_MS }];
    const target = resolveStudyStartTarget({ items, now: NOW, hasPlanItems: true });
    expect(target).toBe("adaptive");
  });

  it("routes to mandatory for a mix of due and not-yet-due items", () => {
    const items = [{ nextReviewAt: NOW + DAY_MS }, { nextReviewAt: NOW - DAY_MS }];
    const target = resolveStudyStartTarget({ items, now: NOW, hasPlanItems: true });
    expect(target).toBe("mandatory");
  });

  it("routes to mandatory exactly at the due boundary", () => {
    const items = [{ nextReviewAt: NOW }];
    const target = resolveStudyStartTarget({ items, now: NOW, hasPlanItems: false });
    expect(target).toBe("mandatory");
  });

  it("ignores an invalid timestamp and falls through to the next rule", () => {
    const items = [{ nextReviewAt: Number.NaN }];
    expect(resolveStudyStartTarget({ items, now: NOW, hasPlanItems: true })).toBe("adaptive");
    expect(resolveStudyStartTarget({ items, now: NOW, hasPlanItems: false })).toBe("none");
  });

  it("routes to none when nothing is due and the plan has no items", () => {
    const items = [{ nextReviewAt: NOW + DAY_MS }];
    expect(resolveStudyStartTarget({ items, now: NOW, hasPlanItems: false })).toBe("none");
  });
});

// Phase 39 — the recommendation surface needs the NUMBER of due items, not
// just the predicate, and must derive it from the same fresh clock reading
// isAnythingDueNow uses rather than from plan.dueCount's memoized snapshot.
describe("countDueNow", () => {
  it("is 0 for an empty list", () => {
    expect(countDueNow([], NOW)).toBe(0);
  });

  it("counts every item whose review time has passed", () => {
    const items = [
      { nextReviewAt: NOW - DAY_MS },
      { nextReviewAt: NOW - 1 },
      { nextReviewAt: NOW + DAY_MS },
    ];
    expect(countDueNow(items, NOW)).toBe(2);
  });

  it("includes the exact boundary — same inclusive rule as isAnythingDueNow", () => {
    expect(countDueNow([{ nextReviewAt: NOW }], NOW)).toBe(1);
  });

  it("skips missing and invalid timestamps instead of counting them as due", () => {
    const items = [
      { nextReviewAt: Number.NaN },
      { nextReviewAt: null },
      { nextReviewAt: undefined },
      { nextReviewAt: NOW - DAY_MS },
    ];
    expect(countDueNow(items, NOW)).toBe(1);
  });

  // The two must never be able to disagree about what "due" means.
  it("is positive exactly when isAnythingDueNow is true", () => {
    const cases = [
      [],
      [{ nextReviewAt: NOW + DAY_MS }],
      [{ nextReviewAt: NOW }],
      [{ nextReviewAt: Number.NaN }],
      [{ nextReviewAt: NOW - DAY_MS }, { nextReviewAt: NOW + DAY_MS }],
    ];
    for (const items of cases) {
      expect(countDueNow(items, NOW) > 0).toBe(isAnythingDueNow(items, NOW));
    }
  });
});
