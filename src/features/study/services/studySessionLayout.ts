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

// Phase 37 — the question image never claims more than this fraction of the
// page's own available height. Root cause of the "photo dominates the
// screen" regression: the image box previously used flex: 1 inside a
// fixed-height page, so it filled EVERY pixel the (usually much smaller)
// outcome section below it didn't need — the Study Hub's own reference
// card (StudyQueueCard) never does this; its image is a small, bounded box
// inside the same card as the outcome controls, never a flex-filled hero.
// contentFit="contain" still guarantees the photo itself is never cropped
// or stretched inside this box — only the BOX's own height is capped.
//
// Phase 38 — raised from 0.45: with the fix capped that tightly, the whole
// PAGE read as a small floating card centered in a sea of empty space
// instead of a real, immersive full page like the rest of the app's swipe
// surfaces (the Feed's own photo view). 0.45 avoided the overflow bug but
// over-corrected into the opposite visual problem. Still well short of the
// old flex: 1 (which had NO ceiling at all and could claim 90%+), and the
// ScrollView safety net in both cards means this is never the only thing
// standing between the outcome buttons and being unreachable.
export const SESSION_IMAGE_MAX_HEIGHT_RATIO = 0.62;
