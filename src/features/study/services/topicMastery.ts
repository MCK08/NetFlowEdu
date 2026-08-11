// Phase 25 — topic-level mastery bands. Pure, React/Firebase-free, exactly
// like learningInsights.ts and dailyPracticePlan.ts before it.
//
// NOT a new mastery system: `status === "mastered"` is already the server's
// own authoritative verdict (functions/src/study/reviewScheduler.ts's
// MASTERY_MIN_SUCCESSFUL_REVIEWS/MASTERY_MIN_INTERVAL_DAYS thresholds,
// which this file never re-implements, imports, or second-guesses). The
// `mastered` band below is counted directly from that field. Every band
// BELOW mastered is a purely STRUCTURAL classification of counts the
// caller already has (how many attempts, how many struggled, whether
// anything has ever succeeded) — comparisons like "zero", "all", or
// "greater than zero" are not tunable percentages, so there is nothing
// here for a future magic-number drift to sneak into.

export type MasteryBand = "new" | "learning" | "shaky" | "developing" | "strong" | "mastered";

export interface TopicMasteryInput {
  totalCount: number;
  masteredCount: number;
  struggledCount: number;
  // How many of the topic's items have EVER had a successful review
  // (successfulReviews > 0) — distinct from masteredCount, which requires
  // the server's full mastery bar, not just "succeeded once".
  everSucceededCount: number;
}

// Decision order (first match wins), each branch a structural fact rather
// than a percentage:
//   totalCount === 0            -> "new" (nothing attempted at all)
//   masteredCount === totalCount -> "mastered" (server says every item is)
//   struggledCount > 0 && everSucceededCount === 0 -> "shaky" (attempted,
//     only ever struggled, never once succeeded)
//   everSucceededCount === 0    -> "learning" (attempted, no struggle
//     recorded yet either — too early to call it anything but starting out)
//   masteredCount > 0 || struggledCount === 0 -> "strong" (at least one
//     fully mastered item, or a track record with zero struggles)
//   otherwise                   -> "developing" (a real mix: some success,
//     some struggle, not yet mastered)
export function buildTopicMastery(input: TopicMasteryInput): MasteryBand {
  const totalCount = safeNonNegativeInt(input.totalCount);
  const masteredCount = safeNonNegativeInt(input.masteredCount);
  const struggledCount = safeNonNegativeInt(input.struggledCount);
  const everSucceededCount = safeNonNegativeInt(input.everSucceededCount);

  if (totalCount === 0) return "new";
  if (masteredCount >= totalCount) return "mastered";
  if (struggledCount > 0 && everSucceededCount === 0) return "shaky";
  if (everSucceededCount === 0) return "learning";
  if (masteredCount > 0 || struggledCount === 0) return "strong";
  return "developing";
}

// Defensive against NaN/Infinity/negative counts — same posture as
// learningInsights.ts's isFiniteNonNegative/safeCount, kept as a local copy
// since this file has no dependency on that one (each stays independently
// testable without importing the other's internals).
function safeNonNegativeInt(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

// Fixed, deterministic display order — worst-first, matching §8's explicit
// "weak, shaky, stale, strong, mastered" priority for the topic list.
export const MASTERY_BAND_PRIORITY: readonly MasteryBand[] = [
  "shaky",
  "learning",
  "new",
  "developing",
  "strong",
  "mastered",
];

export function masteryBandPriorityIndex(band: MasteryBand): number {
  const index = MASTERY_BAND_PRIORITY.indexOf(band);
  return index === -1 ? MASTERY_BAND_PRIORITY.length : index;
}
