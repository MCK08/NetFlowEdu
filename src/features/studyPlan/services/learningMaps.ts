import {
  buildConceptMasteryMap,
  ConceptNode,
  ConceptPresentation,
  conceptStateLabel,
  conceptSupportingFact,
} from "@features/study/services/conceptMasteryMap";
import type { LearningEvent } from "@features/learningStory/services/learningTrail";
import { sortEventsChronologically } from "@features/learningStory/services/learningTrail";
import type { StudyOutcome } from "@features/study/domain/studyTypes";
import {
  AnalyticsItem,
  buildQuestionArchive,
} from "@features/studentAnalytics/services/studentAnalytics";

import type { CompletedPlanDay } from "./planStore";
import { localDayKey, startOfLocalDay } from "./planDay";

// Phase 108 — Eksik Haritam, Güçlü Alanlarım, İlerleme Haritam.
//
// Three views over evidence the product already interprets:
//   * the archive (Phase 107): which questions the student provably could
//     not solve, and which of those they later solved;
//   * the concept map (Phase 70): how Phase 42's per-question verdicts read
//     when grouped by topic;
//   * the learning events (Phase 59): what happened, in order, with a
//     server-written time.
// Nothing here classifies. Every count is a count of questions or events,
// every label is Phase 70's own, and every dated row is a recorded event or
// a fact with a recorded timestamp. Pure and Firebase/React-free.

function topicKey(subject: string, topic: string): string {
  return `${subject}|${topic}`;
}

// ─── Eksik Haritam ─────────────────────────────────────────────────────────

export interface GapTopic {
  subject: string;
  topic: string;
  /** Archived questions still waiting — the student's own struggle evidence. */
  pendingCount: number;
  /** Archived questions the student has since solved. */
  solvedLaterCount: number;
  /** Phase 70's reading of the topic, for the semantic word beside the count. */
  presentation: ConceptPresentation;
  stateLabel: string;
}

export interface GapSubject {
  subject: string;
  pendingCount: number;
  topics: GapTopic[];
}

export interface GapMap {
  subjects: GapSubject[];
  pendingTotal: number;
  solvedLaterTotal: number;
  isEmpty: boolean;
}

/** Subject → topic → waiting questions. A topic is here ONLY because the
 *  archive holds at least one question of it (pending or solved later); a
 *  topic with a low rate, a teacher's assignment, or another student's
 *  difficulty never becomes an "eksik". */
export function buildGapMap(items: readonly AnalyticsItem[], now: number): GapMap {
  const archive = buildQuestionArchive(items);
  const concepts = new Map<string, ConceptNode>();
  for (const region of buildConceptMasteryMap({ items, now }).subjects) {
    for (const node of region.concepts) concepts.set(topicKey(node.subject, node.topic), node);
  }

  const topics = new Map<string, GapTopic>();
  for (const entry of archive) {
    if (!entry.subject || !entry.topic) continue;
    const key = topicKey(entry.subject, entry.topic);
    let gap = topics.get(key);
    if (!gap) {
      const node = concepts.get(key);
      const presentation: ConceptPresentation = node?.presentation ?? "needs_evidence";
      gap = {
        subject: entry.subject,
        topic: entry.topic,
        pendingCount: 0,
        solvedLaterCount: 0,
        presentation,
        stateLabel: node ? conceptStateLabel(node) : "Daha fazla kanıt gerekiyor",
      };
      topics.set(key, gap);
    }
    if (entry.state === "pending") gap.pendingCount += 1;
    else gap.solvedLaterCount += 1;
  }

  const bySubject = new Map<string, GapTopic[]>();
  for (const gap of topics.values()) {
    const list = bySubject.get(gap.subject);
    if (list) list.push(gap);
    else bySubject.set(gap.subject, [gap]);
  }

  const subjects: GapSubject[] = [...bySubject.entries()].map(([subject, list]) => ({
    subject,
    pendingCount: list.reduce((sum, gap) => sum + gap.pendingCount, 0),
    topics: list.sort((a, b) => {
      if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
      if (a.solvedLaterCount !== b.solvedLaterCount) return b.solvedLaterCount - a.solvedLaterCount;
      return a.topic.localeCompare(b.topic, "tr");
    }),
  }));
  subjects.sort((a, b) => {
    if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
    return a.subject.localeCompare(b.subject, "tr");
  });

  let pendingTotal = 0;
  let solvedLaterTotal = 0;
  for (const gap of topics.values()) {
    pendingTotal += gap.pendingCount;
    solvedLaterTotal += gap.solvedLaterCount;
  }
  return { subjects, pendingTotal, solvedLaterTotal, isEmpty: topics.size === 0 };
}

/** The word under a gap topic: what the archive count means today. */
export function gapCountLabel(gap: Pick<GapTopic, "pendingCount" | "solvedLaterCount">): string {
  if (gap.pendingCount > 0) return `${gap.pendingCount} tekrar bekliyor`;
  return `${gap.solvedLaterCount} sonradan çözüldü`;
}

// ─── Güçlü Alanlarım ───────────────────────────────────────────────────────

export interface StrongArea {
  subject: string;
  topic: string;
  questionCount: number;
  /** Phase 70's supporting fact, e.g. "5 sorunun 4'ünde istikrarlı başarı". */
  fact: string;
}

/** Topics Phase 70 presents as "steady" — standing success on more than half
 *  of the topic's questions, each of which Phase 42 already required three
 *  recorded outcomes for. No rate, no level, no rank; a topic with thinner
 *  evidence is simply not listed. */
export function buildStrongAreas(items: readonly AnalyticsItem[], now: number): StrongArea[] {
  const areas: StrongArea[] = [];
  for (const region of buildConceptMasteryMap({ items, now }).subjects) {
    for (const node of region.concepts) {
      if (node.presentation !== "steady") continue;
      areas.push({ subject: node.subject, topic: node.topic, questionCount: node.questionCount, fact: conceptSupportingFact(node) });
    }
  }
  return areas.sort((a, b) => {
    if (a.questionCount !== b.questionCount) return b.questionCount - a.questionCount;
    return topicKey(a.subject, a.topic).localeCompare(topicKey(b.subject, b.topic), "tr");
  });
}

// ─── İlerleme Haritam ──────────────────────────────────────────────────────

/** The four stages the map draws, in reading order. These are Phase 70's
 *  presentations; only "needs_evidence" is left off the ladder because it is
 *  not a place on it. */
export const PROGRESS_STAGES: readonly ConceptPresentation[] = ["needs_attention", "watch", "recovering", "steady"];

export interface ProgressStage {
  presentation: ConceptPresentation;
  label: string;
  topics: { subject: string; topic: string }[];
}

export interface ProgressMap {
  stages: ProgressStage[];
  /** Topics with too little evidence to place — named, never hidden. */
  unplacedCount: number;
  totalTopics: number;
}

/** Where each topic stands right now, on Phase 70's own ladder. A snapshot,
 *  not a history: it cannot say how a topic got where it is. */
export function buildProgressMap(items: readonly AnalyticsItem[], now: number): ProgressMap {
  const nodes = buildConceptMasteryMap({ items, now }).subjects.flatMap((region) => region.concepts);
  const stages: ProgressStage[] = PROGRESS_STAGES.map((presentation) => ({
    presentation,
    label: conceptStateLabel({ presentation } as ConceptNode),
    topics: nodes
      .filter((node) => node.presentation === presentation)
      .map((node) => ({ subject: node.subject, topic: node.topic }))
      .sort((a, b) => topicKey(a.subject, a.topic).localeCompare(topicKey(b.subject, b.topic), "tr")),
  }));
  const unplacedCount = nodes.filter((node) => node.presentation === "needs_evidence").length;
  return { stages, unplacedCount, totalTopics: nodes.length };
}

export type ProgressEventKind = "outcome" | "solved_later" | "plan_completed";

export interface ProgressEvent {
  id: string;
  occurredAt: number;
  dayKey: string;
  kind: ProgressEventKind;
  subject: string;
  topic: string;
  /** The recorded outcome for kind "outcome"; null otherwise. */
  outcome: StudyOutcome | null;
  sentence: string;
}

export interface ProgressHistory {
  /** Newest first. */
  events: ProgressEvent[];
  isEmpty: boolean;
}

const OUTCOME_SENTENCE: Readonly<Record<StudyOutcome, string>> = {
  solved: "Çözdün",
  struggled: "Zorlandın",
  again: "Tekrar istedin",
};

export interface BuildProgressHistoryParams {
  /** Recent learning events, joined with subject/topic by the caller. */
  events: readonly LearningEvent[];
  items: readonly AnalyticsItem[];
  completedDays: readonly CompletedPlanDay[];
  /** At most this many rows, newest first. */
  limit?: number;
}

/** Dated rows, each a fact with a recorded time:
 *   * a learning event (server-written occurredAt) — "Zorlandın" / "Çözdün";
 *   * an archived question the student later solved (the solve is the
 *     item's own lastReviewedAt, and "solved later" is Phase 107's provable
 *     state);
 *   * a day on which the daily plan completed (plan-local record).
 *  Nothing is interpolated between rows and no state is inferred from a
 *  gap; a student with no events sees an empty history, not a curve. */
export function buildProgressHistory(params: BuildProgressHistoryParams): ProgressHistory {
  const limit = params.limit ?? 40;
  const rows: ProgressEvent[] = [];

  for (const event of sortEventsChronologically(params.events)) {
    if (!Number.isFinite(event.occurredAt) || event.occurredAt <= 0) continue;
    rows.push({
      id: `event:${event.id}`,
      occurredAt: event.occurredAt,
      dayKey: localDayKey(event.occurredAt),
      kind: "outcome",
      subject: event.subject,
      topic: event.topic,
      outcome: event.outcome,
      sentence: OUTCOME_SENTENCE[event.outcome],
    });
  }

  for (const entry of buildQuestionArchive(params.items)) {
    if (entry.state !== "solved_later") continue;
    if (!Number.isFinite(entry.lastReviewedAt) || entry.lastReviewedAt <= 0) continue;
    rows.push({
      id: `solved_later:${entry.questionId}`,
      occurredAt: entry.lastReviewedAt,
      dayKey: localDayKey(entry.lastReviewedAt),
      kind: "solved_later",
      subject: entry.subject,
      topic: entry.topic,
      outcome: null,
      sentence: "Çözemediğin bir soruyu yeniden çözdün",
    });
  }

  for (const day of params.completedDays) {
    const start = startOfLocalDay(new Date(`${day.dayKey}T00:00:00`).getTime());
    if (!Number.isFinite(start)) continue;
    rows.push({
      id: `plan:${day.dayKey}`,
      // End of that day, so it sorts after the day's own outcomes.
      occurredAt: start + 24 * 60 * 60 * 1000 - 1,
      dayKey: day.dayKey,
      kind: "plan_completed",
      subject: "",
      topic: "",
      outcome: null,
      sentence: `Günlük plan tamamlandı · ${day.stepsCompleted} adım`,
    });
  }

  rows.sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return b.occurredAt - a.occurredAt;
    return a.id.localeCompare(b.id);
  });
  const events = rows.slice(0, limit);
  return { events, isEmpty: events.length === 0 };
}
