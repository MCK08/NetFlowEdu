import { LearningInsightItem } from "./learningInsights";
import { buildLearningState, LearningState } from "./learningState";
import { ChronologyProfile } from "./chronologyTieBreak";

// Phase 62 — naming WHICH topics are ready to revisit, and why now.
//
// WHAT THIS DELIBERATELY DOES NOT DO
//
// It does not decide review timing. NetFlowEdu already has a real spaced-
// repetition engine — functions/src/study/reviewScheduler.ts — which turns
// each outcome into an interval (again → 10 minutes, struggled → 1 day, first
// solve → 2 days, then doubling to a 60-day ceiling with a mastery gate) and
// writes `nextReviewAt`. That value is the authority here and is never
// recomputed, re-derived or second-guessed.
//
// That restraint is a documented repo rule, not a preference. studyTypes.ts
// records that a second copy of the scheduling algorithm once lived on the
// client and was REMOVED for being "a second production implementation
// waiting to drift". A client-side readiness policy with its own day
// thresholds would be exactly that, and it would contradict the scheduler in
// ordinary use: a stable question with a 32-day interval is genuinely not due,
// no matter how many days have passed since it was last seen.
//
// THE ACTUAL GAP THIS FILLS
//
// The scheduler decides what is due; the Hub only ever showed a COUNT
// ("2 tekrar bekliyor"). The student never learned which topics were waiting
// or why. This names them, using the scheduler's own verdict, ordered by the
// learning evidence the product already trusts.

// A story, not a worklist. The review SESSION already exists for working
// through everything due; this section only points at what is worth knowing.
export const MAX_REVIEW_TOPICS = 3;

// Which Phase 42 states may be described as "ready to revisit".
//
// persistent_struggle is deliberately absent. A student failing the same
// question repeatedly needs active reinforcement, not a gentle nudge that it
// has been a while — Phase 46 owns that case, and calling it spaced review
// would both mislabel it and soften a signal that should stay urgent.
//
// insufficient_data is absent for the opposite reason: with too little
// evidence there is nothing to revisit yet, and saying otherwise would invent
// a history the counters cannot support.
const REVIEWABLE_STATES: readonly LearningState[] = ["recovering", "one_off_struggle", "stable"];

// Order among reviewable states. Recovering first: a topic whose struggle was
// only just resolved has the most fragile grip, so of two equally-due topics
// it is the one worth revisiting first.
const STATE_URGENCY: Readonly<Record<string, number>> = {
  recovering: 0,
  one_off_struggle: 1,
  stable: 2,
};

export type ReviewEvidenceBasis = "scheduler_due" | "scheduler_due_with_chronology";

export interface ReviewReadyTopic {
  // Stable across renders: subject+topic, never an index.
  id: string;
  subject: string;
  topic: string;
  // The representative question a caller routes to. Chosen by the existing
  // ordering rules below rather than a new selector.
  questionId: string;
  state: LearningState;
  evidenceBasis: ReviewEvidenceBasis;
}

interface Candidate {
  item: LearningInsightItem;
  state: LearningState;
  // How far past its scheduled review the item is. Used ONLY as a secondary
  // key: see the ordering note below.
  overdueBy: number;
  hasChronology: boolean;
}

/** Topics the SCHEDULER says are ready, ordered by learning evidence.
 *
 *  `now` is injected rather than read inside, so the same inputs always
 *  produce the same output and every branch is directly testable. */
export function buildReviewReadyTopics(params: {
  items: readonly LearningInsightItem[];
  chronologyByQuestionId?: ReadonlyMap<string, ChronologyProfile>;
  now: number;
}): ReviewReadyTopic[] {
  const candidates: Candidate[] = [];

  for (const item of params.items) {
    // Mastered items have left the review cycle; the scheduler's own mastery
    // gate decided that, and re-surfacing them here would undo it.
    if (item.status === "mastered") continue;
    // A legacy item with no resolvable topic has nothing to name and nowhere
    // to route — the same rule the practice plan applies.
    if (!item.subject.trim() || !item.topic.trim()) continue;

    // THE authority. Not a threshold of this module's invention: the
    // scheduler already encoded how long this particular item should wait,
    // based on how its own outcomes actually went.
    if (item.nextReviewAt > params.now) continue;

    const state = buildLearningState({
      history: item.outcomeHistory ?? null,
      lastOutcome: item.lastOutcome,
      status: item.status,
      successfulReviews: item.successfulReviews,
    });
    if (!REVIEWABLE_STATES.includes(state)) continue;

    candidates.push({
      item,
      state,
      overdueBy: params.now - item.nextReviewAt,
      hasChronology: Boolean(params.chronologyByQuestionId?.get(item.questionId)?.shape),
    });
  }

  // Ordering, strongest key first:
  //
  //   1. learning state — evidence about the student's grip
  //   2. how overdue    — only breaks ties WITHIN a state
  //   3. questionId     — stable, so nothing reshuffles between renders
  //
  // State outranks age deliberately. A stable topic left for a month must not
  // outrank a recovering one due yesterday: elapsed time is context, not
  // urgency, and letting it dominate would turn this into the timestamp sort
  // the feature exists to avoid. Using age only as a secondary key also caps
  // its effect naturally — nothing grows more urgent without bound.
  candidates.sort((a, b) => {
    const byState = (STATE_URGENCY[a.state] ?? 99) - (STATE_URGENCY[b.state] ?? 99);
    if (byState !== 0) return byState;
    if (a.overdueBy !== b.overdueBy) return b.overdueBy - a.overdueBy;
    return a.item.questionId.localeCompare(b.item.questionId);
  });

  // One row per topic (§32): three cards for three questions in Denklemler is
  // a worklist, not a story. The first candidate for a topic is already its
  // best by the ordering above, so it becomes the representative.
  const seenTopics = new Set<string>();
  const topics: ReviewReadyTopic[] = [];
  for (const candidate of candidates) {
    const id = `${candidate.item.subject}|${candidate.item.topic}`;
    if (seenTopics.has(id)) continue;
    seenTopics.add(id);
    topics.push({
      id,
      subject: candidate.item.subject,
      topic: candidate.item.topic,
      questionId: candidate.item.questionId,
      state: candidate.state,
      evidenceBasis: candidate.hasChronology ? "scheduler_due_with_chronology" : "scheduler_due",
    });
    if (topics.length >= MAX_REVIEW_TOPICS) break;
  }

  return topics;
}

// Fixed copy. Observational, never predictive: it says this is a reasonable
// moment to revisit, never that the student is about to forget, and never
// quotes a retention figure — the product has no model that could support one.
const STATE_COPY: Readonly<Record<string, string>> = {
  recovering: "Zorlandıktan sonra toparlanmıştın; pekiştirmek için uygun bir zaman.",
  one_off_struggle: "Bu konuyu yeniden pekiştirmek için uygun bir zaman.",
  stable: "Bu konuyu yeniden pekiştirmek için uygun bir zaman.",
};

export function reviewReadyReasonText(topic: ReviewReadyTopic): string {
  return STATE_COPY[topic.state] ?? STATE_COPY.stable!;
}
