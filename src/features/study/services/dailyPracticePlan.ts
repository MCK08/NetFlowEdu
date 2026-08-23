import { buildDailyProgress, LearningInsightItem, TopicInsight } from "./learningInsights";
import { masteryBandPriorityIndex } from "./topicMastery";
import { buildRecencySignal, recencyPriorityIndex } from "./recencySignal";

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
//
// FEED vs. DAILY PLAN — an intentional contract, not a bug: this module is
// REINFORCEMENT-oriented — every tier (due/struggled/weak_topic/goal_fill)
// requires an existing LearningInsightItem, i.e. the student has already
// studied the question at least once. A genuinely never-studied question
// therefore can NEVER appear here at all. Compare src/features/feed/
// services/feedRanking.ts, which is DISCOVERY-oriented and deliberately
// ranks never-studied questions ABOVE already-developed ones. Both read the
// same underlying mastery/recency signals; they are not required to, and by
// design do not, recommend the same thing in the same session. Do not
// "fix" this by merging the two orderings — see
// tests/unit/feedRanking.test.ts's cross-surface contract test.

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
//
// Phase 25 — `comparator` is an injection point (default: the original
// Phase 23 compareByReviewOrder), not a behavior change: buildDailyPracticePlan
// below still calls this with no third argument, so its output is
// byte-identical to before. buildAdaptivePracticePlan passes an
// mastery/recency-aware comparator instead — the tier MEMBERSHIP rules
// (the predicate) are completely untouched either way; only the ORDER
// within a tier can differ, which only matters for which items survive
// the MAX_PLAN_ITEMS cap.
function takeTier(
  items: readonly LearningInsightItem[],
  claimed: Set<string>,
  predicate: (item: LearningInsightItem) => boolean,
  comparator: (a: LearningInsightItem, b: LearningInsightItem) => number = compareByReviewOrder,
): LearningInsightItem[] {
  const matched = items.filter((item) => !claimed.has(item.questionId) && predicate(item));
  matched.sort(comparator);
  for (const item of matched) claimed.add(item.questionId);
  return matched;
}

interface BuildTieredPlanOptions {
  items: readonly LearningInsightItem[];
  weakTopics: readonly TopicInsight[];
  now: number;
  reviewedToday: number;
  dailyGoal: number;
  comparator: (a: LearningInsightItem, b: LearningInsightItem) => number;
}

// The shared core both buildDailyPracticePlan and buildAdaptivePracticePlan
// run — identical tier predicates and claim mechanism either way; only the
// within-tier `comparator` differs between the two public entry points.
function buildTieredPlan(options: BuildTieredPlanOptions): DailyPracticePlan {
  const items = dedupeByQuestionId(options.items);
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const progress = buildDailyProgress(options.reviewedToday, options.dailyGoal);
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
    options.comparator,
  );

  // Tier 3 — the Hub's own top-ranked weak topic, not already claimed.
  const topFocus = options.weakTopics[0] ?? null;
  const weakTopicItems = topFocus
    ? takeTier(
        items,
        claimed,
        (item) => isActive(item) && item.subject === topFocus.subject && item.topic === topFocus.topic,
        options.comparator,
      )
    : [];

  // Tier 4 — anything else still active, to round the plan out toward the
  // daily goal. Deliberately no subject/topic requirement — a legacy item
  // is exactly as eligible here as a fully-tagged one.
  const fillerItems = takeTier(items, claimed, isActive, options.comparator);

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

// The single entry point: raw study items + the Hub's own weak-topic
// ranking in, the day's practice plan out. Deterministic and side-effect
// free — the same input always produces byte-identical output.
export function buildDailyPracticePlan(params: BuildDailyPracticePlanParams): DailyPracticePlan {
  return buildTieredPlan({ ...params, comparator: compareByReviewOrder });
}

export interface BuildAdaptivePracticePlanParams extends BuildDailyPracticePlanParams {
  // The Hub's FULL topic breakdown (learningInsights.ts's `allTopics`), not
  // just the capped top-5 weakTopics — an item's own topic may not be one
  // of the top-5 weakest and still deserves mastery/recency-aware ordering
  // relative to its tier-mates. Already computed in-memory by the same
  // buildLearningInsights call; zero additional Firestore reads.
  topicInsights: readonly TopicInsight[];
}

// Phase 25 §5 — SAME four tiers, SAME predicates, SAME claim/dedupe
// mechanism as buildDailyPracticePlan (both run through buildTieredPlan) —
// this NEVER changes which tier a question lands in or reorders across
// tiers (due always beats struggled always beats weak_topic always beats
// goal_fill, exactly as §14 requires). The only difference is the order
// WITHIN a tier: mastery band (worse first) and recency (staler first)
// now break ties before falling back to the original nextReviewAt/id
// order — so when a tier has more matches than MAX_PLAN_ITEMS lets
// through, the ones that actually surface are the least-mastered and
// least-recently-practiced first, not an arbitrary due-time ordering.
export function buildAdaptivePracticePlan(params: BuildAdaptivePracticePlanParams): DailyPracticePlan {
  const topicByKey = new Map<string, TopicInsight>();
  for (const topic of params.topicInsights) {
    topicByKey.set(`${topic.subject} ${topic.topic}`, topic);
  }

  const now = Number.isFinite(params.now) ? params.now : Date.now();

  function adaptiveComparator(a: LearningInsightItem, b: LearningInsightItem): number {
    const topicA = topicByKey.get(`${a.subject} ${a.topic}`) ?? null;
    const topicB = topicByKey.get(`${b.subject} ${b.topic}`) ?? null;

    // A legacy item with no resolvable topic (subject/topic === "", or a
    // topic never bucketed — see learningInsights.ts's own bucketByTopic
    // doc comment) has no mastery/recency signal to rank by at all; it
    // falls back to the exact same ordering buildDailyPracticePlan already
    // used, so §21 backward-compatibility holds for legacy data too.
    const masteryDelta = masteryRankOf(topicA) - masteryRankOf(topicB);
    if (masteryDelta !== 0) return masteryDelta;

    const recencyDelta = recencyRankOf(a, topicA, now) - recencyRankOf(b, topicB, now);
    if (recencyDelta !== 0) return recencyDelta;

    // Phase 45 — two questions can share an identical mastery band and
    // recency bucket (both are TOPIC-level signals; two questions in the
    // same topic always share them) while having genuinely different
    // struggle histories: a question failed 8 times out of 10 attempts read
    // identically to one failed 2 times out of 10, because both layers
    // above only ever see the topic's aggregate state or each item's single
    // most recent outcome — never the per-question EVENT count Phase 41
    // already records. This is the one place that count is allowed to
    // matter: strictly as a tie-breaker, only once mastery and recency have
    // already failed to distinguish the pair, and only ever REORDERING
    // within whatever tier/eligibility the existing rules above already
    // placed both items into — it can never move a question into a
    // different tier or override a real mastery/recency difference.
    const struggleRankA = questionStruggleRankOf(a);
    const struggleRankB = questionStruggleRankOf(b);
    // Trustworthy on BOTH sides or not compared at all — a legacy item with
    // no complete counter history (Phase 41's own completeness rule) must
    // never be ranked as if it had zero struggles, so an incomparable pair
    // simply falls through to the existing tie-breaker below unchanged.
    if (struggleRankA !== null && struggleRankB !== null) {
      const struggleDelta = struggleRankA - struggleRankB;
      if (struggleDelta !== 0) return struggleDelta;
    }

    return compareByReviewOrder(a, b);
  }

  return buildTieredPlan({ ...params, comparator: adaptiveComparator });
}

// Lower = more struggle events = sorts first, the same "lower is more
// urgent" convention masteryRankOf/recencyRankOf already use. null — never
// 0 — when this item's counters are not trustworthy (Phase 41's
// completeness rule, resolved once upstream by resolveOutcomeHistory and
// carried here via LearningInsightItem.outcomeHistory): the tie-break above
// only ever compares two ranks that are both real.
//
// Deliberately `struggledCount` only, matching TopicInsight's own
// struggledAttemptCount (learningInsights.ts) and studentAttention.ts's
// Phase 42 copy — "again" is the student asking to see a card again in ten
// minutes, not a report of difficulty (reviewScheduler.ts treats it as a
// full reset, not a one-day setback like "struggled"), so it is not treated
// as equivalent evidence of struggle here either.
function questionStruggleRankOf(item: LearningInsightItem): number | null {
  const history = item.outcomeHistory;
  if (!history) return null;
  return -history.struggledCount;
}

// Lower index = worse (needs attention sooner) = sorts first. A topic with
// no bucket at all (legacy/unmatched) is treated as neutral — after every
// real mastery signal but before nothing, i.e. it never artificially wins
// or loses a tiebreak against a topic that actually has data.
function masteryRankOf(topic: TopicInsight | null): number {
  return topic ? masteryBandPriorityIndex(topic.masteryBand) : masteryBandPriorityIndex("developing");
}

function recencyRankOf(item: LearningInsightItem, topic: TopicInsight | null, now: number): number {
  if (topic) return recencyPriorityIndex(topic.recency);
  // No topic bucket for this item — fall back to the ITEM's own
  // lastReviewedAt (still real data, just not topic-aggregated).
  return recencyPriorityIndex(buildRecencySignal(item.lastReviewedAt, now));
}
