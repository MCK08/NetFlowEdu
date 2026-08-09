import { buildDailyProgress, LearningInsightItem, TopicInsight } from "./learningInsights";

// Phase 23 — "what should I study right now", answered deterministically
// from data the app already has. This is a SELECTION + ORDERING +
// PRESENTATION layer on top of the existing engines, not a second
// scheduler: it never computes intervalDays/successfulReviews/nextReviewAt
// (that stays exactly reviewScheduler.ts's job) and never decides what
// counts as "due" differently than learningInsights.ts already does.
//
// Reuses the SAME already-joined item list buildLearningInsights consumes
// (see useLearningInsights.ts) and that call's own weakTopics output — so
// building a plan costs zero additional Firestore reads over what the
// Learning Hub already fetches.

// How many non-due recommendation items the Hub renders at once. Not a
// query limit — remainingGoal can be far larger; only what's surfaced here
// is capped, matching MAX_RANKED_TOPICS's role in learningInsights.ts.
export const MAX_PLAN_ITEMS = 5;

export type PlanReason = "due" | "struggled" | "weak_topic" | "goal_fill";

export interface PracticePlanItem {
  questionId: string;
  reason: PlanReason;
  subject: string;
  topic: string;
}

export interface PlanTopicFocus {
  subject: string;
  topic: string;
}

export interface DailyPracticePlan {
  dailyGoal: number;
  reviewedToday: number;
  // max(0, dailyGoal - reviewedToday) — a SEPARATE number from dueCount by
  // design (§7): due obligations are never folded into, capped by, or
  // hidden behind the daily-goal count.
  remainingGoal: number;
  isGoalComplete: boolean;
  // The full due count — every item with nextReviewAt <= now, uncapped.
  dueCount: number;
  // The single weak topic represented in planItems, if any "weak_topic"
  // item survived the cap — null otherwise (never a fake/invented topic).
  topicFocus: PlanTopicFocus | null;
  // Deduped, priority-ordered, NON-due items only — due items are a count,
  // not an enumerated list, because the existing review session already
  // re-fetches its own due working set server-side (see ReviewSessionScreen).
  planItems: PracticePlanItem[];
  // Explains every item this plan surfaced: all due items (by id) plus every
  // item in planItems. Never contains a reason for an item that wasn't
  // actually selected.
  reasonByQuestionId: Record<string, PlanReason>;
}

export interface BuildDailyPracticePlanParams {
  items: readonly LearningInsightItem[];
  // The caller's already-ranked weak topics (buildLearningInsights's own
  // output) — recomputing topic-weakness ranking here would be a second,
  // divergence-prone implementation of logic that already exists.
  weakTopics: readonly TopicInsight[];
  now: number;
  reviewedToday: number;
  dailyGoal: number;
}

// Same first-occurrence-wins dedupe as learningInsights.ts's own
// dedupeByQuestionId — kept as a local copy (not imported) because that one
// is a private module detail there, not part of this feature's public API.
function dedupeByQuestionId(items: readonly LearningInsightItem[]): LearningInsightItem[] {
  const seen = new Set<string>();
  const result: LearningInsightItem[] = [];
  for (const item of items) {
    if (seen.has(item.questionId)) continue;
    seen.add(item.questionId);
    result.push(item);
  }
  return result;
}

// Soonest-relevant first, questionId as a deterministic tiebreaker — so two
// items with the identical nextReviewAt (e.g. both freshly created) always
// order the same way call after call.
function compareByReviewOrder(a: LearningInsightItem, b: LearningInsightItem): number {
  if (a.nextReviewAt !== b.nextReviewAt) return a.nextReviewAt - b.nextReviewAt;
  return a.questionId.localeCompare(b.questionId);
}

function isActive(item: LearningInsightItem): boolean {
  return item.status !== "mastered";
}

// Filters `items` down to the next tier's matches (excluding anything a
// higher-priority tier already claimed), sorts them, and marks them claimed
// — so a later tier can never re-select a question an earlier tier already
// placed. This IS the duplicate-protection mechanism (§8): priority order
// alone decides which single category a question lands in.
function takeTier(
  items: readonly LearningInsightItem[],
  claimed: Set<string>,
  predicate: (item: LearningInsightItem) => boolean,
): LearningInsightItem[] {
  const matched = items.filter((item) => !claimed.has(item.questionId) && predicate(item));
  matched.sort(compareByReviewOrder);
  for (const item of matched) claimed.add(item.questionId);
  return matched;
}

// The single entry point: raw study items + the Hub's own weak-topic
// ranking in, the day's practice plan out. Deterministic and side-effect
// free — the same input always produces byte-identical output.
export function buildDailyPracticePlan(params: BuildDailyPracticePlanParams): DailyPracticePlan {
  const items = dedupeByQuestionId(params.items);
  const now = Number.isFinite(params.now) ? params.now : Date.now();
  const progress = buildDailyProgress(params.reviewedToday, params.dailyGoal);
  const remainingGoal = Math.max(0, progress.dailyGoal - progress.reviewedToday);

  const claimed = new Set<string>();

  // Tier 1 — real due obligations. Never filtered by subject/topic (a
  // legacy question with no metadata is still due, §15), never capped by
  // remainingGoal (§7).
  const dueItems = items.filter((item) => item.nextReviewAt <= now);
  for (const item of dueItems) claimed.add(item.questionId);

  // Tier 2 — actively struggled with, not already due.
  const struggledItems = takeTier(
    items,
    claimed,
    (item) => isActive(item) && item.lastOutcome === "struggled",
  );

  // Tier 3 — the Hub's own top-ranked weak topic, not already claimed.
  const topFocus = params.weakTopics[0] ?? null;
  const weakTopicItems = topFocus
    ? takeTier(
        items,
        claimed,
        (item) => isActive(item) && item.subject === topFocus.subject && item.topic === topFocus.topic,
      )
    : [];

  // Tier 4 — anything else still active, to round the plan out toward the
  // daily goal. Deliberately no subject/topic requirement — a legacy item
  // is exactly as eligible here as a fully-tagged one.
  const fillerItems = takeTier(items, claimed, isActive);

  const reasonOf = new Map<string, PlanReason>();
  for (const item of struggledItems) reasonOf.set(item.questionId, "struggled");
  for (const item of weakTopicItems) reasonOf.set(item.questionId, "weak_topic");
  for (const item of fillerItems) reasonOf.set(item.questionId, "goal_fill");

  const nonDueOrdered = [...struggledItems, ...weakTopicItems, ...fillerItems];
  const visibleCount = Math.min(remainingGoal, MAX_PLAN_ITEMS);
  const planItems: PracticePlanItem[] = nonDueOrdered.slice(0, visibleCount).map((item) => ({
    questionId: item.questionId,
    // Safe non-null assertion: every item in nonDueOrdered was placed into
    // reasonOf in the loops immediately above.
    reason: reasonOf.get(item.questionId) as PlanReason,
    subject: item.subject,
    topic: item.topic,
  }));

  const topicFocus: PlanTopicFocus | null =
    topFocus && planItems.some((p) => p.reason === "weak_topic")
      ? { subject: topFocus.subject, topic: topFocus.topic }
      : null;

  const reasonByQuestionId: Record<string, PlanReason> = {};
  for (const item of dueItems) reasonByQuestionId[item.questionId] = "due";
  for (const item of planItems) reasonByQuestionId[item.questionId] = item.reason;

  return {
    dailyGoal: progress.dailyGoal,
    reviewedToday: progress.reviewedToday,
    remainingGoal,
    isGoalComplete: progress.isComplete,
    dueCount: dueItems.length,
    topicFocus,
    planItems,
    reasonByQuestionId,
  };
}
