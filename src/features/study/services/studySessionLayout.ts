// Phase 35 — pure layout math for StudySessionScreen's vertical swipe feed.
//
// Extracted specifically so this can be unit-tested without React Native's
// own layout engine: the bug this exists to prevent (image + outcome
// buttons overflowing past the visible viewport, "Zorlandım"/"Çözdüm"
// unreachable) was a pure arithmetic mistake — a card was given the full
// raw window height even though a header floats on top of it and a
// safe-area inset eats into the bottom — not something that needed a
// device to discover. See StudySessionScreen.tsx's own doc comment on
// `cardHeight` for the full story.

export interface SessionCardHeightInput {
  /** Raw device window height (useWindowDimensions().height). */
  windowHeight: number;
  /** The floating header's own rendered height (insets.top + its own
   *  content height) — the ListHeaderComponent spacer that pushes every
   *  card down by exactly this much. */
  headerHeight: number;
  /** Bottom safe-area inset (insets.bottom) — the home indicator strip on
   *  notched devices, otherwise 0. */
  insetsBottom: number;
}

/**
 * The true visible height available to ONE swipe card: everything between
 * the bottom of the floating header and the top of the bottom safe-area
 * inset. Never negative — a window smaller than header+inset (should never
 * happen on a real device, but a defensively bogus input must not produce a
 * negative height a card could be asked to render at) clamps to 0.
 */
export function computeSessionCardHeight(input: SessionCardHeightInput): number {
  const raw = input.windowHeight - input.headerHeight - input.insetsBottom;
  return Math.max(0, raw);
}

/**
 * Real FlatList scroll-stop positions for a vertical swipe feed whose first
 * item is offset by a header spacer taller (or shorter) than every card
 * after it — snapToInterval cannot represent this (it only knows one fixed
 * interval measured from offset 0); snapToOffsets needs the explicit list
 * this produces. Item `i` always starts at `headerHeight + cardHeight * i`.
 */
export function computeSessionSnapOffsets(
  itemCount: number,
  headerHeight: number,
  cardHeight: number,
): number[] {
  if (itemCount <= 0) return [];
  return Array.from({ length: itemCount }, (_, index) => headerHeight + cardHeight * index);
}

/**
 * The scroll offset for the top of item `index` in the same coordinate
 * space computeSessionSnapOffsets uses — what auto-advance
 * (scrollToOffset) must target after an outcome is recorded, or when the
 * mandatory session's own `index` moves on.
 */
export function computeSessionItemOffset(index: number, headerHeight: number, cardHeight: number): number {
  return headerHeight + cardHeight * index;
}

// The outcome area (description + Tekrar Et/Zorlandım/Çözdüm) never claims
// more than this fraction of one card's height — see
// StudySessionAdaptiveCard/StudySessionMandatoryCard's own use of this same
// constant. Exported so it stays the single source both cards read, rather
// than two independently-editable copies of the same number silently
// drifting apart.
export const SESSION_CONTROLS_MAX_HEIGHT_RATIO = 0.55;
