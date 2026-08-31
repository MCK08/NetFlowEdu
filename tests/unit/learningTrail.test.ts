import {
  hasTrustworthyTrail,
  LearningEvent,
  MAX_TRAIL_EVENTS,
  resolveTrailShape,
  selectTopicTrail,
  sortEventsChronologically,
  trailInsightText,
  trailStepLabel,
} from "../../src/features/learningStory/services/learningTrail";
import { StudyOutcome } from "../../src/features/study/domain/studyTypes";

function ev(
  id: string,
  outcome: StudyOutcome,
  occurredAt: number,
  overrides: Partial<LearningEvent> = {},
): LearningEvent {
  return {
    id,
    questionId: `q-${id}`,
    outcome,
    occurredAt,
    subject: "Matematik",
    topic: "Denklemler",
    ...overrides,
  };
}

describe("sortEventsChronologically", () => {
  it("orders oldest → newest", () => {
    const sorted = sortEventsChronologically([ev("c", "solved", 300), ev("a", "struggled", 100), ev("b", "struggled", 200)]);
    expect(sorted.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  // Two events written in the same millisecond must never swap between
  // renders, and order must never depend on Firestore's return order.
  it("breaks an identical-timestamp tie deterministically by id", () => {
    const forward = sortEventsChronologically([ev("b", "solved", 100), ev("a", "struggled", 100)]);
    const reversed = sortEventsChronologically([ev("a", "struggled", 100), ev("b", "solved", 100)]);
    expect(forward.map((e) => e.id)).toEqual(["a", "b"]);
    expect(reversed.map((e) => e.id)).toEqual(forward.map((e) => e.id));
  });

  it("does not mutate its input", () => {
    const input = [ev("b", "solved", 200), ev("a", "struggled", 100)];
    const copy = [...input];
    sortEventsChronologically(input);
    expect(input).toEqual(copy);
  });
});

describe("selectTopicTrail", () => {
  it("keeps only the requested topic's events, in order", () => {
    const trail = selectTopicTrail(
      [
        ev("a", "struggled", 100),
        ev("other", "solved", 150, { subject: "Fizik", topic: "Kuvvet" }),
        ev("b", "solved", 200),
      ],
      "Matematik",
      "Denklemler",
    );
    expect(trail.map((e) => e.id)).toEqual(["a", "b"]);
  });

  // The window must be the MOST RECENT events, not the first ones returned.
  it("keeps the most recent events when there are more than the cap", () => {
    const many = Array.from({ length: MAX_TRAIL_EVENTS + 3 }, (_, i) =>
      ev(`e${i}`, "solved", (i + 1) * 100),
    );
    const trail = selectTopicTrail(many, "Matematik", "Denklemler");
    expect(trail).toHaveLength(MAX_TRAIL_EVENTS);
    expect(trail[trail.length - 1]?.id).toBe(`e${MAX_TRAIL_EVENTS + 2}`);
  });

  // A legacy question whose metadata could not be resolved carries "" for
  // subject/topic and must never contaminate a real topic's trail.
  it("never matches an unresolved-metadata event", () => {
    const trail = selectTopicTrail([ev("legacy", "struggled", 100, { subject: "", topic: "" })], "", "");
    expect(trail).toEqual([]);
  });

  it("returns nothing for a topic with no events", () => {
    expect(selectTopicTrail([ev("a", "solved", 100)], "Fizik", "Kuvvet")).toEqual([]);
  });
});

describe("hasTrustworthyTrail", () => {
  // One outcome is not a journey; rendering it as a sequence would overstate
  // the evidence.
  it("rejects a single event", () => {
    expect(hasTrustworthyTrail([ev("a", "struggled", 100)])).toBe(false);
  });

  it("rejects an empty trail", () => {
    expect(hasTrustworthyTrail([])).toBe(false);
  });

  it("accepts two or more", () => {
    expect(hasTrustworthyTrail([ev("a", "struggled", 100), ev("b", "solved", 200)])).toBe(true);
  });
});

describe("resolveTrailShape", () => {
  it("reads struggle → struggle → solve as a recovery", () => {
    expect(
      resolveTrailShape([ev("a", "struggled", 100), ev("b", "struggled", 200), ev("c", "solved", 300)]),
    ).toBe("recovery");
  });

  // Order is the whole point: the same multiset in the opposite order is NOT
  // a recovery.
  it("does not call solve → struggle a recovery", () => {
    expect(resolveTrailShape([ev("a", "solved", 100), ev("b", "struggled", 200)])).not.toBe(
      "recovery",
    );
  });

  it("reads consecutive struggles as repeated struggle", () => {
    expect(resolveTrailShape([ev("a", "struggled", 100), ev("b", "struggled", 200)])).toBe(
      "repeated_struggle",
    );
  });

  it("reads consecutive solves as steady", () => {
    expect(resolveTrailShape([ev("a", "solved", 100), ev("b", "solved", 200)])).toBe("steady");
  });

  // "again" is a request to see the card again shortly, not a report of
  // difficulty — the rule learningState.ts already applies.
  it("does not treat 'again' as a struggle", () => {
    expect(resolveTrailShape([ev("a", "again", 100), ev("b", "solved", 200)])).not.toBe("recovery");
    expect(resolveTrailShape([ev("a", "again", 100), ev("b", "again", 200)])).not.toBe(
      "repeated_struggle",
    );
  });

  it("is null when there is not enough evidence", () => {
    expect(resolveTrailShape([ev("a", "solved", 100)])).toBeNull();
    expect(resolveTrailShape([])).toBeNull();
  });
});

describe("trailInsightText", () => {
  it("gives the recovery sentence for a real recovery", () => {
    expect(
      trailInsightText([ev("a", "struggled", 100), ev("b", "struggled", 200), ev("c", "solved", 300)]),
    ).toBe("Son çalışmalarda toparlanma görülüyor.");
  });

  // A mixed sequence supports no honest summary beyond the trail itself.
  it("says nothing for a mixed sequence", () => {
    expect(
      trailInsightText([ev("a", "solved", 100), ev("b", "struggled", 200), ev("c", "again", 300)]),
    ).toBeNull();
  });

  it("says nothing when evidence is too thin", () => {
    expect(trailInsightText([ev("a", "solved", 100)])).toBeNull();
  });

  // §26/§99 — observational only. No mastery claim, no causal claim, no
  // shaming, and never a number the events cannot prove.
  it("never overclaims or shames in any supported shape", () => {
    const shapes: LearningEvent[][] = [
      [ev("a", "struggled", 100), ev("b", "struggled", 200), ev("c", "solved", 300)],
      [ev("a", "struggled", 100), ev("b", "struggled", 200)],
      [ev("a", "solved", 100), ev("b", "solved", 200)],
    ];
    for (const trail of shapes) {
      const text = trailInsightText(trail);
      expect(text).not.toBeNull();
      expect(text).not.toMatch(/öğrendin|ustalaştın|başardın sayesinde|kötüsün|başarısız/i);
      expect(text).not.toMatch(/%\d/);
      expect(text).not.toMatch(/bu hafta|bu ay/i);
    }
  });
});

describe("trailStepLabel", () => {
  it("uses human Turkish, never the internal enum", () => {
    expect(trailStepLabel("solved")).toBe("Çözdüm");
    expect(trailStepLabel("struggled")).toBe("Zorlandım");
    expect(trailStepLabel("again")).toBe("Tekrar Çalıştım");
  });

  it("never leaks an internal outcome name", () => {
    for (const outcome of ["solved", "struggled", "again"] as const) {
      expect(trailStepLabel(outcome)).not.toMatch(/solved|struggled|again/);
    }
  });
});
