import { LearningEvent } from "@features/learningStory/services/learningTrail";

import { StudyOutcome } from "../domain/studyTypes";
import { LearningInsightItem } from "./learningInsights";
import { buildLearningState, LearningState } from "./learningState";

// Phase 71 — how difficulty is REPEATING, from evidence the product can prove.
//
// WHAT THIS DELIBERATELY DOES NOT DO
//
// It never says WHY a student struggled. The repository has no authored
// misconception metadata: `Question` carries `choices` and `correctChoice` and
// nothing else, `recordStudyOutcome` receives only { questionId, outcome,
// operationId }, and the selected choice lives in React state that is never
// persisted. So "işaret hatası" and its relatives cannot be sourced from
// anything — they could only be guessed from question text, which is exactly
// the inference this phase refuses to make.
//
// What CAN be proven is repetition: the same question struggled more than
// once, difficulty spread across several questions of one topic, or a struggle
// the student has since climbed back out of. That is what this module states,
// and nothing more.
//
// WHERE EACH FACT COMES FROM
//
//   counts       Phase 41 cumulative counters — trustworthy or null, never zero
//   verdicts     Phase 42 buildLearningState — the only classifier, reused
//   chronology   Phase 59 studyEvents — the only ordered memory, bounded
//
// No new classifier, no new threshold, no scheduler, no score. This module is
// observational: nothing here feeds adaptive selection, review timing or the
// next action.

export type StrugglePatternKind =
  // Unresolved struggle on two or more DISTINCT questions of one topic.
  | "topic_spread"
  // Unresolved struggle that keeps recurring on ONE question.
  | "same_question"
  // Repeated struggle the student has since climbed back out of.
  | "recovery";

export interface StrugglePattern {
  /** Stable across renders: kind + subject + topic. */
  id: string;
  kind: StrugglePatternKind;
  subject: string;
  topic: string;
  /** Distinct questions of this topic showing unresolved repeated struggle. */
  distinctQuestionCount: number;
  /** The question a same-question or recovery pattern is actually about. */
  focusQuestionId: string | null;
  /** Cumulative struggle count for the focus question. 0 when not applicable. */
  focusStruggleCount: number;
  /** Real ordered outcomes for the focus question, from Phase 59 events.
   *  Empty when the bounded window holds none — the pattern still stands on
   *  its counters; only the chronology is withheld. */
  recentOutcomes: StudyOutcome[];
}

export interface StrugglePatternMemory {
  patterns: StrugglePattern[];
  /** True when the bounded event window held too little to say anything about
   *  repetition either way. Distinguishes "nothing repeats" from "we have not
   *  seen enough yet" — two different sentences for the student. */
  hasThinHistory: boolean;
  isEmpty: boolean;
}

// A screen the student reads, not a report. Four is enough to show what is
// actually recurring without turning repetition into a worklist.
export const MAX_VISIBLE_PATTERNS = 4;

// "Repeated" starts at two, the bar Phase 42 already sets for a struggle to be
// a pattern rather than a slip. Not re-derived here — the same constant's
// reasoning, applied to the same field.
export const REPEATED_STRUGGLE_MIN = 2;

// Two distinct questions before difficulty is described as spread. One
// question is a question, not a spread.
export const SPREAD_MIN_QUESTIONS = 2;

// Reused from the Learning Trail rather than invented: one lone outcome is not
// a history, and the same reasoning decides whether this screen may say
// "nothing is repeating" instead of "we have not seen enough yet".
export const MIN_EVENTS_FOR_ABSENCE_CLAIM = 2;

// Which kinds outrank which. Unresolved before resolved, and broader before
// narrower: a topic where several questions are still going wrong is a more
// useful thing to know than one question inside it, and both are more
// actionable than a struggle already climbed out of.
const KIND_PRIORITY: Readonly<Record<StrugglePatternKind, number>> = {
  topic_spread: 0,
  same_question: 1,
  recovery: 2,
};

interface QuestionEvidence {
  questionId: string;
  state: LearningState;
  struggledCount: number;
}

/** Ordered outcomes for one question, oldest → newest, from the bounded window.
 *
 *  Chronology comes only from Phase 59 events. It is never reconstructed from
 *  counters, which record how many times something happened but not when — the
 *  exact inference Phase 56 refused to make. */
function outcomesForQuestion(
  events: readonly LearningEvent[],
  questionId: string,
): StudyOutcome[] {
  return events
    .filter((event) => event.questionId === questionId)
    .slice()
    .sort((a, b) => (a.occurredAt !== b.occurredAt ? a.occurredAt - b.occurredAt : a.id.localeCompare(b.id)))
    .map((event) => event.outcome);
}

/** The repetition the evidence actually supports.
 *
 *  Pure: no clock, no Firebase, no randomness. There is deliberately no `now`
 *  parameter — repetition is not a time-window question, and giving this module
 *  a clock would invite exactly the elapsed-time reasoning it should not do. */
export function buildStrugglePatternMemory(params: {
  items: readonly LearningInsightItem[];
  events: readonly LearningEvent[];
}): StrugglePatternMemory {
  // Duplicate event ids can only mean a corrupted or double-delivered read;
  // collapsing them keeps one delivery from inflating a chronology.
  const seenEventIds = new Set<string>();
  const events: LearningEvent[] = [];
  for (const event of params.events) {
    if (seenEventIds.has(event.id)) continue;
    seenEventIds.add(event.id);
    events.push(event);
  }

  const byTopic = new Map<string, { subject: string; topic: string; questions: QuestionEvidence[] }>();

  for (const item of params.items) {
    const subject = item.subject.trim();
    const topic = item.topic.trim();
    // No resolvable concept means nothing to name and no group to belong to —
    // the same rule Phase 62 and Phase 70 already apply.
    if (!subject || !topic) continue;

    // Phase 41's completeness rule, deferred to. A null history is UNKNOWN:
    // it can never be read as "never struggled", and it can never contribute
    // to a claim that struggle is or is not repeating.
    const history = item.outcomeHistory;
    if (!history) continue;

    const state = buildLearningState({
      history,
      lastOutcome: item.lastOutcome,
      status: item.status,
      successfulReviews: item.successfulReviews,
    });

    const key = `${subject}|${topic}`;
    let group = byTopic.get(key);
    if (!group) {
      group = { subject, topic, questions: [] };
      byTopic.set(key, group);
    }
    group.questions.push({
      questionId: item.questionId,
      state,
      // struggledCount only — "again" is a request to see the card again
      // shortly, not a report of difficulty, and every other surface in the
      // product already draws that line the same way.
      struggledCount: history.struggledCount,
    });
  }

  const patterns: StrugglePattern[] = [];

  for (const [key, group] of byTopic) {
    // Ordered checks, one pattern per topic. Showing a topic both as "spread"
    // and as "one question keeps recurring" would restate the same evidence in
    // two cards without adding meaning.
    const unresolved = group.questions.filter((q) => q.state === "persistent_struggle");

    if (unresolved.length >= SPREAD_MIN_QUESTIONS) {
      patterns.push({
        id: `topic_spread|${key}`,
        kind: "topic_spread",
        subject: group.subject,
        topic: group.topic,
        distinctQuestionCount: unresolved.length,
        focusQuestionId: null,
        focusStruggleCount: 0,
        recentOutcomes: [],
      });
      continue;
    }

    // The single question carrying the most repeated, still-unresolved
    // struggle. Deterministic on ties so the same evidence always names the
    // same question.
    const repeated = unresolved
      .filter((q) => q.struggledCount >= REPEATED_STRUGGLE_MIN)
      .sort((a, b) =>
        a.struggledCount !== b.struggledCount
          ? b.struggledCount - a.struggledCount
          : a.questionId.localeCompare(b.questionId),
      );
    const focus = repeated[0];
    if (focus) {
      patterns.push({
        id: `same_question|${key}`,
        kind: "same_question",
        subject: group.subject,
        topic: group.topic,
        distinctQuestionCount: 1,
        focusQuestionId: focus.questionId,
        focusStruggleCount: focus.struggledCount,
        recentOutcomes: outcomesForQuestion(events, focus.questionId),
      });
      continue;
    }

    // Recovery is Phase 42's verdict, never "the latest event was a solve".
    // That distinction is the whole point: a standing solve after repeated
    // struggle is evidence, one solved card is not.
    const recovered = group.questions
      .filter((q) => q.state === "recovering")
      .sort((a, b) =>
        a.struggledCount !== b.struggledCount
          ? b.struggledCount - a.struggledCount
          : a.questionId.localeCompare(b.questionId),
      );
    const recoveredFocus = recovered[0];
    if (recoveredFocus) {
      patterns.push({
        id: `recovery|${key}`,
        kind: "recovery",
        subject: group.subject,
        topic: group.topic,
        distinctQuestionCount: recovered.length,
        focusQuestionId: recoveredFocus.questionId,
        focusStruggleCount: recoveredFocus.struggledCount,
        recentOutcomes: outcomesForQuestion(events, recoveredFocus.questionId),
      });
    }
    // Anything else — a single slip, stable evidence, or unknown history —
    // produces NO pattern. A calm absence is the honest result, and inventing
    // a "success pattern" to fill the screen would be the same overclaim in a
    // friendlier voice.
  }

  patterns.sort((a, b) => {
    const byKind = KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
    if (byKind !== 0) return byKind;
    if (a.distinctQuestionCount !== b.distinctQuestionCount) {
      return b.distinctQuestionCount - a.distinctQuestionCount;
    }
    if (a.focusStruggleCount !== b.focusStruggleCount) {
      return b.focusStruggleCount - a.focusStruggleCount;
    }
    return a.id.localeCompare(b.id);
  });

  return {
    patterns: patterns.slice(0, MAX_VISIBLE_PATTERNS),
    hasThinHistory: events.length < MIN_EVENTS_FOR_ABSENCE_CLAIM,
    isEmpty: patterns.length === 0,
  };
}

// Student-facing wording. Descriptive, never diagnostic: each line says what
// the records show, never why it happened and never what the student is.
const KIND_TITLE: Readonly<Record<StrugglePatternKind, string>> = {
  topic_spread: "Zorlanma birden fazla soruya yayılıyor",
  same_question: "Aynı soruda zorlanma tekrar ediyor",
  recovery: "Tekrar eden zorlanmadan sonra toparlanma",
};

export function patternTitle(pattern: StrugglePattern): string {
  return KIND_TITLE[pattern.kind];
}

/** The one supporting fact, scoped to exactly the evidence behind it.
 *
 *  Scope wording is load-bearing: a count of questions says "bu konuda", a
 *  count of attempts on one question says "bu soruda". Swapping them would
 *  turn question evidence into topic evidence, which is the precise mistake
 *  this product has corrected before. */
export function patternSupportingFact(pattern: StrugglePattern): string {
  switch (pattern.kind) {
    case "topic_spread":
      return `Bu konuda ${pattern.distinctQuestionCount} farklı soruda zorlanma tekrar ediyor.`;
    case "same_question":
      return `Bu soruda ${pattern.focusStruggleCount} zorlanma kaydı var.`;
    case "recovery":
    default:
      return pattern.focusStruggleCount >= REPEATED_STRUGGLE_MIN
        ? `Bu soruda ${pattern.focusStruggleCount} zorlanmanın ardından çözüm kaydı var.`
        : "Bu soruda zorlanmanın ardından çözüm kaydı var.";
  }
}

/** Label for the bounded chronology, when there is one to show.
 *
 *  Says "son öğrenme kayıtlarında" because the events behind it come from a
 *  bounded query. It must never read as a claim about the student's whole
 *  history — that window genuinely is not the whole history. */
export function patternChronologyLabel(pattern: StrugglePattern): string | null {
  return pattern.recentOutcomes.length > 0 ? "Son öğrenme kayıtlarında" : null;
}

const OUTCOME_LABEL: Readonly<Record<StudyOutcome, string>> = {
  solved: "Çözdüm",
  struggled: "Zorlandım",
  again: "Tekrar Çalıştım",
};

export function patternOutcomeLabel(outcome: StudyOutcome): string {
  return OUTCOME_LABEL[outcome];
}

/** What the screen says when it has no pattern to show.
 *
 *  Two different sentences, because they are two different facts. Telling a
 *  student with almost no history that nothing is repeating would be a claim
 *  the records cannot support. */
export function patternAbsenceCopy(memory: StrugglePatternMemory): {
  title: string;
  description: string;
} {
  if (memory.hasThinHistory) {
    return {
      title: "Örüntü söylemek için daha fazla öğrenme kaydı gerekiyor",
      description: "Çalıştıkça NetFlowEdu tekrar eden öğrenme sinyallerini burada gösterecek.",
    };
  }
  return {
    title: "Henüz tekrar eden bir zorlanma örüntüsü görünmüyor",
    description: "Tekrar eden bir zorlanma oluştuğunda burada görünecek.",
  };
}
