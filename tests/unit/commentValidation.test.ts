import {
  MAX_COMMENT_LENGTH,
  normalizeCommentText,
  validateCommentText,
} from "@features/social/comments/services/commentValidation";

describe("validateCommentText", () => {
  it("rejects an empty comment", () => {
    expect(validateCommentText("")).toBe("Yorum boş olamaz.");
  });

  it("rejects a whitespace-only comment", () => {
    expect(validateCommentText("   \n  ")).toBe("Yorum boş olamaz.");
  });

  it("rejects a comment over 500 characters", () => {
    expect(validateCommentText("a".repeat(501))).toBe(
      `Yorum en fazla ${MAX_COMMENT_LENGTH} karakter olabilir.`,
    );
  });

  it("accepts exactly 500 characters", () => {
    expect(validateCommentText("a".repeat(500))).toBeNull();
  });

  it("accepts a normal comment", () => {
    expect(validateCommentText("Merhaba, güzel soru!")).toBeNull();
  });

  it("accepts a comment that is only long after trimming whitespace is removed from consideration", () => {
    // Leading/trailing whitespace shouldn't count toward the limit.
    expect(validateCommentText(`  ${"a".repeat(500)}  `)).toBeNull();
  });
});

describe("normalizeCommentText", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeCommentText("  Merhaba  ")).toBe("Merhaba");
  });

  it("does not alter internal whitespace", () => {
    expect(normalizeCommentText("  Merhaba   dünya  ")).toBe("Merhaba   dünya");
  });
});
