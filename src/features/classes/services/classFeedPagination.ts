import { Question } from "@/types/question";

// Pure pagination/positioning helpers for the immersive class feed.
//
// Deliberately free of React and Firebase so every rule the feed depends on
// (no duplicates across page boundaries, deterministic active index, when to
// prefetch, where to land after a refresh) is directly unit-testable rather
// than only observable by scrolling a real device. The hook
// (useClassFeed) and the screen (ClassFeedScreen) are thin consumers.

// Appends `incoming` after `existing`, dropping any question id already
// present. Firestore cursor pages can legitimately overlap — a new question
// inserted at the head shifts everything down, so the same document can come
// back in the next page. Appending blindly would render the same question
// twice and make "3 / 18" lie. Order is otherwise preserved exactly as the
// server returned it (createdAt desc); this never re-sorts.
export function mergeQuestionPages(existing: Question[], incoming: Question[]): Question[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((q) => q.id));
  const merged = existing.slice();
  for (const question of incoming) {
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    merged.push(question);
  }
  return merged;
}

// First-wins dedupe within a single list. Used for the initial page too, so
// a server-side anomaly can never produce duplicate React keys.
export function dedupeQuestionsById(questions: Question[]): Question[] {
  const seen = new Set<string>();
  const out: Question[] = [];
  for (const question of questions) {
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    out.push(question);
  }
  return out;
}

// Which card a given scroll offset is showing, for a full-screen paginated
// list where every item is exactly `viewportHeight` tall.
//
// Rounds to the nearest page rather than flooring: mid-drag offsets and
// iOS's slight bounce overshoot would otherwise report the previous card
// until the very last pixel. Always clamped into range so a bounce past the
// end (or above the top) can never produce an out-of-bounds index.
export function calculateActiveIndex(
  offsetY: number,
  viewportHeight: number,
  itemCount: number,
): number {
  if (itemCount <= 0) return 0;
  if (viewportHeight <= 0) return 0;
  const raw = Math.round(offsetY / viewportHeight);
  // `<= 0` rather than `< 0`: a small negative offset (iOS rubber-band above
  // the first card) rounds to -0, which passes a `< 0` check and would leak
  // -0 out as an index.
  if (raw <= 0) return 0;
  if (raw > itemCount - 1) return itemCount - 1;
  return raw;
}

// Whether to start fetching the next page now. Fires while the user still
// has `threshold` cards ahead of them, so the request overlaps with reading
// time instead of stalling at the end of the list.
//
// Returns false when a request is already in flight — this is the
// request-deduplication rule that stops rapid swiping from firing several
// identical page fetches (each of which would advance the cursor and could
// skip questions entirely).
export function shouldPrefetchNextPage(params: {
  activeIndex: number;
  loadedCount: number;
  hasMore: boolean;
  isFetching: boolean;
  threshold?: number;
}): boolean {
  const { activeIndex, loadedCount, hasMore, isFetching, threshold = 3 } = params;
  if (!hasMore) return false;
  if (isFetching) return false;
  if (loadedCount === 0) return false;
  return activeIndex >= loadedCount - 1 - threshold;
}

// Where to land after a refresh replaces the list. Keeps the user on the
// question they were actually reading (matched by id) instead of snapping
// back to the top; falls back to the nearest valid index only if that
// question is gone (e.g. the teacher deleted it while the feed was open).
export function restoreActiveIndex(
  questions: Question[],
  previousQuestionId: string | undefined,
  previousIndex: number,
): number {
  if (questions.length === 0) return 0;
  if (previousQuestionId) {
    const found = questions.findIndex((q) => q.id === previousQuestionId);
    if (found >= 0) return found;
  }
  if (previousIndex < 0) return 0;
  if (previousIndex > questions.length - 1) return questions.length - 1;
  return previousIndex;
}

// True only when the user is on the last loaded card AND the server has
// nothing further. Drives the explicit completion state instead of an
// infinite spinner that never resolves.
export function isEndOfFeed(params: {
  activeIndex: number;
  loadedCount: number;
  hasMore: boolean;
}): boolean {
  const { activeIndex, loadedCount, hasMore } = params;
  if (hasMore) return false;
  if (loadedCount === 0) return false;
  return activeIndex >= loadedCount - 1;
}

// "3 / 18" — 1-based for display. Clamped so an empty list renders "0 / 0"
// rather than "1 / 0".
export function formatFeedPosition(activeIndex: number, total: number): string {
  if (total <= 0) return "0 / 0";
  const position = Math.min(Math.max(activeIndex + 1, 1), total);
  return `${position} / ${total}`;
}

// Phase 18 — splices `question` back into the feed at `insertIndex` for its
// session-local "second chance" (see classFeedStudyGating.ts's
// computeReshowInsertIndex for WHEN/WHERE this is called). Deliberately
// does NOT dedupe against the question's existing earlier occurrence — the
// whole point is the SAME question appearing twice in one session, which
// mergeQuestionPages/dedupeQuestionsById would otherwise collapse. Clamps
// the index defensively so an out-of-range value (e.g. stale offset after
// other splices/loads shifted the array) can never throw.
export function reinjectQuestionForSecondChance(
  questions: Question[],
  question: Question,
  insertIndex: number,
): Question[] {
  const clamped = Math.max(0, Math.min(insertIndex, questions.length));
  const next = questions.slice();
  next.splice(clamped, 0, question);
  return next;
}
