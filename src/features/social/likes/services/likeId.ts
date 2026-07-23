// Mirrors functions/src/social/likeId.ts exactly — deterministic doc id
// `${targetId}_${userId}` lets the client read its own like state with a
// single getDoc (no query) and matches the id the toggle callables use.
export function buildLikeId(targetId: string, userId: string): string {
  return `${targetId}_${userId}`;
}
