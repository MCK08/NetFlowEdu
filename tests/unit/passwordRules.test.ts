import {
  evaluatePasswordRules,
  PASSWORD_RULES,
  USERNAME_HINT,
  validatePassword,
  validateUsername,
} from "@features/authentication/validation";

describe("PASSWORD_RULES is the single source both the checklist and the validator read", () => {
  it("lists the four rules in the order validatePassword reports them", () => {
    expect(PASSWORD_RULES.map((rule) => rule.id)).toEqual([
      "length",
      "uppercase",
      "lowercase",
      "number",
    ]);
  });

  // If these ever drift, the visible checklist would tick a rule the
  // validator still rejects — the exact confusion this list prevents.
  it("every rule's own message is what validatePassword returns when only that rule fails", () => {
    // Each candidate violates exactly ONE rule, so the message it produces
    // can only have come from that rule.
    const violates: Record<string, string> = {
      length: "Abc1",
      uppercase: "abcdefg1",
      lowercase: "ABCDEFG1",
      number: "Abcdefgh",
    };
    for (const rule of PASSWORD_RULES) {
      const candidate = violates[rule.id] as string;
      expect(candidate).toBeDefined();
      expect(rule.test(candidate)).toBe(false);
      // Every other rule must pass, or the assertion below would prove
      // nothing about which rule produced the message.
      for (const other of PASSWORD_RULES.filter((candidateRule) => candidateRule.id !== rule.id)) {
        expect(other.test(candidate)).toBe(true);
      }
      expect(validatePassword(candidate)).toBe(rule.message);
    }
  });

  it("gives every rule a short hint that is not the full error sentence", () => {
    for (const rule of PASSWORD_RULES) {
      expect(rule.hint.length).toBeGreaterThan(0);
      expect(rule.hint.endsWith(".")).toBe(false);
      expect(rule.hint).not.toBe(rule.message);
    }
  });
});

describe("validatePassword — behaviour preserved exactly", () => {
  it("still reports an empty password as required, before any rule", () => {
    expect(validatePassword("")).toBe("Şifre gerekli.");
  });

  it("still reports the FIRST failing rule, not a combined list", () => {
    // Too short AND missing an uppercase AND missing a digit — length wins.
    expect(validatePassword("abc")).toBe("Şifre en az 8 karakter olmalı.");
  });

  it("accepts a password satisfying all four rules", () => {
    expect(validatePassword("Guclu1Sifre")).toBeUndefined();
  });

  it("accepts Turkish-specific casing", () => {
    expect(validatePassword("İstanbul1")).toBeUndefined();
    expect(validatePassword("ÇĞÖŞÜ1abc")).toBeUndefined();
  });
});

describe("evaluatePasswordRules", () => {
  it("reports nothing satisfied for an empty password", () => {
    expect(evaluatePasswordRules("").every((rule) => !rule.satisfied)).toBe(true);
  });

  it("reports everything satisfied exactly when validatePassword passes", () => {
    const password = "Guclu1Sifre";
    expect(evaluatePasswordRules(password).every((rule) => rule.satisfied)).toBe(true);
    expect(validatePassword(password)).toBeUndefined();
  });

  it("ticks rules independently as they are met", () => {
    const result = evaluatePasswordRules("abcdefgh");
    const byId = Object.fromEntries(result.map((rule) => [rule.id, rule.satisfied]));
    expect(byId.length).toBe(true);
    expect(byId.lowercase).toBe(true);
    expect(byId.uppercase).toBe(false);
    expect(byId.number).toBe(false);
  });

  it("returns one entry per rule, carrying the same hints", () => {
    expect(evaluatePasswordRules("x").map((rule) => rule.hint)).toEqual(
      PASSWORD_RULES.map((rule) => rule.hint),
    );
  });
});

describe("USERNAME_HINT states the rule the validator actually enforces", () => {
  it("names the length bounds and the allowed characters", () => {
    expect(USERNAME_HINT).toContain("3-20");
    expect(USERNAME_HINT).toContain("_");
  });

  it("describes a username the validator accepts, and excludes ones it rejects", () => {
    expect(validateUsername("abc")).toBeUndefined();
    expect(validateUsername("a".repeat(20))).toBeUndefined();
    expect(validateUsername("ab")).toBeDefined();
    expect(validateUsername("a".repeat(21))).toBeDefined();
    expect(validateUsername("has space")).toBeDefined();
    expect(validateUsername("has-dash")).toBeDefined();
  });
});
