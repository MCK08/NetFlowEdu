import { Friendship } from "@/types/friendship";

// Same overlapping-cursor-page problem as classFeedPagination's
// mergeQuestionPages, applied to friendship lists (Arkadaşlar / Gelen /
// Gönderilen). Appends, drops ids already present, never re-sorts.
export function mergeFriendshipPages(
  existing: Friendship[],
  incoming: Friendship[],
): Friendship[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((f) => f.id));
  const merged = existing.slice();
  for (const friendship of incoming) {
    if (seen.has(friendship.id)) continue;
    seen.add(friendship.id);
    merged.push(friendship);
  }
  return merged;
}

// First-wins dedupe within a single list — guards against duplicate React
// keys even if a server-side anomaly ever returns the same doc twice.
export function dedupeFriendshipsById(friendships: Friendship[]): Friendship[] {
  const seen = new Set<string>();
  const out: Friendship[] = [];
  for (const friendship of friendships) {
    if (seen.has(friendship.id)) continue;
    seen.add(friendship.id);
    out.push(friendship);
  }
  return out;
}
