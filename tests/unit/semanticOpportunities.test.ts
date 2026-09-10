// Phase 79 — what the server records about the distractors that were ON OFFER.
//
// The gating tests matter most. An opportunity payload is the evidence a later
// recovery claim rests on, so every case where it must NOT be written is a case
// where a recovery claim would otherwise be built on nothing.

import {
  MAX_SEMANTIC_OPPORTUNITIES,
  resolveSemanticOpportunities,
  SEMANTIC_CHOICE_SCHEMA_VERSION,
} from "../../functions/src/study/semanticChoiceEvidence";

const QUESTION = {
  ownerId: "teacher-1",
  choices: { A: "3", B: "4", C: "7", D: "10" },
  correctChoice: "B",
  choiceFeedback: {
    A: { text: "İşaret hatası.", conceptKey: "sign_transfer_error" },
    C: { text: "Anahtarsız açıklama.", conceptKey: null },
    D: { text: "Bölme atlanmış.", conceptKey: "missing_division_step" },
  },
};

function resolve(selectedChoice: unknown, question: object = QUESTION) {
  return resolveSemanticOpportunities({ question, selectedChoice });
}

describe("what was on offer", () => {
  it("records every authored meaning that was selectable and wrong", () => {
    expect(resolve("C")).toEqual({
      namespaceId: "teacher-1",
      conceptKeys: ["missing_division_step", "sign_transfer_error"],
      selectedChoice: "C",
      schemaVersion: SEMANTIC_CHOICE_SCHEMA_VERSION,
    });
  });

  it("records the meaning the student DID take alongside the others", () => {
    // Taking A does not remove A from what was offered — the opportunity set
    // is about the page, not about the outcome.
    expect(resolve("A")?.conceptKeys).toEqual([
      "missing_division_step",
      "sign_transfer_error",
    ]);
  });

  it("records opportunities even when the student answered correctly", () => {
    // This is the single most valuable event Phase 79 produces: the traps were
    // on the page and none was taken. Tying it to the presence of a selected
    // MEANING would have thrown it away.
    const result = resolve("B");
    expect(result?.selectedChoice).toBe("B");
    expect(result?.conceptKeys).toContain("sign_transfer_error");
  });

  it("sorts keys so the stored bytes are deterministic", () => {
    expect(resolve("C")?.conceptKeys).toEqual([...(resolve("C")?.conceptKeys ?? [])].sort());
  });

  it("takes the namespace from the question", () => {
    expect(resolve("C", { ...QUESTION, ownerId: "teacher-9" })?.namespaceId).toBe("teacher-9");
  });
});

describe("what is never an opportunity", () => {
  it("the correct answer, even if it somehow carried feedback with a key", () => {
    const question = {
      ...QUESTION,
      choiceFeedback: {
        ...QUESTION.choiceFeedback,
        B: { text: "Doğru cevabın açıklaması.", conceptKey: "should_never_appear" },
      },
    };
    expect(resolve("C", question)?.conceptKeys).not.toContain("should_never_appear");
  });

  it("a wrong option whose author wrote no key", () => {
    // C has feedback but conceptKey null.
    expect(resolve("A")?.conceptKeys).not.toContain("");
    expect(resolve("A")?.conceptKeys).toHaveLength(2);
  });

  it("an option that does not exist on the question", () => {
    const question = { ...QUESTION, choices: { A: "3", B: "4" } };
    // D's feedback is stranded because D is no longer an option.
    expect(resolve("A", question)?.conceptKeys).toEqual(["sign_transfer_error"]);
  });

  it("an option whose text was blanked out", () => {
    const question = { ...QUESTION, choices: { ...QUESTION.choices, D: "   " } };
    expect(resolve("A", question)?.conceptKeys).toEqual(["sign_transfer_error"]);
  });

  it("a feedback entry with a key but no authored sentence", () => {
    const question = {
      ...QUESTION,
      choiceFeedback: { A: { text: "  ", conceptKey: "sign_transfer_error" } },
    };
    expect(resolve("C", question)).toBeNull();
  });
});

// The gate that keeps "did not engage" from becoming "declined".
describe("no pick, no opportunity", () => {
  it("records nothing when no choice was made", () => {
    // A student can record an outcome on a multiple-choice question through the
    // rating control without ever touching the options. The distractors were on
    // the page, but they were never offered as a decision.
    expect(resolve(undefined)).toBeNull();
    expect(resolve(null)).toBeNull();
  });

  it("records nothing for a label that is not a real choice label", () => {
    for (const forged of ["Z", "a", 1, {}, [], true]) {
      expect(resolve(forged)).toBeNull();
    }
  });

  it("records nothing for a label naming no option on this question", () => {
    expect(resolve("E")).toBeNull();
  });
});

describe("questions that carry no semantic distractors", () => {
  it("records nothing for a legacy question with no feedback", () => {
    expect(resolve("A", { ...QUESTION, choiceFeedback: undefined })).toBeNull();
  });

  it("records nothing when every wrong option lacks a key", () => {
    const question = {
      ...QUESTION,
      choiceFeedback: { A: { text: "x", conceptKey: null }, D: { text: "y" } },
    };
    expect(resolve("A", question)).toBeNull();
  });

  it("records nothing for a non-multiple-choice question", () => {
    expect(resolve("A", { ...QUESTION, choices: undefined })).toBeNull();
  });

  it("records nothing when the correct answer is unknown", () => {
    // Without knowing which option is right, no option can be verified WRONG,
    // so nothing here is a verified distractor.
    expect(resolve("A", { ...QUESTION, correctChoice: null })).toBeNull();
  });

  it("records nothing when the question has no usable owner", () => {
    expect(resolve("A", { ...QUESTION, ownerId: "  " })).toBeNull();
  });
});

describe("deduplication and bounds", () => {
  it("counts one meaning once even when two options carry it", () => {
    // The student was offered that meaning ONCE. Counting it twice would
    // inflate every later decline.
    const question = {
      ...QUESTION,
      choiceFeedback: {
        A: { text: "x", conceptKey: "sign_transfer_error" },
        C: { text: "y", conceptKey: "sign_transfer_error" },
        D: { text: "z", conceptKey: "Sign Transfer Error" },
      },
    };
    expect(resolve("B", question)?.conceptKeys).toEqual(["sign_transfer_error"]);
  });

  it("cannot exceed the number of wrong options a question can have", () => {
    const question = {
      ownerId: "teacher-1",
      choices: { A: "1", B: "2", C: "3", D: "4", E: "5" },
      correctChoice: "E",
      choiceFeedback: {
        A: { text: "a", conceptKey: "k_a" },
        B: { text: "b", conceptKey: "k_b" },
        C: { text: "c", conceptKey: "k_c" },
        D: { text: "d", conceptKey: "k_d" },
      },
    };
    const keys = resolve("A", question)?.conceptKeys ?? [];
    expect(keys).toHaveLength(4);
    expect(keys.length).toBeLessThanOrEqual(MAX_SEMANTIC_OPPORTUNITIES);
  });
});

describe("a caller cannot declare what was offered", () => {
  it("reads the option set from the question, never from the request", () => {
    // The resolver has no parameter for a claimed opportunity set at all, so
    // there is nowhere to put one. This pins that shape.
    const result = resolveSemanticOpportunities({
      question: QUESTION,
      selectedChoice: "C",
    });
    expect(result?.conceptKeys).toEqual(["missing_division_step", "sign_transfer_error"]);
  });

  it("ignores a malformed feedback map rather than trusting it", () => {
    for (const feedback of ["sign_transfer_error", 42, [], null, { A: "raw string" }]) {
      expect(resolve("C", { ...QUESTION, choiceFeedback: feedback })).toBeNull();
    }
  });
});
