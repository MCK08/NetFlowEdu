import type { StudyOutcome, StudyStatus } from "./reviewScheduler";

// Where the student encountered the question. Mirrors Question.visibility
// exactly — stored so the review queue can show provenance and so a future
// "only my class questions" filter needs no migration.
export type StudySource = "public" | "class" | "private";

export const STUDY_SCHEMA_VERSION = 1;

// Daily goal bounds. A goal outside this range is rejected rather than
// clamped silently, so a client bug can't quietly set someone's goal to 0
// (which would make "goalCompleted" meaningless) or 10_000.
export const MIN_DAILY_GOAL = 1;
export const MAX_DAILY_GOAL = 100;
export const DEFAULT_DAILY_GOAL = 10;

export function isValidDailyGoal(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_DAILY_GOAL &&
    value <= MAX_DAILY_GOAL
  );
}

// users/{uid}/studyItems/{questionId}
//
// Deliberately carries NO question content — no imageUrl, no description,
// no subject. Question access is re-verified against the real
// questions/{questionId} document on every read (see the queue service), so
// a student who loses class membership immediately loses the content too.
// Snapshotting here would leak private/class material into a document the
// owner can read forever.
export interface StudyItemRecord {
  questionId: string;
  status: StudyStatus;
  lastOutcome: StudyOutcome;
  intervalDays: number;
  // SCHEDULER STATE, not a success tally. reviewScheduler.ts decrements it
  // on "struggled" and resets it to 0 on "again" — it answers "how long may
  // the next interval be", never "how often did this student succeed".
  // Anything that needs the second question must use the cumulative
  // counters below instead (see Phase 41).
  successfulReviews: number;
  attemptCount: number;
  firstAddedAt: number;
  lastReviewedAt: number;
  nextReviewAt: number;
  source: StudySource;
  sourceClassId: string | null;
  questionOwnerId: string;
  schemaVersion: number;
  updatedAt: number;
  // Phase 41 — cumulative, monotonic per-outcome tallies for THIS question.
  // Optional because every document written before Phase 41 lacks them: an
  // absent counter means "cumulative history unavailable for this item",
  // which is NOT the same claim as zero, and must never be read as one (see
  // src/features/study/services/outcomeCounters.ts for the completeness
  // rule every consumer shares).
  solvedCount?: number;
  struggledCount?: number;
  againCount?: number;
}

// users/{uid}/studyMeta/summary — same server-only-write, owner-only-read
// contract as users/{uid}/socialMeta/summary and notificationMeta/summary.
export interface StudySummaryRecord {
  totalReviewActions: number;
  totalUniqueQuestions: number;
  masteredCount: number;
  currentStreak: number;
  longestStreak: number;
  lastStudyDay: string | null;
  dailyGoal: number;
  reviewedToday: number;
  timeZone: string;
  schemaVersion: number;
  updatedAt: number;
}

// users/{uid}/studyDays/{YYYY-MM-DD}
export interface StudyDayRecord {
  dayKey: string;
  reviewCount: number;
  uniqueQuestionCount: number;
  solvedCount: number;
  struggledCount: number;
  againCount: number;
  goalCompleted: boolean;
  updatedAt: number;
}

export function outcomeCounterField(outcome: StudyOutcome): keyof OutcomeCounters {
  if (outcome === "solved") return "solvedCount";
  if (outcome === "struggled") return "struggledCount";
  return "againCount";
}

// The three counters, one per member of the CLOSED StudyOutcome union
// ("again" | "struggled" | "solved" — see reviewScheduler.ts, enforced at
// the callable's own boundary by isStudyOutcome). Because the union is
// closed, their sum is the complete count of outcomes recorded — there is
// no fourth bucket an outcome could fall into and go uncounted.
export interface OutcomeCounters {
  solvedCount: number;
  struggledCount: number;
  againCount: number;
}

function counterValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

// The ONE place a counter is incremented. Both the per-question study item
// and the per-calendar-day stats document go through it, so the two can
// never drift in what "one more struggled outcome" means.
//
// Monotonic by construction: exactly one field goes up by one, and no
// branch can ever decrease a counter or reset one to zero — that is the
// difference between these and successfulReviews, which is a scheduler
// streak and deliberately DOES go down.
export function incrementOutcomeCounters(
  previous: Partial<OutcomeCounters> | null | undefined,
  outcome: StudyOutcome,
): OutcomeCounters {
  const field = outcomeCounterField(outcome);
  return {
    solvedCount: counterValue(previous?.solvedCount) + (field === "solvedCount" ? 1 : 0),
    struggledCount: counterValue(previous?.struggledCount) + (field === "struggledCount" ? 1 : 0),
    againCount: counterValue(previous?.againCount) + (field === "againCount" ? 1 : 0),
  };
}
