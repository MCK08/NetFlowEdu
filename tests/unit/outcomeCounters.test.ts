import {
  incrementOutcomeCounters,
  outcomeCounterField,
} from "../../functions/src/study/studyTypes";
import { STUDY_OUTCOMES, StudyOutcome } from "../../functions/src/study/reviewScheduler";
import {
  buildSuccessRatePercent,
  resolveOutcomeHistory,
  sumOutcomeCounter,
} from "../../src/features/study/services/outcomeCounters";

// Phase 41 — cumulative per-question outcome counters.
//
// The defect these exist to fix: `successfulReviews` is the scheduler's
// streak state ("struggled" decrements it, "again" resets it to zero), but
// it was being divided by attemptCount as though it were a count of correct
// answers. A student who answered solved/solved/solved/again therefore
// displayed as 0% — identical to one who never answered anything correctly.

// Replays a real outcome sequence through the SAME increment helper the
// Cloud Function uses, returning the stored counters.
function replay(outcomes: readonly StudyOutcome[]) {
  let counters = { solvedCount: 0, struggledCount: 0, againCount: 0 };
  let first = true;
  for (const outcome of outcomes) {
    counters = incrementOutcomeCounters(first ? null : counters, outcome);
    first = false;
  }
  return counters;
}

describe("outcomeCounterField — covers the closed outcome union", () => {
  it.each([
    ["solved", "solvedCount"],
    ["struggled", "struggledCount"],
    ["again", "againCount"],
  ] as const)("%s maps to %s", (outcome, field) => {
    expect(outcomeCounterField(outcome)).toBe(field);
  });

  // The denominator argument: the union is closed and every member has its
  // own counter, so the three can never miss an outcome. If a fourth
  // outcome is ever added, this fails loudly rather than silently
  // under-counting every success rate in the product.
  it("gives every member of STUDY_OUTCOMES its own distinct counter", () => {
    const fields = STUDY_OUTCOMES.map(outcomeCounterField);
    expect(new Set(fields).size).toBe(STUDY_OUTCOMES.length);
    expect(STUDY_OUTCOMES.length).toBe(3);
  });
});

describe("incrementOutcomeCounters — arithmetic", () => {
  it("solved increments only solvedCount", () => {
    expect(incrementOutcomeCounters(null, "solved")).toEqual({
      solvedCount: 1,
      struggledCount: 0,
      againCount: 0,
    });
  });

  it("struggled increments only struggledCount", () => {
    expect(incrementOutcomeCounters(null, "struggled")).toEqual({
      solvedCount: 0,
      struggledCount: 1,
      againCount: 0,
    });
  });

  it("again increments only againCount", () => {
    expect(incrementOutcomeCounters(null, "again")).toEqual({
      solvedCount: 0,
      struggledCount: 0,
      againCount: 1,
    });
  });

  it("starts from zero for a legacy document that carries no counters", () => {
    expect(incrementOutcomeCounters({}, "solved").solvedCount).toBe(1);
  });

  it("ignores corrupted counter values rather than producing NaN", () => {
    const corrupted = {
      solvedCount: Number.NaN,
      struggledCount: -5,
      againCount: Number.POSITIVE_INFINITY,
    };
    expect(incrementOutcomeCounters(corrupted, "solved")).toEqual({
      solvedCount: 1,
      struggledCount: 0,
      againCount: 0,
    });
  });
});

describe("incrementOutcomeCounters — sequences", () => {
  it("S,S,S,A -> solved 3, struggled 0, again 1", () => {
    expect(replay(["solved", "solved", "solved", "again"])).toEqual({
      solvedCount: 3,
      struggledCount: 0,
      againCount: 1,
    });
  });

  it("T,S,S,T,S -> solved 3, struggled 2, again 0", () => {
    expect(replay(["struggled", "solved", "solved", "struggled", "solved"])).toEqual({
      solvedCount: 3,
      struggledCount: 2,
      againCount: 0,
    });
  });

  it("the sum of the counters is always the number of outcomes replayed", () => {
    const sequence: StudyOutcome[] = [
      "solved", "again", "struggled", "solved", "solved", "struggled", "again", "solved",
    ];
    const counters = replay(sequence);
    expect(counters.solvedCount + counters.struggledCount + counters.againCount).toBe(sequence.length);
  });
});

describe("incrementOutcomeCounters — invariants", () => {
  // The whole difference from successfulReviews, stated as a property:
  // nothing can make a cumulative counter go backwards.
  it("is monotonic — no outcome ever decreases any counter", () => {
    let counters = { solvedCount: 0, struggledCount: 0, againCount: 0 };
    const sequence: StudyOutcome[] = [
      "solved", "struggled", "again", "again", "solved", "struggled", "solved",
    ];
    for (const outcome of sequence) {
      const next = incrementOutcomeCounters(counters, outcome);
      expect(next.solvedCount).toBeGreaterThanOrEqual(counters.solvedCount);
      expect(next.struggledCount).toBeGreaterThanOrEqual(counters.struggledCount);
      expect(next.againCount).toBeGreaterThanOrEqual(counters.againCount);
      counters = next;
    }
  });

  it("advances the total by exactly one per outcome — never zero, never two", () => {
    let counters = { solvedCount: 0, struggledCount: 0, againCount: 0 };
    for (const outcome of ["solved", "struggled", "again"] as const) {
      const before = counters.solvedCount + counters.struggledCount + counters.againCount;
      counters = incrementOutcomeCounters(counters, outcome);
      const after = counters.solvedCount + counters.struggledCount + counters.againCount;
      expect(after - before).toBe(1);
    }
  });

  it("does not mutate the previous counters it is given", () => {
    const previous = { solvedCount: 2, struggledCount: 1, againCount: 0 };
    incrementOutcomeCounters(previous, "solved");
    expect(previous).toEqual({ solvedCount: 2, struggledCount: 1, againCount: 0 });
  });
});

describe("resolveOutcomeHistory — the completeness rule", () => {
  it("trusts counters that account for every recorded attempt", () => {
    expect(
      resolveOutcomeHistory({ attemptCount: 4, solvedCount: 3, struggledCount: 0, againCount: 1 }),
    ).toEqual({ solvedCount: 3, struggledCount: 0, againCount: 1, knownOutcomeCount: 4 });
  });

  // Legacy: no counters at all. Absent is NOT zero.
  it("returns null for a document that predates the counters", () => {
    expect(
      resolveOutcomeHistory({ attemptCount: 10, solvedCount: null, struggledCount: null, againCount: null }),
    ).toBeNull();
  });

  it("returns null when only some counters exist — a partial write is not history", () => {
    expect(
      resolveOutcomeHistory({ attemptCount: 3, solvedCount: 3, struggledCount: null, againCount: null }),
    ).toBeNull();
  });

  // The important one: a legacy item that has since recorded new outcomes.
  // Its counters are real but describe only the period since counting
  // began, so they must not be presented as the item's history.
  it("returns null when counters cover only part of the item's life", () => {
    expect(
      resolveOutcomeHistory({ attemptCount: 20, solvedCount: 1, struggledCount: 1, againCount: 0 }),
    ).toBeNull();
  });

  it("returns null for an item with counters but no recorded outcomes at all", () => {
    expect(
      resolveOutcomeHistory({ attemptCount: 0, solvedCount: 0, struggledCount: 0, againCount: 0 }),
    ).toBeNull();
  });

  it("never lets the counters exceed attemptCount be treated as complete", () => {
    expect(
      resolveOutcomeHistory({ attemptCount: 2, solvedCount: 5, struggledCount: 0, againCount: 0 }),
    ).toBeNull();
  });

  it("is deterministic and does not mutate its input", () => {
    const input = { attemptCount: 2, solvedCount: 1, struggledCount: 1, againCount: 0 };
    const first = resolveOutcomeHistory(input);
    const second = resolveOutcomeHistory(input);
    expect(first).toEqual(second);
    expect(input).toEqual({ attemptCount: 2, solvedCount: 1, struggledCount: 1, againCount: 0 });
  });
});

describe("buildSuccessRatePercent", () => {
  const complete = (solved: number, struggled: number, again = 0) =>
    resolveOutcomeHistory({
      attemptCount: solved + struggled + again,
      solvedCount: solved,
      struggledCount: struggled,
      againCount: again,
    });

  // The production defect, as a number.
  it("reports 75% for solved,solved,solved,again", () => {
    expect(buildSuccessRatePercent([complete(3, 0, 1)])).toBe(75);
  });

  it("reports 0% for a student who genuinely never solved anything", () => {
    expect(buildSuccessRatePercent([complete(0, 4)])).toBe(0);
  });

  it("gives those two students DIFFERENT numbers — the old math gave both 0%", () => {
    expect(buildSuccessRatePercent([complete(3, 0, 1)])).not.toBe(
      buildSuccessRatePercent([complete(0, 4)]),
    );
  });

  it("aggregates across items by real outcomes, not by item count", () => {
    // 3/4 and 1/2 -> 4 solved of 6 outcomes, not the average of 75% and 50%.
    expect(buildSuccessRatePercent([complete(3, 1), complete(1, 1)])).toBe(67);
  });

  it("returns null — never 0 — when nothing has trustworthy history", () => {
    expect(buildSuccessRatePercent([])).toBeNull();
    expect(buildSuccessRatePercent([null, null])).toBeNull();
  });

  it("skips untrustworthy items and reports from the rest", () => {
    expect(buildSuccessRatePercent([null, complete(3, 1)])).toBe(75);
  });

  it("is clamped to 100 even for a corrupted over-count", () => {
    expect(
      buildSuccessRatePercent([
        { solvedCount: 9, struggledCount: 0, againCount: 0, knownOutcomeCount: 4 },
      ]),
    ).toBe(100);
  });
});

describe("sumOutcomeCounter", () => {
  const complete = (solved: number, struggled: number, again = 0) =>
    resolveOutcomeHistory({
      attemptCount: solved + struggled + again,
      solvedCount: solved,
      struggledCount: struggled,
      againCount: again,
    });

  it("sums real struggled events across items", () => {
    expect(sumOutcomeCounter([complete(1, 8), complete(2, 2)], "struggledCount")).toBe(10);
  });

  // "Nobody struggled" and "we don't know" are different answers and must
  // stay different — this is what keeps the UI from inventing a number.
  it("returns null when no item contributed, but 0 when one genuinely did", () => {
    expect(sumOutcomeCounter([null, null], "struggledCount")).toBeNull();
    expect(sumOutcomeCounter([complete(3, 0)], "struggledCount")).toBe(0);
  });

  it("ignores untrustworthy items rather than counting them as zero", () => {
    expect(sumOutcomeCounter([null, complete(0, 5)], "struggledCount")).toBe(5);
  });
});
