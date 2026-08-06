// Transient UI state that is only meaningful for the question it was created
// for.
//
// Question detail mounts its study hook with a FIXED questionId, so unscoped
// "pending outcome" / "error message" state was correct there. The class feed
// keeps ONE hook instance alive while the active question changes underneath
// it, and unscoped state then renders on the wrong card: a spinner for
// question A's in-flight write appearing on question B, or A's failure
// message shown under B's buttons.
//
// Pairing the value with its questionId and reading it back through
// `scopedValue` makes that mismatch unrepresentable rather than merely
// unlikely — and keeps the check pure, so it is testable without React.
export interface QuestionScoped<T> {
  questionId: string;
  value: T;
}

export function scopeToQuestion<T>(questionId: string, value: T): QuestionScoped<T> {
  return { questionId, value };
}

/**
 * The value if it belongs to `questionId`, otherwise null.
 *
 * A null `questionId` (no active question) yields null: there is no card for
 * the state to belong to.
 */
export function scopedValue<T>(
  entry: QuestionScoped<T> | null,
  questionId: string | null,
): T | null {
  if (!entry || !questionId) return null;
  return entry.questionId === questionId ? entry.value : null;
}
