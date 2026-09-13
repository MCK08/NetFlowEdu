// Phase 87 — the optimistic-concurrency fingerprint.
//
// Two duties, and they pull against each other: every real authoring change
// must move the fingerprint, and nothing else about the document may move it.
// A false negative loses an author's work; a false positive blocks a save for
// no reason. Both directions are asserted here.

import {
  canonicalizeQuestionAuthoringState,
  createQuestionRevisionDraft,
  hasQuestionRevisionConflict,
  projectQuestionAuthoringState,
  questionAuthoringRevision,
  sanitizeQuestionRevision,
} from "../../src/features/questions/services/questionRevision";
import { Question } from "../../src/types/question";

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
      A: {
        text: "İşareti kontrol et.",
        semanticDefinitionId: DEF_A,
        semanticLabel: "İşaret aktarımı",
        conceptKey: null,
      },
      D: {
        text: "Bölmeyi atlamış olabilirsin.",
        semanticDefinitionId: null,
        semanticLabel: null,
        conceptKey: "missing_division",
      },
    },
    ...over,
  };
}

const rev = (over: Partial<Question> = {}) => questionAuthoringRevision(question(over));

describe("the fingerprint does not move", () => {
  it("C1 for two identical questions", () => {
    expect(rev()).toBe(rev());
  });

  it("C16 across repeated calls on the same object", () => {
    const q = question();
    expect(questionAuthoringRevision(q)).toBe(questionAuthoringRevision(q));
    expect(questionAuthoringRevision(q)).toBe(questionAuthoringRevision(q));
  });

  it("C2 when object keys were inserted in a different order", () => {
    // Same meaning, different literal construction order — for choices, for
    // feedback, and for the fields of one feedback entry.
    const forward = question();
    const shuffled = question({
      choices: { D: "10", B: "4", C: "7", A: "3" },
      choiceFeedback: {
        D: {
          conceptKey: "missing_division",
          semanticLabel: null,
          semanticDefinitionId: null,
          text: "Bölmeyi atlamış olabilirsin.",
        },
        A: {
          semanticLabel: "İşaret aktarımı",
          text: "İşareti kontrol et.",
          conceptKey: null,
          semanticDefinitionId: DEF_A,
        },
      },
    });
    expect(questionAuthoringRevision(shuffled)).toBe(questionAuthoringRevision(forward));
  });

  it("C9 when only ownerId differs", () => {
    expect(rev({ ownerId: "someone-else" })).toBe(rev());
  });

  it("C10 when only classId differs", () => {
    expect(rev({ classId: "class-2" })).toBe(rev());
  });

  it("C11 when only the engagement counters moved", () => {
    // A learner answering must never look like a competing edit.
    expect(rev({ answerCount: 99 })).toBe(rev());
    expect(rev({ likeCount: 99 })).toBe(rev());
    expect(rev({ commentCount: 99 })).toBe(rev());
    expect(rev({ answerCount: 41, likeCount: 7, commentCount: 12 })).toBe(rev());
  });

  it("C12 when only read-only metadata differs", () => {
    expect(rev({ visibility: "public" })).toBe(rev());
    expect(rev({ posterRole: "student" })).toBe(rev());
    expect(rev({ subject: "Fizik" })).toBe(rev());
    expect(rev({ topic: "Kuvvet" })).toBe(rev());
    expect(rev({ gradeLevel: "11" })).toBe(rev());
    expect(rev({ imageUrl: "https://example.test/other.png" })).toBe(rev());
    expect(rev({ createdAt: 1 })).toBe(rev());
    expect(rev({ id: "q2" })).toBe(rev());
  });

  it("C13 when a definition was renamed ELSEWHERE", () => {
    // Renaming a shared definition does not rewrite questions (Phase 82), so
    // the question's stored snapshot — and its fingerprint — do not move.
    const before = question();
    const after = question();
    expect(questionAuthoringRevision(after)).toBe(questionAuthoringRevision(before));
    expect(after.choiceFeedback?.A?.semanticDefinitionId).toBe(DEF_A);
  });

  it("C14 for an equivalent representation the sanitiser collapses", () => {
    // Trailing whitespace, a blank hint box, and a note on an option that does
    // not exist all vanish on save, so none of them is a real difference.
    const noisy = question({
      description: "  2x + 6 = 14 ise x kaçtır?  ",
      hints: ["Sabiti karşı tarafa geçir.", "   "],
      choiceFeedback: {
        A: {
          text: "İşareti kontrol et.",
          semanticDefinitionId: DEF_A,
          semanticLabel: "İşaret aktarımı",
          conceptKey: null,
        },
        D: {
          text: "Bölmeyi atlamış olabilirsin.",
          semanticDefinitionId: null,
          semanticLabel: null,
          conceptKey: "missing_division",
        },
        E: { text: "Olmayan şıkka not.", semanticDefinitionId: null, semanticLabel: null, conceptKey: null },
      },
    });
    expect(questionAuthoringRevision(noisy)).toBe(rev());
  });

  it("C15 projects a raw document to what SAVING it would store, not to its raw shape", () => {
    // A note sitting on the correct answer is not legal authoring state; the
    // projection reflects the sanitiser, so it never appears.
    const illegal = question({
      choiceFeedback: {
        A: {
          text: "İşareti kontrol et.",
          semanticDefinitionId: DEF_A,
          semanticLabel: "İşaret aktarımı",
          conceptKey: null,
        },
        B: { text: "Doğru şıkka not.", semanticDefinitionId: DEF_B, semanticLabel: "X", conceptKey: null },
        D: {
          text: "Bölmeyi atlamış olabilirsin.",
          semanticDefinitionId: null,
          semanticLabel: null,
          conceptKey: "missing_division",
        },
      },
    });
    // B is the correct answer, so its note is dropped and the fingerprint
    // equals the question without it.
    expect(projectQuestionAuthoringState(illegal).choiceFeedback?.B).toBeUndefined();
    expect(questionAuthoringRevision(illegal)).toBe(rev());
  });
});

describe("the fingerprint moves", () => {
  it("C3 when the question text changed", () => {
    expect(rev({ description: "3x + 6 = 15 ise x kaçtır?" })).not.toBe(rev());
  });

  it("C3 when the question text was removed", () => {
    expect(rev({ description: null })).not.toBe(rev());
  });

  it("C4 when a wrong option's text changed", () => {
    expect(rev({ choices: { A: "3", B: "4", C: "7", D: "12" } })).not.toBe(rev());
  });

  it("C4 when an option was removed", () => {
    expect(rev({ choices: { A: "3", B: "4", C: "7" } })).not.toBe(rev());
  });

  it("C5 when the correct answer changed", () => {
    expect(rev({ correctChoice: "C" })).not.toBe(rev());
  });

  it("C6 when a note's text changed", () => {
    const edited = question();
    edited.choiceFeedback!.A!.text = "Taraf değiştirirken işaret değişir.";
    expect(questionAuthoringRevision(edited)).not.toBe(rev());
  });

  it("C7 when a note's shared definition changed — the remap case", () => {
    const remapped = question({
      choiceFeedback: {
        A: {
          text: "İşareti kontrol et.",
          semanticDefinitionId: DEF_B,
          semanticLabel: "Negatif işaret aktarımı",
          conceptKey: null,
        },
        D: {
          text: "Bölmeyi atlamış olabilirsin.",
          semanticDefinitionId: null,
          semanticLabel: null,
          conceptKey: "missing_division",
        },
      },
    });
    expect(questionAuthoringRevision(remapped)).not.toBe(rev());
  });

  it("C7 when a shared mapping was removed entirely", () => {
    const cleared = question({
      choiceFeedback: {
        A: { text: "İşareti kontrol et.", semanticDefinitionId: null, semanticLabel: null, conceptKey: null },
        D: {
          text: "Bölmeyi atlamış olabilirsin.",
          semanticDefinitionId: null,
          semanticLabel: null,
          conceptKey: "missing_division",
        },
      },
    });
    expect(questionAuthoringRevision(cleared)).not.toBe(rev());
  });

  it("C8 when the hints changed", () => {
    expect(rev({ hints: ["Önce sabiti sadeleştir."] })).not.toBe(rev());
    expect(rev({ hints: [] })).not.toBe(rev());
    expect(rev({ hints: ["Sabiti karşı tarafa geçir.", "Sonra katsayıya böl."] })).not.toBe(rev());
  });

  it("treats hint ORDER as meaningful", () => {
    const a = rev({ hints: ["bir", "iki"] });
    const b = rev({ hints: ["iki", "bir"] });
    expect(a).not.toBe(b);
  });
});

describe("conflict comparison", () => {
  it("reports no conflict for the same fingerprint", () => {
    expect(hasQuestionRevisionConflict(rev(), rev())).toBe(false);
  });

  it("reports a conflict once the authoring state moved", () => {
    expect(hasQuestionRevisionConflict(rev(), rev({ description: "Yeni metin" }))).toBe(true);
  });

  it("reports no conflict when only a counter moved", () => {
    expect(hasQuestionRevisionConflict(rev(), rev({ answerCount: 500 }))).toBe(false);
  });

  it("agrees with what a save would actually persist", () => {
    // The fingerprint is derived from the same sanitise path a save takes, so
    // saving an untouched draft can never conflict with itself.
    const q = question();
    const saved = sanitizeQuestionRevision(createQuestionRevisionDraft(q));
    expect(canonicalizeQuestionAuthoringState(saved)).toBe(questionAuthoringRevision(q));
  });
});

describe("the fingerprint is a product token, not a secret", () => {
  it("covers exactly the five writable authoring fields and nothing else", () => {
    const projected = projectQuestionAuthoringState(question());
    expect(Object.keys(projected).sort()).toEqual([
      "choiceFeedback",
      "choices",
      "correctChoice",
      "description",
      "hints",
    ]);
  });

  it("carries no identity, ownership or engagement data", () => {
    const token = rev();
    for (const secret of ["teacher-1", "class-1", "org", "q1", "public", "Fizik"]) {
      expect(token).not.toContain(secret);
    }
  });
});
