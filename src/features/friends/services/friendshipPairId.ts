// Client-side mirror of functions/src/friends/pairId.ts's
// buildFriendshipPairId — same duplication convention as social/likeId.ts's
// buildLikeId (client and Functions are separate TS builds, so pure id
// logic is kept in sync by two small, independently tested copies rather
// than one shared module). Used only to compute the doc id to GET/listen —
// never trusted for a mutation, which always goes through a callable that
// recomputes it server-side.
export function buildFriendshipPairId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("_");
}
