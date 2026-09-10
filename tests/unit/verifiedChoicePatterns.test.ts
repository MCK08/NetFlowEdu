// Phase 78 — repeated authored choice meanings across DIFFERENT questions.
//
// The refusals carry the weight here. Most of these tests exist to prove the
// aggregator does NOT report something: not from one occurrence, not from one
// question repeated, not across two authors, and never as a recovery.

import { LearningEvent } from "../../src/features/learningStory/services/learningTrail";
import {
  buildVerifiedChoicePatterns,
  choicePatternAbsenceCopy,
  choicePatternEvidence,
  choicePatternFact,
  MAX_VISIBLE_CHOICE_PATTERNS,
} from "../../src/features/study/services/verifiedChoicePatterns";

const T0 = 1_700_000_000_000;

function event(over: Partial<LearningEvent> = {}): LearningEvent {
  return {
    id: `e-${Math.random()}`,
    questionId: "q1",
    outcome: "struggled",
    occurredAt: T0,
    subject: "Matematik",
    topic: "Denklemler",
    semanticChoice: {
      namespaceId: "teacher-1",
      conceptKey: "sign_transfer_error",
      choiceLabel: "B",
    },
    ...over,
  };
}

/** An ordinary Phase 59 event, from before this phase or from a pick that
 *  carried no authored meaning. */
function plainEvent(over: Partial<LearningEvent> = {}): LearningEvent {
  return event({ semanticChoice: null, ...over });
}

const build = (events: LearningEvent[]) => buildVerifiedChoicePatterns({ events });

describe("nothing to report", () => {
  it("is empty with no events", () => {
    const memory = build([]);
    expect(memory.isEmpty).toBe(true);
    expect(memory.patterns).toEqual([]);
    expect(memory.semanticEventCount).toBe(0);
  });

  it("is empty when no event carries semantic evidence", () => {
    const memory = build([plainEvent({ id: "a" }), plainEvent({ id: "b", questionId: "q2" })]);
    expect(memory.isEmpty).toBe(true);
    expect(memory.semanticEventCount).toBe(0);
  });

  it("does not report a pattern from a single occurrence", () => {
    const memory = build([event({ id: "a" })]);
    expect(memory.patterns).toEqual([]);
    expect(memory.semanticEventCount).toBe(1);
  });

  // The central exclusion: Phase 71 already owns same-question repetition, and
  // three picks on one question say as much about the question as the student.
  it("does not report a pattern from the same question repeated", () => {
    const memory = build([
      event({ id: "a", questionId: "q1", occurredAt: T0 }),
      event({ id: "b", questionId: "q1", occurredAt: T0 + 1 }),
      event({ id: "c", questionId: "q1", occurredAt: T0 + 2 }),
    ]);
    expect(memory.patterns).toEqual([]);
    expect(memory.semanticEventCount).toBe(3);
  });
});

describe("a verified cross-question pattern", () => {
  it("appears once the same meaning shows up on two different questions", () => {
    const memory = build([
      event({ id: "a", questionId: "q1", occurredAt: T0 }),
      event({ id: "b", questionId: "q2", occurredAt: T0 + 1000 }),
    ]);
    expect(memory.patterns).toHaveLength(1);
    expect(memory.patterns[0]).toMatchObject({
      subject: "Matematik",
      topic: "Denklemler",
      occurrenceCount: 2,
      distinctQuestionCount: 2,
      lastSeenAt: T0 + 1000,
    });
  });

  it("counts occurrences and distinct questions honestly and separately", () => {
    const memory = build([
      event({ id: "a", questionId: "q1", occurredAt: T0 }),
      event({ id: "b", questionId: "q1", occurredAt: T0 + 1 }),
      event({ id: "c", questionId: "q2", occurredAt: T0 + 2 }),
    ]);
    expect(memory.patterns[0]?.occurrenceCount).toBe(3);
    expect(memory.patterns[0]?.distinctQuestionCount).toBe(2);
  });

  it("lists the contributing questions, most recent first", () => {
    const memory = build([
      event({ id: "a", questionId: "q1", occurredAt: T0 }),
      event({ id: "b", questionId: "q2", occurredAt: T0 + 500 }),
    ]);
    expect(memory.patterns[0]?.questionIds).toEqual(["q2", "q1"]);
  });

  it("groups two different picked labels that carry the same authored meaning", () => {
    // Question 1's distractor B and question 2's distractor D can be the same
    // authored idea — that is the whole point of a conceptKey.
    const memory = build([
      event({ id: "a", questionId: "q1", semanticChoice: { namespaceId: "teacher-1", conceptKey: "sign_transfer_error", choiceLabel: "B" } }),
      event({ id: "b", questionId: "q2", occurredAt: T0 + 1, semanticChoice: { namespaceId: "teacher-1", conceptKey: "sign_transfer_error", choiceLabel: "D" } }),
    ]);
    expect(memory.patterns).toHaveLength(1);
    expect(memory.patterns[0]?.distinctQuestionCount).toBe(2);
  });
});

describe("identities that must never merge", () => {
  it("keeps the same key from two different authors apart", () => {
    const memory = build([
      event({ id: "a", questionId: "q1", semanticChoice: { namespaceId: "teacher-1", conceptKey: "sign_transfer_error", choiceLabel: "B" } }),
      event({ id: "b", questionId: "q2", semanticChoice: { namespaceId: "teacher-2", conceptKey: "sign_transfer_error", choiceLabel: "B" } }),
    ]);
    // Two identities, each with one occurrence — so no pattern at all.
    expect(memory.patterns).toEqual([]);
    expect(memory.semanticEventCount).toBe(2);
  });

  it("does not let a second author's event complete another author's pattern", () => {
    const memory = build([
      event({ id: "a", questionId: "q1" }),
      event({ id: "b", questionId: "q2", semanticChoice: { namespaceId: "teacher-2", conceptKey: "sign_transfer_error", choiceLabel: "B" } }),
      event({ id: "c", questionId: "q3", semanticChoice: { namespaceId: "teacher-3", conceptKey: "sign_transfer_error", choiceLabel: "B" } }),
    ]);
    expect(memory.patterns).toEqual([]);
  });

  it("keeps the same author's key apart across unrelated topics", () => {
    const memory = build([
      event({ id: "a", questionId: "q1", topic: "Denklemler" }),
      event({ id: "b", questionId: "q2", topic: "Geometri" }),
    ]);
    expect(memory.patterns).toEqual([]);
  });

  it("keeps the same author's key apart across subjects", () => {
    const memory = build([
      event({ id: "a", questionId: "q1", subject: "Matematik" }),
      event({ id: "b", questionId: "q2", subject: "Fizik" }),
    ]);
    expect(memory.patterns).toEqual([]);
  });

  it("keeps two different keys from one author apart", () => {
    const memory = build([
      event({ id: "a", questionId: "q1" }),
      event({ id: "b", questionId: "q2", semanticChoice: { namespaceId: "teacher-1", conceptKey: "denominator_addition", choiceLabel: "C" } }),
    ]);
    expect(memory.patterns).toEqual([]);
  });
});

describe("incomplete evidence never becomes a wildcard", () => {
  it("skips an event with no namespace", () => {
    const memory = build([
      event({ id: "a", questionId: "q1", semanticChoice: { namespaceId: "", conceptKey: "sign_transfer_error", choiceLabel: "B" } }),
      event({ id: "b", questionId: "q2" }),
    ]);
    expect(memory.patterns).toEqual([]);
    expect(memory.semanticEventCount).toBe(1);
  });

  it("skips an event with no conceptKey", () => {
    const memory = build([
      event({ id: "a", questionId: "q1", semanticChoice: { namespaceId: "teacher-1", conceptKey: "  ", choiceLabel: "B" } }),
      event({ id: "b", questionId: "q2" }),
    ]);
    expect(memory.semanticEventCount).toBe(1);
  });

  it("skips an event whose question metadata never resolved", () => {
    const memory = build([
      event({ id: "a", questionId: "q1", subject: "", topic: "" }),
      event({ id: "b", questionId: "q2" }),
    ]);
    expect(memory.semanticEventCount).toBe(1);
    expect(memory.patterns).toEqual([]);
  });

  it("skips a legacy event with no semantic field at all", () => {
    const legacy = event({ id: "a", questionId: "q1" });
    delete (legacy as { semanticChoice?: unknown }).semanticChoice;
    const memory = build([legacy, event({ id: "b", questionId: "q2" })]);
    expect(memory.semanticEventCount).toBe(1);
  });

  it("lets ordinary and semantic events coexist without inventing zeros", () => {
    const memory = build([
      plainEvent({ id: "p1", outcome: "solved" }),
      event({ id: "a", questionId: "q1" }),
      plainEvent({ id: "p2", questionId: "q9", outcome: "struggled" }),
      event({ id: "b", questionId: "q2", occurredAt: T0 + 1 }),
    ]);
    expect(memory.patterns).toHaveLength(1);
    expect(memory.semanticEventCount).toBe(2);
  });
});

// A later correct answer proves the student answered that question correctly.
// It does not prove an authored meaning stopped applying — they may have
// guessed, met a different sub-skill, or never seen that distractor again.
describe("there is no recovery", () => {
  it("does not clear a pattern when a later solved event arrives", () => {
    const memory = build([
      event({ id: "a", questionId: "q1", occurredAt: T0 }),
      event({ id: "b", questionId: "q2", occurredAt: T0 + 1 }),
      plainEvent({ id: "c", questionId: "q1", outcome: "solved", occurredAt: T0 + 999 }),
    ]);
    expect(memory.patterns).toHaveLength(1);
  });

  it("exposes no resolved, recovered or fixed field", () => {
    const memory = build([
      event({ id: "a", questionId: "q1" }),
      event({ id: "b", questionId: "q2", occurredAt: T0 + 1 }),
    ]);
    const keys = Object.keys(memory.patterns[0]!);
    for (const banned of ["resolved", "recovered", "fixed", "cleared", "improved"]) {
      expect(keys.some((k) => k.toLowerCase().includes(banned))).toBe(false);
    }
  });

  it("exposes no score, severity, risk or confidence field", () => {
    const memory = build([
      event({ id: "a", questionId: "q1" }),
      event({ id: "b", questionId: "q2", occurredAt: T0 + 1 }),
    ]);
    const keys = Object.keys(memory.patterns[0]!);
    for (const banned of ["score", "severity", "risk", "confidence", "percent", "probability"]) {
      expect(keys.some((k) => k.toLowerCase().includes(banned))).toBe(false);
    }
  });
});

describe("ordering and bounds", () => {
  function pair(key: string, question: string, at: number): LearningEvent[] {
    return [
      event({ id: `${key}-1`, questionId: `${question}a`, topic: key, occurredAt: at }),
      event({ id: `${key}-2`, questionId: `${question}b`, topic: key, occurredAt: at + 1 }),
    ];
  }

  it("orders most recently seen first", () => {
    const memory = build([...pair("Eski", "x", T0), ...pair("Yeni", "y", T0 + 10_000)]);
    expect(memory.patterns.map((p) => p.topic)).toEqual(["Yeni", "Eski"]);
  });

  it("caps how many patterns are visible", () => {
    const events: LearningEvent[] = [];
    for (let i = 0; i < MAX_VISIBLE_CHOICE_PATTERNS + 3; i++) {
      events.push(...pair(`Konu${i}`, `q${i}`, T0 + i * 100));
    }
    expect(build(events).patterns).toHaveLength(MAX_VISIBLE_CHOICE_PATTERNS);
  });

  it("is deterministic under input permutation", () => {
    const events = [...pair("A", "x", T0), ...pair("B", "y", T0 + 10)];
    const forward = JSON.stringify(build(events).patterns);
    const reversed = JSON.stringify(build([...events].reverse()).patterns);
    expect(forward).toBe(reversed);
  });
});

describe("copy", () => {
  const pattern = {
    id: "teacher-1|sign_transfer_error|Matematik|Denklemler",
    subject: "Matematik",
    topic: "Denklemler",
    occurrenceCount: 3,
    distinctQuestionCount: 2,
    lastSeenAt: T0,
    questionIds: ["q2", "q1"],
  };

  it("states the repetition as a bounded fact", () => {
    const fact = choicePatternFact(pattern);
    expect(fact).toBe(
      "Son öğrenme kayıtlarında aynı seçim örüntüsü 2 farklı soruda tekrarlandı.",
    );
    expect(fact).not.toContain("Tüm");
  });

  it("states supporting counts, never a rate", () => {
    expect(choicePatternEvidence(pattern)).toBe("2 farklı soru · 3 kayıt");
    expect(choicePatternEvidence(pattern)).not.toContain("%");
  });

  it("never leaks the internal key or the author's id into visible copy", () => {
    const visible = `${choicePatternFact(pattern)} ${choicePatternEvidence(pattern)}`;
    expect(visible).not.toContain("sign_transfer_error");
    expect(visible).not.toContain("teacher-1");
  });

  it("never makes a diagnostic or causal claim", () => {
    const visible = `${choicePatternFact(pattern)} ${choicePatternEvidence(pattern)}`.toLowerCase();
    for (const banned of ["yanılgı", "bilmiyor", "anlamıyor", "çünkü", "sorunu", "eksiğin"]) {
      expect(visible).not.toContain(banned);
    }
  });

  it("distinguishes 'nothing repeated' from 'not enough to look at'", () => {
    const nothingRepeated = choicePatternAbsenceCopy({
      patterns: [],
      semanticEventCount: 4,
      isEmpty: true,
    });
    const tooLittle = choicePatternAbsenceCopy({
      patterns: [],
      semanticEventCount: 1,
      isEmpty: true,
    });
    expect(nothingRepeated.title).not.toBe(tooLittle.title);
  });

  it("never tells the student they have no mistakes", () => {
    for (const count of [0, 1, 2, 9]) {
      const copy = choicePatternAbsenceCopy({ patterns: [], semanticEventCount: count, isEmpty: true });
      const text = `${copy.title} ${copy.description}`.toLowerCase();
      for (const banned of ["hatan yok", "hiç hata", "tebrikler", "mükemmel", "harika"]) {
        expect(text).not.toContain(banned);
      }
    }
  });
});
