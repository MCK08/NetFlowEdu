import {
  activeStudyQuestionId,
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
