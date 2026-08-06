// THE scheduling engine. Pure TypeScript: no Firebase, no React, no Date.now()
// of its own — the caller passes the reference time in, so the same input
// always produces the same output and every branch is directly unit-testable.
//
// Timezone-independent by construction: everything here is arithmetic on
// epoch milliseconds. Calendar-day concerns (streaks, daily stats) are a
// SEPARATE problem handled by dayKey.ts, deliberately not mixed in here.
//
// This file is duplicated verbatim on the client
// (src/features/study/domain/reviewScheduler.ts) — functions/ is a separate
// TypeScript project the Expo app cannot import across, the same constraint
// already documented for onboardingStatus.ts and friendshipPairId.ts. Both
// copies are exercised against the identical test vectors (see
// tests/unit/reviewScheduler.test.ts and reviewSchedulerParity.test.ts) so
// they cannot silently drift.

export type StudyStatus = "learning" | "review" | "mastered";
export type StudyOutcome = "again" | "struggled" | "solved";

export const STUDY_STATUSES: readonly StudyStatus[] = ["learning", "review", "mastered"] as const;
export const STUDY_OUTCOMES: readonly StudyOutcome[] = ["again", "struggled", "solved"] as const;

export function isStudyOutcome(value: unknown): value is StudyOutcome {
  return typeof value === "string" && (STUDY_OUTCOMES as readonly string[]).includes(value);
}

// ---- Named constants (no magic numbers below this line) -------------------

export const MINUTE_MS = 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** "again" puts the question back in front of the student the same session. */
export const AGAIN_DELAY_MINUTES = 10;
/** "struggled" always retries tomorrow, regardless of prior progress. */
export const STRUGGLED_INTERVAL_DAYS = 1;
/** A question solved for the first time is next seen in two days. */
export const FIRST_SOLVED_INTERVAL_DAYS = 2;
/** Each subsequent solve doubles the interval... */
export const SOLVED_INTERVAL_MULTIPLIER = 2;
/** ...but never below the first-solve interval... */
export const MIN_SOLVED_INTERVAL_DAYS = 2;
/** ...and never beyond this ceiling. */
export const MAX_INTERVAL_DAYS = 60;
/** Both mastery conditions must hold together. */
export const MASTERY_MIN_SUCCESSFUL_REVIEWS = 3;
export const MASTERY_MIN_INTERVAL_DAYS = 14;

// ---- Types ---------------------------------------------------------------

// Only the scheduling-relevant slice of a study item. Deliberately NOT the
// whole Firestore document: this engine has no business knowing about
// questionOwnerId, source, schemaVersion, etc.
export interface SchedulerState {
  status: StudyStatus;
  intervalDays: number;
  successfulReviews: number;
}

export interface SchedulerResult {
  status: StudyStatus;
  intervalDays: number;
  successfulReviews: number;
  nextReviewAt: number;
  lastOutcome: StudyOutcome;
}

// A question the student has never studied before. Passing `null` as the
// previous state is the caller's way of saying "first ever attempt".
export const INITIAL_SCHEDULER_STATE: SchedulerState = {
  status: "learning",
  intervalDays: 0,
  successfulReviews: 0,
};

function sanitize(previous: SchedulerState | null): SchedulerState {
  if (!previous) return { ...INITIAL_SCHEDULER_STATE };
  // Defensive: a hand-edited or partially-migrated document must never make
  // the scheduler produce NaN/negative intervals.
  const intervalDays =
    Number.isFinite(previous.intervalDays) && previous.intervalDays > 0
      ? Math.floor(previous.intervalDays)
      : 0;
  const successfulReviews =
    Number.isFinite(previous.successfulReviews) && previous.successfulReviews > 0
      ? Math.floor(previous.successfulReviews)
      : 0;
  return { status: previous.status, intervalDays, successfulReviews };
}

// Mastery is a derived property of (successfulReviews, intervalDays), never
// a state the caller can set directly — so a question can also fall OUT of
// mastered the moment the student says "again"/"struggled", which is the
// whole point of the product thesis (resurface what you actually get wrong).
function resolveStatus(successfulReviews: number, intervalDays: number): StudyStatus {
  if (
    successfulReviews >= MASTERY_MIN_SUCCESSFUL_REVIEWS &&
    intervalDays >= MASTERY_MIN_INTERVAL_DAYS
  ) {
    return "mastered";
  }
  return "review";
}

/**
 * Computes the next scheduling state for one question.
 *
 * @param previous the item's current scheduling state, or null on first attempt
 * @param outcome  what the student reported
 * @param now      reference time in epoch ms (server time at the call site)
 */
export function scheduleNextReview(
  previous: SchedulerState | null,
  outcome: StudyOutcome,
  now: number,
): SchedulerResult {
  const prev = sanitize(previous);

  if (outcome === "again") {
    return {
      status: "learning",
      intervalDays: 0,
      successfulReviews: 0,
      nextReviewAt: now + AGAIN_DELAY_MINUTES * MINUTE_MS,
      lastOutcome: "again",
    };
  }

  if (outcome === "struggled") {
    return {
      status: "learning",
      intervalDays: STRUGGLED_INTERVAL_DAYS,
      // Loses one step of progress but never goes below zero — a bad day
      // shouldn't erase weeks of work.
      successfulReviews: Math.max(0, prev.successfulReviews - 1),
      nextReviewAt: now + STRUGGLED_INTERVAL_DAYS * DAY_MS,
      lastOutcome: "struggled",
    };
  }

  // outcome === "solved"
  const successfulReviews = prev.successfulReviews + 1;
  const intervalDays =
    prev.intervalDays <= 0
      ? FIRST_SOLVED_INTERVAL_DAYS
      : Math.min(
          MAX_INTERVAL_DAYS,
          Math.max(MIN_SOLVED_INTERVAL_DAYS, Math.round(prev.intervalDays * SOLVED_INTERVAL_MULTIPLIER)),
        );

  return {
    status: resolveStatus(successfulReviews, intervalDays),
    intervalDays,
    successfulReviews,
    nextReviewAt: now + intervalDays * DAY_MS,
    lastOutcome: "solved",
  };
}

// Whether an item is due for review at `now`. Kept beside the scheduler so
// "due" can never drift from how nextReviewAt is produced.
export function isDueForReview(nextReviewAt: number, now: number): boolean {
  return nextReviewAt <= now;
}
