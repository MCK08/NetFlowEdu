import {
  applyOutcomeResult,
  parseStudyItem,
  retainItemForQuestion,
  shouldApplyHydration,
  shouldApplyOutcome,
} from "../../src/features/study/services/studyItemParser";

// Hydration is what makes a study surface show the student where a question
// ACTUALLY stands instead of always rendering blank. These tests cover the
// two things that can go wrong with it: a raw document that does not match
// the expected schema, and an async result that arrives after the question
// on screen has already changed.

describe("parseStudyItem", () => {
  const complete = {
    questionId: "q1",
    status: "review",
    lastOutcome: "struggled",
    intervalDays: 4,
    successfulReviews: 2,
    attemptCount: 5,
    nextReviewAt: 1_700_000_000_000,
    source: "class",
  };

  it("returns null when the student has never studied the question", () => {
    // The overwhelmingly common case — not an error state.
    expect(parseStudyItem("q1", undefined)).toBeNull();
    expect(parseStudyItem("q1", null)).toBeNull();
  });

  it("returns null for a non-object document", () => {
    expect(parseStudyItem("q1", "corrupt")).toBeNull();
    expect(parseStudyItem("q1", 42)).toBeNull();
  });

  it("passes a well-formed document through unchanged", () => {
    expect(parseStudyItem("q1", complete)).toEqual(complete);
  });

  it("stamps the requested questionId rather than trusting the document", () => {
    // The document is addressed BY questionId, so the path is authoritative;
    // a stale/mismatched field inside must not win.
    const parsed = parseStudyItem("q-real", { ...complete, questionId: "q-stale" });
    expect(parsed?.questionId).toBe("q-real");
  });

  it("falls back to 'learning' for an unrecognized status", () => {
    // Conservative on purpose: 'learning' means "keep showing me this",
    // which is the safe direction for an unreadable document.
    expect(parseStudyItem("q1", { ...complete, status: "graduated" })?.status).toBe("learning");
    expect(parseStudyItem("q1", { ...complete, status: undefined })?.status).toBe("learning");
  });

  it("drops an unrecognized lastOutcome instead of guessing one", () => {
    // A wrong value here would highlight a button the student never pressed.
    expect(parseStudyItem("q1", { ...complete, lastOutcome: "perfect" })?.lastOutcome).toBeNull();
    expect(parseStudyItem("q1", { ...complete, lastOutcome: 3 })?.lastOutcome).toBeNull();
  });

  it("floors negative and fractional counters to a non-negative integer", () => {
    const parsed = parseStudyItem("q1", {
      ...complete,
      intervalDays: -5,
      successfulReviews: 2.7,
      attemptCount: Number.NaN,
    });
    expect(parsed?.intervalDays).toBe(0);
    expect(parsed?.successfulReviews).toBe(2);
    expect(parsed?.attemptCount).toBe(0);
  });

  it("uses null, not 0, for a missing nextReviewAt", () => {
    // 0 is a valid epoch and would render as "due right now" — a different
    // and wrong claim about the schedule.
    expect(parseStudyItem("q1", { ...complete, nextReviewAt: undefined })?.nextReviewAt).toBeNull();
    expect(parseStudyItem("q1", { ...complete, nextReviewAt: "soon" })?.nextReviewAt).toBeNull();
    expect(parseStudyItem("q1", { ...complete, nextReviewAt: 0 })?.nextReviewAt).toBe(0);
  });

  it("defaults an unknown source to public", () => {
    expect(parseStudyItem("q1", { ...complete, source: "imported" })?.source).toBe("public");
  });
});

describe("applyOutcomeResult", () => {
  const serverResult = {
    status: "review" as const,
    intervalDays: 4,
    successfulReviews: 2,
    nextReviewAt: 1_700_000_000_000,
  };

  it("takes status and schedule from the SERVER, never recomputing them", () => {
    const applied = applyOutcomeResult(null, "q1", "solved", serverResult);
    expect(applied.status).toBe("review");
    expect(applied.intervalDays).toBe(4);
    expect(applied.successfulReviews).toBe(2);
    expect(applied.nextReviewAt).toBe(1_700_000_000_000);
  });

  it("records the outcome the student actually chose", () => {
    expect(applyOutcomeResult(null, "q1", "again", serverResult).lastOutcome).toBe("again");
  });

  it("starts attemptCount at 1 for a first-ever review", () => {
    expect(applyOutcomeResult(null, "q1", "solved", serverResult).attemptCount).toBe(1);
  });

  it("increments attemptCount from the previous item", () => {
    const previous = parseStudyItem("q1", {
      status: "learning",
      attemptCount: 3,
      source: "class",
    });
    const applied = applyOutcomeResult(previous, "q1", "solved", serverResult);
    expect(applied.attemptCount).toBe(4);
    // source is not part of the callable's response, so it is carried over
    // rather than silently reset to "public".
    expect(applied.source).toBe("class");
  });
});

describe("shouldApplyHydration", () => {
  const base = {
    requestedQuestionId: "q1",
    currentQuestionId: "q1",
    requestGeneration: 3,
    currentGeneration: 3,
  };

  it("applies a response that is still current", () => {
    expect(shouldApplyHydration(base)).toBe(true);
  });

  it("drops a response for a question that is no longer on screen", () => {
    expect(shouldApplyHydration({ ...base, currentQuestionId: "q2" })).toBe(false);
  });

  it("drops a superseded response for the SAME question", () => {
    // Re-entering the same question issues a new read; the older in-flight
    // one must not win a race and overwrite the newer result.
    expect(shouldApplyHydration({ ...base, currentGeneration: 4 })).toBe(false);
  });
});

describe("retainItemForQuestion", () => {
  const item = parseStudyItem("q1", { status: "mastered", lastOutcome: "solved" });

  it("keeps state while re-hydrating the SAME question", () => {
    // Otherwise a remount would flash the card back to "not in plan".
    expect(retainItemForQuestion(item, "q1")).toBe(item);
  });

  it("drops state belonging to a different question", () => {
    // The class feed swipe case: the outcome buttons read item.lastOutcome
    // directly, so keeping q1's "solved" here would show it selected on q2
    // for the whole duration of q2's fetch.
    expect(retainItemForQuestion(item, "q2")).toBeNull();
  });

  it("is a no-op when nothing is held", () => {
    expect(retainItemForQuestion(null, "q1")).toBeNull();
  });
});

describe("shouldApplyOutcome", () => {
  it("applies a result to the question it was issued for", () => {
    expect(shouldApplyOutcome({ targetQuestionId: "q1", currentQuestionId: "q1" })).toBe(true);
  });

  it("drops a result that resolved after the active question changed", () => {
    // The server already recorded it; misattributing it to q2 would show the
    // student a status for a question they never assessed.
    expect(shouldApplyOutcome({ targetQuestionId: "q1", currentQuestionId: "q2" })).toBe(false);
  });

  it("drops a result when no question is active", () => {
    expect(shouldApplyOutcome({ targetQuestionId: "q1", currentQuestionId: null })).toBe(false);
  });

  it("rejects an empty target id", () => {
    expect(shouldApplyOutcome({ targetQuestionId: "", currentQuestionId: "" })).toBe(false);
  });
});
