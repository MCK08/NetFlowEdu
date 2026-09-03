// Phase 71 — verified struggle pattern memory.
//
// The honesty blocks matter most: a single slip must never be described as
// repetition, "again" must never become a struggle, unknown counters must never
// become zero, and recovery must come from Phase 42's verdict rather than from
// "the last event happened to be a solve".

import { LearningEvent } from "../../src/features/learningStory/services/learningTrail";
import {
  buildStrugglePatternMemory,
  MAX_VISIBLE_PATTERNS,
  MIN_EVENTS_FOR_ABSENCE_CLAIM,
  patternAbsenceCopy,
  patternChronologyLabel,
  patternOutcomeLabel,
  patternSupportingFact,
  patternTitle,
  REPEATED_STRUGGLE_MIN,
  StrugglePatternMemory,
} from "../../src/features/study/services/strugglePatternMemory";
import { LearningInsightItem } from "../../src/features/study/services/learningInsights";
import { StudyOutcome } from "../../src/features/study/domain/studyTypes";

const T0 = 1_700_000_000_000;

function item(overrides: Partial<LearningInsightItem> = {}): LearningInsightItem {
  return {
    questionId: "q1",
    status: "review",
    lastOutcome: "solved",
    nextReviewAt: T0 + 86400000,
    subject: "Matematik",
    topic: "Denklemler",
    successfulReviews: 1,
    lastReviewedAt: T0,
    outcomeHistory: { solvedCount: 3, struggledCount: 0, againCount: 0, knownOutcomeCount: 3 },
    ...overrides,
  };
}

/** Phase 42 persistent_struggle: >= 2 struggles, no standing recovery. */
function persistent(id: string, struggled = 3, over: Partial<LearningInsightItem> = {}) {
  return item({
    questionId: id,
    lastOutcome: "struggled",
    successfulReviews: 0,
    outcomeHistory: {
      solvedCount: 1,
      struggledCount: struggled,
      againCount: 0,
      knownOutcomeCount: 1 + struggled,
    },
    ...over,
  });
}

/** Phase 42 one_off_struggle: exactly one struggle ever. */
function oneOff(id: string, over: Partial<LearningInsightItem> = {}) {
  return item({
    questionId: id,
    outcomeHistory: { solvedCount: 3, struggledCount: 1, againCount: 0, knownOutcomeCount: 4 },
    ...over,
  });
}

/** Phase 42 recovering: >= 2 struggles, last solved, success standing. */
function recovering(id: string, struggled = 2, over: Partial<LearningInsightItem> = {}) {
  return item({
    questionId: id,
    lastOutcome: "solved",
    successfulReviews: 2,
    outcomeHistory: {
      solvedCount: 2,
      struggledCount: struggled,
      againCount: 0,
      knownOutcomeCount: 2 + struggled,
    },
    ...over,
  });
}

/** Phase 42 stable. */
function stable(id: string, over: Partial<LearningInsightItem> = {}) {
  return item({ questionId: id, ...over });
}

/** Pre-Phase-41: counters absent, history genuinely unknown. */
function legacy(id: string, over: Partial<LearningInsightItem> = {}) {
  return item({ questionId: id, outcomeHistory: null, ...over });
}

function event(
  id: string,
  questionId: string,
  outcome: StudyOutcome,
  offsetMs: number,
): LearningEvent {
  return { id, questionId, outcome, occurredAt: T0 + offsetMs, subject: "Matematik", topic: "Denklemler" };
}

function build(
  items: LearningInsightItem[],
  events: LearningEvent[] = [],
): StrugglePatternMemory {
  return buildStrugglePatternMemory({ items, events });
}

describe("pattern memory — nothing to say", () => {
  it("is empty with no items and no events", () => {
    const memory = build([]);
    expect(memory.isEmpty).toBe(true);
    expect(memory.patterns).toHaveLength(0);
  });

  it("produces no pattern from a single stable question", () => {
    expect(build([stable("q1")]).patterns).toHaveLength(0);
  });

  it("produces no pattern from stable evidence across a topic", () => {
    expect(build([stable("q1"), stable("q2"), stable("q3")]).patterns).toHaveLength(0);
  });
});

describe("pattern memory — one-off honesty", () => {
  // §66 — mandatory.
  it("never calls a single struggle a repeated pattern", () => {
    const memory = build([oneOff("q1")]);
    expect(memory.patterns).toHaveLength(0);
  });

  it("does not spread from several unrelated single slips", () => {
    // Each question slipped once; none is unresolved repetition.
    const memory = build([oneOff("q1"), oneOff("q2"), oneOff("q3")]);
    expect(memory.patterns).toHaveLength(0);
  });

  it("does not treat a one-off beside stable evidence as a pattern", () => {
    expect(build([oneOff("q1"), stable("q2"), stable("q3")]).patterns).toHaveLength(0);
  });
});

describe("pattern memory — same-question repetition", () => {
  // §64 — mandatory.
  it("reads repeated struggle on one question", () => {
    const memory = build([persistent("q1", 3)]);
    expect(memory.patterns).toHaveLength(1);
    expect(memory.patterns[0]!.kind).toBe("same_question");
    expect(memory.patterns[0]!.focusQuestionId).toBe("q1");
    expect(memory.patterns[0]!.focusStruggleCount).toBe(3);
  });

  it("states the count in question scope, not topic scope", () => {
    const fact = patternSupportingFact(build([persistent("q1", 3)]).patterns[0]!);
    expect(fact).toBe("Bu soruda 3 zorlanma kaydı var.");
    expect(fact).not.toContain("konuda");
  });

  it("requires the documented repetition minimum", () => {
    expect(REPEATED_STRUGGLE_MIN).toBe(2);
    expect(build([persistent("q1", 2)]).patterns[0]!.kind).toBe("same_question");
  });

  it("names the most-struggled question deterministically", () => {
    const memory = build([persistent("qa", 2), stable("qb")]);
    expect(memory.patterns[0]!.focusQuestionId).toBe("qa");
  });

  it("attaches real chronology when the bounded window holds it", () => {
    const memory = build(
      [persistent("q1", 2)],
      [
        event("e2", "q1", "struggled", 2000),
        event("e1", "q1", "struggled", 1000),
        event("e3", "q1", "solved", 3000),
      ],
    );
    // Oldest → newest, from occurredAt — never reconstructed from counters.
    expect(memory.patterns[0]!.recentOutcomes).toEqual(["struggled", "struggled", "solved"]);
  });

  it("stands on its counters when the window holds no events for it", () => {
    const memory = build([persistent("q1", 3)], [event("e1", "other-q", "solved", 1000)]);
    expect(memory.patterns[0]!.kind).toBe("same_question");
    expect(memory.patterns[0]!.recentOutcomes).toEqual([]);
    expect(patternChronologyLabel(memory.patterns[0]!)).toBeNull();
  });
});

describe("pattern memory — topic-wide spread", () => {
  // §65 — mandatory.
  it("reads unresolved struggle spread across distinct questions", () => {
    const memory = build([persistent("q1"), persistent("q2")]);
    expect(memory.patterns).toHaveLength(1);
    expect(memory.patterns[0]!.kind).toBe("topic_spread");
    expect(memory.patterns[0]!.distinctQuestionCount).toBe(2);
  });

  it("states the count in topic scope", () => {
    const fact = patternSupportingFact(build([persistent("q1"), persistent("q2")]).patterns[0]!);
    expect(fact).toBe("Bu konuda 2 farklı soruda zorlanma tekrar ediyor.");
  });

  it("requires the documented spread minimum", () => {
    expect(build([persistent("q1")]).patterns[0]!.kind).toBe("same_question");
  });

  it("does not spread across different topics", () => {
    const memory = build([persistent("q1"), persistent("q2", 3, { topic: "Geometri" })]);
    expect(memory.patterns).toHaveLength(2);
    expect(memory.patterns.every((p) => p.kind === "same_question")).toBe(true);
  });

  it("does not merge the same topic name under different subjects", () => {
    const memory = build([persistent("q1"), persistent("q2", 3, { subject: "Fizik" })]);
    expect(memory.patterns).toHaveLength(2);
  });

  it("shows one pattern per topic, not spread and same-question both", () => {
    const memory = build([persistent("q1", 5), persistent("q2", 4)]);
    expect(memory.patterns).toHaveLength(1);
    expect(memory.patterns[0]!.kind).toBe("topic_spread");
  });
});

describe("pattern memory — recovery honesty", () => {
  it("reads a Phase 42 recovery", () => {
    const memory = build([recovering("q1", 2)]);
    expect(memory.patterns[0]!.kind).toBe("recovery");
  });

  // §67 — mandatory.
  it("does not infer recovery merely because the latest event was a solve", () => {
    // Unresolved by Phase 42 (no standing success), latest event solved.
    const memory = build(
      [persistent("q1", 3, { lastOutcome: "solved", successfulReviews: 0 })],
      [event("e1", "q1", "struggled", 1000), event("e2", "q1", "solved", 2000)],
    );
    expect(memory.patterns[0]!.kind).not.toBe("recovery");
    expect(memory.patterns[0]!.kind).toBe("same_question");
  });

  it("does not claim recovery for a single slip that was solved", () => {
    expect(build([oneOff("q1")]).patterns).toHaveLength(0);
  });

  it("ranks unresolved struggle above a resolved recovery", () => {
    const memory = build([persistent("q1"), recovering("q2", 2, { topic: "Geometri" })]);
    expect(memory.patterns[0]!.kind).toBe("same_question");
    expect(memory.patterns[1]!.kind).toBe("recovery");
  });

  it("describes recovery without claiming the topic is learned", () => {
    const fact = patternSupportingFact(build([recovering("q1", 2)]).patterns[0]!);
    expect(fact).toBe("Bu soruda 2 zorlanmanın ardından çözüm kaydı var.");
    expect(fact).not.toMatch(/öğrendin|artık biliyorsun|tamamlandı/i);
  });
});

describe("pattern memory — again is not a struggle", () => {
  // §68 — mandatory.
  it("does not turn repeated 'again' into a struggle pattern", () => {
    const againOnly = item({
      questionId: "q1",
      lastOutcome: "again",
      successfulReviews: 0,
      outcomeHistory: { solvedCount: 1, struggledCount: 0, againCount: 5, knownOutcomeCount: 6 },
    });
    expect(build([againOnly]).patterns).toHaveLength(0);
  });

  it("does not let 'again' events inflate a chronology into a pattern", () => {
    const memory = build(
      [item({ questionId: "q1", outcomeHistory: { solvedCount: 2, struggledCount: 0, againCount: 4, knownOutcomeCount: 6 } })],
      [event("e1", "q1", "again", 1000), event("e2", "q1", "again", 2000)],
    );
    expect(memory.patterns).toHaveLength(0);
  });
});

describe("pattern memory — unknown is never zero", () => {
  // §69 — mandatory.
  it("makes no claim from legacy counters", () => {
    expect(build([legacy("q1"), legacy("q2"), legacy("q3")]).patterns).toHaveLength(0);
  });

  it("does not let unknown history contribute to a spread", () => {
    const memory = build([persistent("q1"), legacy("q2"), legacy("q3")]);
    expect(memory.patterns[0]!.kind).toBe("same_question");
    expect(memory.patterns[0]!.distinctQuestionCount).toBe(1);
  });

  it("never reports unknown history as 'no struggles'", () => {
    const memory = build([legacy("q1")]);
    expect(memory.patterns).toHaveLength(0);
    // Absence copy must not claim the student had no difficulty.
    const copy = patternAbsenceCopy(memory);
    expect(`${copy.title} ${copy.description}`).not.toMatch(/hiç zorlanma|zorlanmadın/i);
  });
});

describe("pattern memory — missing metadata", () => {
  it("omits a question with no topic", () => {
    expect(build([persistent("q1", 3, { topic: "" })]).patterns).toHaveLength(0);
  });

  it("omits a question with no subject", () => {
    expect(build([persistent("q1", 3, { subject: "" })]).patterns).toHaveLength(0);
  });

  it("does not group unrelated unnamed questions together", () => {
    const memory = build([
      persistent("q1", 3, { subject: "", topic: "" }),
      persistent("q2", 3, { subject: "", topic: "" }),
    ]);
    expect(memory.patterns).toHaveLength(0);
  });
});

describe("pattern memory — bounded history", () => {
  // §70 — the copy must not turn a bounded window into a lifetime claim.
  it("labels chronology as recent records, never as the whole history", () => {
    const memory = build(
      [persistent("q1", 2)],
      [event("e1", "q1", "struggled", 1000), event("e2", "q1", "struggled", 2000)],
    );
    const label = patternChronologyLabel(memory.patterns[0]!);
    expect(label).toBe("Son öğrenme kayıtlarında");
    expect(label).not.toMatch(/her zaman|tüm geçmiş|toplam hayat/i);
  });

  it("separates a thin history from a genuine absence of repetition", () => {
    expect(build([], []).hasThinHistory).toBe(true);
    expect(
      build([], [event("e1", "q1", "solved", 1000), event("e2", "q1", "solved", 2000)])
        .hasThinHistory,
    ).toBe(false);
    expect(MIN_EVENTS_FOR_ABSENCE_CLAIM).toBe(2);
  });

  it("uses different copy for each", () => {
    const thin = patternAbsenceCopy(build([], []));
    const settled = patternAbsenceCopy(
      build([], [event("e1", "q1", "solved", 1), event("e2", "q1", "solved", 2)]),
    );
    expect(thin.title).toContain("daha fazla öğrenme kaydı");
    expect(settled.title).toContain("tekrar eden bir zorlanma örüntüsü");
    expect(thin.title).not.toBe(settled.title);
  });
});

describe("pattern memory — determinism", () => {
  const items = [
    persistent("q1", 4, { topic: "Alpha" }),
    persistent("q2", 3, { topic: "Alpha" }),
    persistent("q3", 5, { topic: "Beta" }),
    recovering("q4", 2, { topic: "Gamma" }),
  ];

  it("orders spread, then repetition, then recovery", () => {
    expect(build(items).patterns.map((p) => p.kind)).toEqual([
      "topic_spread",
      "same_question",
      "recovery",
    ]);
  });

  it("is identical whatever order the items arrive in", () => {
    const forward = build(items).patterns.map((p) => p.id);
    const reversed = build([...items].reverse()).patterns.map((p) => p.id);
    expect(reversed).toEqual(forward);
  });

  it("is identical whatever order the events arrive in", () => {
    const events = [
      event("e3", "q3", "solved", 3000),
      event("e1", "q3", "struggled", 1000),
      event("e2", "q3", "struggled", 2000),
    ];
    const forward = build(items, events).patterns.map((p) => p.recentOutcomes.join(","));
    const reversed = build(items, [...events].reverse()).patterns.map((p) =>
      p.recentOutcomes.join(","),
    );
    expect(reversed).toEqual(forward);
  });

  it("collapses a duplicated event id rather than double counting it", () => {
    const dup = [event("e1", "q1", "struggled", 1000), event("e1", "q1", "struggled", 1000)];
    expect(build([persistent("q1", 2)], dup).patterns[0]!.recentOutcomes).toEqual(["struggled"]);
  });

  it("caps how many patterns a comprehension screen shows", () => {
    const many = ["A", "B", "C", "D", "E", "F"].map((t, i) => persistent(`q${i}`, 3, { topic: t }));
    expect(build(many).patterns.length).toBeLessThanOrEqual(MAX_VISIBLE_PATTERNS);
  });
});

describe("pattern memory — copy safety", () => {
  const rich = [
    persistent("q1", 4),
    persistent("q2", 3),
    persistent("q3", 5, { topic: "Geometri" }),
    recovering("q4", 2, { subject: "Fizik", topic: "Kuvvet" }),
  ];

  function allCopy(): string {
    const memory = build(rich, [event("e1", "q3", "struggled", 1000)]);
    const parts: string[] = [];
    for (const pattern of memory.patterns) {
      parts.push(patternTitle(pattern), patternSupportingFact(pattern));
      const label = patternChronologyLabel(pattern);
      if (label) parts.push(label);
    }
    const absence = patternAbsenceCopy(memory);
    parts.push(absence.title, absence.description);
    return parts.join(" | ");
  }

  // §71 — mandatory: no semantic mistake claim exists to be made.
  it("makes no semantic mistake diagnosis", () => {
    const copy = allCopy().toLocaleLowerCase("tr");
    for (const claim of [
      "işaret hatası",
      "payda",
      "işlem önceliği",
      "formül hatası",
      "yanlış uyguluyorsun",
      "karıştırıyorsun",
    ]) {
      expect(copy).not.toContain(claim);
    }
  });

  it("states no score, percentage or probability", () => {
    const copy = allCopy();
    expect(copy).not.toMatch(/%/);
    expect(copy).not.toMatch(/puan|skor|olasılık|risk/i);
  });

  it("never exposes an internal enum", () => {
    const copy = allCopy();
    for (const leak of [
      "topic_spread",
      "same_question",
      "persistent_struggle",
      "insufficient_data",
      "recovering",
      "studyEvents",
      "struggledCount",
      "patternScore",
    ]) {
      expect(copy).not.toContain(leak);
    }
  });

  it("passes no judgement on the student", () => {
    const copy = allCopy().toLocaleLowerCase("tr");
    for (const word of ["zayıf", "başarısız", "bilmiyorsun", "kötü", "hatalısın"]) {
      expect(copy).not.toContain(word);
    }
  });

  it("labels outcomes in the student's own vocabulary", () => {
    expect(patternOutcomeLabel("solved")).toBe("Çözdüm");
    expect(patternOutcomeLabel("struggled")).toBe("Zorlandım");
    expect(patternOutcomeLabel("again")).toBe("Tekrar Çalıştım");
  });

  it("titles each pattern in plain product language", () => {
    expect(patternTitle(build([persistent("q1"), persistent("q2")]).patterns[0]!)).toBe(
      "Zorlanma birden fazla soruya yayılıyor",
    );
    expect(patternTitle(build([persistent("q1", 3)]).patterns[0]!)).toBe(
      "Aynı soruda zorlanma tekrar ediyor",
    );
    expect(patternTitle(build([recovering("q1", 2)]).patterns[0]!)).toBe(
      "Tekrar eden zorlanmadan sonra toparlanma",
    );
  });
});
