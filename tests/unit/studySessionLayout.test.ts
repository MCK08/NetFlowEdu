import {
  computeSessionCardHeight,
  computeSessionItemContentOffset,
  computeSessionScrollOffset,
  computeSessionSnapOffsets,
  NATIVE_SESSION_INITIAL_NUM_TO_RENDER,
  resolveSessionInitialNumToRender,
  SESSION_IMAGE_MAX_HEIGHT_RATIO,
  shouldAnimateSessionScroll,
  WEB_SESSION_MAX_INITIAL_RENDER,
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

// Phase 38.1 — the auto-advance regression. Proven experimentally against
// the running app: react-native-web's FlatList honours scrollToOffset with
// `animated: false` (scrollTop 0 -> 672) but its `animated: true` path is a
// no-op (scrollTop stayed 0), so after recording an outcome the student was
// silently left on the card they had just answered.
describe("shouldAnimateSessionScroll", () => {
  it("does NOT animate on web — the platform where the animated path is a proven no-op", () => {
    expect(shouldAnimateSessionScroll("web")).toBe(false);
  });

  it.each(["ios", "android"])("keeps the animated scroll on %s — native behavior is unchanged", (os) => {
    expect(shouldAnimateSessionScroll(os)).toBe(true);
  });

  it("defaults to animating on any other/unknown platform rather than degrading it", () => {
    expect(shouldAnimateSessionScroll("windows")).toBe(true);
    expect(shouldAnimateSessionScroll("macos")).toBe(true);
  });

  it("is a pure function of the platform string", () => {
    expect(shouldAnimateSessionScroll("web")).toBe(shouldAnimateSessionScroll("web"));
    expect(shouldAnimateSessionScroll("ios")).toBe(shouldAnimateSessionScroll("ios"));
  });
});

// Phase 38.1 — the bounded WEB compatibility fallback. On react-native-web
// 0.21.2 the session list's measurement callbacks never fire, so
// VirtualizedList pins its render window to `initialNumToRender` forever;
// with the previous value of 1 only the first card ever mounted.
describe("resolveSessionInitialNumToRender — web fallback", () => {
  it.each([
    [0, 1],
    [1, 1],
    [3, 3],
    [5, 5],
    [10, 10],
    [30, 30],
  ])("renders the whole bounded session: %i items -> %i", (itemCount, expected) => {
    expect(resolveSessionInitialNumToRender("web", itemCount)).toBe(expected);
  });

  it.each([
    [31, 30],
    [150, 30],
    [10000, 30],
  ])("clamps an unbounded list at the cap: %i items -> %i", (itemCount, expected) => {
    expect(resolveSessionInitialNumToRender("web", itemCount)).toBe(expected);
  });

  it("never returns more than the real item count for a bounded session", () => {
    for (const count of [1, 2, 7, 29, 30]) {
      expect(resolveSessionInitialNumToRender("web", count)).toBeLessThanOrEqual(count);
    }
  });

  it("never returns more than the cap, for any input", () => {
    for (const count of [0, 1, 30, 31, 500, Number.MAX_SAFE_INTEGER]) {
      expect(resolveSessionInitialNumToRender("web", count)).toBeLessThanOrEqual(
        WEB_SESSION_MAX_INITIAL_RENDER,
      );
    }
  });

  it("never returns less than 1, so a list always renders something", () => {
    for (const count of [0, -1, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveSessionInitialNumToRender("web", count)).toBeGreaterThanOrEqual(1);
    }
  });

  it("floors a fractional count rather than passing a non-integer to FlatList", () => {
    expect(resolveSessionInitialNumToRender("web", 4.9)).toBe(4);
  });

  it("the cap is the assignment contract's own maximum, not an invented number", () => {
    expect(WEB_SESSION_MAX_INITIAL_RENDER).toBe(30);
  });
});

describe("resolveSessionInitialNumToRender — native is untouched", () => {
  it.each([
    ["ios", 0],
    ["ios", 5],
    ["ios", 30],
    ["ios", 150],
    ["android", 0],
    ["android", 5],
    ["android", 30],
    ["android", 150],
  ])("%s with %i items keeps the existing native value", (os, itemCount) => {
    expect(resolveSessionInitialNumToRender(os, itemCount)).toBe(NATIVE_SESSION_INITIAL_NUM_TO_RENDER);
  });

  it("an unknown platform is treated as native, never as web", () => {
    expect(resolveSessionInitialNumToRender("windows", 150)).toBe(NATIVE_SESSION_INITIAL_NUM_TO_RENDER);
    expect(resolveSessionInitialNumToRender("macos", 150)).toBe(NATIVE_SESSION_INITIAL_NUM_TO_RENDER);
  });

  it("preserves the exact value both lists shipped before this phase", () => {
    expect(NATIVE_SESSION_INITIAL_NUM_TO_RENDER).toBe(1);
  });

  it("is deterministic", () => {
    expect(resolveSessionInitialNumToRender("web", 12)).toBe(resolveSessionInitialNumToRender("web", 12));
    expect(resolveSessionInitialNumToRender("ios", 12)).toBe(resolveSessionInitialNumToRender("ios", 12));
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
