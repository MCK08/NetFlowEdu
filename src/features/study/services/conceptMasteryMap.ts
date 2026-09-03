import { LearningInsightItem } from "./learningInsights";
import { buildLearningState, LearningState } from "./learningState";

// Phase 70 — the student's learning landscape, built ONLY from evidence the
// product already trusts.
//
// WHAT THIS IS NOT
//
// Not a second learning classifier. Phase 42's buildLearningState remains the
// only thing that decides what one question's history means; this module
// groups those verdicts by concept and decides how to PRESENT a group. A
// presentation category is not a learning state, and none of them is exposed
// to the student by name.
//
// Not a scoring system. There is no masteryScore, no percentage, no 0-100 and
// no confidence figure anywhere in this file. NetFlowEdu has no model that
// could support one, and inventing a number would make an unearned claim look
// like a measurement.
//
// Not a second scheduler. Review readiness is `nextReviewAt <= now` — the
// server's own verdict, the same authority Phase 62 defers to.
//
// THE RULE THAT SHAPES THE AGGREGATION
//
// Risk is never averaged away, and absence is never counted as success. One
// question a student keeps failing stays visible inside an otherwise solid
// concept, and one solved question surrounded by unknowns does not make a
// concept look learned. Where a concept's evidence is thin, the honest answer
// is that more evidence is needed — not a smaller number.

/** How a concept is presented. Derived FROM Phase 42 states, never a
 *  replacement for them, and never shown to the student by name. */
export type ConceptPresentation =
  // At least one question shows repeated, unresolved struggle.
  | "needs_attention"
  // Repeated struggle that the student has since climbed back out of.
  | "recovering"
  // Exactly one slip somewhere — real, but not a pattern.
  | "watch"
  // Enough questions carry standing success to describe the concept that way.
  | "steady"
  // Not enough trustworthy evidence to say anything else. The default.
  | "needs_evidence";

export interface ConceptNode {
  /** Stable across renders: subject+topic, the same key Phase 62 uses. */
  id: string;
  subject: string;
  topic: string;
  /** Every question the student has met in this concept. */
  questionCount: number;
  /** Questions whose counters cover their whole history (Phase 41). */
  trustworthyEvidenceCount: number;
  /** Questions whose history cannot be trusted — unknown, never zero. */
  unknownEvidenceCount: number;
  /** How many questions landed in each Phase 42 state. */
  stateComposition: Readonly<Record<LearningState, number>>;
  /** Questions the SCHEDULER says are ready to revisit. */
  dueCount: number;
  presentation: ConceptPresentation;
}

export interface SubjectRegion {
  subject: string;
  concepts: ConceptNode[];
}

export interface ConceptMasteryMap {
  subjects: SubjectRegion[];
  /** Concepts carrying at least one question with trustworthy evidence. */
  conceptsWithEvidence: number;
  conceptsNeedingAttention: number;
  conceptsDueForReview: number;
  totalConcepts: number;
  isEmpty: boolean;
}

const EMPTY_COMPOSITION: Readonly<Record<LearningState, number>> = {
  persistent_struggle: 0,
  recovering: 0,
  stable: 0,
  one_off_struggle: 0,
  insufficient_data: 0,
};

// Order concepts are shown in. Attention first, because that is what the
// student can act on; unknown last, because it is the least informative. This
// is a reading order, not a ranking of the student.
const PRESENTATION_ORDER: Readonly<Record<ConceptPresentation, number>> = {
  needs_attention: 0,
  recovering: 1,
  watch: 2,
  steady: 3,
  needs_evidence: 4,
};

/** How a concept's Phase 42 composition is presented.
 *
 *  Ordered checks, most conservative first, so a single unresolved struggle
 *  can never be diluted by the questions around it — averaging is exactly what
 *  would hide the case the product exists to surface.
 *
 *  "steady" additionally requires standing success on MORE THAN HALF the
 *  concept's questions. One solved question among four unknowns is not a
 *  learned concept, and calling it one would be the same overclaim Phase 42
 *  refuses to make about a single question. */
function resolvePresentation(
  composition: Readonly<Record<LearningState, number>>,
  questionCount: number,
): ConceptPresentation {
  if (composition.persistent_struggle > 0) return "needs_attention";
  if (composition.recovering > 0) return "recovering";
  if (composition.one_off_struggle > 0) return "watch";
  if (composition.stable * 2 > questionCount) return "steady";
  return "needs_evidence";
}

interface ConceptAccumulator {
  subject: string;
  topic: string;
  questionCount: number;
  trustworthyEvidenceCount: number;
  unknownEvidenceCount: number;
  composition: Record<LearningState, number>;
  dueCount: number;
}

/** Groups every study item into concepts and reads each one's evidence.
 *
 *  `now` is injected rather than read inside, so the same items always produce
 *  the same map and the review-readiness branch is directly testable.
 *
 *  O(n) over items plus the final sorts — one pass, one map, no nested scan
 *  over subjects × topics. */
export function buildConceptMasteryMap(params: {
  items: readonly LearningInsightItem[];
  now: number;
}): ConceptMasteryMap {
  const concepts = new Map<string, ConceptAccumulator>();

  for (const item of params.items) {
    const subject = item.subject.trim();
    const topic = item.topic.trim();
    // A question whose metadata never resolved has no concept to belong to.
    // Grouping those under one "unknown" heading would invent a relationship
    // between questions that have nothing to do with each other — the same
    // rule the practice plan and Phase 62 already apply.
    if (!subject || !topic) continue;

    const id = `${subject}|${topic}`;
    let concept = concepts.get(id);
    if (!concept) {
      concept = {
        subject,
        topic,
        questionCount: 0,
        trustworthyEvidenceCount: 0,
        unknownEvidenceCount: 0,
        composition: { ...EMPTY_COMPOSITION },
        dueCount: 0,
      };
      concepts.set(id, concept);
    }

    concept.questionCount += 1;

    // Phase 41's completeness rule, deferred to rather than re-derived: a null
    // history means earlier outcomes exist that were never counted. It is
    // UNKNOWN, and it must never be read as "no struggles".
    if (item.outcomeHistory) concept.trustworthyEvidenceCount += 1;
    else concept.unknownEvidenceCount += 1;

    // Phase 42 is the authority on what one question's history means.
    const state = buildLearningState({
      history: item.outcomeHistory ?? null,
      lastOutcome: item.lastOutcome,
      status: item.status,
      successfulReviews: item.successfulReviews,
    });
    concept.composition[state] += 1;

    // The scheduler's own verdict. Mastered items have left the review cycle
    // by its mastery gate, and re-counting them here would undo that.
    if (item.status !== "mastered" && item.nextReviewAt <= params.now) {
      concept.dueCount += 1;
    }
  }

  const nodes: ConceptNode[] = [];
  for (const [id, concept] of concepts) {
    nodes.push({
      id,
      subject: concept.subject,
      topic: concept.topic,
      questionCount: concept.questionCount,
      trustworthyEvidenceCount: concept.trustworthyEvidenceCount,
      unknownEvidenceCount: concept.unknownEvidenceCount,
      stateComposition: { ...concept.composition },
      dueCount: concept.dueCount,
      presentation: resolvePresentation(concept.composition, concept.questionCount),
    });
  }

  const bySubject = new Map<string, ConceptNode[]>();
  for (const node of nodes) {
    const existing = bySubject.get(node.subject);
    if (existing) existing.push(node);
    else bySubject.set(node.subject, [node]);
  }

  const subjects: SubjectRegion[] = [];
  for (const [subject, subjectConcepts] of bySubject) {
    // Deterministic: presentation order, then topic name. Insertion order is
    // never relied on, so the same evidence always reads the same way.
    subjectConcepts.sort((a, b) => {
      const byPresentation =
        PRESENTATION_ORDER[a.presentation] - PRESENTATION_ORDER[b.presentation];
      if (byPresentation !== 0) return byPresentation;
      return a.topic.localeCompare(b.topic, "tr");
    });
    subjects.push({ subject, concepts: subjectConcepts });
  }
  subjects.sort((a, b) => a.subject.localeCompare(b.subject, "tr"));

  return {
    subjects,
    conceptsWithEvidence: nodes.filter((node) => node.trustworthyEvidenceCount > 0).length,
    conceptsNeedingAttention: nodes.filter((node) => node.presentation === "needs_attention")
      .length,
    conceptsDueForReview: nodes.filter((node) => node.dueCount > 0).length,
    totalConcepts: nodes.length,
    isEmpty: nodes.length === 0,
  };
}

// Student-facing wording. Fixed, observational, and never an internal name.
//
// Nothing here says the student is weak, has failed, or has finished. A
// repeated struggle is described as something that happened, not as a verdict
// on the person, and "steady" never becomes "mastered" — the product has no
// definition of mastery at concept level to stand behind.
const PRESENTATION_LABEL: Readonly<Record<ConceptPresentation, string>> = {
  needs_attention: "Tekrar eden zorlanma",
  recovering: "Toparlanıyor",
  watch: "Tek zorlanma görüldü",
  steady: "İstikrarlı",
  needs_evidence: "Daha fazla kanıt gerekiyor",
};

export function conceptStateLabel(node: ConceptNode): string {
  return PRESENTATION_LABEL[node.presentation];
}

/** ONE supporting fact per concept, and only facts the counters can support.
 *
 *  Every number here is a real count of questions. None is a rate, a share or
 *  a score, and the evidence-coverage sentence deliberately states both halves
 *  ("N of M") rather than collapsing them into a percentage. */
export function conceptSupportingFact(node: ConceptNode): string {
  switch (node.presentation) {
    case "needs_attention": {
      const count = node.stateComposition.persistent_struggle;
      return count === 1
        ? "Bir soruda zorlanma tekrar etti."
        : `${count} soruda zorlanma tekrar etti.`;
    }
    case "recovering":
      return "Zorlandıktan sonra çözüm kanıtı var.";
    case "watch":
      return "Bir soruda zorlanma görüldü.";
    case "steady": {
      const count = node.stateComposition.stable;
      return count === 1
        ? "Bir soruda istikrarlı çözüm kanıtı var."
        : `${count} soruda istikrarlı çözüm kanıtı var.`;
    }
    case "needs_evidence":
    default:
      // The honest shape of thin evidence: how much of the concept is actually
      // covered, stated as counts. Zero coverage says so plainly rather than
      // implying the student got things wrong.
      return node.trustworthyEvidenceCount === 0
        ? "Henüz yeterli öğrenme kanıtı yok."
        : `${node.questionCount} sorudan ${node.trustworthyEvidenceCount} tanesinde yeterli öğrenme kanıtı var.`;
  }
}

/** The review line, shown only when the scheduler has actually released
 *  something in this concept. */
export function conceptReviewNote(node: ConceptNode): string | null {
  return node.dueCount > 0 ? "Tekrar zamanı geldi." : null;
}

/** The map's headline facts. Only non-zero ones are worth stating, so the
 *  caller renders exactly what came back and nothing more. */
export function conceptMapSummaryFacts(map: ConceptMasteryMap): string[] {
  const facts: string[] = [];
  if (map.conceptsWithEvidence > 0) {
    facts.push(`${map.conceptsWithEvidence} konuda öğrenme kanıtı`);
  }
  if (map.conceptsNeedingAttention > 0) {
    facts.push(`${map.conceptsNeedingAttention} konuda tekrar eden zorlanma`);
  }
  if (map.conceptsDueForReview > 0) {
    facts.push(`${map.conceptsDueForReview} konuda tekrar zamanı`);
  }
  return facts;
}
