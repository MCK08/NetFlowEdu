import { ChronologyProfile, compareChronology } from "./chronologyTieBreak";
import { paceEquivalentExposure } from "./exposurePacing";
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

// Phase 65 — the concept identity exposure pacing spaces on.
//
// Deliberately TOPIC-level (subject+topic), not subject-level: a subject is
// not one concept, and treating it as one would push a genuinely different
// topic behind an unrelated one for the sake of variety. Mirrors
// reviewSessionComposition.ts's resolveTopicKey exactly — same fields, same
// trimming, same separator — so the review queue and the adaptive plan can
// never disagree about what "the same topic" means.
//
// null when either half is missing, which the pacer treats as its own unique
// concept rather than a shared unknown bucket. A legacy item with no
// resolvable metadata is therefore never grouped with another one.
function exposureKeyOf(item: LearningInsightItem): string | null {
  const subject = item.subject?.trim() ?? "";
  const topic = item.topic?.trim() ?? "";
  if (!subject || !topic) return null;
  return `${subject}|${topic}`;
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
//
// Phase 65 — `pace` is a second injection point with the same discipline as
// `comparator` above: absent (buildDailyPracticePlan) the output is
// byte-identical to before. When present it runs AFTER the canonical sort and
// may only reorder candidates that sort itself declared equivalent, so tier
// membership, the claim mechanism and every stronger key are untouched.
function takeTier(
  items: readonly LearningInsightItem[],
  claimed: Set<string>,
  predicate: (item: LearningInsightItem) => boolean,
  comparator: (a: LearningInsightItem, b: LearningInsightItem) => number = compareByReviewOrder,
  pace?: (sorted: LearningInsightItem[]) => LearningInsightItem[],
): LearningInsightItem[] {
  const matched = items.filter((item) => !claimed.has(item.questionId) && predicate(item));
  matched.sort(comparator);
  const ordered = pace ? pace(matched) : matched;
  for (const item of ordered) claimed.add(item.questionId);
  return ordered;
}

interface BuildTieredPlanOptions {
  items: readonly LearningInsightItem[];
  weakTopics: readonly TopicInsight[];
  now: number;
  reviewedToday: number;
  dailyGoal: number;
  comparator: (a: LearningInsightItem, b: LearningInsightItem) => number;
  // Phase 65 — opt-in, adaptive-only. See buildAdaptivePracticePlan.
  //
  // This is deliberately NOT `comparator(a, b) === 0`. The comparator is a
  // TOTAL order: it ends in an alphabetical questionId tie-break so the sort
  // is stable and reproducible, which means it never returns 0 for two
  // distinct questions. Using it as the oracle would make every equivalence
  // run a singleton and pacing a silent no-op. The caller therefore supplies
  // the comparator's REAL-PRIORITY half, so "equivalent" means "every
  // meaningful signal tied and only the alphabetical fallback separated
  // them" — which is exactly the band pacing is licensed to act in.
  isEquivalent?: (a: LearningInsightItem, b: LearningInsightItem) => boolean;
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

  // Phase 65 — exposure pacing, carried ACROSS tier boundaries.
  //
  // `carriedKey` is the concept last placed by the previous tier, so tier 3
  // does not open by repeating the topic tier 2 ended on — the same
  // page-boundary idea Phase 64 introduced for review pages. It lives here,
  // in one composition pass, rather than in module scope: nothing survives
  // between calls, so it cannot leak across students or sessions.
  //
  // Absent for buildDailyPracticePlan, whose output stays byte-identical.
  let carriedKey: string | null = null;
  const isEquivalent = options.isEquivalent;
  const pace = isEquivalent
    ? (sorted: LearningInsightItem[]): LearningInsightItem[] => {
        const paced = paceEquivalentExposure({
          items: sorted,
          keyOf: exposureKeyOf,
          // The canonical ranking's own verdict on interchangeability — see
          // exposurePacing.ts on why that makes the safety property
          // structural rather than a promise.
          isEquivalent,
          previousKey: carriedKey,
        });
        const last = paced[paced.length - 1];
        if (last) carriedKey = exposureKeyOf(last);
        return paced;
      }
    : undefined;

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
    pace,
  );

  // Tier 3 — the Hub's own top-ranked weak topic, not already claimed.
  const topFocus = options.weakTopics[0] ?? null;
  const weakTopicItems = topFocus
    ? takeTier(
        items,
        claimed,
        (item) => isActive(item) && item.subject === topFocus.subject && item.topic === topFocus.topic,
        options.comparator,
        pace,
      )
    : [];

  // Tier 4 — anything else still active, to round the plan out toward the
  // daily goal. Deliberately no subject/topic requirement — a legacy item
  // is exactly as eligible here as a fully-tagged one.
  const fillerItems = takeTier(items, claimed, isActive, options.comparator, pace);

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
  // Phase 61 — verified recent chronology per questionId, or omitted.
  //
  // OPTIONAL on purpose: every existing caller and test that does not pass it
  // gets byte-identical behaviour to before, because an absent map makes the
  // chronology comparison below return 0 for every pair.
  chronologyByQuestionId?: ReadonlyMap<string, ChronologyProfile>;
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

  // Phase 65 — the REAL priority half of the adaptive ordering. Returns 0
  // only when every meaningful signal ties; the arbitrary questionId
  // tie-break lives in adaptiveComparator below.
  function adaptivePriorityDelta(a: LearningInsightItem, b: LearningInsightItem): number {
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

    // Phase 61 — the LAST word before the stable fallback, and only ever
    // between candidates every rule above has already declared equivalent.
    //
    // Its position in this list IS the safety property: mastery, recency and
    // Phase 45's cumulative struggle evidence have all already had their say
    // and returned 0, so a recent sequence can only ever choose between
    // genuinely tied questions. It cannot cross a tier (buildTieredPlan
    // decided that long before this comparator ran), and it cannot outrank a
    // stronger cumulative history — a question struggled 8 times still sorts
    // ahead of one struggled 3 times regardless of how either sequence ends.
    //
    // compareChronology returns 0 unless BOTH sides have a readable sequence,
    // so a question is never promoted merely for having been studied since
    // the event log began. See its own note on rollout fairness.
    const chronologyDelta = compareChronology(
      params.chronologyByQuestionId?.get(a.questionId),
      params.chronologyByQuestionId?.get(b.questionId),
    );
    if (chronologyDelta !== 0) return chronologyDelta;

    // Phase 65 — everything above is REAL priority. `nextReviewAt` still is
    // too (an earlier due date genuinely comes first), so it belongs here
    // rather than in the arbitrary tail below.
    if (a.nextReviewAt !== b.nextReviewAt) return a.nextReviewAt - b.nextReviewAt;

    return 0;
  }

  // The canonical total order: real priority first, then the alphabetical
  // questionId tie-break that only exists to make the sort stable and
  // reproducible. Splitting the two is what lets exposure pacing act on the
  // arbitrary half WITHOUT ever touching the meaningful half — the tail is
  // the only thing it is allowed to override.
  function adaptiveComparator(a: LearningInsightItem, b: LearningInsightItem): number {
    const priorityDelta = adaptivePriorityDelta(a, b);
    if (priorityDelta !== 0) return priorityDelta;
    return a.questionId.localeCompare(b.questionId);
  }

  return buildTieredPlan({
    ...params,
    comparator: adaptiveComparator,
    // Two candidates are interchangeable exactly when every real signal ties
    // and only the alphabetical fallback separated them.
    isEquivalent: (a, b) => adaptivePriorityDelta(a, b) === 0,
  });
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
