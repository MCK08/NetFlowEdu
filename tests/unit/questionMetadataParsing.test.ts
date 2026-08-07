import {
  parseChoicesFromUnknown as toChoices,
  parseCorrectChoiceFromUnknown as toCorrectChoice,
} from "@features/questions/services/multipleChoice";

// Phase 21 — these two functions are the READ half of question metadata
// serialization, used by both questions.ts's toQuestion and
// savedQuestions.ts's toQuestion. Whatever createQuestion wrote (via
// multipleChoice.ts's buildChoicesPayload), parseChoicesFromUnknown/
// parseCorrectChoiceFromUnknown must parse back into the exact same shape,
// AND must never crash or misbehave on a document that predates this phase
// entirely (no `choices`/`correctChoice` field at all) or on a
// hand-edited/corrupted one. Aliased to toChoices/toCorrectChoice below
// purely to keep this file's own test descriptions readable.

describe("toChoices — reading a question document's choices field", () => {
  it("parses a well-formed choices map written by buildChoicesPayload", () => {
    expect(toChoices({ A: "Paris", B: "London" })).toEqual({ A: "Paris", B: "London" });
  });

  it("returns null for a pre-Phase-21 document with no choices field at all", () => {
    expect(toChoices(undefined)).toBeNull();
  });

  it("returns null for an explicit null (every question without multiple choice)", () => {
    expect(toChoices(null)).toBeNull();
  });

  it("does not crash on a corrupted/unexpected shape — string, number, array", () => {
    expect(() => toChoices("not-an-object")).not.toThrow();
    expect(toChoices("not-an-object")).toBeNull();
    expect(() => toChoices(42)).not.toThrow();
    expect(toChoices(42)).toBeNull();
    expect(() => toChoices([1, 2, 3])).not.toThrow();
  });

  it("drops empty-string options and non-string values defensively", () => {
    expect(toChoices({ A: "Paris", B: "", C: 42, D: "London" })).toEqual({ A: "Paris", D: "London" });
  });

  it("collapses to null if fewer than 2 options survive sanitization", () => {
    expect(toChoices({ A: "Paris", B: "" })).toBeNull();
  });
});

describe("toCorrectChoice — reading a question document's correctChoice field", () => {
  const choices = { A: "Paris", B: "London" };

  it("parses a correctChoice that names a real option", () => {
    expect(toCorrectChoice("A", choices)).toBe("A");
  });

  it("returns null when choices itself is null — a stray correctChoice on a legacy document is never trusted", () => {
    expect(toCorrectChoice("A", null)).toBeNull();
  });

  it("returns null for a pre-Phase-21 document with no correctChoice field at all", () => {
    expect(toCorrectChoice(undefined, choices)).toBeNull();
  });

  it("returns null for a correctChoice naming an option that isn't actually present", () => {
    expect(toCorrectChoice("C", choices)).toBeNull();
  });

  it("does not crash on a corrupted/unexpected shape", () => {
    expect(() => toCorrectChoice(42, choices)).not.toThrow();
    expect(toCorrectChoice(42, choices)).toBeNull();
    expect(() => toCorrectChoice({ nested: true }, choices)).not.toThrow();
  });
});
