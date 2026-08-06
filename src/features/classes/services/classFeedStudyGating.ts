// Who gets study controls in the class feed, and which question the feed
// hydrates state for.
//
// Both answers live here rather than inline in the screen so the rule that
// actually matters — inactive cards cost nothing — is a pure function that a
// test can break. The screen holds ONE study hook for the whole list (see
// ClassFeedScreen), so `activeStudyQuestionId` is literally the only input
// that can cause a Firestore read: if it stays null, no read happens at all.

interface ActiveStudyQuestionParams {
  questionIds: string[];
  activeIndex: number;
  isStudent: boolean;
}

/**
 * The question the feed should hydrate study state for — or null for "read
 * nothing".
 *
 * Returns null for a teacher: study items exist only for students, and
 * recordStudyOutcome rejects teachers outright, so opening the read would be
 * wasted work and showing the control would be a guaranteed error.
 *
 * Returns null for an out-of-range index, which is the real state during the
 * first render of an empty or still-loading feed.
 */
export function activeStudyQuestionId({
  questionIds,
  activeIndex,
  isStudent,
}: ActiveStudyQuestionParams): string | null {
  if (!isStudent) return null;
  if (!Number.isInteger(activeIndex) || activeIndex < 0) return null;
  return questionIds[activeIndex] ?? null;
}

/**
 * Whether the card at `index` renders the self-assessment controls.
 *
 * Exactly one card can satisfy this for a given activeIndex, which is what
 * keeps the feed at one hydration read regardless of how many cards
 * FlatList happens to have mounted.
 */
export function shouldShowStudyControls(params: {
  index: number;
  activeIndex: number;
  isStudent: boolean;
}): boolean {
  return params.isStudent && params.index === params.activeIndex;
}

// ---------------------------------------------------------------------------
// Phase 18 — scroll-first "second chance" reshow.
//
// The Study Engine scheduler (functions/src/study/reviewScheduler.ts) is
// untouched: a "struggled" outcome still writes nextReviewAt = +1 day server
// side, exactly as it always has, and that write is what eventually makes
// the question due again in the Study dashboard / Review Queue. Nothing
// here changes that.
//
// What's new is purely a SESSION-LOCAL, client-side echo layered on top: if
// a question is struggled for the first time in this scroll session, splice
// the SAME question object back into the feed's own array a random
// 20-40 items ahead, so the student gets a natural "second chance" within
// this session instead of waiting a full day. This is deliberately never
// persisted anywhere — closing the app and reopening loses it, which is
// correct: the server-side schedule (due tomorrow) is the only durable
// truth. If a reshown question is struggled AGAIN, it must NOT be
// reinjected a second time — it falls through to the normal next-day
// review path, per the product rule ("1 başarısızlık = önce ikinci şans,
// bir daha değil").
// ---------------------------------------------------------------------------

export const RESHOW_MIN_OFFSET = 20;
export const RESHOW_MAX_OFFSET = 40;

// Injectable RNG purely so this is unit-testable without mocking global
// Math.random — production callers omit the argument.
export function pickReshowOffset(random: () => number = Math.random): number {
  const span = RESHOW_MAX_OFFSET - RESHOW_MIN_OFFSET + 1;
  return RESHOW_MIN_OFFSET + Math.floor(random() * span);
}

/**
 * Where to splice a struggled question back into the feed for its one
 * session-local second chance, or `null` if it must NOT be reinjected
 * (already had its second chance this session — see the module doc above).
 *
 * Clamps to the end of the currently-loaded array rather than the "ideal"
 * offset when the feed is shorter than the offset — still resurfacing it
 * before the session's natural end beats not resurfacing it at all, and a
 * further-future page hasn't been fetched yet to splice into regardless.
 */
export function computeReshowInsertIndex(params: {
  currentIndex: number;
  totalLength: number;
  offset: number;
  alreadyReshownThisSession: boolean;
}): number | null {
  if (params.alreadyReshownThisSession) return null;
  const target = params.currentIndex + params.offset;
  return Math.min(target, params.totalLength);
}
