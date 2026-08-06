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

export function outcomeCounterField(
  outcome: StudyOutcome,
): "solvedCount" | "struggledCount" | "againCount" {
  if (outcome === "solved") return "solvedCount";
  if (outcome === "struggled") return "struggledCount";
  return "againCount";
}
