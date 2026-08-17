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
 * Where item `index` actually SITS inside the list's content, measured from
 * the very top of the content (the header spacer's own top). This is what
 * FlatList's `getItemLayout` describes — a statement about layout, not a
 * place to scroll to.
 *
 * NOT interchangeable with computeSessionScrollOffset below. See its doc
 * comment for the (measured) reason those are two different numbers.
 */
export function computeSessionItemContentOffset(
  index: number,
  headerHeight: number,
  cardHeight: number,
): number {
  return headerHeight + cardHeight * index;
}

/**
 * The scroll offset that brings item `index` to rest exactly BELOW the
 * floating header — what `scrollToOffset` and `snapToOffsets` must use.
 *
 * Phase 38 root cause. These two numbers were previously the same function,
 * and that conflation shifted every card up by exactly `headerHeight`:
 *
 *   item i's content position  = headerHeight + cardHeight * i
 *   item i's on-screen top     = contentPosition - scrollOffset
 *
 * Scrolling to the CONTENT position therefore puts the card's top at
 * screen y = 0 — underneath the opaque floating header (which covers
 * y ∈ [0, headerHeight)) — instead of at y = headerHeight. Measured
 * directly in the running app: with headerHeight 48 and cardHeight 672, the
 * DOM reports item 1 at content y 720, and the old math scrolled to 720,
 * landing its top at screen y 0 with the top 48px hidden behind the header.
 * On a notched phone headerHeight is ~95-107, so roughly the top hundred
 * pixels of every card after the first — the top of the question image —
 * was cropped by the header on every auto-advance and every swipe.
 *
 * Subtracting the header spacer is the whole fix: the spacer exists so the
 * FIRST card starts below the header at rest (scroll offset 0); every
 * subsequent card reaches that same resting place at `cardHeight * index`.
 */
export function computeSessionScrollOffset(index: number, cardHeight: number): number {
  if (index <= 0) return 0;
  return Math.max(0, cardHeight * index);
}

/**
 * Real FlatList scroll-stop positions for the vertical swipe feed — the
 * SCROLL-offset space (see computeSessionScrollOffset), not the content
 * space. snapToInterval cannot express this list on its own once a header
 * spacer of a different height sits above the cards, which is why the
 * explicit offsets are computed here.
 */
export function computeSessionSnapOffsets(itemCount: number, cardHeight: number): number[] {
  if (itemCount <= 0) return [];
  return Array.from({ length: itemCount }, (_, index) => computeSessionScrollOffset(index, cardHeight));
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
