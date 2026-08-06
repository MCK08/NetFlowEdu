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
