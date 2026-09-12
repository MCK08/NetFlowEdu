import { MAX_HINT_LENGTH, MAX_QUESTION_HINTS } from "../../src/features/questions/services/questionHints";
import {
  buildQuestionUpdatePatch,
  createQuestionRevisionDraft,
  draftHasChoices,
  feedbackEligibleLabels,
  hintDraftBoxes,
  isRevisionDirty,
  isSemanticMappingChanged,
  MAX_QUESTION_DESCRIPTION_LENGTH,
  QUESTION_UPDATE_ALLOWLIST,
  QuestionRevisionDraft,
  REMAP_TRUST_NOTE,
  REVISION_TRUST_NOTE,
  sanitizeQuestionRevision,
  validateQuestionRevision,
} from "../../src/features/questions/services/questionRevision";
import { Question } from "../../src/types/question";

// Phase 86 — the pure half of question revision. Every rule the editor and
// updateQuestion rely on is asserted here without React or Firestore.

const DEF_A = "def-a";
const DEF_B = "def-b";

function question(over: Partial<Question> = {}): Question {
  return {
    id: "q1",
    ownerId: "teacher-1",
    organizationId: "org",
    visibility: "class",
    imageUrl: "https://example.test/q.png",
    classId: "class-1",
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "9",
    description: "2x + 6 = 14 ise x kaçtır?",
    posterRole: "teacher",
    createdAt: 1_700_000_000_000,
    likeCount: 3,
    commentCount: 1,
    answerCount: 2,
    choices: { A: "3", B: "4", C: "7", D: "10" },
    correctChoice: "B",
    hints: ["Sabiti karşı tarafa geçir."],
    choiceFeedback: {
      A: { text: "İşareti kontrol et.", semanticDefinitionId: DEF_A, semanticLabel: "İşaret aktarımı", conceptKey: null },
      D: { text: "Bölmeyi atlamış olabilirsin.", semanticDefinitionId: null, semanticLabel: null, conceptKey: "missing_division" },
    },
    ...over,
  };
}

function draftOf(q: Question = question()): QuestionRevisionDraft {
  return createQuestionRevisionDraft(q);
}

describe("question revision — draft", () => {
  it("opens as the question exactly as it is, including legacy and shared notes", () => {
    const d = draftOf();
    expect(d.description).toBe("2x + 6 = 14 ise x kaçtır?");
    expect(d.choices).toEqual({ A: "3", B: "4", C: "7", D: "10" });
    expect(d.correctChoice).toBe("B");
    expect(d.feedback.A?.semanticDefinitionId).toBe(DEF_A);
    expect(d.feedback.D?.conceptKey).toBe("missing_division");
    expect(d.hints).toEqual(["Sabiti karşı tarafa geçir."]);
  });

  it("P1 — an unchanged draft sanitises to the question's own current state", () => {
    const q = question();
    expect(isRevisionDirty(q, draftOf(q))).toBe(false);
    const out = sanitizeQuestionRevision(draftOf(q));
    expect(out.choices).toEqual(q.choices);
    expect(out.correctChoice).toBe("B");
    expect(out.choiceFeedback?.A?.semanticDefinitionId).toBe(DEF_A);
    expect(out.hints).toEqual(q.hints);
  });

  it("does not mutate the question it opens from", () => {
    const q = question();
    const snapshot = JSON.stringify(q);
    const d = draftOf(q);
    d.choices.B = "changed";
    d.feedback.A!.text = "changed";
    d.hints.push("x");
    expect(JSON.stringify(q)).toBe(snapshot);
  });

  it("P18 — the draft cannot carry an immutable field", () => {
    const keys = Object.keys(draftOf()).sort();
    expect(keys).toEqual(["choices", "correctChoice", "description", "feedback", "hints"]);
    for (const forbidden of ["ownerId", "classId", "visibility", "posterRole", "createdAt", "likeCount", "subject", "topic", "gradeLevel", "imageUrl"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe("question revision — edits that must be safe", () => {
  it("P2 — editing the question text is accepted and trimmed", () => {
    const d = draftOf();
    d.description = "  2x + 6 = 14. x = ?  ";
    expect(validateQuestionRevision(d)).toBeNull();
    expect(sanitizeQuestionRevision(d).description).toBe("2x + 6 = 14. x = ?");
    expect(isRevisionDirty(question(), d)).toBe(true);
  });

  it("P3 — editing option A's TEXT keeps A's semantic mapping", () => {
    const d = draftOf();
    d.choices.A = "3 (yeni metin)";
    const out = sanitizeQuestionRevision(d);
    expect(out.choices?.A).toBe("3 (yeni metin)");
    expect(out.choiceFeedback?.A?.semanticDefinitionId).toBe(DEF_A);
    expect(out.choiceFeedback?.A?.text).toBe("İşareti kontrol et.");
  });

  it("P4 — making mapped option A the correct answer removes A's note AND mapping", () => {
    const d = draftOf();
    d.correctChoice = "A";
    const out = sanitizeQuestionRevision(d);
    expect(out.correctChoice).toBe("A");
    expect(out.choiceFeedback?.A).toBeUndefined();
    // …and the other note survives untouched.
    expect(out.choiceFeedback?.D?.conceptKey).toBe("missing_division");
  });

  it("P5 — moving the correct answer away from B does not invent a note on B", () => {
    const d = draftOf();
    d.correctChoice = "C";
    const out = sanitizeQuestionRevision(d);
    expect(out.choiceFeedback?.B).toBeUndefined();
    expect(out.choiceFeedback?.C).toBeUndefined();
    expect(out.choiceFeedback?.A?.semanticDefinitionId).toBe(DEF_A);
  });

  it("P6 — blanking a mapped option removes its note with it", () => {
    const d = draftOf();
    d.choices.A = "   ";
    const out = sanitizeQuestionRevision(d);
    expect(out.choices?.A).toBeUndefined();
    expect(out.choiceFeedback?.A).toBeUndefined();
    expect(Object.keys(out.choices ?? {})).toEqual(["B", "C", "D"]);
  });

  it("P7 — a blank note is dropped", () => {
    const d = draftOf();
    d.feedback.A = { text: "   ", semanticDefinitionId: DEF_A, semanticLabel: "x", conceptKey: null };
    expect(sanitizeQuestionRevision(d).choiceFeedback?.A).toBeUndefined();
  });

  it("P8 — a malformed semantic reference is sanitised by the canonical path", () => {
    const d = draftOf();
    d.feedback.A = { text: "not", semanticDefinitionId: "   ", semanticLabel: "x", conceptKey: null };
    const out = sanitizeQuestionRevision(d);
    expect(out.choiceFeedback?.A?.text).toBe("not");
    expect(out.choiceFeedback?.A?.semanticDefinitionId).toBeNull();
    expect(out.choiceFeedback?.A?.semanticLabel).toBeNull();
  });

  it("P9 — more hints than the ladder holds are cut by the canonical sanitiser", () => {
    const d = draftOf();
    d.hints = ["1", "2", "3", "4", "5"];
    expect(sanitizeQuestionRevision(d).hints).toHaveLength(MAX_QUESTION_HINTS);
  });

  it("P10 — an over-long hint is cut by the canonical sanitiser", () => {
    const d = draftOf();
    d.hints = ["x".repeat(MAX_HINT_LENGTH + 40)];
    expect(sanitizeQuestionRevision(d).hints[0]).toHaveLength(MAX_HINT_LENGTH);
  });

  it("blank hint boxes are dropped so the ladder stays contiguous", () => {
    const d = draftOf();
    d.hints = ["", "İkinci", "   "];
    expect(sanitizeQuestionRevision(d).hints).toEqual(["İkinci"]);
  });

  it("P20 — sanitisation is deterministic", () => {
    const d = draftOf();
    d.choices.A = "yeni";
    d.correctChoice = "C";
    d.hints = ["b", "", "a"];
    expect(sanitizeQuestionRevision(d)).toEqual(sanitizeQuestionRevision(d));
  });
});

describe("question revision — shared semantic mapping", () => {
  it("P11 — a shared definition reference is carried as an opaque id", () => {
    const d = draftOf();
    d.feedback.C = { text: "C notu", semanticDefinitionId: DEF_B, semanticLabel: "Başka", conceptKey: null };
    const out = sanitizeQuestionRevision(d);
    expect(out.choiceFeedback?.C?.semanticDefinitionId).toBe(DEF_B);
    expect(out.choiceFeedback?.C?.semanticLabel).toBe("Başka");
  });

  it("P12 — an archived CURRENT mapping left alone is retained", () => {
    // The draft does not know or care whether DEF_A is archived; nothing in
    // the sanitiser reads definition state, so an untouched reference stays.
    const q = question();
    const out = sanitizeQuestionRevision(draftOf(q));
    expect(out.choiceFeedback?.A?.semanticDefinitionId).toBe(DEF_A);
    expect(isRevisionDirty(q, draftOf(q))).toBe(false);
  });

  it("P14 — two definitions with the same label stay two ids", () => {
    const d = draftOf();
    d.feedback.A = { text: "a", semanticDefinitionId: "def-1", semanticLabel: "Aynı", conceptKey: null };
    d.feedback.C = { text: "c", semanticDefinitionId: "def-2", semanticLabel: "Aynı", conceptKey: null };
    const out = sanitizeQuestionRevision(d);
    expect(out.choiceFeedback?.A?.semanticDefinitionId).toBe("def-1");
    expect(out.choiceFeedback?.C?.semanticDefinitionId).toBe("def-2");
  });

  it("P15 — a legacy private mapping is preserved untouched, never migrated", () => {
    const q = question();
    const out = sanitizeQuestionRevision(draftOf(q));
    expect(out.choiceFeedback?.D?.conceptKey).toBe("missing_division");
    expect(out.choiceFeedback?.D?.semanticDefinitionId).toBeNull();
  });

  it("P16 — a mapping intentionally removed is gone", () => {
    const d = draftOf();
    d.feedback.A = { ...d.feedback.A!, semanticDefinitionId: null, semanticLabel: null };
    const out = sanitizeQuestionRevision(d);
    expect(out.choiceFeedback?.A?.semanticDefinitionId).toBeNull();
    expect(out.choiceFeedback?.A?.text).toBe("İşareti kontrol et.");
    expect(isSemanticMappingChanged(question(), d)).toBe(true);
  });

  it("P17 — A → B remap: the current revision points to B, and only the mapping changed", () => {
    const d = draftOf();
    d.feedback.A = { ...d.feedback.A!, semanticDefinitionId: DEF_B, semanticLabel: "B etiketi" };
    const out = sanitizeQuestionRevision(d);
    expect(out.choiceFeedback?.A?.semanticDefinitionId).toBe(DEF_B);
    expect(out.choiceFeedback?.A?.semanticLabel).toBe("B etiketi");
    expect(isSemanticMappingChanged(question(), d)).toBe(true);
    // A text-only edit is NOT a mapping change.
    const textOnly = draftOf();
    textOnly.feedback.A = { ...textOnly.feedback.A!, text: "different words" };
    expect(isSemanticMappingChanged(question(), textOnly)).toBe(false);
  });

  it("a shared reference wins over a stale private key on the same note (Phase 80 rule)", () => {
    const d = draftOf();
    d.feedback.D = { ...d.feedback.D!, semanticDefinitionId: DEF_B, semanticLabel: "B" };
    const out = sanitizeQuestionRevision(d);
    expect(out.choiceFeedback?.D?.semanticDefinitionId).toBe(DEF_B);
    expect(out.choiceFeedback?.D?.conceptKey).toBeNull();
  });
});

describe("question revision — validation", () => {
  it("rejects a multiple-choice draft with fewer than two options", () => {
    const d = draftOf();
    d.choices = { A: "only" };
    expect(validateQuestionRevision(d)).toMatch(/en az 2 şık/);
  });

  it("rejects a multiple-choice draft whose correct answer is not an option", () => {
    const d = draftOf();
    d.choices.B = "";
    expect(validateQuestionRevision(d)).toMatch(/doğru cevabı/);
  });

  it("accepts a plain question with no options at all", () => {
    const d = draftOf();
    d.choices = {};
    d.correctChoice = null;
    expect(draftHasChoices(d)).toBe(false);
    expect(validateQuestionRevision(d)).toBeNull();
    const out = sanitizeQuestionRevision(d);
    expect(out.choices).toBeNull();
    expect(out.correctChoice).toBeNull();
    expect(out.choiceFeedback).toBeNull();
  });

  it("rejects an over-long caption", () => {
    const d = draftOf();
    d.description = "x".repeat(MAX_QUESTION_DESCRIPTION_LENGTH + 1);
    expect(validateQuestionRevision(d)).toMatch(/karakter/);
  });

  it("P19 — subject and topic are not part of a revision at all", () => {
    const out = sanitizeQuestionRevision(draftOf()) as unknown as Record<string, unknown>;
    expect(out.subject).toBeUndefined();
    expect(out.topic).toBeUndefined();
    expect(out.gradeLevel).toBeUndefined();
    expect(out.imageUrl).toBeUndefined();
  });
});

describe("question revision — editor helpers", () => {
  it("offers a note field only for present, non-correct options", () => {
    expect(feedbackEligibleLabels(draftOf())).toEqual(["A", "C", "D"]);
    const d = draftOf();
    d.correctChoice = "A";
    d.choices.D = "";
    expect(feedbackEligibleLabels(d)).toEqual(["B", "C"]);
  });

  it("pads hint boxes to the ladder length and never past it", () => {
    expect(hintDraftBoxes(["a"])).toEqual(["a", "", ""]);
    expect(hintDraftBoxes(["a", "b", "c", "d"])).toEqual(["a", "b", "c"]);
  });

  it("carries the trust copy that is said on the editor", () => {
    expect(REVISION_TRUST_NOTE).toMatch(/yeni yanıtlar/);
    expect(REVISION_TRUST_NOTE).toMatch(/değişmez/);
    expect(REMAP_TRUST_NOTE).toMatch(/güncel eşlemeyi/);
    for (const text of [REVISION_TRUST_NOTE, REMAP_TRUST_NOTE]) {
      expect(text).not.toMatch(/sürüm geçmişi|eski sürüm|önceki sürüm korun/i);
    }
  });
});

// Part 52 — the service's allowlist, asserted without Firestore.
describe("updateQuestion — patch allowlist", () => {
  it("S4–S9 — the patch never contains an immutable, scope or counter field", () => {
    const patch = buildQuestionUpdatePatch(sanitizeQuestionRevision(draftOf())) as unknown as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual([...QUESTION_UPDATE_ALLOWLIST].sort());
    for (const forbidden of [
      "ownerId", "classId", "visibility", "posterRole", "createdAt",
      "answerCount", "likeCount", "commentCount",
      "subject", "topic", "gradeLevel", "imageUrl", "organizationId", "id",
    ]) {
      expect(patch).not.toHaveProperty(forbidden);
    }
  });

  it("writes exactly the sanitised five, and nothing the draft did not set", () => {
    const d = draftOf();
    d.correctChoice = "A"; // drops A's note by the canonical rule
    const patch = buildQuestionUpdatePatch(sanitizeQuestionRevision(d));
    expect(patch.correctChoice).toBe("A");
    expect(patch.choiceFeedback?.A).toBeUndefined();
    expect(patch.choiceFeedback?.D?.text).toBe("Bölmeyi atlamış olabilirsin.");
    expect(patch.hints).toEqual(["Sabiti karşı tarafa geçir."]);
    expect(patch.description).toBe("2x + 6 = 14 ise x kaçtır?");
  });
});
