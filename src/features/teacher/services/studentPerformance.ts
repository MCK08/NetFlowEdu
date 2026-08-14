import {
  buildLearningInsights,
  LearningInsightItem,
  TopicInsight,
} from "@features/study/services/learningInsights";
import { buildLearningTrend, LearningTrend } from "@features/study/services/learningTrend";
import { StudyDay, StudyItem } from "@features/study/services/studyService";
import {
  isInCurrentLocalWeek,
  isWithinRecentDays,
  RECENT_STUDY_DAYS_WINDOW,
} from "@features/study/services/studyWeek";
import { StudyOutcome } from "@features/study/domain/studyTypes";
import { Question } from "@/types/question";

// How many of a student's most-recently-reviewed items to carry through as
// `recentOutcomes` — enough for a "last N studies" attention reason (see
// studentAttention.ts) without turning the snapshot into a full history.
export const RECENT_OUTCOMES_LIMIT = 5;

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

// Phase 32 — the signal a teacher actually asks for ("bu hafta çalıştı
// mı?"), which no field on this snapshot could previously answer: `today`
// is too narrow (a student who studied hard Monday–Thursday reads as
// completely inactive on Friday), and `lastStudiedAt` is a raw timestamp
// the caller had to interpret itself. Week boundary is local-Monday — see
// studyWeek.ts.
export interface WeekActivity {
  // Distinct class-sourced questions whose LAST review falls in the current
  // local week. Same "one item contributes its last outcome only"
  // approximation `dayBuckets` documents below — never a claim about the
  // student's true total review count, which only studyDays holds.
  reviewedThisWeek: number;
  solvedThisWeek: number;
  struggledThisWeek: number;
  // Distinct local days within the current week carrying at least one such
  // review.
  activeDaysThisWeek: number;
  // The plain question a teacher opens this screen to answer.
  studiedThisWeek: boolean;
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
  thisWeek: WeekActivity;
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
  // Most-recently-reviewed outcomes first, capped at RECENT_OUTCOMES_LIMIT —
  // exactly what feeds studentAttention.ts's "son N çalışmada M zorlanma"
  // reason. Items never reviewed (lastReviewedAt <= 0) are excluded, same
  // rule bucketItemsByDay already uses.
  recentOutcomes: readonly StudyOutcome[];
  // The same per-day buckets used to derive `trend` below, exposed so a
  // CLASS-level trend (classTrend.ts) can merge multiple students' buckets
  // and run the identical, unmodified buildLearningTrend over the sum —
  // never a second trend engine. Already computed for `trend`; this is a
  // zero-cost exposure, not a new calculation.
  dayBuckets: readonly StudyDay[];
  // Phase 32 — WINDOWED to RECENT_STUDY_DAYS_WINDOW (see bucketItemsByDay).
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

// Exported so classTrend.ts can bucket several students' items and merge
// the results into one class-wide StudyDay[] — the exact same bucketing
// rule this file already uses for one student's own trend, never a second
// implementation of it.
//
// Phase 32 BUGFIX — `now` is now REQUIRED and the buckets are windowed to
// RECENT_STUDY_DAYS_WINDOW. Before this, the window was unbounded, which
// produced two real, teacher-visible defects:
//
//   1. `daysActiveRecently` (= buckets.length) counted EVERY distinct day
//      the student had ever studied in this class, while the UI rendered it
//      under the label "son 14 gün içinde". A student whose last activity
//      was six months ago displayed "3 aktif gün / son 14 gün içinde" —
//      the teacher was shown activity that did not happen in that window.
//   2. buildLearningTrend was handed an unbounded history, while the
//      student-facing Learning Hub hands it exactly 14 days
//      (getRecentStudyDays' own limit(RECENT_STUDY_DAYS_WINDOW)). The same
//      "recent half vs earlier half" comparison therefore meant something
//      different on the teacher's side than on the student's.
//
// This does NOT touch buildLearningTrend's own thresholds: a class-sourced
// item still contributes exactly one review to exactly one day (a genuine
// undercount versus real studyDays reviewCounts, documented on
// `dayBuckets`), so a small class legitimately still reports
// "insufficient_data" rather than a manufactured direction.
export function bucketItemsByDay(items: readonly StudyItem[], now: number): StudyDay[] {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const buckets = new Map<string, { reviewCount: number; solvedCount: number; struggledCount: number }>();
  for (const item of items) {
    if (!item.lastReviewedAt || item.lastReviewedAt <= 0) continue;
    if (!isWithinRecentDays(item.lastReviewedAt, safeNow, RECENT_STUDY_DAYS_WINDOW)) continue;
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

  // Phase 32 — the current local week (Monday-start, see studyWeek.ts).
  // Computed from the SAME lastReviewedAt/lastOutcome fields `today` above
  // already uses, so the two can never disagree about what counts as a
  // review; nothing here is estimated or back-filled.
  const weekItems = items.filter((item) => isInCurrentLocalWeek(item.lastReviewedAt, safeNow));
  const thisWeek: WeekActivity = {
    reviewedThisWeek: weekItems.length,
    solvedThisWeek: weekItems.filter((item) => item.lastOutcome === "solved").length,
    struggledThisWeek: weekItems.filter((item) => item.lastOutcome === "struggled").length,
    activeDaysThisWeek: new Set(weekItems.map((item) => localDayKey(item.lastReviewedAt))).size,
    studiedThisWeek: weekItems.length > 0,
  };

  const lastReviewedTimestamps = items.map((item) => item.lastReviewedAt).filter((ts) => ts > 0);
  const lastStudiedAt = lastReviewedTimestamps.length > 0 ? Math.max(...lastReviewedTimestamps) : null;

  const dayBuckets = bucketItemsByDay(items, safeNow);

  // Most-recently-reviewed first. A stable sort so two items reviewed at
  // the identical timestamp (e.g. backfilled/legacy data) always order the
  // same way call after call — questionId as the tiebreak, matching
  // dailyPracticePlan.ts's own deterministic-tiebreak convention.
  const recentOutcomes = items
    .filter((item) => item.lastReviewedAt > 0)
    .slice()
    .sort((a, b) => {
      if (a.lastReviewedAt !== b.lastReviewedAt) return b.lastReviewedAt - a.lastReviewedAt;
      return a.questionId.localeCompare(b.questionId);
    })
    .slice(0, RECENT_OUTCOMES_LIMIT)
    .map((item) => item.lastOutcome);

  return {
    totalCount,
    masteredCount,
    dueCount: insights.dueCount,
    successRatePercent,
    today,
    thisWeek,
    weakTopics: insights.weakTopics,
    strongTopics: insights.strongTopics,
    allTopics: insights.allTopics,
    trend: buildLearningTrend(dayBuckets),
    lastStudiedAt,
    recentOutcomes,
    dayBuckets,
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
