import { StudyDay } from "./studyService";

// Phase 25 — a real, explainable trend computed from
// users/{uid}/studyDays/{dayKey}: genuine server-written per-calendar-day
// counters (reviewCount/solvedCount/struggledCount — see
// functions/src/study/recordStudyOutcome.ts's transaction), never
// estimated, projected, or invented. No percentage is fabricated: the
// comparison below is a real struggle-rate computed from real counts.
//
// Pure and Firebase/React-free — `getRecentStudyDays` (studyService.ts) is
// the only place that talks to Firestore; this file only ever sees the
// StudyDay[] it already fetched.

export type LearningTrend = "improving" | "stable" | "declining" | "insufficient_data";

// Below this many total reviews across the whole window, any split into
// "recent half vs earlier half" would be comparing noise, not signal (e.g.
// 1 struggled review out of 2 total looks identical to a genuine 50%
// struggle rate). Matches DEFAULT_QUEUE_PAGE_SIZE's own order of magnitude
// (10) as "a session's worth of real data", not an arbitrary percentage.
const MIN_TOTAL_REVIEWS_FOR_TREND = 10;
// Also require the window to span at least two distinct days WITH
// activity — a single very active day split down the middle is not "two
// periods to compare", it's one session sliced in half.
const MIN_ACTIVE_DAYS_FOR_TREND = 2;
// How much the struggle rate has to move before it counts as a real
// direction rather than day-to-day noise. Symmetric around 0, so
// "improving" and "declining" require the exact same size of real change.
const STRUGGLE_RATE_STABLE_BAND = 0.1;

interface WindowStats {
  totalReviews: number;
  totalStruggled: number;
  activeDays: number;
}

function summarize(days: readonly StudyDay[]): WindowStats {
  let totalReviews = 0;
  let totalStruggled = 0;
  let activeDays = 0;
  for (const day of days) {
    const reviewCount = safeCount(day.reviewCount);
    if (reviewCount <= 0) continue;
    totalReviews += reviewCount;
    totalStruggled += safeCount(day.struggledCount);
    activeDays += 1;
  }
  return { totalReviews, totalStruggled, activeDays };
}

function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function struggleRate(stats: WindowStats): number {
  return stats.totalReviews > 0 ? stats.totalStruggled / stats.totalReviews : 0;
}

// `recentDays` is expected in the SAME order getRecentStudyDays returns —
// most recent dayKey first (orderBy(documentId(), "desc")) — so this never
// re-sorts or re-derives "which half is more recent" from anything but
// array position, keeping this function trivially testable with plain
// fixture arrays.
export function buildLearningTrend(recentDays: readonly StudyDay[]): LearningTrend {
  // Only days with real activity count toward the sample — a long run of
  // untouched days shouldn't dilute the comparison into "insufficient" when
  // the actual STUDY sessions present are perfectly comparable.
  const activeOnly = recentDays.filter((day) => safeCount(day.reviewCount) > 0);
  const overall = summarize(activeOnly);

  if (overall.totalReviews < MIN_TOTAL_REVIEWS_FOR_TREND) return "insufficient_data";
  if (overall.activeDays < MIN_ACTIVE_DAYS_FOR_TREND) return "insufficient_data";

  // Split the ACTIVE days in half by position: index 0..mid-1 is "recent"
  // (array is newest-first), mid..end is "earlier". An odd count leaves the
  // extra day in the earlier half, matching Array.prototype.slice's own
  // floor-rounding rather than a hand-picked rule.
  const mid = Math.floor(activeOnly.length / 2);
  const recentHalf = activeOnly.slice(0, mid);
  const earlierHalf = activeOnly.slice(mid);

  const recentStats = summarize(recentHalf);
  const earlierStats = summarize(earlierHalf);

  // Both halves need their own minimum sample too — otherwise a window
  // that passes the OVERALL minimum could still compare, say, 9 earlier
  // reviews against 1 recent review, which is not a comparison.
  if (recentStats.totalReviews === 0 || earlierStats.totalReviews === 0) return "insufficient_data";

  const recentRate = struggleRate(recentStats);
  const earlierRate = struggleRate(earlierStats);
  const delta = recentRate - earlierRate;

  // Struggling LESS recently than before = improving. Struggling MORE = declining.
  if (delta <= -STRUGGLE_RATE_STABLE_BAND) return "improving";
  if (delta >= STRUGGLE_RATE_STABLE_BAND) return "declining";
  return "stable";
}
