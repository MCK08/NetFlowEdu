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
