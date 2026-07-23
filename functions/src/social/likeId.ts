// Deterministic like-doc id: `${targetId}_${userId}`. This is what makes
// "does this user already like this" a single get() (no query) and toggle
// create/delete trivially idempotent — there can only ever be one document
// per (target, user) pair, by construction.
export function buildLikeId(targetId: string, userId: string): string {
  return `${targetId}_${userId}`;
}
