import {
  buildChoicesPayload,
  evaluateChoice,
  hasMultipleChoice,
  isValidCorrectChoice,
  sanitizeChoices,
} from "@features/questions/services/multipleChoice";

describe("sanitizeChoices", () => {
  it("trims and keeps options with 2+ non-empty values", () => {
    expect(sanitizeChoices({ A: " Paris ", B: "London" })).toEqual({ A: "Paris", B: "London" });
  });

  it("drops empty/whitespace-only options", () => {
    expect(sanitizeChoices({ A: "Paris", B: "   ", C: "London" })).toEqual({ A: "Paris", C: "London" });
  });

  it("returns null for a single filled option — multiple choice needs 2+", () => {
    expect(sanitizeChoices({ A: "Paris" })).toBeNull();
  });

  it("returns null for no options at all", () => {
    expect(sanitizeChoices({})).toBeNull();
    expect(sanitizeChoices(null)).toBeNull();
    expect(sanitizeChoices(undefined)).toBeNull();
  });

  it("accepts up to all five options", () => {
    expect(sanitizeChoices({ A: "a", B: "b", C: "c", D: "d", E: "e" })).toEqual({
      A: "a",
      B: "b",
      C: "c",
      D: "d",
      E: "e",
    });
  });
});

describe("hasMultipleChoice", () => {
  it("is false for null (the legacy/no-MC question shape)", () => {
    expect(hasMultipleChoice(null)).toBe(false);
    expect(hasMultipleChoice(undefined)).toBe(false);
  });

  it("is false for fewer than 2 real options", () => {
    expect(hasMultipleChoice({ A: "Paris" })).toBe(false);
    expect(hasMultipleChoice({ A: "Paris", B: "" })).toBe(false);
  });

  it("is true for 2+ real options", () => {
    expect(hasMultipleChoice({ A: "Paris", B: "London" })).toBe(true);
  });
});

describe("isValidCorrectChoice", () => {
  const choices = { A: "Paris", B: "London" };

  it("accepts a correctChoice that names a real, non-empty option", () => {
    expect(isValidCorrectChoice(choices, "A")).toBe(true);
  });

  it("rejects a correctChoice naming an option that isn't present", () => {
    expect(isValidCorrectChoice(choices, "C")).toBe(false);
  });

  it("rejects a correctChoice when choices is null", () => {
    expect(isValidCorrectChoice(null, "A")).toBe(false);
  });

  it("rejects an empty/missing correctChoice", () => {
    expect(isValidCorrectChoice(choices, null)).toBe(false);
    expect(isValidCorrectChoice(choices, undefined)).toBe(false);
    expect(isValidCorrectChoice(choices, "")).toBe(false);
  });

  it("rejects a value that isn't a legal choice label at all", () => {
    expect(isValidCorrectChoice(choices, "Z")).toBe(false);
  });
});

describe("buildChoicesPayload", () => {
  it("pairs sanitized choices with a valid correctChoice", () => {
    expect(buildChoicesPayload({ A: "Paris", B: "London" }, "A")).toEqual({
      choices: { A: "Paris", B: "London" },
      correctChoice: "A",
    });
  });

  it("drops correctChoice without choices — never saves an orphaned correctChoice", () => {
    expect(buildChoicesPayload(null, "A")).toEqual({ choices: null, correctChoice: null });
  });

  it("drops choices without a valid correctChoice — never saves choices with no answer", () => {
    expect(buildChoicesPayload({ A: "Paris", B: "London" }, null)).toEqual({
      choices: { A: "Paris", B: "London" },
      correctChoice: null,
    });
  });

  it("rejects a correctChoice pointing at an option that got sanitized away", () => {
    // B was typed then cleared — sanitizeChoices drops it, so a stale
    // correctChoice: "B" must not survive either.
    expect(buildChoicesPayload({ A: "Paris", B: "   ", C: "London" }, "B")).toEqual({
      choices: { A: "Paris", C: "London" },
      correctChoice: null,
    });
  });

  it("collapses a single-option draft to legacy (no multiple choice at all)", () => {
    expect(buildChoicesPayload({ A: "Paris" }, "A")).toEqual({ choices: null, correctChoice: null });
  });
});

describe("evaluateChoice", () => {
  it("marks the correct pick as correct", () => {
    expect(evaluateChoice("B", "B")).toBe("correct");
  });

  it("marks any other pick as incorrect", () => {
    expect(evaluateChoice("B", "A")).toBe("incorrect");
  });

  it("marks every pick incorrect when there is no correctChoice at all", () => {
    expect(evaluateChoice(null, "A")).toBe("incorrect");
  });
});
