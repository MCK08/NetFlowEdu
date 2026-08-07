import { Question } from "@/types/question";

// Phase 19.2 — the interstitial rating "screen" is no longer an overlay
// layered on top of the feed; it is a real item IN the feed's own data
// array. [Question, Rating, Question, Rating, ...] — swiping from a
// question naturally lands on ITS rating card (the very next FlatList
// item), and choosing an outcome deterministically scrolls to the next
// question (index + 1). There is no gesture prediction, no drag ref, no
// "which question is this rating for" ambiguity: the rating card's own
// `question` prop IS the answer, fixed at the moment this array was built,
// exactly like every other FlatList item.
//
// Pure and React/Firebase-free, same reasoning as classFeedPagination.ts:
// the one property that matters here (a rating card always immediately
// follows its own question card, before and after any reshow splice) is
// something a test can pin down directly.

export type FeedItemType = "question" | "rating";

export interface FeedItem {
  type: FeedItemType;
  question: Question;
  // The question's position in the ORIGINAL (non-interleaved) source
  // array at the moment this item was created. Used only for prefetch
  // bookkeeping (see ClassFeedScreen) — never for identity or keys.
  questionIndex: number;
  // True for a session-local "second chance" pair (see
  // reinjectPairForSecondChance) — never true for the feed's original,
  // server-ordered items.
  isReshow: boolean;
  // Precomputed, stable, and unique per item — including across a reshow
  // (the same question legitimately appears twice; `isReshow` is what
  // keeps their keys from colliding without needing a separate
  // occurrence-counting pass over the whole array on every render).
  key: string;
}

function questionKey(question: Question, isReshow: boolean): string {
  return `q-${question.id}${isReshow ? "-r" : ""}`;
}

function ratingKey(question: Question, isReshow: boolean): string {
  return `r-${question.id}${isReshow ? "-r" : ""}`;
}

function buildPair(question: Question, questionIndex: number, isReshow: boolean): FeedItem[] {
  return [
    { type: "question", question, questionIndex, isReshow, key: questionKey(question, isReshow) },
    { type: "rating", question, questionIndex, isReshow, key: ratingKey(question, isReshow) },
  ];
}

// Reshow pairs that were never anchored to a preceding question item (in
// practice: never happens, since reinjectPairForSecondChance always splices
// after some struggled question's own pair — but grouping needs SOME key
// for that theoretical case, so it gets its own bucket instead of being
// silently dropped).
const START_ANCHOR = "\0start";

// Interleaves a fresh slice of source questions into [Q, R, Q, R, ...]
// pairs, tagged with their ORIGINAL index (`baseIndexOffset` lets this be
// called again for a newly-loaded page and get correct, continuing
// indices rather than always starting from 0).
//
// `includeRating` is false for a teacher viewing the class feed: study
// items exist only for students, and recordStudyOutcome rejects a teacher
// outright, so a rating card would be a guaranteed error for them. Gating
// it HERE (never building the item at all) rather than hiding it in the
// renderer is what guarantees a teacher's feed is pure questions, same
// spacing/index math as a plain list.
export function buildFeedItems(
  questions: Question[],
  baseIndexOffset = 0,
  includeRating = true,
): FeedItem[] {
  const items: FeedItem[] = [];
  questions.forEach((question, i) => {
    const questionIndex = baseIndexOffset + i;
    if (includeRating) {
      items.push(...buildPair(question, questionIndex, false));
    } else {
      items.push({
        type: "question",
        question,
        questionIndex,
        isReshow: false,
        key: questionKey(question, false),
      });
    }
  });
  return items;
}

// Splices a fresh [Question, Rating] pair for `question`'s session-local
// "second chance" at `insertIndex` — see classFeedStudyGating.ts's
// computeReshowInsertIndex for WHEN/WHERE this is called from. Clamped
// defensively so a stale offset (e.g. after other splices/loads shifted
// the array) can never throw.
export function reinjectPairForSecondChance(
  items: FeedItem[],
  question: Question,
  questionIndex: number,
  insertIndex: number,
): FeedItem[] {
  const clamped = Math.max(0, Math.min(insertIndex, items.length));
  const next = items.slice();
  next.splice(clamped, 0, ...buildPair(question, questionIndex, true));
  return next;
}

// Phase 20 — replaces the old length-comparison diff that useInterleavedStudyFeed
// used to grow `items` (it assumed `questions` only ever gained items at the
// END, which pagination does — but a new upload prepending to the FRONT, or
// a pull-to-refresh reordering the whole list, broke that assumption: the
// old code would mistake an existing question for new, mint it a duplicate
// key, and leave the actually-new question with no feed item at all).
//
// `questions`' current order is the single source of truth. Every normal
// (non-reshow) pair is rebuilt fresh from it on every call — cheap (plain
// objects, matched by `key` for React's reconciliation, not by identity)
// and correct by construction for append, prepend, reorder, and removal
// alike, since it never has to GUESS what changed.
//
// The only state that can't be rebuilt from `questions` is a session-local
// reshow pair (there is no server record of it) — those are carried over
// from `prevItems` UNCHANGED, anchored to the id of whichever question
// they immediately followed, so they keep surfacing near the same
// neighbor after a reconciliation instead of being recomputed or, worse,
// silently dropped.
export function reconcileFeedItems(
  prevItems: FeedItem[],
  questions: Question[],
  includeRating: boolean,
): FeedItem[] {
  const reshowByAnchor = new Map<string, FeedItem[]>();
  let anchor: string | null = null;
  for (let i = 0; i < prevItems.length; i++) {
    const item = prevItems[i];
    if (!item) continue;
    if (!item.isReshow) {
      if (item.type === "question") anchor = item.question.id;
      continue;
    }
    // Reshow pairs are always emitted contiguously by buildPair (question
    // immediately followed by its rating) — process the pair once, at its
    // "question" half, and skip the "rating" half since it was already
    // absorbed into the same block.
    if (item.type !== "question") continue;
    const ratingItem = prevItems[i + 1];
    const block: FeedItem[] =
      ratingItem && ratingItem.isReshow && ratingItem.type === "rating"
        ? [item, ratingItem]
        : [item];
    const anchorKey = anchor ?? START_ANCHOR;
    const existing = reshowByAnchor.get(anchorKey);
    reshowByAnchor.set(anchorKey, existing ? [...existing, ...block] : block);
  }

  const result: FeedItem[] = [];
  function appendReshowBlocksFor(key: string) {
    const blocks = reshowByAnchor.get(key);
    if (!blocks) return;
    result.push(...blocks);
    reshowByAnchor.delete(key);
  }

  appendReshowBlocksFor(START_ANCHOR);
  questions.forEach((question, index) => {
    if (includeRating) {
      result.push(...buildPair(question, index, false));
    } else {
      result.push({
        type: "question",
        question,
        questionIndex: index,
        isReshow: false,
        key: questionKey(question, false),
      });
    }
    appendReshowBlocksFor(question.id);
  });

  // Any reshow blocks whose anchor question no longer exists in `questions`
  // (its normal pair was dropped by a refresh/removal) are still preserved
  // — appended at the end rather than discarded. A struggled question's
  // second chance is a promise to the student that must outlive its old
  // neighbor's disappearance.
  for (const blocks of reshowByAnchor.values()) {
    result.push(...blocks);
  }

  return result;
}
