// Phase 79 — the recovery contract.
//
// Almost every test here is about NOT claiming recovery. The one thing this
// phase must never do is turn silence, or a single moment, or a relapse, into
// a story about a learner getting better.

import { LearningEvent } from "../../src/features/learningStory/services/learningTrail";
import {
  buildVerifiedChoicePatterns,
  CHOICE_RECOVERY_LABEL,
  choiceRecoveryFact,
} from "../../src/features/study/services/verifiedChoicePatterns";

const T0 = 1_700_000_000_000;
const NS = "teacher-1";
const KEY = "sign_transfer_error";

function base(over: Partial<LearningEvent> = {}): LearningEvent {
  return {
    id: `e-${Math.random()}`,
    questionId: "q1",
    outcome: "struggled",
    occurredAt: T0,
    subject: "Matematik",
    topic: "Denklemler",
    semanticChoice: null,
    semanticOpportunities: null,
    ...over,
  };
}

/** The meaning was offered AND taken. */
function selected(questionId: string, at: number, over: Partial<LearningEvent> = {}): LearningEvent {
  return base({
    questionId,
    occurredAt: at,
    semanticChoice: { namespaceId: NS, conceptKey: KEY, choiceLabel: "A" },
    semanticOpportunities: { namespaceId: NS, conceptKeys: [KEY], selectedChoice: "A" },
    ...over,
  });
}

/** The meaning was offered and the student picked something else. */
function declined(questionId: string, at: number, over: Partial<LearningEvent> = {}): LearningEvent {
  return base({
    questionId,
    occurredAt: at,
    outcome: "solved",
    semanticChoice: null,
    semanticOpportunities: { namespaceId: NS, conceptKeys: [KEY], selectedChoice: "B" },
    ...over,
  });
}

/** An ordinary event: no opportunity evidence at all (legacy, or an outcome
 *  recorded without touching the options). */
function plain(questionId: string, at: number): LearningEvent {
  return base({ questionId, occurredAt: at, outcome: "solved" });
}

const build = (events: LearningEvent[]) => buildVerifiedChoicePatterns({ events });
const only = (events: LearningEvent[]) => build(events).patterns[0];

/** The two selections that make a pattern exist at all. */
const PATTERN = [selected("q1", T0), selected("q2", T0 + 100)];

describe("recovery requires a pattern first", () => {
  it("declined opportunities alone produce no pattern and no recovery", () => {
    const memory = build([declined("q1", T0), declined("q2", T0 + 1), declined("q3", T0 + 2)]);
    expect(memory.patterns).toEqual([]);
  });

  it("one selection plus later declines produces no pattern", () => {
    const memory = build([
      selected("q1", T0),
      declined("q2", T0 + 10),
      declined("q3", T0 + 20),
    ]);
    expect(memory.patterns).toEqual([]);
  });

  it("a repeated pattern with nothing after it stays repeated", () => {
    expect(only(PATTERN)?.recovery).toBeNull();
  });
});

describe("the recovery threshold", () => {
  it("one later decline is not enough", () => {
    expect(only([...PATTERN, declined("q3", T0 + 200)])?.recovery).toBeNull();
  });

  it("two declines on the SAME later question are not enough", () => {
    // Answering one question twice is not breadth, for the same reason it was
    // not breadth when the pattern formed.
    const memory = only([
      ...PATTERN,
      declined("q3", T0 + 200),
      declined("q3", T0 + 300),
    ]);
    expect(memory?.recovery).toBeNull();
  });

  it("two declines across two distinct later questions is a recovery signal", () => {
    const pattern = only([...PATTERN, declined("q3", T0 + 200), declined("q4", T0 + 300)]);
    expect(pattern?.recovery).toEqual({
      declinedOpportunityCount: 2,
      distinctQuestionCount: 2,
      since: T0 + 100,
      lastDeclinedAt: T0 + 300,
    });
  });

  it("counts occurrences and distinct questions separately and honestly", () => {
    const pattern = only([
      ...PATTERN,
      declined("q3", T0 + 200),
      declined("q3", T0 + 250),
      declined("q4", T0 + 300),
    ]);
    expect(pattern?.recovery?.declinedOpportunityCount).toBe(3);
    expect(pattern?.recovery?.distinctQuestionCount).toBe(2);
  });
});

describe("what cannot count as a decline", () => {
  it("an event carrying no opportunity evidence at all", () => {
    // A legacy event proves nothing about what was on the page. Reading its
    // silence as a decline is the exact inference this phase exists to replace.
    expect(only([...PATTERN, plain("q3", T0 + 200), plain("q4", T0 + 300)])?.recovery).toBeNull();
  });

  it("an event that offered a DIFFERENT meaning", () => {
    const other = declined("q3", T0 + 200, {
      semanticOpportunities: { namespaceId: NS, conceptKeys: ["other_key"], selectedChoice: "B" },
    });
    const other2 = declined("q4", T0 + 300, {
      semanticOpportunities: { namespaceId: NS, conceptKeys: ["other_key"], selectedChoice: "B" },
    });
    expect(only([...PATTERN, other, other2])?.recovery).toBeNull();
  });

  it("an event from a DIFFERENT author offering the identical key", () => {
    const foreign = (q: string, at: number) =>
      declined(q, at, {
        semanticOpportunities: { namespaceId: "teacher-2", conceptKeys: [KEY], selectedChoice: "B" },
      });
    expect(only([...PATTERN, foreign("q3", T0 + 200), foreign("q4", T0 + 300)])?.recovery).toBeNull();
  });

  it("an event in a DIFFERENT topic", () => {
    const elsewhere = (q: string, at: number) => declined(q, at, { topic: "Geometri" });
    expect(only([...PATTERN, elsewhere("q3", T0 + 200), elsewhere("q4", T0 + 300)])?.recovery).toBeNull();
  });

  it("an event in a DIFFERENT subject", () => {
    const elsewhere = (q: string, at: number) => declined(q, at, { subject: "Fizik" });
    expect(only([...PATTERN, elsewhere("q3", T0 + 200), elsewhere("q4", T0 + 300)])?.recovery).toBeNull();
  });

  it("an event where the meaning WAS taken", () => {
    // Offered and selected is a re-selection, not a decline.
    expect(only([...PATTERN, selected("q3", T0 + 200), selected("q4", T0 + 300)])?.recovery).toBeNull();
  });

  it("declines that happened BEFORE the pattern's latest selection", () => {
    const memory = only([
      selected("q1", T0),
      declined("q3", T0 + 10),
      declined("q4", T0 + 20),
      selected("q2", T0 + 100),
    ]);
    expect(memory?.recovery).toBeNull();
  });
});

// The property that makes relapse self-correcting: the window opens at the
// LATEST selection, so there is no separate reset branch to get wrong.
describe("re-selection", () => {
  it("withdraws a recovery signal once the meaning is taken again", () => {
    const withRecovery = only([...PATTERN, declined("q3", T0 + 200), declined("q4", T0 + 300)]);
    expect(withRecovery?.recovery).not.toBeNull();

    const afterRelapse = only([
      ...PATTERN,
      declined("q3", T0 + 200),
      declined("q4", T0 + 300),
      selected("q5", T0 + 400),
    ]);
    expect(afterRelapse?.recovery).toBeNull();
  });

  it("earns a fresh signal from declines after the relapse", () => {
    const pattern = only([
      ...PATTERN,
      declined("q3", T0 + 200),
      declined("q4", T0 + 300),
      selected("q5", T0 + 400),
      declined("q6", T0 + 500),
      declined("q7", T0 + 600),
    ]);
    expect(pattern?.recovery).toEqual({
      declinedOpportunityCount: 2,
      distinctQuestionCount: 2,
      since: T0 + 400,
      lastDeclinedAt: T0 + 600,
    });
  });

  it("does not carry pre-relapse declines into the fresh window", () => {
    const pattern = only([
      ...PATTERN,
      declined("q3", T0 + 200),
      declined("q4", T0 + 300),
      selected("q5", T0 + 400),
      declined("q6", T0 + 500),
    ]);
    // Only ONE decline after the relapse — the two before it are gone.
    expect(pattern?.recovery).toBeNull();
  });

  it("moves the pattern's own last-seen forward on a relapse", () => {
    const pattern = only([...PATTERN, selected("q5", T0 + 400)]);
    expect(pattern?.lastSeenAt).toBe(T0 + 400);
    expect(pattern?.occurrenceCount).toBe(3);
    expect(pattern?.distinctQuestionCount).toBe(3);
  });
});

describe("no resolution is ever claimed", () => {
  it("exposes no resolved, mastered or fixed field", () => {
    const pattern = only([...PATTERN, declined("q3", T0 + 200), declined("q4", T0 + 300)])!;
    const keys = [...Object.keys(pattern), ...Object.keys(pattern.recovery!)];
    for (const banned of ["resolved", "mastered", "fixed", "cleared", "understood", "complete"]) {
      expect(keys.some((k) => k.toLowerCase().includes(banned))).toBe(false);
    }
  });

  it("exposes no score, probability or confidence on the recovery signal", () => {
    const pattern = only([...PATTERN, declined("q3", T0 + 200), declined("q4", T0 + 300)])!;
    for (const banned of ["score", "probability", "confidence", "percent", "risk", "severity"]) {
      expect(Object.keys(pattern.recovery!).some((k) => k.toLowerCase().includes(banned))).toBe(false);
    }
  });

  it("words the fact as a bounded observation, not a verdict", () => {
    const fact = choiceRecoveryFact({
      declinedOpportunityCount: 3,
      distinctQuestionCount: 2,
      since: T0,
      lastDeclinedAt: T0 + 1,
    });
    expect(fact).toBe("Sonraki 2 farklı soruda aynı seçim yeniden seçilmedi.");
    expect(fact).not.toContain("Tüm");
  });

  it("never says resolved, fixed, learned or mastered in visible copy", () => {
    const visible = `${CHOICE_RECOVERY_LABEL} ${choiceRecoveryFact({
      declinedOpportunityCount: 2,
      distinctQuestionCount: 2,
      since: T0,
      lastDeclinedAt: T0 + 1,
    })}`.toLowerCase();
    for (const banned of ["çözüldü", "giderildi", "artık yok", "öğrenildi", "ustalaş", "%", "tebrikler"]) {
      expect(visible).not.toContain(banned);
    }
  });

  it("keeps the label a signal rather than an outcome", () => {
    expect(CHOICE_RECOVERY_LABEL).toBe("Toparlanma sinyali");
  });
});

describe("determinism", () => {
  it("produces the same recovery under input permutation", () => {
    const events = [...PATTERN, declined("q3", T0 + 200), declined("q4", T0 + 300)];
    const forward = JSON.stringify(build(events).patterns);
    const reversed = JSON.stringify(build([...events].reverse()).patterns);
    expect(forward).toBe(reversed);
  });

  it("ignores unrelated events entirely", () => {
    const pattern = only([
      ...PATTERN,
      plain("q9", T0 + 150),
      declined("q3", T0 + 200),
      plain("q8", T0 + 250),
      declined("q4", T0 + 300),
    ]);
    expect(pattern?.recovery?.distinctQuestionCount).toBe(2);
  });
});
