// Phase 25 — "how long ago did the student last actually work on this" as
// its own deterministic signal, kept STRICTLY separate from scheduling:
// this file never computes nextReviewAt, never touches intervalDays, and
// its output is read only by the recommendation engine (learningInsights.ts
// / dailyPracticePlan.ts), never written back to Firestore. The review
// scheduler (functions/src/study/reviewScheduler.ts) remains the one and
// only authority on WHEN a question is actually due.
//
// Pure day-count arithmetic on epoch milliseconds — no Intl/timezone
// lookups (unlike functions/src/study/dayKey.ts's calendar-day keys, which
// exist specifically to gate a security-sensitive streak; a UI-only
// "recently practiced vs stale" label has no such requirement, so this
// stays simple, cross-project-import-free arithmetic, matching how
// classFeedStudyGating.ts already does its own plain ms math rather than
// importing functions/'s day-key logic across the client/functions
// boundary this repo does not allow).

export type RecencySignal = "never_practiced" | "recently_practiced" | "aging" | "stale";

const DAY_MS = 24 * 60 * 60 * 1000;

// "Recently practiced" if reviewed within the last 3 days — the same
// order of magnitude as the scheduler's own FIRST_SOLVED_INTERVAL_DAYS (2
// days), so a question sitting comfortably inside its own current review
// cadence reads as "recent", not "aging". "Stale" starts at 14 days — the
// same number the server's own MASTERY_MIN_INTERVAL_DAYS uses for "this
// interval is long enough to call mastered", reused here as "this is long
// enough without practice to actively flag" rather than inventing an
// unrelated cutoff. Everything between is "aging".
const RECENTLY_PRACTICED_MAX_DAYS = 3;
const STALE_MIN_DAYS = 14;

export function buildRecencySignal(lastReviewedAt: number, now: number): RecencySignal {
  if (!Number.isFinite(lastReviewedAt) || lastReviewedAt <= 0) return "never_practiced";
  const safeNow = Number.isFinite(now) ? now : Date.now();

  const elapsedMs = safeNow - lastReviewedAt;
  // A future timestamp (clock skew, bad data) is never treated as stale —
  // clamped to "just practiced" rather than producing a negative day count.
  if (elapsedMs <= 0) return "recently_practiced";

  const elapsedDays = elapsedMs / DAY_MS;
  if (elapsedDays <= RECENTLY_PRACTICED_MAX_DAYS) return "recently_practiced";
  if (elapsedDays >= STALE_MIN_DAYS) return "stale";
  return "aging";
}

// Worst-first (most in need of attention), mirroring
// topicMastery.ts's masteryBandPriorityIndex.
export const RECENCY_PRIORITY: readonly RecencySignal[] = [
  "stale",
  "aging",
  "never_practiced",
  "recently_practiced",
];

export function recencyPriorityIndex(signal: RecencySignal): number {
  const index = RECENCY_PRIORITY.indexOf(signal);
  return index === -1 ? RECENCY_PRIORITY.length : index;
}
