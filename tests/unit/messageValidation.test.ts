import {
  MAX_MESSAGE_LENGTH,
  normalizeMessageText,
  validateMessageText,
} from "@features/classes/services/messageValidation";

describe("validateMessageText", () => {
  it("rejects an empty message", () => {
    expect(validateMessageText("")).toBe("Mesaj boş olamaz.");
  });

  it("rejects a whitespace-only message", () => {
    expect(validateMessageText("   \n  ")).toBe("Mesaj boş olamaz.");
  });

  it("rejects a message over 1000 characters", () => {
    expect(validateMessageText("a".repeat(1001))).toBe(
      `Mesaj en fazla ${MAX_MESSAGE_LENGTH} karakter olabilir.`,
    );
  });

  it("accepts exactly 1000 characters", () => {
    expect(validateMessageText("a".repeat(1000))).toBeNull();
  });

  it("accepts a normal message", () => {
    expect(validateMessageText("Merhaba sınıf!")).toBeNull();
  });

  it("accepts a message that is only long after trimming whitespace is removed from consideration", () => {
    expect(validateMessageText(`  ${"a".repeat(1000)}  `)).toBeNull();
  });
});

describe("normalizeMessageText", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeMessageText("  Merhaba  ")).toBe("Merhaba");
  });

  it("does not alter internal whitespace", () => {
    expect(normalizeMessageText("  Merhaba   sınıf  ")).toBe("Merhaba   sınıf");
  });
});
