// Spaced-repetition tuning. Kept out of business logic so the review
// algorithm (Phase 5) is configurable without code changes.
export const REVIEW_CONFIG = {
  minIntervalHours: 4,
  maxIntervalDays: 30,
  wrongAnswerMultiplier: 0.5,
  correctAnswerMultiplier: 2,
} as const;
