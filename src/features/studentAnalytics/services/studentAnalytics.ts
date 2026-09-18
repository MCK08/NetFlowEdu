import type { StudyOutcome } from "@features/study/domain/studyTypes";
import type { StudyItem } from "@features/study/services/studyService";
import { buildConceptMasteryMap, ConceptNode } from "@features/study/services/conceptMasteryMap";
import type { LearningInsightItem } from "@features/study/services/learningInsights";
import { buildLearningState, LearningState } from "@features/study/services/learningState";
import {
  buildSuccessRatePercent,
  OutcomeHistory,
  resolveOutcomeHistory,
} from "@features/study/services/outcomeCounters";
import {
  LearningEvent,
  MAX_TRAIL_EVENTS,
  MIN_TRAIL_EVENTS,
  sortEventsChronologically,
} from "@features/learningStory/services/learningTrail";
import { hasMultipleChoice } from "@features/questions/services/multipleChoice";
import type { Question } from "@/types/question";

// Phase 107 — Kişisel Analiz and "Çözemediğim Sorular".
//
// PRESENTATION, NOT A NEW LEARNING MODEL
//
// Everything here is derived from evidence the product already persists and
// already interprets. The per-question verdict is Phase 42's buildLearningState,
// called unchanged; the per-topic reading is Phase 70's buildConceptMasteryMap,
// called unchanged; every rate goes through Phase 41's completeness rule. This
// module adds groupings, filters and counts over those — it never decides that
// a student is weak, strong or improving on any basis of its own.
//
// Pure and Firebase/React-free. `StudyItem` is imported as a TYPE only: the
// studyService module initialises Firebase at import time, and nothing in a
// deterministic view-model may depend on that.

const DAY_MS = 24 * 60 * 60 * 1000;

// Questions whose subject is unknown (legacy, or the question could not be
// read) are grouped, never dropped, so a student's real history is never
// silently shortened.
//
// Deliberately NOT learningInsights.ts's "Diğer": that is also a real subject
// a teacher can pick (classes/services/subjects.ts), so reusing it would merge
// genuinely unknown questions into a real subject and hand them its topics.
// The bucket is keyed separately and named for what it actually is.
export const UNKNOWN_SUBJECT_LABEL = "Ders bilgisi olmayan sorular";
const UNKNOWN_SUBJECT_KEY = "__netflowedu_unknown_subject__";

// The only question formats the product persists. `choices` is the single
// field that distinguishes them (see Question.choices / hasMultipleChoice);
// there is no true/false, fill-in or matching type to report on, and inventing
// one would be a row describing questions that do not exist.
export type QuestionKind = "multiple_choice" | "open";

export interface AnalyticsItem extends LearningInsightItem {
  attemptCount: number;
  // Resolved ONCE at the read boundary (Phase 41). null means "this item's
  // counters do not cover its whole history" — never zero.
  outcomeHistory: OutcomeHistory | null;
  // Phase 42's per-question verdict, computed by the locked classifier.
  learningState: LearningState;
  // Projection of the question document. `isQuestionAvailable` is false when
  // it could not be read (deleted, or access revoked): the evidence is still
  // the student's, the content is simply no longer theirs to see.
  isQuestionAvailable: boolean;
  questionKind: QuestionKind | null;
  imageUrl: string | null;
  description: string | null;
  hints: readonly string[];
}

export function toQuestionKind(question: Pick<Question, "choices"> | null): QuestionKind | null {
  if (!question) return null;
  return hasMultipleChoice(question.choices) ? "multiple_choice" : "open";
}

/** Joins one study item with its (possibly unreadable) question. */
export function toAnalyticsItem(item: StudyItem, question: Question | null): AnalyticsItem {
  const outcomeHistory = resolveOutcomeHistory({
    attemptCount: item.attemptCount,
    solvedCount: item.solvedCount ?? null,
    struggledCount: item.struggledCount ?? null,
    againCount: item.againCount ?? null,
  });
  return {
    questionId: item.questionId,
    status: item.status,
    lastOutcome: item.lastOutcome,
    nextReviewAt: item.nextReviewAt,
    successfulReviews: item.successfulReviews,
    lastReviewedAt: item.lastReviewedAt,
    attemptCount: item.attemptCount,
    subject: question?.subject?.trim() ?? "",
    topic: question?.topic?.trim() ?? "",
    outcomeHistory,
    learningState: buildLearningState({
      history: outcomeHistory,
      lastOutcome: item.lastOutcome,
      status: item.status,
      successfulReviews: item.successfulReviews,
    }),
    isQuestionAvailable: question !== null,
    questionKind: toQuestionKind(question),
    imageUrl: question?.imageUrl ? question.imageUrl : null,
    description: question?.description?.trim() ? question.description.trim() : null,
    hints: question?.hints ?? [],
  };
}

// ─── Time range ────────────────────────────────────────────────────────────

export type AnalyticsRange = "7d" | "30d" | "all";

export const ANALYTICS_RANGES: readonly AnalyticsRange[] = ["7d", "30d", "all"] as const;

const RANGE_DAYS: Readonly<Record<Exclude<AnalyticsRange, "all">, number>> = {
  "7d": 7,
  "30d": 30,
};

/** Questions the student last worked on inside the range.
 *
 *  The window is keyed on `lastReviewedAt`, the server-written time of the
 *  most recent outcome — the one timestamp every item carries. It selects
 *  WHICH questions are in scope; it does not pretend to slice an item's
 *  cumulative counters by date, because nothing persisted can do that. An
 *  item without a usable timestamp belongs to "all" only, rather than being
 *  guessed into a recent window. */
export function filterItemsByRange(
  items: readonly AnalyticsItem[],
  range: AnalyticsRange,
  now: number,
): AnalyticsItem[] {
  if (range === "all") return [...items];
  const since = now - RANGE_DAYS[range] * DAY_MS;
  return items.filter(
    (item) => Number.isFinite(item.lastReviewedAt) && item.lastReviewedAt > 0 && item.lastReviewedAt >= since,
  );
}

// ─── Shared counting ───────────────────────────────────────────────────────

function knownOutcomes(items: readonly AnalyticsItem[]): number {
  let total = 0;
  for (const item of items) total += item.outcomeHistory?.knownOutcomeCount ?? 0;
  return total;
}

function topicKey(subject: string, topic: string): string {
  return `${subject}|${topic}`;
}

// ─── Overview ──────────────────────────────────────────────────────────────

export interface AnalyticsOverview {
  questionCount: number;
  /** Distinct subject+topic pairs whose metadata is known. */
  topicCount: number;
  /** Solved share of every trustworthy recorded outcome on these questions,
   *  0-100. null — never 0 — when none of them has trustworthy history. */
  successRatePercent: number | null;
  /** The denominator behind successRatePercent; 0 when it is null. */
  knownOutcomeCount: number;
  /** The subject the student clearly spent the most questions on, or null
   *  when no single subject leads — a tie is not a focus. */
  focusSubject: string | null;
}

// A "focus" needs at least this many questions. One question is not a
// pattern of study, and the narrative must not narrate one.
const MIN_QUESTIONS_FOR_FOCUS = 2;

export function buildAnalyticsOverview(items: readonly AnalyticsItem[]): AnalyticsOverview {
  const topics = new Set<string>();
  const bySubject = new Map<string, number>();
  for (const item of items) {
    if (item.subject && item.topic) topics.add(topicKey(item.subject, item.topic));
    if (item.subject) bySubject.set(item.subject, (bySubject.get(item.subject) ?? 0) + 1);
  }

  const ranked = [...bySubject.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"));
  const [first, second] = ranked;
  const focusSubject =
    first && first[1] >= MIN_QUESTIONS_FOR_FOCUS && (!second || first[1] > second[1]) ? first[0] : null;

  const successRatePercent = buildSuccessRatePercent(items.map((item) => item.outcomeHistory));
  return {
    questionCount: items.length,
    topicCount: topics.size,
    successRatePercent,
    knownOutcomeCount: successRatePercent === null ? 0 : knownOutcomes(items),
    focusSubject,
  };
}

// ─── "Çözemediğim Sorular" archive ─────────────────────────────────────────

export type ArchiveState = "pending" | "solved_later";

/** Whether persisted evidence shows the student could not solve this question.
 *
 *  QUESTION-evidence only. A question is never archived because its topic is
 *  struggling, its subject is weak, or a teacher assigned it.
 *
 *  The evidence is a "Zorlandım" outcome — `struggled`, the one meaning of
 *  "zorlanma" the product already uses (Phase 42's classifier, Phase 41's
 *  "N kez zorlandın" copy), and exactly what a wrong multiple-choice answer
 *  records (multipleChoiceStudyBridge). "Tekrar Et" (`again`) is deliberately
 *  NOT evidence: it is a request to see the card again soon, pressed on
 *  solved questions too, and studyService even DEFAULTS a missing
 *  lastOutcome to "again" — so counting it would archive questions with no
 *  proof of any difficulty at all.
 *
 *  Legacy items (no trustworthy counters) can only be judged by the one
 *  outcome they still carry. If that is a solve, earlier difficulty may or
 *  may not have happened, so the item stays out: an archive entry must be
 *  provable, never assumed. */
export function hasStruggleEvidence(item: AnalyticsItem): boolean {
  if (item.outcomeHistory) return item.outcomeHistory.struggledCount > 0;
  return item.lastOutcome === "struggled";
}

/** The archive state, or null when the question does not belong in it.
 *
 *  "solved_later" is a strict, provable claim: trustworthy counters record at
 *  least one struggle AND the most recent outcome is a solve. Because the
 *  latest outcome is not that struggle, the struggle necessarily came first —
 *  no ordering is inferred. A legacy item can never reach it: its counters
 *  cannot show that a struggle ever preceded the solve.
 *
 *  Solving later does NOT remove the question. Its history stays in the
 *  archive; only its state changes. */
export function resolveArchiveState(item: AnalyticsItem): ArchiveState | null {
  if (!hasStruggleEvidence(item)) return null;
  if (item.outcomeHistory && item.lastOutcome === "solved") return "solved_later";
  return "pending";
}

export interface ArchiveEntry {
  questionId: string;
  subject: string;
  topic: string;
  state: ArchiveState;
  /** Real number of "Zorlandım" outcomes, or null for a legacy item whose
   *  counters do not cover its history. */
  struggledCount: number | null;
  lastReviewedAt: number;
  learningState: LearningState;
  questionKind: QuestionKind | null;
  isQuestionAvailable: boolean;
  imageUrl: string | null;
  description: string | null;
}

function toArchiveEntry(item: AnalyticsItem, state: ArchiveState): ArchiveEntry {
  return {
    questionId: item.questionId,
    subject: item.subject,
    topic: item.topic,
    state,
    struggledCount: item.outcomeHistory ? item.outcomeHistory.struggledCount : null,
    lastReviewedAt: item.lastReviewedAt,
    learningState: item.learningState,
    questionKind: item.questionKind,
    isQuestionAvailable: item.isQuestionAvailable,
    imageUrl: item.imageUrl,
    description: item.description,
  };
}

/** Every archived question: waiting ones first (they are what the student can
 *  act on), then solved-later ones; newest first within each; question id as
 *  the final tie-break so the order never depends on Firestore's. */
export function buildQuestionArchive(items: readonly AnalyticsItem[]): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  for (const item of items) {
    const state = resolveArchiveState(item);
    if (state) entries.push(toArchiveEntry(item, state));
  }
  return entries.sort((a, b) => {
    if (a.state !== b.state) return a.state === "pending" ? -1 : 1;
    if (a.lastReviewedAt !== b.lastReviewedAt) return b.lastReviewedAt - a.lastReviewedAt;
    return a.questionId.localeCompare(b.questionId);
  });
}

export type ArchiveFilter = "all" | ArchiveState;

export const ARCHIVE_FILTERS: readonly ArchiveFilter[] = ["all", "pending", "solved_later"] as const;

export interface ArchiveScope {
  subject?: string | null;
  topic?: string | null;
}

export function filterArchive(
  entries: readonly ArchiveEntry[],
  filter: ArchiveFilter,
  scope: ArchiveScope = {},
): ArchiveEntry[] {
  const subject = scope.subject?.trim() || null;
  const topic = scope.topic?.trim() || null;
  return entries.filter(
    (entry) =>
      (filter === "all" || entry.state === filter) &&
      (subject === null || entry.subject === subject) &&
      (topic === null || entry.topic === topic),
  );
}

export interface ArchiveSummary {
  total: number;
  pending: number;
  solvedLater: number;
}

export function summarizeArchive(entries: readonly ArchiveEntry[]): ArchiveSummary {
  let pending = 0;
  for (const entry of entries) if (entry.state === "pending") pending += 1;
  return { total: entries.length, pending, solvedLater: entries.length - pending };
}

function pendingArchiveCount(items: readonly AnalyticsItem[]): number {
  let count = 0;
  for (const item of items) if (resolveArchiveState(item) === "pending") count += 1;
  return count;
}

// ─── Subjects ──────────────────────────────────────────────────────────────

export interface SubjectAnalysis {
  subject: string;
  /** True for the grouped bucket of questions whose subject is unknown. */
  isUnknownSubject: boolean;
  questionCount: number;
  knownOutcomeCount: number;
  successRatePercent: number | null;
  pendingArchiveCount: number;
  /** Phase 70 concept nodes for this subject, in the map's own reading order
   *  (attention first). Empty for the unknown bucket: a question with no
   *  subject has no topic to belong to either. */
  topics: ConceptNode[];
}

export function buildSubjectAnalysis(items: readonly AnalyticsItem[], now: number): SubjectAnalysis[] {
  const map = buildConceptMasteryMap({ items, now });
  const topicsBySubject = new Map(map.subjects.map((region) => [region.subject, region.concepts]));

  const groups = new Map<string, AnalyticsItem[]>();
  for (const item of items) {
    const key = item.subject || UNKNOWN_SUBJECT_KEY;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  const rows: SubjectAnalysis[] = [];
  for (const [key, group] of groups) {
    const isUnknownSubject = key === UNKNOWN_SUBJECT_KEY;
    const successRatePercent = buildSuccessRatePercent(group.map((item) => item.outcomeHistory));
    rows.push({
      subject: isUnknownSubject ? UNKNOWN_SUBJECT_LABEL : key,
      isUnknownSubject,
      questionCount: group.length,
      knownOutcomeCount: successRatePercent === null ? 0 : knownOutcomes(group),
      successRatePercent,
      pendingArchiveCount: pendingArchiveCount(group),
      topics: isUnknownSubject ? [] : topicsBySubject.get(key) ?? [],
    });
  }

  // Most-studied first; the unknown bucket always last, since it is the
  // least informative row rather than a real subject competing for rank.
  return rows.sort((a, b) => {
    if (a.isUnknownSubject !== b.isUnknownSubject) return a.isUnknownSubject ? 1 : -1;
    if (a.questionCount !== b.questionCount) return b.questionCount - a.questionCount;
    return a.subject.localeCompare(b.subject, "tr");
  });
}

// ─── Topic detail ──────────────────────────────────────────────────────────

export interface TopicDetail {
  subject: string;
  topic: string;
  /** The Phase 70 reading of this topic — its verdict and wording come from
   *  conceptMasteryMap, never from here. */
  node: ConceptNode | null;
  questionCount: number;
  knownOutcomeCount: number;
  successRatePercent: number | null;
  archivePendingCount: number;
  archiveSolvedLaterCount: number;
  /** Most recent real engagement across the topic's questions. */
  lastReviewedAt: number | null;
}

export function buildTopicDetail(
  items: readonly AnalyticsItem[],
  subject: string,
  topic: string,
  now: number,
): TopicDetail | null {
  const wantedSubject = subject.trim();
  const wantedTopic = topic.trim();
  if (!wantedSubject || !wantedTopic) return null;

  const scoped = items.filter((item) => item.subject === wantedSubject && item.topic === wantedTopic);
  if (scoped.length === 0) return null;

  const node =
    buildConceptMasteryMap({ items: scoped, now })
      .subjects.flatMap((region) => region.concepts)
      .find((concept) => concept.subject === wantedSubject && concept.topic === wantedTopic) ?? null;

  const archive = summarizeArchive(buildQuestionArchive(scoped));
  const successRatePercent = buildSuccessRatePercent(scoped.map((item) => item.outcomeHistory));
  const timestamps = scoped.map((item) => item.lastReviewedAt).filter((value) => Number.isFinite(value) && value > 0);

  return {
    subject: wantedSubject,
    topic: wantedTopic,
    node,
    questionCount: scoped.length,
    knownOutcomeCount: successRatePercent === null ? 0 : knownOutcomes(scoped),
    successRatePercent,
    archivePendingCount: archive.pending,
    archiveSolvedLaterCount: archive.solvedLater,
    lastReviewedAt: timestamps.length > 0 ? Math.max(...timestamps) : null,
  };
}

export interface TopicTimeline {
  /** Real outcomes on this topic, OLDEST → NEWEST, at most MAX_TRAIL_EVENTS. */
  steps: StudyOutcome[];
  /** False when there are too few real events to draw anything honest. */
  isSufficient: boolean;
}

/** The order of the student's most recent outcomes on one topic.
 *
 *  Drawn from the bounded Phase 59 learning events — the product's only
 *  chronological record — and shaped by the Learning Trail's own limits
 *  (MIN/MAX_TRAIL_EVENTS) so this reads exactly like the trail the student
 *  already knows. Real events only: nothing is interpolated, averaged or
 *  extended to fill a chart. Below the minimum, it says so instead. */
export function buildTopicTimeline(
  events: readonly LearningEvent[],
  subject: string,
  topic: string,
): TopicTimeline {
  const scoped = sortEventsChronologically(
    events.filter((event) => event.subject === subject && event.topic === topic),
  );
  const steps = scoped.slice(-MAX_TRAIL_EVENTS).map((event) => event.outcome);
  return { steps, isSufficient: steps.length >= MIN_TRAIL_EVENTS };
}

// ─── Question types ────────────────────────────────────────────────────────

export interface QuestionKindAnalysis {
  kind: QuestionKind;
  questionCount: number;
  knownOutcomeCount: number;
  solvedCount: number | null;
  successRatePercent: number | null;
  pendingArchiveCount: number;
}

export interface QuestionTypeAnalysis {
  /** Only formats the student has actually met, in a fixed order. */
  rows: QuestionKindAnalysis[];
  /** Questions whose format cannot be known because the question is gone. */
  unresolvedCount: number;
  totalCount: number;
}

const KIND_ORDER: readonly QuestionKind[] = ["multiple_choice", "open"];

export function buildQuestionTypeAnalysis(items: readonly AnalyticsItem[]): QuestionTypeAnalysis {
  const rows: QuestionKindAnalysis[] = [];
  for (const kind of KIND_ORDER) {
    const group = items.filter((item) => item.questionKind === kind);
    if (group.length === 0) continue;
    const successRatePercent = buildSuccessRatePercent(group.map((item) => item.outcomeHistory));
    let solved = 0;
    for (const item of group) solved += item.outcomeHistory?.solvedCount ?? 0;
    rows.push({
      kind,
      questionCount: group.length,
      knownOutcomeCount: successRatePercent === null ? 0 : knownOutcomes(group),
      solvedCount: successRatePercent === null ? null : solved,
      successRatePercent,
      pendingArchiveCount: pendingArchiveCount(group),
    });
  }
  return {
    rows,
    unresolvedCount: items.filter((item) => item.questionKind === null).length,
    totalCount: items.length,
  };
}
