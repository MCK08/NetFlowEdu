import { ResolvedQueueEntry, StudyItem } from "./studyService";

// Pure page-merge helpers for the cursor-paginated review queue — no React,
// no Firebase, directly unit-testable.
//
// Firestore cursor pages can overlap: `startAfter(lastDoc)` is exclusive,
// but if an item's nextReviewAt is rewritten between two page fetches (which
// is exactly what recording an outcome does), the same questionId can appear
// on two pages. Appending blindly would render duplicate React keys and let
// the student review the same question twice in one session.

// Appends `incoming`, dropping any questionId already present. Never
// re-sorts: the query already returns nextReviewAt ASC, and re-sorting
// client-side would reshuffle the session under the student's finger.
export function mergeStudyItemPages(existing: StudyItem[], incoming: StudyItem[]): StudyItem[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((i) => i.questionId));
  const merged = existing.slice();
  for (const item of incoming) {
    if (seen.has(item.questionId)) continue;
    seen.add(item.questionId);
    merged.push(item);
  }
  return merged;
}

// First-wins dedupe within a single page — guards duplicate React keys even
// if a server anomaly ever returned the same document twice.
export function dedupeStudyItems(items: StudyItem[]): StudyItem[] {
  const seen = new Set<string>();
  const out: StudyItem[] = [];
  for (const item of items) {
    if (seen.has(item.questionId)) continue;
    seen.add(item.questionId);
    out.push(item);
  }
  return out;
}

// Removes one item from the working set — used after it's been reviewed
// (the server has already rescheduled it) or removed from the plan.
export function removeStudyItemById(items: StudyItem[], questionId: string): StudyItem[] {
  const index = items.findIndex((i) => i.questionId === questionId);
  if (index === -1) return items;
  return items.filter((i) => i.questionId !== questionId);
}

// Whether a newly-arrived page means there is more to fetch. A short page
// (fewer than requested) is the terminal signal — an empty page also ends
// pagination, and must not leave `hasMore` true and spin forever.
export function hasMorePages(pageLength: number, pageSize: number): boolean {
  return pageLength >= pageSize && pageLength > 0;
}

// Same append-and-dedupe contract as mergeStudyItemPages, but over the
// resolved (item + question) entries the session actually renders — so the
// session never has to round-trip entries back through their items just to
// deduplicate them.
export function mergeResolvedPages(
  existing: ResolvedQueueEntry[],
  incoming: ResolvedQueueEntry[],
): ResolvedQueueEntry[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((e) => e.item.questionId));
  const merged = existing.slice();
  for (const entry of incoming) {
    if (seen.has(entry.item.questionId)) continue;
    seen.add(entry.item.questionId);
    merged.push(entry);
  }
  return merged;
}
