import {
  collapseRepeats,
  MAX_MODERATION_TEXT_LENGTH,
  normalizeForModeration,
  turkishLower,
} from "../../functions/src/moderation/textNormalization";

// Normalization is what decides whether obfuscation works. Every test below
// is either "this bypass must collapse onto the plain form" or "this
// legitimate input must survive untouched" — the two failure modes pull in
// opposite directions, so both are pinned.

describe("turkishLower", () => {
  it("maps dotted capital İ to i and dotless I to ı", () => {
    // The single most common Turkish casing bug. JS toLowerCase() maps I->i,
    // which silently breaks every match on a word written in caps.
    expect(turkishLower("İSTANBUL")).toBe("istanbul");
    expect(turkishLower("ISIRMAK")).toBe("ısırmak");
  });

  it("lowercases the rest of the Turkish alphabet", () => {
    expect(turkishLower("ŞGÜÖÇ")).toBe("şgüöç");
  });
});

describe("collapseRepeats", () => {
  it("collapses runs of three or more", () => {
    expect(collapseRepeats("siiiik", 3)).toBe("sik");
  });

  it("leaves legitimate double letters alone at minRun 3", () => {
    // Turkish has real doubles; "dikkat" must not become "dikat".
    expect(collapseRepeats("dikkat", 3)).toBe("dikkat");
    expect(collapseRepeats("elli", 3)).toBe("elli");
  });

  it("collapses doubles only at minRun 2", () => {
    expect(collapseRepeats("dikkat", 2)).toBe("dikat");
  });
});

describe("normalizeForModeration", () => {
  it("returns an empty result for a non-string", () => {
    expect(normalizeForModeration(undefined).isEmpty).toBe(true);
    expect(normalizeForModeration(42).tokens).toEqual([]);
  });

  it("treats whitespace-only input as empty", () => {
    expect(normalizeForModeration("   \n\t  ").isEmpty).toBe(true);
  });

  it("strips zero-width characters used to split a word", () => {
    // "si<ZWSP>ktir" renders identically to the plain word.
    const result = normalizeForModeration("si​ktir");
    expect(result.tokens).toContain("siktir");
  });

  it("strips bidirectional control characters", () => {
    const result = normalizeForModeration("si‮ktir");
    expect(result.tokens).toContain("siktir");
  });

  it("collapses excessive whitespace", () => {
    expect(normalizeForModeration("bir     iki\n\n\nuc").normalized).toBe("bir iki uc");
  });

  it("folds Turkish letters to ASCII so one term matches both spellings", () => {
    expect(normalizeForModeration("şerefsiz").tokens).toContain("serefsiz");
    expect(normalizeForModeration("ĞÜÇÖI").tokens).toContain("gucoı".replace("ı", "i"));
  });

  it("drops punctuation INSIDE a token", () => {
    // "s.i.k.t.i.r" is one obfuscated word, not six.
    expect(normalizeForModeration("s.i.k.t.i.r").tokens).toContain("siktir");
  });

  it("joins runs of single-character tokens", () => {
    // The letter-spacing bypass.
    expect(normalizeForModeration("bu s i k t i r demek").joinedSingles).toContain("siktir");
  });

  it("does not join a run of only two single characters", () => {
    // "a b" is algebra far more often than obfuscation.
    expect(normalizeForModeration("a b = 4").joinedSingles).toEqual([]);
  });

  it("folds conservative leetspeak substitutions", () => {
    expect(normalizeForModeration("s1kt1r").tokens).toContain("siktir");
    expect(normalizeForModeration("@ptal").tokens).toContain("aptal");
  });

  it("does not fold digits that carry no letter meaning", () => {
    // 2/6/9 stay themselves, so ordinary numbers survive.
    expect(normalizeForModeration("2 6 9").tokens).toEqual(["2", "6", "9"]);
  });

  it("keeps an ordinary mathematical expression intact", () => {
    const result = normalizeForModeration("2x + 3y = 12 ise x kaçtır?");
    expect(result.isEmpty).toBe(false);
    expect(result.tokens).toContain("ise");
    expect(result.tokens).toContain("kactir");
  });

  it("truncates and flags input beyond the maximum length", () => {
    const long = "a".repeat(MAX_MODERATION_TEXT_LENGTH + 500);
    const result = normalizeForModeration(long);
    expect(result.wasTruncated).toBe(true);
    expect(result.normalized.length).toBeLessThanOrEqual(MAX_MODERATION_TEXT_LENGTH);
  });

  it("does not flag ordinary-length input as truncated", () => {
    expect(normalizeForModeration("kısa bir cevap").wasTruncated).toBe(false);
  });

  it("normalizes fullwidth and mathematical lookalikes via NFKC", () => {
    expect(normalizeForModeration("ｓｉｋｔｉｒ").tokens).toContain("siktir");
    expect(normalizeForModeration("\u{1D42C}\u{1D422}\u{1D424}").tokens).toContain("sik");
  });
});
