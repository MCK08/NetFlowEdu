import {
  computeReshowInsertIndex,
  pickReshowOffset,
  RESHOW_MAX_OFFSET,
  RESHOW_MIN_OFFSET,
} from "../../src/features/classes/services/classFeedStudyGating";

// Phase 19.2 note: `activeStudyQuestionId`/`shouldShowStudyControls` (and
// their tests) were removed here — the interleaved feed item model
// (feedItems.ts, driven by useInterleavedStudyFeed) replaced the "active
// card renders inline/overlaid controls" model those two functions existed
// for. The rating "screen" is now its own real feed item (RatingCard), not
// state derived from which question card is active.

// Phase 18 — scroll-first "second chance" reshow. The server-side
// scheduler (functions/src/study/reviewScheduler.ts) is untouched and
// already sends a struggled item a full day out; these two functions are
// the ENTIRE new client-side layer on top of it, so they carry the whole
// burden of proof for the product rule: one session-local second chance,
// never two.
describe("pickReshowOffset", () => {
  it("always falls within the specified 20-40 window", () => {
    // Deterministic sweep across [0, 1) — Math.random()'s actual contracted
    // range (never 1 itself) — rather than relying on the real RNG, so a
    // flaky range bug can't show up only occasionally.
    for (let i = 0; i < 100; i++) {
      const offset = pickReshowOffset(() => i / 100);
      expect(offset).toBeGreaterThanOrEqual(RESHOW_MIN_OFFSET);
      expect(offset).toBeLessThanOrEqual(RESHOW_MAX_OFFSET);
    }
  });

  it("reaches both the minimum and the maximum of the window", () => {
    expect(pickReshowOffset(() => 0)).toBe(RESHOW_MIN_OFFSET);
    // Just under 1 (real Math.random's range) must still land on the max,
    // not overshoot it by one.
    expect(pickReshowOffset(() => 0.999999)).toBe(RESHOW_MAX_OFFSET);
  });
});

describe("computeReshowInsertIndex", () => {
  it("places the question `offset` items ahead of the current one", () => {
    expect(
      computeReshowInsertIndex({
        currentIndex: 5,
        totalLength: 100,
        offset: 25,
        alreadyReshownThisSession: false,
      }),
    ).toBe(30);
  });

  it("clamps to the end of the currently-loaded feed rather than overshooting it", () => {
    expect(
      computeReshowInsertIndex({
        currentIndex: 5,
        totalLength: 12,
        offset: 25,
        alreadyReshownThisSession: false,
      }),
    ).toBe(12);
  });

  it("returns null once a question already had its second chance this session — the core 'never twice' rule", () => {
    expect(
      computeReshowInsertIndex({
        currentIndex: 5,
        totalLength: 100,
        offset: 25,
        alreadyReshownThisSession: true,
      }),
    ).toBeNull();
  });
});
