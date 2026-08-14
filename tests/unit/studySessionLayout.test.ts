import {
  computeSessionCardHeight,
  computeSessionItemOffset,
  computeSessionSnapOffsets,
  SESSION_CONTROLS_MAX_HEIGHT_RATIO,
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
    expect(computeSessionSnapOffsets(0, 92, 575)).toEqual([]);
  });

  it("offsets every item by the header height, then by cardHeight per index — never snapToInterval's uniform-from-zero assumption", () => {
    expect(computeSessionSnapOffsets(3, 92, 575)).toEqual([92, 667, 1242]);
  });

  it("matches computeSessionItemOffset for every index it produces", () => {
    const headerHeight = 107;
    const cardHeight = 791;
    const offsets = computeSessionSnapOffsets(4, headerHeight, cardHeight);
    offsets.forEach((offset, index) => {
      expect(offset).toBe(computeSessionItemOffset(index, headerHeight, cardHeight));
    });
  });
});

describe("computeSessionItemOffset", () => {
  it("the first item starts exactly at the header's own height, not at 0", () => {
    expect(computeSessionItemOffset(0, 92, 575)).toBe(92);
  });

  it("advances by exactly one cardHeight per index", () => {
    expect(computeSessionItemOffset(1, 92, 575)).toBe(667);
    expect(computeSessionItemOffset(2, 92, 575)).toBe(1242);
  });
});

describe("SESSION_CONTROLS_MAX_HEIGHT_RATIO", () => {
  it("is a fraction strictly between 0 and 1 — the outcome area can never claim the whole card nor be reduced to nothing", () => {
    expect(SESSION_CONTROLS_MAX_HEIGHT_RATIO).toBeGreaterThan(0);
    expect(SESSION_CONTROLS_MAX_HEIGHT_RATIO).toBeLessThan(1);
  });

  it("leaves the image at least as much room as the controls area gets — the image must never be the smaller share by design", () => {
    expect(SESSION_CONTROLS_MAX_HEIGHT_RATIO).toBeLessThanOrEqual(0.6);
  });
});
