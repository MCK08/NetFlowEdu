// Phase 61 — the chronology signal, and the safety properties that keep it
// subordinate to every stronger rule.
//
// The ranking tests below matter more than the signal tests: a tie-break that
// quietly outranks cumulative evidence would be a silent regression in what
// the app practises next, and nothing on screen would reveal it.

import {
  buildChronologyProfiles,
  chronologyRankOf,
  chronologyReasonFor,
  compareChronology,
  CHRONOLOGY_WINDOW,
} from "../../src/features/study/services/chronologyTieBreak";
import { LearningEvent } from "../../src/features/learningStory/services/learningTrail";
import { StudyOutcome } from "../../src/features/study/domain/studyTypes";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

function event(
  id: string,
  outcome: StudyOutcome,
  occurredAt: number,
  questionId = "q1",
): LearningEvent {
  return { id, questionId, outcome, occurredAt, subject: "Matematik", topic: "Denklemler" };
}

function profileFor(events: LearningEvent[], questionId = "q1") {
  return buildChronologyProfiles(events).get(questionId);
}

describe("chronology signal — shape reading", () => {
  it("reads repeated recent struggle", () => {
    const p = profileFor([
      event("a", "struggled", NOW - 3 * DAY),
      event("b", "struggled", NOW - 2 * DAY),
      event("c", "struggled", NOW - DAY),
    ]);
    expect(p?.shape).toBe("repeated_struggle");
  });

  it("reads a recovery", () => {
    const p = profileFor([
      event("a", "struggled", NOW - 3 * DAY),
      event("b", "struggled", NOW - 2 * DAY),
      event("c", "solved", NOW - DAY),
    ]);
    expect(p?.shape).toBe("recovery");
  });

  it("reads recent solved stability", () => {
    const p = profileFor([
      event("a", "solved", NOW - 2 * DAY),
      event("b", "solved", NOW - DAY),
      event("c", "solved", NOW),
    ]);
    expect(p?.shape).toBe("steady");
  });

  it("reads a mixed sequence as mixed", () => {
    const p = profileFor([
      event("a", "solved", NOW - 2 * DAY),
      event("b", "again", NOW - DAY),
    ]);
    expect(p?.shape).toBe("mixed");
  });

  it("says nothing from a single event", () => {
    const p = profileFor([event("a", "struggled", NOW)]);
    expect(p?.shape).toBeNull();
    expect(chronologyRankOf(p)).toBeNull();
  });

  it("treats 'again' as neither struggle nor solve", () => {
    // Matching reviewScheduler/learningState: "again" is a request to see the
    // card again shortly, not a report of difficulty. A sequence of them is
    // therefore NOT repeated struggle.
    const p = profileFor([
      event("a", "again", NOW - 2 * DAY),
      event("b", "again", NOW - DAY),
      event("c", "again", NOW),
    ]);
    expect(p?.shape).not.toBe("repeated_struggle");
    expect(p?.shape).not.toBe("steady");
  });
});

describe("chronology signal — input robustness", () => {
  it("normalises reverse (newest-first) input, as Firestore returns it", () => {
    const forward = profileFor([
      event("a", "struggled", NOW - 2 * DAY),
      event("b", "struggled", NOW - DAY),
      event("c", "solved", NOW),
    ]);
    const reversed = profileFor([
      event("c", "solved", NOW),
      event("b", "struggled", NOW - DAY),
      event("a", "struggled", NOW - 2 * DAY),
    ]);
    expect(reversed?.shape).toBe(forward?.shape);
    expect(reversed?.consideredEventIds).toEqual(forward?.consideredEventIds);
  });

  it("is deterministic when events share a timestamp", () => {
    const same = NOW - DAY;
    const one = profileFor([event("b", "solved", same), event("a", "struggled", same)]);
    const two = profileFor([event("a", "struggled", same), event("b", "solved", same)]);
    expect(one?.consideredEventIds).toEqual(two?.consideredEventIds);
  });

  it("defensively ignores a duplicated input id without hiding it as real history", () => {
    const dup = profileFor([
      event("a", "struggled", NOW - 2 * DAY),
      event("a", "struggled", NOW - 2 * DAY),
      event("b", "struggled", NOW - DAY),
    ]);
    // Two distinct events, not three.
    expect(dup?.eventCount).toBe(2);
  });

  it("keeps only the most recent window", () => {
    const many = Array.from({ length: CHRONOLOGY_WINDOW + 3 }, (_, i) =>
      event(`e${i}`, "solved", NOW - (CHRONOLOGY_WINDOW + 3 - i) * DAY),
    );
    const p = profileFor(many);
    expect(p?.eventCount).toBe(CHRONOLOGY_WINDOW);
    expect(p?.consideredEventIds.at(-1)).toBe(`e${CHRONOLOGY_WINDOW + 2}`);
  });

  it("never mixes one question's events into another's", () => {
    const profiles = buildChronologyProfiles([
      event("a", "struggled", NOW - 2 * DAY, "denklemler-q"),
      event("b", "struggled", NOW - DAY, "denklemler-q"),
      event("c", "solved", NOW, "geometri-q"),
    ]);
    expect(profiles.get("denklemler-q")?.shape).toBe("repeated_struggle");
    // One event only — no shape, and certainly not the other question's.
    expect(profiles.get("geometri-q")?.shape).toBeNull();
  });
});

describe("chronology comparison — rollout fairness", () => {
  const struggling = profileFor([
    event("a", "struggled", NOW - 2 * DAY),
    event("b", "struggled", NOW - DAY),
    event("c", "struggled", NOW),
  ]);
  const steady = profileFor([
    event("a", "solved", NOW - 2 * DAY),
    event("b", "solved", NOW - DAY),
    event("c", "solved", NOW),
  ]);

  it("prefers repeated struggle over steady solving", () => {
    expect(compareChronology(struggling, steady)).toBeLessThan(0);
  });

  it("does NOT favour a candidate merely for having chronology", () => {
    // The event log begins at Phase 59; ranking on presence alone would
    // reward whatever was studied after the upgrade, not real evidence.
    expect(compareChronology(struggling, undefined)).toBe(0);
    expect(compareChronology(undefined, struggling)).toBe(0);
  });

  it("treats two unreadable sequences as indistinguishable", () => {
    expect(compareChronology(undefined, undefined)).toBe(0);
  });

  it("treats identical signals as indistinguishable", () => {
    expect(compareChronology(struggling, struggling)).toBe(0);
  });

  it("orders repeated struggle before recovery before mixed before steady", () => {
    const recovery = profileFor([
      event("a", "struggled", NOW - 2 * DAY),
      event("b", "struggled", NOW - DAY),
      event("c", "solved", NOW),
    ]);
    const mixed = profileFor([
      event("a", "solved", NOW - DAY),
      event("b", "again", NOW),
    ]);
    expect(chronologyRankOf(struggling)!).toBeLessThan(chronologyRankOf(recovery)!);
    expect(chronologyRankOf(recovery)!).toBeLessThan(chronologyRankOf(mixed)!);
    expect(chronologyRankOf(mixed)!).toBeLessThan(chronologyRankOf(steady)!);
  });
});

describe("chronology explainability", () => {
  it("explains only the shapes that can promote a question", () => {
    const struggling = profileFor([
      event("a", "struggled", NOW - DAY),
      event("b", "struggled", NOW),
    ]);
    const recovery = profileFor([
      event("a", "struggled", NOW - 2 * DAY),
      event("b", "struggled", NOW - DAY),
      event("c", "solved", NOW),
    ]);
    const steady = profileFor([
      event("a", "solved", NOW - DAY),
      event("b", "solved", NOW),
    ]);
    expect(chronologyReasonFor(struggling)).toBe("recent_repeated_struggle");
    expect(chronologyReasonFor(recovery)).toBe("recent_recovery");
    // Explaining a deprioritisation to a student is noise.
    expect(chronologyReasonFor(steady)).toBeNull();
    expect(chronologyReasonFor(undefined)).toBeNull();
  });
});
