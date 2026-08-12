import {
  buildLearningInsights,
  LearningInsightItem,
  TopicInsight,
} from "@features/study/services/learningInsights";
import { buildLearningTrend, LearningTrend } from "@features/study/services/learningTrend";
import { StudyDay, StudyItem } from "@features/study/services/studyService";
import { Question } from "@/types/question";

// Phase 27 — the Teacher Class Performance dashboard's pure computation
// layer. Deliberately NOT a new mastery/trend/priority system: every
// number here is either read straight off a StudyItem field the server
// already wrote (attemptCount, successfulReviews, status, nextReviewAt,
// lastReviewedAt, lastOutcome) or produced by Phase 22/25's EXISTING
// engines (buildLearningInsights for weak/strong/allTopics + mastery
// bands, buildLearningTrend for improving/stable/declining). This file
// only reshapes a class-scoped StudyItem[] into their expected input
// shapes — Firebase/React-free, so every branch is directly testable.

export interface TodayActivity {
  reviewedToday: number;
  solvedToday: number;
  struggledToday: number;
}

export interface StudentPerformanceSnapshot {
  totalCount: number;
  masteredCount: number;
  dueCount: number;
  // Real successfulReviews/attemptCount ratio across every class-sourced
  // item — null (never 0%) when the student has no attempts at all yet,
  // so the UI can render "henüz veri yok" instead of a misleading 0%.
  successRatePercent: number | null;
  today: TodayActivity;
  weakTopics: TopicInsight[];
  strongTopics: TopicInsight[];
  allTopics: TopicInsight[];
  // Derived from the SAME class-sourced items, bucketed into
  // StudyDay-shaped rows by each item's own lastReviewedAt/lastOutcome and
  // fed into the UNMODIFIED buildLearningTrend. This is an APPROXIMATION,
  // not the real studyDays history (which has no sourceClassId to scope
  // by teacher — see firestore.rules' own doc comment on why that
  // collection stays owner-only): a question reviewed twice in one day
  // only ever contributes its LAST outcome, since StudyItem carries no
  // per-attempt history. Documented, not hidden.
  trend: LearningTrend;
  // null when the student has never reviewed anything from this class yet.
  lastStudiedAt: number | null;
  // Deliberately NOT "streak" — the real currentStreak/longestStreak lives
  // only in users/{uid}/studyMeta/summary, which has no sourceClassId (or
  // any other field) a rule could use to prove a specific teacher may read
  // it without either granting every teacher in the org access to every
  // student's cross-class summary, or adding a new schema field/Cloud
  // Function this phase's own instructions say to avoid unless proven
  // necessary. This is the honest, class-scoped substitute: how many
  // distinct days, within the same recent window buildLearningTrend looks
  // at, the student reviewed at least one question FROM THIS CLASS. Real
  // data, clearly a different (narrower) claim than a true streak.
  daysActiveRecently: number;
}

function safeCount(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function isSameLocalDay(a: number, b: number): boolean {
  const dateA = new Date(a);
  const dateB = new Date(b);
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

// "YYYY-MM-DD" in the DEVICE's local time — good enough for a teacher-facing
// trend hint, unlike functions/src/study/dayKey.ts's server-validated day
// key, which exists specifically to gate a security-sensitive streak this
// screen never touches.
function localDayKey(epochMs: number): string {
  const date = new Date(epochMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function bucketItemsByDay(items: readonly StudyItem[]): StudyDay[] {
  const buckets = new Map<string, { reviewCount: number; solvedCount: number; struggledCount: number }>();
  for (const item of items) {
    if (!item.lastReviewedAt || item.lastReviewedAt <= 0) continue;
    const key = localDayKey(item.lastReviewedAt);
    const bucket = buckets.get(key) ?? { reviewCount: 0, solvedCount: 0, struggledCount: 0 };
    bucket.reviewCount += 1;
    if (item.lastOutcome === "solved") bucket.solvedCount += 1;
    if (item.lastOutcome === "struggled") bucket.struggledCount += 1;
    buckets.set(key, bucket);
  }
  // Newest dayKey first — matches getRecentStudyDays' own ordering
  // contract, which buildLearningTrend already assumes.
  return [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dayKey, counts]) => ({ dayKey, ...counts }));
}

// The join step: a class-sourced StudyItem carries no question content
// (firestore.rules' own doc comment on studyItems), so subject/topic come
// from the SAME shared question metadata cache the Learning Hub and Feed
// ranking already use — never a second fetch path.
export function toLearningInsightItems(
  items: readonly StudyItem[],
  questionsById: ReadonlyMap<string, Question | null>,
): LearningInsightItem[] {
  return items.map((item) => {
    const question = questionsById.get(item.questionId) ?? null;
    return {
      questionId: item.questionId,
      status: item.status,
      lastOutcome: item.lastOutcome,
      nextReviewAt: item.nextReviewAt,
      subject: question?.subject ?? "",
      topic: question?.topic ?? "",
      successfulReviews: item.successfulReviews,
      lastReviewedAt: item.lastReviewedAt,
    };
  });
}

// The single entry point: one student's class-sourced items (+ the shared
// question metadata needed to resolve their subject/topic) in, the
// dashboard's complete per-student view-model out. Deterministic —
// Firebase/React-free, directly unit-testable.
export function buildStudentPerformanceSnapshot(
  items: readonly StudyItem[],
  questionsById: ReadonlyMap<string, Question | null>,
  now: number,
): StudentPerformanceSnapshot {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const insightItems = toLearningInsightItems(items, questionsById);
  const insights = buildLearningInsights({ items: insightItems, now: safeNow, reviewedToday: 0, dailyGoal: 0 });

  const totalCount = items.length;
  const masteredCount = items.filter((item) => item.status === "mastered").length;

  const totalAttempts = items.reduce((sum, item) => sum + safeCount(item.attemptCount), 0);
  const totalSuccessful = items.reduce((sum, item) => sum + safeCount(item.successfulReviews), 0);
  const successRatePercent =
    totalAttempts > 0 ? Math.round(Math.min(1, totalSuccessful / totalAttempts) * 100) : null;

  const todayItems = items.filter(
    (item) => item.lastReviewedAt > 0 && isSameLocalDay(item.lastReviewedAt, safeNow),
  );
  const today: TodayActivity = {
    reviewedToday: todayItems.length,
    solvedToday: todayItems.filter((item) => item.lastOutcome === "solved").length,
    struggledToday: todayItems.filter((item) => item.lastOutcome === "struggled").length,
  };

  const lastReviewedTimestamps = items.map((item) => item.lastReviewedAt).filter((ts) => ts > 0);
  const lastStudiedAt = lastReviewedTimestamps.length > 0 ? Math.max(...lastReviewedTimestamps) : null;

  const dayBuckets = bucketItemsByDay(items);

  return {
    totalCount,
    masteredCount,
    dueCount: insights.dueCount,
    successRatePercent,
    today,
    weakTopics: insights.weakTopics,
    strongTopics: insights.strongTopics,
    allTopics: insights.allTopics,
    trend: buildLearningTrend(dayBuckets),
    lastStudiedAt,
    daysActiveRecently: dayBuckets.length,
  };
}

export type SupportTier = "needs_support" | "declining" | "normal" | "strong";

// §7 "Öğrencileri anlamlı şekilde sırala: 1. destek gerekenler, 2. gelişimi
// düşenler, 3. normal, 4. güçlü". A categorical bucket needs SOME cutoff —
// these are structural, not tuned percentages: <50% success or 3+ (of the
// max 5 ranked, see learningInsights.ts's MAX_RANKED_TOPICS) weak topics is
// "more weak topics than not" for a student with any real signal at all;
// >=80% with zero weak topics is "nothing currently needs attention".
// A student with no attempts yet (successRatePercent === null) is always
// "normal" — never flagged as struggling on the basis of having done
// nothing, and never called "strong" on the basis of no evidence either.
export function classifyStudentSupportTier(snapshot: StudentPerformanceSnapshot): SupportTier {
  const { successRatePercent, weakTopics, trend } = snapshot;

  if (successRatePercent !== null && successRatePercent < 50) return "needs_support";
  if (weakTopics.length >= 3) return "needs_support";
  if (trend === "declining") return "declining";
  if (successRatePercent !== null && successRatePercent >= 80 && weakTopics.length === 0) return "strong";
  return "normal";
}

const SUPPORT_TIER_PRIORITY: readonly SupportTier[] = ["needs_support", "declining", "normal", "strong"];

function supportTierPriorityIndex(tier: SupportTier): number {
  return SUPPORT_TIER_PRIORITY.indexOf(tier);
}

export interface StudentPerformanceCard {
  studentUid: string;
  displayName: string;
  photoURL: string | null;
  snapshot: StudentPerformanceSnapshot;
  tier: SupportTier;
}

export interface ClassPerformanceSummary {
  studentCount: number;
  // null when NO student in the class has any attempts yet — never a fake
  // 0% average.
  averageSuccessRatePercent: number | null;
  totalDueCount: number;
  needsSupportCount: number;
}

// §1 "Sınıf özeti" — averaged only over students who actually have a
// successRatePercent (i.e. have attempted something); a class where every
// student is brand new correctly reports "no data" rather than 0%.
export function buildClassPerformanceSummary(cards: readonly StudentPerformanceCard[]): ClassPerformanceSummary {
  const withRate = cards.filter((card) => card.snapshot.successRatePercent !== null);
  const averageSuccessRatePercent =
    withRate.length > 0
      ? Math.round(withRate.reduce((sum, card) => sum + (card.snapshot.successRatePercent ?? 0), 0) / withRate.length)
      : null;

  return {
    studentCount: cards.length,
    averageSuccessRatePercent,
    totalDueCount: cards.reduce((sum, card) => sum + card.snapshot.dueCount, 0),
    needsSupportCount: cards.filter((card) => card.tier === "needs_support").length,
  };
}

// Stable sort (§7): tier priority first, then LOWEST success rate first
// within a tier (the student who needs the most attention surfaces first
// even among several "needs_support" cards), then displayName as a final
// deterministic tiebreak so two students tied on everything else always
// render in the same order.
export function sortStudentPerformanceCards(cards: readonly StudentPerformanceCard[]): StudentPerformanceCard[] {
  return [...cards].sort((a, b) => {
    const tierDelta = supportTierPriorityIndex(a.tier) - supportTierPriorityIndex(b.tier);
    if (tierDelta !== 0) return tierDelta;

    const rateA = a.snapshot.successRatePercent ?? 0;
    const rateB = b.snapshot.successRatePercent ?? 0;
    if (rateA !== rateB) return rateA - rateB;

    return a.displayName.localeCompare(b.displayName, "tr");
  });
}
