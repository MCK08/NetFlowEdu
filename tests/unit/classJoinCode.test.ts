import { generateJoinCode, normalizeJoinCode } from "../../functions/src/classes/joinCode";

describe("generateJoinCode", () => {
  it("generates a 6-character code", () => {
    expect(generateJoinCode()).toHaveLength(6);
  });

  it("never includes visually ambiguous characters (0/O, 1/I/L)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateJoinCode();
      expect(code).not.toMatch(/[01ILO]/);
    }
  });

  it("only uses uppercase letters/digits", () => {
    expect(generateJoinCode()).toMatch(/^[A-Z2-9]+$/);
  });
});

describe("normalizeJoinCode", () => {
  it("uppercases the code", () => {
    expect(normalizeJoinCode("abc123")).toBe("ABC123");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeJoinCode("  ABC123  ")).toBe("ABC123");
  });

  it("is idempotent", () => {
    const once = normalizeJoinCode(" abc123 ");
    expect(normalizeJoinCode(once)).toBe(once);
  });
});
