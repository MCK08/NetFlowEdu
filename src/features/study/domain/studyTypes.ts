// CLIENT-SIDE STUDY TYPES.
//
// These are the shared vocabulary of the study feature on the client:
// outcomes, statuses, and the shape of a study item as the UI consumes it.
//
// Deliberately types + constants ONLY. The scheduling ALGORITHM lives in
// exactly one place — functions/src/study/reviewScheduler.ts — and the
// client never recomputes it. Phase 16 originally shipped a second copy of
// that algorithm here "for a parity test"; it was tree-shaken out of every
// bundle (proving nothing in the app called it) while still being a second
// production implementation waiting to drift. It has been removed: the
// server response is the single source of truth for status, intervalDays,
// successfulReviews and nextReviewAt.

export type StudyStatus = "learning" | "review" | "mastered";
export type StudyOutcome = "again" | "struggled" | "solved";

export const STUDY_STATUSES: readonly StudyStatus[] = ["learning", "review", "mastered"] as const;
export const STUDY_OUTCOMES: readonly StudyOutcome[] = ["again", "struggled", "solved"] as const;

export function isStudyStatus(value: unknown): value is StudyStatus {
  return typeof value === "string" && (STUDY_STATUSES as readonly string[]).includes(value);
}

export function isStudyOutcome(value: unknown): value is StudyOutcome {
  return typeof value === "string" && (STUDY_OUTCOMES as readonly string[]).includes(value);
}

// Where the student met the question — mirrors Question.visibility.
export type StudySource = "public" | "class" | "private";
