// Phase 78 — the server's decision about whether a pick carries authored
// meaning worth remembering.
//
// The security-shaped tests matter most here: a client contributes a LABEL and
// nothing else, so every one of these is really asking "can a caller make the
// server write down something the author never said?"

import {
  normalizeConceptKey,
  resolveSemanticChoiceEvidence,
  SEMANTIC_CHOICE_SCHEMA_VERSION,
} from "../../functions/src/study/semanticChoiceEvidence";
// The client-side original this file deliberately mirrors. Imported so the two
// are pinned against the same inputs rather than trusted to stay in step.
import { normalizeConceptKey as clientNormalizeConceptKey } from "../../src/features/questions/services/choiceFeedback";

const QUESTION = {
  ownerId: "teacher-1",
  choices: { A: "3x", B: "-3x", C: "x/3", D: "3/x" },
  correctChoice: "A",
  choiceFeedback: {
    B: { text: "İşareti taşırken yön değişmez.", conceptKey: "sign_transfer_error" },
    C: { text: "Bölme değil çarpma var.", conceptKey: null },
    D: { text: "Payda ile pay yer değiştirmiş." },
  },
};

function resolve(selectedChoice: unknown, question: object = QUESTION) {
  return resolveSemanticChoiceEvidence({ question, selectedChoice });
}

describe("normalizeConceptKey mirrors the client implementation", () => {
  const cases = [
    "sign_transfer_error",
    "Sign Transfer Error",
    "sign-transfer-error",
    "  SIGN__transfer  ",
    "İşaret",
    "",
    "___",
    "a".repeat(80),
  ];

  it("agrees with choiceFeedback.ts on every input", () => {
    for (const input of cases) {
      expect(normalizeConceptKey(input)).toBe(clientNormalizeConceptKey(input));
    }
  });

  it("agrees on non-string input", () => {
    for (const input of [null, undefined, 42, {}, []]) {
      expect(normalizeConceptKey(input)).toBe(clientNormalizeConceptKey(input));
    }
  });
});

describe("a wrong pick with an authored key", () => {
  it("produces verified evidence", () => {
    expect(resolve("B")).toEqual({
      // Phase 80 — the kind is explicit now. A legacy event without it is read
      // as "author", which is exactly what those events were.
      namespaceKind: "author",
      namespaceId: "teacher-1",
      conceptKey: "sign_transfer_error",
      choiceLabel: "B",
      schemaVersion: SEMANTIC_CHOICE_SCHEMA_VERSION,
    });
  });

  it("takes the namespace from the question, never from anywhere else", () => {
    expect(resolve("B")?.namespaceId).toBe("teacher-1");
    expect(resolve("B", { ...QUESTION, ownerId: "teacher-2" })?.namespaceId).toBe("teacher-2");
  });

  it("re-normalises a key that was stored unnormalised", () => {
    const question = {
      ...QUESTION,
      choiceFeedback: { B: { text: "x", conceptKey: "Sign Transfer Error" } },
    };
    expect(resolve("B", question)?.conceptKey).toBe("sign_transfer_error");
  });
});

describe("picks that must record nothing", () => {
  it("the correct answer", () => {
    expect(resolve("A")).toBeNull();
  });

  it("a wrong answer the author gave no key for", () => {
    expect(resolve("C")).toBeNull();
  });

  it("a wrong answer whose feedback entry omits conceptKey entirely", () => {
    expect(resolve("D")).toBeNull();
  });

  it("a label that names no option on this question", () => {
    expect(resolve("E")).toBeNull();
  });

  it("no pick at all", () => {
    expect(resolve(undefined)).toBeNull();
    expect(resolve(null)).toBeNull();
  });

  it("a question with no authored feedback at all (legacy)", () => {
    expect(resolve("B", { ...QUESTION, choiceFeedback: undefined })).toBeNull();
  });

  it("a question with no choices at all (non-multiple-choice)", () => {
    expect(resolve("B", { ...QUESTION, choices: undefined })).toBeNull();
  });

  it("a question whose correct answer is unknown", () => {
    // Without knowing which option is right, "this was wrong" is not something
    // the server can verify — and Phase 78 records only what it can verify.
    expect(resolve("B", { ...QUESTION, correctChoice: null })).toBeNull();
  });

  it("a question with no usable owner, so there is no namespace", () => {
    expect(resolve("B", { ...QUESTION, ownerId: "" })).toBeNull();
    expect(resolve("B", { ...QUESTION, ownerId: "   " })).toBeNull();
    expect(resolve("B", { ...QUESTION, ownerId: undefined })).toBeNull();
  });

  it("an option whose text was blanked out", () => {
    expect(resolve("B", { ...QUESTION, choices: { ...QUESTION.choices, B: "   " } })).toBeNull();
  });

  it("a feedback entry with a key but no authored sentence", () => {
    const question = {
      ...QUESTION,
      choiceFeedback: { B: { text: "  ", conceptKey: "sign_transfer_error" } },
    };
    expect(resolve("B", question)).toBeNull();
  });
});

describe("a caller cannot assert meaning", () => {
  it("ignores a forged label that is not a choice label", () => {
    for (const forged of ["F", "a", 1, {}, [], true, "B "]) {
      expect(resolve(forged)).toBeNull();
    }
  });

  it("never re-points an unusable pick at a neighbouring option", () => {
    // C has feedback but no key, E does not exist. Neither may borrow B's.
    expect(resolve("C")).toBeNull();
    expect(resolve("E")).toBeNull();
  });

  it("reads the key from the question, not from anything the caller supplies", () => {
    // Whatever a caller might smuggle alongside, only the question document is
    // consulted — the resolver has no parameter for a claimed meaning at all.
    const evidence = resolveSemanticChoiceEvidence({
      question: QUESTION,
      selectedChoice: "B",
    });
    expect(evidence?.conceptKey).toBe("sign_transfer_error");
  });

  it("cannot be fed a meaning through a malformed feedback shape", () => {
    for (const feedback of ["sign_transfer_error", 42, [], null]) {
      expect(resolve("B", { ...QUESTION, choiceFeedback: feedback })).toBeNull();
    }
  });

  it("ignores a feedback entry that is not an object", () => {
    expect(resolve("B", { ...QUESTION, choiceFeedback: { B: "sign_transfer_error" } })).toBeNull();
  });
});

describe("determinism", () => {
  it("returns the same evidence for the same inputs", () => {
    expect(resolve("B")).toEqual(resolve("B"));
  });

  it("carries the picked label so two occurrences in one question stay distinguishable", () => {
    const question = {
      ...QUESTION,
      choiceFeedback: {
        B: { text: "x", conceptKey: "sign_transfer_error" },
        C: { text: "y", conceptKey: "sign_transfer_error" },
      },
    };
    expect(resolve("B", question)?.choiceLabel).toBe("B");
    expect(resolve("C", question)?.choiceLabel).toBe("C");
  });
});
