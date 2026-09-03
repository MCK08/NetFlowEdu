// Phase 70 — the concept map's aggregation.
//
// The honesty blocks matter most: a concept must never look learned because
// most of its evidence is missing, and one unresolved struggle must never be
// averaged away by the questions around it.

import {
  buildConceptMasteryMap,
  ConceptMasteryMap,
  conceptMapSummaryFacts,
  conceptReviewNote,
  conceptStateLabel,
  conceptSupportingFact,
} from "../../src/features/study/services/conceptMasteryMap";
import { LearningInsightItem } from "../../src/features/study/services/learningInsights";

const NOW = 1_700_000_000_000;
const FUTURE = NOW + 5 * 24 * 60 * 60 * 1000;
const PAST = NOW - 60 * 60 * 1000;

/** A question with complete Phase 41 counters. */
function item(overrides: Partial<LearningInsightItem> = {}): LearningInsightItem {
  return {
    questionId: "q1",
    status: "review",
    lastOutcome: "solved",
    nextReviewAt: FUTURE,
    subject: "Matematik",
    topic: "Denklemler",
    successfulReviews: 1,
    lastReviewedAt: PAST,
    outcomeHistory: { solvedCount: 3, struggledCount: 0, againCount: 0, knownOutcomeCount: 3 },
    ...overrides,
  };
}

/** Phase 42 "stable": no struggles across >= 3 recorded outcomes. */
function stable(id: string, over: Partial<LearningInsightItem> = {}) {
  return item({ questionId: id, ...over });
}

/** Phase 42 "persistent_struggle": >= 2 struggles, no standing recovery. */
function persistent(id: string, over: Partial<LearningInsightItem> = {}) {
  return item({
    questionId: id,
    lastOutcome: "struggled",
    successfulReviews: 0,
    outcomeHistory: { solvedCount: 1, struggledCount: 3, againCount: 0, knownOutcomeCount: 4 },
    ...over,
  });
}

/** Phase 42 "recovering": >= 2 struggles, last solved, success standing. */
function recovering(id: string, over: Partial<LearningInsightItem> = {}) {
  return item({
    questionId: id,
    lastOutcome: "solved",
    successfulReviews: 2,
    outcomeHistory: { solvedCount: 2, struggledCount: 2, againCount: 0, knownOutcomeCount: 4 },
    ...over,
  });
}

/** Phase 42 "one_off_struggle": exactly one struggle ever. */
function oneOff(id: string, over: Partial<LearningInsightItem> = {}) {
  return item({
    questionId: id,
    outcomeHistory: { solvedCount: 3, struggledCount: 1, againCount: 0, knownOutcomeCount: 4 },
    ...over,
  });
}

/** A pre-Phase-41 item: counters absent, history genuinely unknown. */
function legacy(id: string, over: Partial<LearningInsightItem> = {}) {
  return item({ questionId: id, outcomeHistory: null, ...over });
}

function build(items: LearningInsightItem[], now = NOW): ConceptMasteryMap {
  return buildConceptMasteryMap({ items, now });
}

function firstConcept(map: ConceptMasteryMap) {
  return map.subjects[0]!.concepts[0]!;
}

describe("concept map — shape", () => {
  it("is empty with no items", () => {
    const map = build([]);
    expect(map.isEmpty).toBe(true);
    expect(map.subjects).toHaveLength(0);
    expect(map.totalConcepts).toBe(0);
  });

  it("groups questions of one topic into a single concept", () => {
    const map = build([stable("q1"), stable("q2"), stable("q3")]);
    expect(map.totalConcepts).toBe(1);
    expect(firstConcept(map).questionCount).toBe(3);
  });

  it("keeps different topics of one subject separate", () => {
    const map = build([stable("q1"), stable("q2", { topic: "Geometri" })]);
    expect(map.subjects).toHaveLength(1);
    expect(map.subjects[0]!.concepts).toHaveLength(2);
  });

  it("keeps different subjects as separate regions", () => {
    const map = build([stable("q1"), stable("q2", { subject: "Fizik", topic: "Kuvvet" })]);
    expect(map.subjects.map((s) => s.subject)).toEqual(["Fizik", "Matematik"]);
  });

  it("does not merge the same topic name under different subjects", () => {
    const map = build([stable("q1"), stable("q2", { subject: "Fizik" })]);
    expect(map.totalConcepts).toBe(2);
  });

  it("never merges similar-looking topic names", () => {
    // No fuzzy matching, no semantic similarity — canonical metadata only.
    const map = build([stable("q1"), stable("q2", { topic: "Birinci Dereceden Denklemler" })]);
    expect(map.subjects[0]!.concepts).toHaveLength(2);
  });

  it("trims surrounding whitespace when grouping", () => {
    const map = build([stable("q1"), stable("q2", { topic: "  Denklemler  " })]);
    expect(map.totalConcepts).toBe(1);
  });
});

describe("concept map — missing metadata", () => {
  it("omits a question with no topic rather than guessing one", () => {
    const map = build([stable("q1"), stable("q2", { topic: "" })]);
    expect(firstConcept(map).questionCount).toBe(1);
  });

  it("omits a question with no subject", () => {
    expect(build([stable("q1", { subject: "" })]).isEmpty).toBe(true);
  });

  it("does not invent an ungrouped bucket", () => {
    const map = build([stable("q1", { topic: "" }), stable("q2", { topic: "" })]);
    expect(map.subjects).toHaveLength(0);
  });
});

describe("concept map — Phase 42 composition", () => {
  it("reads a stable question as stable", () => {
    expect(firstConcept(build([stable("q1")])).stateComposition.stable).toBe(1);
  });

  it("reads repeated unresolved struggle", () => {
    expect(firstConcept(build([persistent("q1")])).stateComposition.persistent_struggle).toBe(1);
  });

  it("reads a standing recovery", () => {
    expect(firstConcept(build([recovering("q1")])).stateComposition.recovering).toBe(1);
  });

  it("reads a single slip as one-off", () => {
    expect(firstConcept(build([oneOff("q1")])).stateComposition.one_off_struggle).toBe(1);
  });

  it("reads a legacy item as insufficient", () => {
    expect(firstConcept(build([legacy("q1")])).stateComposition.insufficient_data).toBe(1);
  });
});

describe("concept map — unknown is never zero", () => {
  it("counts a legacy item as unknown evidence, not as evidence", () => {
    const concept = firstConcept(build([legacy("q1")]));
    expect(concept.unknownEvidenceCount).toBe(1);
    expect(concept.trustworthyEvidenceCount).toBe(0);
  });

  it("does not let missing counters strengthen a concept", () => {
    // Legacy items must not read as "no struggles recorded".
    const concept = firstConcept(build([legacy("q1"), legacy("q2"), legacy("q3")]));
    expect(concept.presentation).toBe("needs_evidence");
    expect(concept.stateComposition.stable).toBe(0);
  });

  it("separates trustworthy from unknown within one concept", () => {
    const concept = firstConcept(build([stable("q1"), legacy("q2"), legacy("q3")]));
    expect(concept.questionCount).toBe(3);
    expect(concept.trustworthyEvidenceCount).toBe(1);
    expect(concept.unknownEvidenceCount).toBe(2);
  });
});

describe("concept map — conservative aggregation", () => {
  // The mandatory honesty case.
  it("does not call a concept steady when most of its evidence is missing", () => {
    const concept = firstConcept(
      build([stable("q1"), legacy("q2"), legacy("q3"), legacy("q4"), legacy("q5")]),
    );
    expect(concept.presentation).toBe("needs_evidence");
    expect(concept.presentation).not.toBe("steady");
    expect(conceptStateLabel(concept)).toBe("Daha fazla kanıt gerekiyor");
  });

  it("keeps one unresolved struggle visible among otherwise stable evidence", () => {
    const concept = firstConcept(
      build([stable("q1"), stable("q2"), stable("q3"), persistent("q4")]),
    );
    expect(concept.presentation).toBe("needs_attention");
  });

  it("does not average a struggle away as more stable questions arrive", () => {
    const many = Array.from({ length: 9 }, (_, i) => stable(`q${i}`));
    const concept = firstConcept(build([...many, persistent("qx")]));
    expect(concept.presentation).toBe("needs_attention");
  });

  it("calls a concept steady only when standing success is the majority", () => {
    expect(firstConcept(build([stable("q1"), stable("q2"), legacy("q3")])).presentation).toBe(
      "steady",
    );
  });

  it("refuses steady at an exact half", () => {
    expect(firstConcept(build([stable("q1"), stable("q2"), legacy("q3"), legacy("q4")])).presentation)
      .toBe("needs_evidence");
  });

  it("prefers attention over recovery when both are present", () => {
    expect(firstConcept(build([persistent("q1"), recovering("q2")])).presentation).toBe(
      "needs_attention",
    );
  });

  it("prefers recovery over a one-off slip", () => {
    expect(firstConcept(build([recovering("q1"), oneOff("q2")])).presentation).toBe("recovering");
  });

  it("prefers a one-off slip over calling the concept steady", () => {
    expect(firstConcept(build([oneOff("q1"), stable("q2"), stable("q3")])).presentation).toBe(
      "watch",
    );
  });
});

describe("concept map — review readiness", () => {
  it("counts a question the scheduler has released", () => {
    expect(firstConcept(build([stable("q1", { nextReviewAt: PAST })])).dueCount).toBe(1);
  });

  it("does not count a question that is not due yet", () => {
    expect(firstConcept(build([stable("q1", { nextReviewAt: FUTURE })])).dueCount).toBe(0);
  });

  it("does not resurface a mastered question", () => {
    const concept = firstConcept(
      build([stable("q1", { status: "mastered", nextReviewAt: PAST })]),
    );
    expect(concept.dueCount).toBe(0);
  });

  it("states the review note only when something is actually due", () => {
    expect(conceptReviewNote(firstConcept(build([stable("q1", { nextReviewAt: PAST })])))).toBe(
      "Tekrar zamanı geldi.",
    );
    expect(conceptReviewNote(firstConcept(build([stable("q1")])))).toBeNull();
  });

  it("uses the scheduler boundary exactly, with no threshold of its own", () => {
    expect(firstConcept(build([stable("q1", { nextReviewAt: NOW })])).dueCount).toBe(1);
    expect(firstConcept(build([stable("q1", { nextReviewAt: NOW + 1 })])).dueCount).toBe(0);
  });
});

describe("concept map — ordering determinism", () => {
  const items = [
    stable("q1", { topic: "Zeta" }),
    persistent("q2", { topic: "Alpha" }),
    legacy("q3", { topic: "Beta" }),
    recovering("q4", { topic: "Gamma" }),
  ];

  it("leads with what needs attention and ends with what is unknown", () => {
    expect(build(items).subjects[0]!.concepts.map((c) => c.topic)).toEqual([
      "Alpha",
      "Gamma",
      "Zeta",
      "Beta",
    ]);
  });

  it("is identical whatever order the items arrive in", () => {
    const forward = build(items).subjects[0]!.concepts.map((c) => c.id);
    const reversed = build([...items].reverse()).subjects[0]!.concepts.map((c) => c.id);
    expect(reversed).toEqual(forward);
  });

  it("orders subjects deterministically", () => {
    const map = build([
      stable("q1", { subject: "Tarih", topic: "T" }),
      stable("q2", { subject: "Biyoloji", topic: "B" }),
      stable("q3", { subject: "Fizik", topic: "F" }),
    ]);
    expect(map.subjects.map((s) => s.subject)).toEqual(["Biyoloji", "Fizik", "Tarih"]);
  });
});

describe("concept map — supporting facts", () => {
  it("states a real repeated-struggle count", () => {
    const concept = firstConcept(build([persistent("q1"), persistent("q2"), stable("q3")]));
    expect(conceptSupportingFact(concept)).toBe("2 soruda zorlanma tekrar etti.");
  });

  it("uses singular wording for one question", () => {
    expect(conceptSupportingFact(firstConcept(build([persistent("q1")])))).toBe(
      "Bir soruda zorlanma tekrar etti.",
    );
  });

  it("states evidence coverage as counts, never a percentage", () => {
    const concept = firstConcept(
      build([stable("q1"), legacy("q2"), legacy("q3"), legacy("q4"), legacy("q5")]),
    );
    const fact = conceptSupportingFact(concept);
    expect(fact).toBe("5 sorudan 1 tanesinde yeterli öğrenme kanıtı var.");
    expect(fact).not.toMatch(/%/);
  });

  it("says plainly when there is no evidence at all", () => {
    expect(conceptSupportingFact(firstConcept(build([legacy("q1")])))).toBe(
      "Henüz yeterli öğrenme kanıtı yok.",
    );
  });

  it("describes recovery without claiming the topic is learned", () => {
    const fact = conceptSupportingFact(firstConcept(build([recovering("q1")])));
    expect(fact).toBe("Zorlandıktan sonra çözüm kanıtı var.");
    expect(fact).not.toMatch(/öğrendin|artık biliyorsun/i);
  });
});

describe("concept map — copy safety", () => {
  const rich = [
    persistent("q1"),
    stable("q2", { topic: "Geometri" }),
    stable("q3", { topic: "Geometri" }),
    legacy("q4", { subject: "Fizik", topic: "Kuvvet" }),
    recovering("q5", { subject: "Fizik", topic: "Optik" }),
  ];

  function allCopy(): string {
    const map = build(rich, NOW);
    const parts = conceptMapSummaryFacts(map);
    for (const subject of map.subjects) {
      for (const concept of subject.concepts) {
        parts.push(conceptStateLabel(concept), conceptSupportingFact(concept));
        const note = conceptReviewNote(concept);
        if (note) parts.push(note);
      }
    }
    return parts.join(" | ");
  }

  it("never exposes an internal enum", () => {
    const copy = allCopy();
    for (const leak of [
      "persistent_struggle",
      "insufficient_data",
      "one_off_struggle",
      "needs_attention",
      "needs_evidence",
      "studyItems",
      "studyEvents",
      "dueCount",
      "masteryScore",
      "operationId",
    ]) {
      expect(copy).not.toContain(leak);
    }
  });

  it("states no percentage, score or grade", () => {
    const copy = allCopy();
    expect(copy).not.toMatch(/%/);
    expect(copy).not.toMatch(/puan|skor|yüzde|başarı oranı/i);
  });

  it("passes no judgement on the student", () => {
    const copy = allCopy().toLocaleLowerCase("tr");
    for (const word of ["zayıf", "başarısız", "bilmiyorsun", "kötü", "yetersizsin"]) {
      expect(copy).not.toContain(word);
    }
  });

  it("never declares a concept finished or mastered", () => {
    const copy = allCopy().toLocaleLowerCase("tr");
    for (const word of ["tamamlandı", "ustalaştın", "bitirdin", "%100"]) {
      expect(copy).not.toContain(word);
    }
  });
});

describe("concept map — summary facts", () => {
  it("counts only concepts carrying trustworthy evidence", () => {
    const map = build([stable("q1"), legacy("q2", { topic: "Geometri" })]);
    expect(map.conceptsWithEvidence).toBe(1);
    expect(map.totalConcepts).toBe(2);
  });

  it("counts concepts needing attention", () => {
    const map = build([persistent("q1"), stable("q2", { topic: "Geometri" })]);
    expect(map.conceptsNeedingAttention).toBe(1);
  });

  it("counts concepts with something due", () => {
    const map = build([
      stable("q1", { nextReviewAt: PAST }),
      stable("q2", { topic: "Geometri", nextReviewAt: FUTURE }),
    ]);
    expect(map.conceptsDueForReview).toBe(1);
  });

  it("states only the facts that are actually non-zero", () => {
    const facts = conceptMapSummaryFacts(build([legacy("q1")]));
    expect(facts).toEqual([]);
  });

  it("reads as finished product copy", () => {
    const facts = conceptMapSummaryFacts(
      build([persistent("q1", { nextReviewAt: PAST }), stable("q2", { topic: "Geometri" })]),
    );
    expect(facts).toEqual([
      "2 konuda öğrenme kanıtı",
      "1 konuda tekrar eden zorlanma",
      "1 konuda tekrar zamanı",
    ]);
  });
});
