import {
  ChoiceFeedbackEntry,
  hasChoiceFeedback,
  MAX_CHOICE_FEEDBACK_LENGTH,
  MAX_CONCEPT_KEY_LENGTH,
  normalizeConceptKey,
  parseChoiceFeedbackFromUnknown,
  QuestionChoiceFeedback,
  resolveChoiceFeedback,
  sanitizeChoiceFeedback,
} from "../../src/features/questions/services/choiceFeedback";
import { parseHintsFromUnknown, sanitizeHints } from "../../src/features/questions/services/questionHints";
import { ChoiceLabel, QuestionChoices } from "../../src/types/question";

const CHOICES: QuestionChoices = { A: "3", B: "4", C: "7", D: "10" };
const CORRECT: ChoiceLabel = "B";

function entry(text: string, conceptKey: string | null = null) {
  return { text, conceptKey };
}

function sanitize(
  raw: Partial<Record<ChoiceLabel, unknown>>,
  choices: QuestionChoices | null = CHOICES,
  correct: ChoiceLabel | null = CORRECT,
) {
  return sanitizeChoiceFeedback(raw, choices, correct);
}

function resolve(
  feedback: QuestionChoiceFeedback | null,
  selected: ChoiceLabel | null,
  choices: QuestionChoices | null = CHOICES,
  correct: ChoiceLabel | null = CORRECT,
): ChoiceFeedbackEntry | null {
  return resolveChoiceFeedback({ choices, correctChoice: correct, choiceFeedback: feedback }, selected);
}

describe("choice feedback — legacy and empty questions", () => {
  // §16 — a question from before this phase must behave exactly as it did.
  it("a question with no feedback field parses to null", () => {
    expect(parseChoiceFeedbackFromUnknown(undefined, CHOICES, CORRECT)).toBeNull();
    expect(parseChoiceFeedbackFromUnknown(null, CHOICES, CORRECT)).toBeNull();
  });

  it("an empty mapping is null, not an empty object", () => {
    expect(sanitize({})).toBeNull();
    expect(parseChoiceFeedbackFromUnknown({}, CHOICES, CORRECT)).toBeNull();
  });

  it("resolves to null for every option on a legacy question", () => {
    for (const label of ["A", "B", "C", "D"] as ChoiceLabel[]) {
      expect(resolve(null, label)).toBeNull();
    }
  });

  it("hasChoiceFeedback is false for absent or empty mappings", () => {
    expect(hasChoiceFeedback(null)).toBe(false);
    expect(hasChoiceFeedback(undefined)).toBe(false);
    expect(hasChoiceFeedback({})).toBe(false);
  });
});

describe("choice feedback — sanitization", () => {
  it("keeps an authored note on a real wrong option", () => {
    const result = sanitize({ C: entry("6'yı karşı tarafa geçirirken işlemi kontrol et.") });
    expect(result?.C?.text).toBe("6'yı karşı tarafa geçirirken işlemi kontrol et.");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitize({ C: entry("   kontrol et.   ") })?.C?.text).toBe("kontrol et.");
  });

  it("drops blank and whitespace-only text", () => {
    expect(sanitize({ C: entry(""), D: entry("   \n  ") })).toBeNull();
  });

  it("drops non-string and malformed entries rather than coercing them", () => {
    expect(sanitize({ C: "a string, not an entry", D: 42, A: null } as never)).toBeNull();
    expect(sanitize({ C: { conceptKey: "x" } } as never)).toBeNull();
  });

  it("caps overlong text at the declared bound", () => {
    const long = "x".repeat(MAX_CHOICE_FEEDBACK_LENGTH + 80);
    expect(sanitize({ C: entry(long) })?.C?.text).toHaveLength(MAX_CHOICE_FEEDBACK_LENGTH);
  });

  it("keeps several mapped distractors independently", () => {
    const result = sanitize({ A: entry("A notu"), C: entry("C notu"), D: entry("D notu") });
    expect(result?.A?.text).toBe("A notu");
    expect(result?.C?.text).toBe("C notu");
    expect(result?.D?.text).toBe("D notu");
  });

  // §14 — an entry can only ever name an option that really exists.
  it("drops an entry for a label this question has no option for", () => {
    expect(sanitize({ E: entry("E notu") })).toBeNull();
  });

  it("drops an entry whose option is present but blank", () => {
    expect(sanitize({ C: entry("C notu") }, { A: "3", B: "4", C: "   " })).toBeNull();
  });

  // §38 — this is wrong-answer guidance; a note on the right answer has no
  // moment at which to appear and its meaning would move with correctChoice.
  it("drops an entry on the correct choice", () => {
    expect(sanitize({ B: entry("B notu") })).toBeNull();
  });

  it("returns null when there are no choices at all", () => {
    expect(sanitize({ C: entry("C notu") }, null)).toBeNull();
  });

  // §27 — purity.
  it("does not mutate its inputs", () => {
    const raw = { C: entry("C notu") };
    const rawCopy = JSON.parse(JSON.stringify(raw));
    const choices: QuestionChoices = { ...CHOICES };
    const choicesCopy = { ...CHOICES };
    sanitizeChoiceFeedback(raw, choices, CORRECT);
    expect(raw).toEqual(rawCopy);
    expect(choices).toEqual(choicesCopy);
  });

  it("is deterministic", () => {
    const raw = { A: entry("A"), C: entry("C", "Sign Transfer Error") };
    expect(sanitize(raw)).toEqual(sanitize(raw));
  });
});

describe("choice feedback — untrusted stored shapes", () => {
  it("rejects arrays and primitives", () => {
    for (const value of [[], "x", 42, true]) {
      expect(parseChoiceFeedbackFromUnknown(value, CHOICES, CORRECT)).toBeNull();
    }
  });

  it("ignores unknown keys instead of inventing a sixth option", () => {
    const parsed = parseChoiceFeedbackFromUnknown(
      { C: entry("C notu"), Z: entry("Z notu"), "": entry("blank"), __proto__: { polluted: true } },
      CHOICES,
      CORRECT,
    );
    expect(Object.keys(parsed ?? {})).toEqual(["C"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("applies the same option and correct-choice rules on read as on write", () => {
    // A document that went stale: it still names D, but D is now the answer.
    const parsed = parseChoiceFeedbackFromUnknown({ D: entry("D notu") }, CHOICES, "D");
    expect(parsed).toBeNull();
  });

  it("round trips a sanitized mapping unchanged", () => {
    const written = sanitize({ C: entry("C notu", "sign_transfer_error") });
    expect(parseChoiceFeedbackFromUnknown(written, CHOICES, CORRECT)).toEqual(written);
  });
});

// §56 — the association must never silently move to a different option.
describe("choice feedback — choice edits", () => {
  it("keeps a note on its own label when that option's TEXT is edited", () => {
    const stored = sanitize({ C: entry("C notu") });
    const edited: QuestionChoices = { ...CHOICES, C: "7.5" };
    expect(resolve(stored, "C", edited)?.text).toBe("C notu");
    expect(resolve(stored, "A", edited)).toBeNull();
    expect(resolve(stored, "D", edited)).toBeNull();
  });

  it("drops a note when its option is removed", () => {
    const stored = sanitize({ C: entry("C notu") });
    const shrunk: QuestionChoices = { A: "3", B: "4", D: "10" };
    expect(parseChoiceFeedbackFromUnknown(stored, shrunk, CORRECT)).toBeNull();
    expect(resolve(stored, "C", shrunk)).toBeNull();
  });

  it("a note never migrates to a newly added option", () => {
    const stored = sanitize({ C: entry("C notu") });
    const grown: QuestionChoices = { ...CHOICES, E: "12" };
    expect(resolve(stored, "E", grown)).toBeNull();
    expect(resolve(stored, "C", grown)?.text).toBe("C notu");
  });

  it("stops resolving once its option becomes the correct answer", () => {
    const stored = sanitize({ C: entry("C notu") });
    expect(resolve(stored, "C", CHOICES, "C")).toBeNull();
    // …and the other mapped options are unaffected by that move.
    const two = sanitize({ A: entry("A notu"), C: entry("C notu") });
    expect(resolve(two, "A", CHOICES, "C")?.text).toBe("A notu");
  });

  it("survives the correct answer moving to a previously unmapped option", () => {
    const stored = sanitize({ C: entry("C notu") });
    expect(resolve(stored, "C", CHOICES, "D")?.text).toBe("C notu");
  });
});

// §58 — the single most important guarantee on screen.
describe("choice feedback — resolution never crosses options", () => {
  const stored = sanitize({ A: entry("A notu"), C: entry("C notu"), D: entry("D notu") });

  it("returns only the picked option's own note", () => {
    expect(resolve(stored, "A")?.text).toBe("A notu");
    expect(resolve(stored, "C")?.text).toBe("C notu");
    expect(resolve(stored, "D")?.text).toBe("D notu");
  });

  it("returns null for an unmapped wrong option rather than a neighbour's note", () => {
    const sparse = sanitize({ C: entry("C notu") });
    expect(resolve(sparse, "A")).toBeNull();
    expect(resolve(sparse, "D")).toBeNull();
  });

  it("returns null for the correct answer", () => {
    expect(resolve(stored, "B")).toBeNull();
  });

  // §57 — before commit there is no selection, so there is nothing to show.
  it("returns null when nothing has been selected yet", () => {
    expect(resolve(stored, null)).toBeNull();
  });

  it("returns null for a label that is not an option on this question", () => {
    expect(resolve(stored, "E")).toBeNull();
    expect(resolve(stored, "Z" as ChoiceLabel)).toBeNull();
  });

  it("never returns an entry whose text is blank", () => {
    expect(
      resolve(
        { C: { text: "   ", conceptKey: null, semanticDefinitionId: null, semanticLabel: null } },
        "C",
      ),
    ).toBeNull();
  });
});

// §20-§23 — the authored semantic key.
describe("choice feedback — semantic identifier", () => {
  it("normalises an authored key to a stable slug", () => {
    expect(normalizeConceptKey("Sign Transfer Error")).toBe("sign_transfer_error");
    expect(normalizeConceptKey("sign-transfer-error")).toBe("sign_transfer_error");
    expect(normalizeConceptKey("  SIGN__transfer  ")).toBe("sign_transfer");
  });

  it("returns null rather than guessing at unusable input", () => {
    for (const value of ["", "   ", "!!!", "___", 42, null, undefined, {}]) {
      expect(normalizeConceptKey(value)).toBeNull();
    }
  });

  it("caps the key length", () => {
    expect(normalizeConceptKey("a".repeat(MAX_CONCEPT_KEY_LENGTH + 30))).toHaveLength(
      MAX_CONCEPT_KEY_LENGTH,
    );
  });

  it("carries an authored key through sanitize and resolve", () => {
    const stored = sanitize({ C: entry("C notu", "Sign Transfer Error") });
    expect(resolve(stored, "C")?.conceptKey).toBe("sign_transfer_error");
  });

  it("is null when the author typed none, and never derived from any text", () => {
    const stored = sanitize({ C: entry("6'yı karşı tarafa geçirirken işlemi kontrol et.") });
    expect(resolve(stored, "C")?.conceptKey).toBeNull();
  });

  it("two authors reusing a key land on the same identity", () => {
    const one = sanitize({ C: entry("x", "denominator addition") });
    const two = sanitize({ A: entry("y", "Denominator-Addition") });
    expect(one?.C?.conceptKey).toBe(two?.A?.conceptKey);
  });
});

// §60 — the two authored channels must stay separate systems.
describe("choice feedback — separate from hints", () => {
  it("a question can carry both, resolved independently", () => {
    const hints = sanitizeHints(["Önce 2x = 8 adımına ulaş.", "İki tarafı 2'ye böl."]);
    const feedback = sanitize({ C: entry("İşaret değişimini kontrol et.") });

    expect(hints).toHaveLength(2);
    expect(resolve(feedback, "C")?.text).toBe("İşaret değişimini kontrol et.");
    // Neither resolver can see the other's data.
    expect(parseHintsFromUnknown(feedback)).toEqual([]);
    expect(parseChoiceFeedbackFromUnknown(hints, CHOICES, CORRECT)).toBeNull();
  });

  it("hints exist before an answer; feedback needs a committed selection", () => {
    const hints = sanitizeHints(["İpucu"]);
    const feedback = sanitize({ C: entry("Geri bildirim") });
    // No selection yet: hints are available, feedback is not.
    expect(hints).toHaveLength(1);
    expect(resolve(feedback, null)).toBeNull();
  });
});
