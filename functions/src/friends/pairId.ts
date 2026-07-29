// Deterministic friendship-doc id: the two UIDs sorted lexicographically and
// joined, so there can only ever be one relationship document between any
// two users regardless of who initiated it — the same "canonical id"
// pattern as social/likeId.ts's buildLikeId, just over two symmetric
// participants instead of (target, user). Never trust a client-submitted
// pairId — every callable recomputes it server-side from the two real UIDs.
export function buildFriendshipPairId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("_");
}
