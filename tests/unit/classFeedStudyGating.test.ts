import {
  activeStudyQuestionId,
  computeReshowInsertIndex,
  pickReshowOffset,
  RESHOW_MAX_OFFSET,
  RESHOW_MIN_OFFSET,
  shouldShowStudyControls,
} from "../../src/features/classes/services/classFeedStudyGating";

// The class feed can have many cards mounted at once. The product requirement
// is that study state is hydrated for the ACTIVE card only — a per-card read
// would turn one swipe into N Firestore reads.
//
// ClassFeedScreen holds exactly ONE study hook and feeds it
// activeStudyQuestionId, and the hook issues no request for a null id. So
// "null means zero reads" is the property that actually enforces the
// requirement, and it is what these tests pin down.

const ids = ["q0", "q1", "q2"];

describe("activeStudyQuestionId", () => {
  it("returns the question at the active index for a student", () => {
    expect(activeStudyQuestionId({ questionIds: ids, activeIndex: 1, isStudent: true })).toBe("q1");
  });

  it("returns null for a teacher — no read is opened at all", () => {
    // Study items exist only for students, and recordStudyOutcome rejects a
    // teacher outright, so both the read and the control would be pointless.
    expect(activeStudyQuestionId({ questionIds: ids, activeIndex: 1, isStudent: false })).toBeNull();
  });

  it("returns null for an empty feed", () => {
    // The real state on first render while the feed is still loading.
    expect(activeStudyQuestionId({ questionIds: [], activeIndex: 0, isStudent: true })).toBeNull();
  });

  it("returns null for an out-of-range index", () => {
    expect(activeStudyQuestionId({ questionIds: ids, activeIndex: 9, isStudent: true })).toBeNull();
    expect(activeStudyQuestionId({ questionIds: ids, activeIndex: -1, isStudent: true })).toBeNull();
  });

  it("returns null for a non-integer index", () => {
    expect(activeStudyQuestionId({ questionIds: ids, activeIndex: 1.5, isStudent: true })).toBeNull();
    expect(
      activeStudyQuestionId({ questionIds: ids, activeIndex: Number.NaN, isStudent: true }),
    ).toBeNull();
  });

  it("resolves to exactly one question across the whole feed", () => {
    // The core cost property: a feed of any size hydrates one question, so
    // the number of study reads never scales with the number of mounted
    // cards.
    const resolved = ids.map((_, activeIndex) =>
      activeStudyQuestionId({ questionIds: ids, activeIndex, isStudent: true }),
    );
    expect(resolved).toEqual(["q0", "q1", "q2"]);
    resolved.forEach((value) => expect(typeof value).toBe("string"));
  });
});

describe("shouldShowStudyControls", () => {
  it("shows controls on the active card for a student", () => {
    expect(shouldShowStudyControls({ index: 2, activeIndex: 2, isStudent: true })).toBe(true);
  });

  it("hides controls on every inactive card", () => {
    expect(shouldShowStudyControls({ index: 0, activeIndex: 2, isStudent: true })).toBe(false);
    expect(shouldShowStudyControls({ index: 3, activeIndex: 2, isStudent: true })).toBe(false);
  });

  it("hides controls from a teacher even on the active card", () => {
    expect(shouldShowStudyControls({ index: 2, activeIndex: 2, isStudent: false })).toBe(false);
  });

  it("marks at most one card in a mounted window", () => {
    // FlatList keeps neighbours mounted; if this ever returned true for more
    // than one index, several cards would render controls driven by a single
    // shared state — each showing the ACTIVE question's status.
    const window = [0, 1, 2, 3, 4, 5, 6, 7];
    const shown = window.filter((index) =>
      shouldShowStudyControls({ index, activeIndex: 4, isStudent: true }),
    );
    expect(shown).toEqual([4]);
  });

  it("marks zero cards for a teacher across the same window", () => {
    const window = [0, 1, 2, 3, 4, 5, 6, 7];
    const shown = window.filter((index) =>
      shouldShowStudyControls({ index, activeIndex: 4, isStudent: false }),
    );
    expect(shown).toEqual([]);
  });

  it("agrees with activeStudyQuestionId about which card is active", () => {
    // The two are used together — the control is rendered by one and fed by
    // the other. If they ever disagreed, a card would render controls bound
    // to a DIFFERENT question's state.
    const activeIndex = 1;
    const hydrated = activeStudyQuestionId({ questionIds: ids, activeIndex, isStudent: true });
    const shownIndex = ids.findIndex((_, index) =>
      shouldShowStudyControls({ index, activeIndex, isStudent: true }),
    );
    expect(ids[shownIndex]).toBe(hydrated);
  });
});

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
