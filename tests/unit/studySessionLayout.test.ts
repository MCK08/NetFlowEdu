import {
  computeSessionCardHeight,
  computeSessionItemContentOffset,
  computeSessionScrollOffset,
  computeSessionSnapOffsets,
  SESSION_IMAGE_MAX_HEIGHT_RATIO,
} from "../../src/features/study/services/studySessionLayout";

// Phase 35 — regression coverage for the "Tekrar Et"/"Zorlandım"/"Çözdüm"
// buttons falling off the bottom of the screen. Root cause: a card used to
// be given the FULL raw window height even though a floating header sits on
// top of it and a bottom safe-area inset eats into the bottom — so the
// card's own content (image + outcome controls) always extended past what
// was actually visible. These tests lock in the corrected math across the
// real device shapes named in the audit (small/normal/large iPhone, with
// and without a safe-area inset).

describe("computeSessionCardHeight", () => {
  it("subtracts both the header and the bottom safe-area inset from the raw window height", () => {
    // iPhone SE-shaped: no notch (insetsBottom 0), small window.
    expect(computeSessionCardHeight({ windowHeight: 667, headerHeight: 92, insetsBottom: 0 })).toBe(575);
  });

  it("subtracts the home-indicator inset on a notched device (iPhone 14-shaped)", () => {
    expect(computeSessionCardHeight({ windowHeight: 844, headerHeight: 92, insetsBottom: 34 })).toBe(718);
  });

  it("subtracts on a large device too (iPhone 14 Pro Max-shaped) — no leftover unused space claimed by the card", () => {
    expect(computeSessionCardHeight({ windowHeight: 932, headerHeight: 107, insetsBottom: 34 })).toBe(791);
  });

  it("never returns a negative height for a pathological input", () => {
    expect(computeSessionCardHeight({ windowHeight: 100, headerHeight: 92, insetsBottom: 34 })).toBe(0);
  });

  it("is always strictly less than the raw window height whenever header or inset is nonzero — the exact invariant the bug violated", () => {
    const windowHeight = 812;
    const cardHeight = computeSessionCardHeight({ windowHeight, headerHeight: 91, insetsBottom: 34 });
    expect(cardHeight).toBeLessThan(windowHeight);
  });
});

describe("computeSessionSnapOffsets", () => {
  it("returns an empty array for zero items", () => {
    expect(computeSessionSnapOffsets(0, 575)).toEqual([]);
  });

  // Phase 38 — this assertion previously read [92, 667, 1242] (the CONTENT
  // positions). Those are the wrong numbers to SCROLL to: scrolling to an
  // item's content position lands its top at screen y=0, underneath the
  // floating header, hiding the top `headerHeight` pixels of every card
  // after the first. Measured directly in the running app before the fix.
  it("snaps in SCROLL space — a plain multiple of cardHeight, header spacer excluded", () => {
    expect(computeSessionSnapOffsets(3, 575)).toEqual([0, 575, 1150]);
  });

  it("matches computeSessionScrollOffset for every index it produces", () => {
    const cardHeight = 791;
    const offsets = computeSessionSnapOffsets(4, cardHeight);
    offsets.forEach((offset, index) => {
      expect(offset).toBe(computeSessionScrollOffset(index, cardHeight));
    });
  });
});

describe("computeSessionScrollOffset", () => {
  it("the first item rests at scroll offset 0 — the header spacer already holds it below the header", () => {
    expect(computeSessionScrollOffset(0, 575)).toBe(0);
  });

  it("advances by exactly one cardHeight per index", () => {
    expect(computeSessionScrollOffset(1, 575)).toBe(575);
    expect(computeSessionScrollOffset(2, 575)).toBe(1150);
  });

  it("never returns a negative offset for a defensive negative index", () => {
    expect(computeSessionScrollOffset(-1, 575)).toBe(0);
  });

  // The regression itself, stated as an invariant: the scroll offset must
  // be exactly headerHeight LESS than the content offset, for every index.
  it.each([
    [0, 92, 575],
    [1, 92, 575],
    [5, 107, 791],
  ])("index %i: scrollOffset === contentOffset - headerHeight", (index, headerHeight, cardHeight) => {
    expect(computeSessionScrollOffset(index, cardHeight)).toBe(
      computeSessionItemContentOffset(index, headerHeight, cardHeight) - headerHeight,
    );
  });
});

describe("computeSessionItemContentOffset", () => {
  it("describes where the item SITS in content space — the first item after the header spacer", () => {
    expect(computeSessionItemContentOffset(0, 92, 575)).toBe(92);
  });

  it("advances by exactly one cardHeight per index", () => {
    expect(computeSessionItemContentOffset(1, 92, 575)).toBe(667);
    expect(computeSessionItemContentOffset(2, 92, 575)).toBe(1242);
  });
});

describe("SESSION_IMAGE_MAX_HEIGHT_RATIO", () => {
  it("is a fraction strictly between 0 and 1 — the image can never claim the whole page nor be reduced to nothing", () => {
    expect(SESSION_IMAGE_MAX_HEIGHT_RATIO).toBeGreaterThan(0);
    expect(SESSION_IMAGE_MAX_HEIGHT_RATIO).toBeLessThan(1);
  });

  it("still leaves real, guaranteed room for the outcome section (Cevapla + Tekrar Et/Zorlandım/Çözdüm) below the image — the image may be the visually larger share (Phase 38: it's the page's primary content, same as the Feed's own photo view), but never so tall it approaches the old uncapped flex: 1 behavior", () => {
    expect(SESSION_IMAGE_MAX_HEIGHT_RATIO).toBeLessThanOrEqual(0.7);
  });
});
