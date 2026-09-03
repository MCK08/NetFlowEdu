// Phase 72 — authored progressive hints.
//
// The trust rule is what these lock down: everything a student sees came from
// the author, the ladder stays contiguous and ordered, and a legacy question
// behaves exactly as it always did.

import {
  hasHints,
  hintActionLabel,
  hintLabel,
  MAX_HINT_LENGTH,
  MAX_QUESTION_HINTS,
  nextRevealCount,
  parseHintsFromUnknown,
  remainingHintCount,
  sanitizeHints,
} from "../../src/features/questions/services/questionHints";

describe("hint authoring — sanitize", () => {
  it("keeps authored hints in author order", () => {
    expect(sanitizeHints(["Önce birimlere bak.", "Denklemi sadeleştir.", "İki tarafı da böl."])).toEqual([
      "Önce birimlere bak.",
      "Denklemi sadeleştir.",
      "İki tarafı da böl.",
    ]);
  });

  it("returns nothing for no input", () => {
    expect(sanitizeHints(null)).toEqual([]);
    expect(sanitizeHints(undefined)).toEqual([]);
    expect(sanitizeHints([])).toEqual([]);
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeHints(["  Birimlere bak.  "])).toEqual(["Birimlere bak."]);
  });

  it("drops blank and whitespace-only entries", () => {
    expect(sanitizeHints(["Birimlere bak.", "", "   ", "Sadeleştir."])).toEqual([
      "Birimlere bak.",
      "Sadeleştir.",
    ]);
  });

  it("keeps the ladder contiguous when an author skips a box", () => {
    // Boxes 1 and 3 filled must become a two-step ladder, never a hole.
    expect(sanitizeHints(["İlk adım.", "", "Son adım."])).toEqual(["İlk adım.", "Son adım."]);
  });

  it("drops entries that are not strings", () => {
    expect(sanitizeHints([null, undefined, "Gerçek ipucu."] as never)).toEqual(["Gerçek ipucu."]);
  });

  it("caps how many hints a question may carry", () => {
    const many = ["a", "b", "c", "d", "e", "f"];
    expect(sanitizeHints(many)).toHaveLength(MAX_QUESTION_HINTS);
    expect(MAX_QUESTION_HINTS).toBe(3);
  });

  it("caps how long one hint may be", () => {
    const long = "x".repeat(MAX_HINT_LENGTH + 50);
    expect(sanitizeHints([long])[0]).toHaveLength(MAX_HINT_LENGTH);
  });

  it("keeps a hint that is exactly at the limit", () => {
    const exact = "y".repeat(MAX_HINT_LENGTH);
    expect(sanitizeHints([exact])[0]).toBe(exact);
  });
});

describe("hint reading — untrusted document data", () => {
  it("returns nothing for a legacy question with no field", () => {
    expect(parseHintsFromUnknown(undefined)).toEqual([]);
    expect(parseHintsFromUnknown(null)).toEqual([]);
  });

  it("rejects a non-array value", () => {
    expect(parseHintsFromUnknown("İpucu")).toEqual([]);
    expect(parseHintsFromUnknown({ 0: "İpucu" })).toEqual([]);
    expect(parseHintsFromUnknown(42)).toEqual([]);
  });

  it("drops garbage entries rather than coercing them", () => {
    expect(parseHintsFromUnknown(["Gerçek ipucu.", 7, {}, null])).toEqual(["Gerçek ipucu."]);
  });

  it("re-applies the count and length bounds on read", () => {
    const stored = ["a", "b", "c", "d"];
    expect(parseHintsFromUnknown(stored)).toHaveLength(MAX_QUESTION_HINTS);
    expect(parseHintsFromUnknown(["z".repeat(500)])[0]).toHaveLength(MAX_HINT_LENGTH);
  });

  it("round trips authored content unchanged", () => {
    const authored = ["Önce birimlere bak.", "Denklemi sadeleştir."];
    expect(parseHintsFromUnknown(sanitizeHints(authored))).toEqual(authored);
  });

  it("preserves order across a round trip", () => {
    const authored = ["1", "2", "3"];
    expect(parseHintsFromUnknown(sanitizeHints(authored))).toEqual(["1", "2", "3"]);
  });
});

describe("hint presence", () => {
  it("is false for a legacy question", () => {
    expect(hasHints([])).toBe(false);
    expect(hasHints(null)).toBe(false);
    expect(hasHints(undefined)).toBe(false);
  });

  it("is true once the author wrote one", () => {
    expect(hasHints(["Birimlere bak."])).toBe(true);
  });
});

describe("hint ladder progression", () => {
  const three = ["bir", "iki", "üç"];

  it("starts closed", () => {
    expect(remainingHintCount(three, 0)).toBe(3);
  });

  it("opens one rung at a time", () => {
    expect(nextRevealCount(three, 0)).toBe(1);
    expect(nextRevealCount(three, 1)).toBe(2);
    expect(nextRevealCount(three, 2)).toBe(3);
  });

  it("never opens past the end of the ladder", () => {
    expect(nextRevealCount(three, 3)).toBe(3);
    expect(nextRevealCount(three, 99)).toBe(3);
    expect(remainingHintCount(three, 3)).toBe(0);
    expect(remainingHintCount(three, 99)).toBe(0);
  });

  it("handles a single-hint ladder", () => {
    expect(nextRevealCount(["tek"], 0)).toBe(1);
    expect(remainingHintCount(["tek"], 1)).toBe(0);
  });

  it("has nothing to open on a question with no hints", () => {
    expect(nextRevealCount([], 0)).toBe(0);
    expect(remainingHintCount([], 0)).toBe(0);
  });

  it("is defensive about a negative reveal count", () => {
    expect(nextRevealCount(three, -5)).toBe(1);
    expect(remainingHintCount(three, -5)).toBe(3);
  });
});

describe("hint copy", () => {
  const three = ["bir", "iki", "üç"];

  it("names each rung by its position", () => {
    expect(hintLabel(0)).toBe("İpucu 1");
    expect(hintLabel(1)).toBe("İpucu 2");
    expect(hintLabel(2)).toBe("İpucu 3");
  });

  it("invites the first hint, then further ones", () => {
    expect(hintActionLabel(three, 0)).toBe("İpucu Al");
    expect(hintActionLabel(three, 1)).toBe("Bir İpucu Daha");
    expect(hintActionLabel(three, 2)).toBe("Bir İpucu Daha");
  });

  it("offers no action once the whole ladder is open", () => {
    expect(hintActionLabel(three, 3)).toBeNull();
    expect(hintActionLabel(["tek"], 1)).toBeNull();
  });

  it("offers no action on a question with no hints", () => {
    expect(hintActionLabel([], 0)).toBeNull();
  });

  it("uses no emoji and no raw enum", () => {
    const copy = [hintLabel(0), hintLabel(1), hintActionLabel(three, 0), hintActionLabel(three, 1)].join(" ");
    expect(copy).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(copy).not.toMatch(/hint|level|correctChoice/i);
  });
});

describe("hint content safety", () => {
  it("stores exactly what the author typed, never a rewrite", () => {
    const authored = "Payda eşitlemeden önce iki kesri de sadeleştir.";
    expect(sanitizeHints([authored])).toEqual([authored]);
  });

  it("carries no answer field of its own", () => {
    // A hint is a string. There is no place in this shape for a correctChoice,
    // a solution or a student identifier to ride along.
    const result = sanitizeHints(["İpucu"]);
    expect(result.every((entry) => typeof entry === "string")).toBe(true);
  });
});
