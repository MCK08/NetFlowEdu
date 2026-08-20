import {
  buildLearningState,
  LearningStateInput,
  MIN_OUTCOMES_FOR_CONFIDENT_STATE,
  REPEATED_STRUGGLE_MIN_EVENTS,
} from "../../src/features/study/services/learningState";
import { resolveOutcomeHistory } from "../../src/features/study/services/outcomeCounters";

// Phase 42 — the classifier that lets a teacher tell a slip from a pattern.
//
// The gap it closes, proven on the live dashboard before this phase: a
// student who failed the SAME question eight times in a row and a student
// who failed four different questions once each both rendered as "low
// success rate, 1 weak question".

// Builds a REAL OutcomeHistory through Phase 41's own completeness rule, so
// no fixture here can describe a state the app could not actually store.
function history(solved: number, struggled: number, again = 0) {
  return resolveOutcomeHistory({
    attemptCount: solved + struggled + again,
    solvedCount: solved,
    struggledCount: struggled,
    againCount: again,
  });
}

function input(overrides: Partial<LearningStateInput> = {}): LearningStateInput {
  return {
    history: history(3, 0),
    lastOutcome: "solved",
    status: "review",
    successfulReviews: 3,
    ...overrides,
  };
}

describe("buildLearningState — insufficient evidence", () => {
  // Legacy: the item predates the counters entirely.
  it("is insufficient_data when the item has no cumulative history", () => {
    expect(buildLearningState(input({ history: null }))).toBe("insufficient_data");
  });

  it("never invents a struggle for a legacy item, even when the last outcome was a struggle", () => {
    expect(
      buildLearningState(input({ history: null, lastOutcome: "struggled", successfulReviews: 0 })),
    ).toBe("insufficient_data");
  });

  // The thin-sample case the dashboard used to render as a confident 100%.
  it("is insufficient_data for a single solve of a single attempt", () => {
    expect(buildLearningState(input({ history: history(1, 0), successfulReviews: 1 }))).toBe(
      "insufficient_data",
    );
  });

  it("is insufficient_data one outcome below the confidence bar", () => {
    const belowBar = MIN_OUTCOMES_FOR_CONFIDENT_STATE - 1;
    expect(buildLearningState(input({ history: history(belowBar, 0) }))).toBe("insufficient_data");
  });
});

describe("buildLearningState — stable", () => {
  it("is stable at exactly the confidence bar with no struggles", () => {
    expect(buildLearningState(input({ history: history(MIN_OUTCOMES_FOR_CONFIDENT_STATE, 0) }))).toBe(
      "stable",
    );
  });

  it("is stable well past the bar", () => {
    expect(buildLearningState(input({ history: history(12, 0) }))).toBe("stable");
  });

  // The server's own mastery verdict outranks any older struggle history.
  it("defers to the server: a mastered question is stable despite past struggles", () => {
    expect(
      buildLearningState(input({ history: history(6, 5), status: "mastered", successfulReviews: 4 })),
    ).toBe("stable");
  });
});

describe("buildLearningState — one-off vs repeated", () => {
  it("treats a single struggle as a slip, not a pattern", () => {
    expect(
      buildLearningState(input({ history: history(4, 1), lastOutcome: "struggled", successfulReviews: 0 })),
    ).toBe("one_off_struggle");
  });

  it("is still one_off when the single struggle is the only outcome at all", () => {
    expect(
      buildLearningState(input({ history: history(0, 1), lastOutcome: "struggled", successfulReviews: 0 })),
    ).toBe("one_off_struggle");
  });

  it("becomes a repeated pattern at exactly the repeat bar", () => {
    expect(
      buildLearningState(
        input({
          history: history(0, REPEATED_STRUGGLE_MIN_EVENTS),
          lastOutcome: "struggled",
          successfulReviews: 0,
        }),
      ),
    ).toBe("persistent_struggle");
  });

  // The case the whole phase exists for.
  it("classifies eight struggles on one question as persistent struggle", () => {
    expect(
      buildLearningState(input({ history: history(0, 8), lastOutcome: "struggled", successfulReviews: 0 })),
    ).toBe("persistent_struggle");
  });

  it("stays persistent when the last outcome was 'again' — asking to see it again is not resolving it", () => {
    expect(
      buildLearningState(input({ history: history(2, 4, 1), lastOutcome: "again", successfulReviews: 0 })),
    ).toBe("persistent_struggle");
  });

  // "again" is not counted as a struggle event: the scheduler treats it as a
  // 10-minute re-show, and the student-facing "N kez zorlandın" copy counts
  // struggled only. One meaning of "zorlanma" across the product.
  it("does not let 'again' outcomes alone create a struggle pattern", () => {
    expect(buildLearningState(input({ history: history(3, 0, 5), lastOutcome: "again" }))).toBe("stable");
  });
});

describe("buildLearningState — recovery", () => {
  it("is recovering when a repeated struggle has since been solved and that solve stands", () => {
    expect(
      buildLearningState(input({ history: history(2, 3), lastOutcome: "solved", successfulReviews: 2 })),
    ).toBe("recovering");
  });

  // successfulReviews is scheduler state: an "again" resets it to zero, so a
  // solve that no longer stands is not evidence of recovery.
  it("is NOT recovering when the last outcome was solved but no success is standing", () => {
    expect(
      buildLearningState(input({ history: history(2, 3), lastOutcome: "solved", successfulReviews: 0 })),
    ).toBe("persistent_struggle");
  });

  it("is NOT recovering while the most recent outcome is still a struggle", () => {
    expect(
      buildLearningState(input({ history: history(5, 3), lastOutcome: "struggled", successfulReviews: 1 })),
    ).toBe("persistent_struggle");
  });
});

describe("buildLearningState — determinism", () => {
  it("returns the same state for the same input", () => {
    const params = input({ history: history(2, 4), lastOutcome: "struggled", successfulReviews: 0 });
    expect(buildLearningState(params)).toBe(buildLearningState(params));
  });

  it("does not mutate its input", () => {
    const params = input({ history: history(1, 2), lastOutcome: "struggled", successfulReviews: 0 });
    const snapshot = JSON.stringify(params);
    buildLearningState(params);
    expect(JSON.stringify(params)).toBe(snapshot);
  });

  it("the thresholds are the repo's existing bars, not new invented numbers", () => {
    // "a single struggled outcome is not repeated" — assignmentFollowUp.ts
    expect(REPEATED_STRUGGLE_MIN_EVENTS).toBe(2);
    // "below this many recorded outcomes a rate is not trusted" —
    // assignmentOutcomeInsights.ts / MASTERY_MIN_SUCCESSFUL_REVIEWS
    expect(MIN_OUTCOMES_FOR_CONFIDENT_STATE).toBe(3);
  });
});
