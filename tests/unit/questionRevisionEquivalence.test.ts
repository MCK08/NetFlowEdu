// Phase 88 — the client and server revision contracts must not drift.
//
// `functions/` is a separate TypeScript project with `rootDir: "src"`, so it
// cannot import `src/features/...`. The repository's established answer for that
// boundary is a documented mirror (see functions/src/study/semanticChoiceEvidence.ts
// and src/utils/onboardingStatus.ts before it). A mirror is only as safe as the
// test that holds it in place — this is that test.
//
// It runs BOTH implementations over the same questions and asserts they produce
// byte-identical fingerprints and identical sanitised state. If either side is
// edited alone, this fails.

import {
  canonicalizeQuestionAuthoringState as clientCanonicalize,
  createQuestionRevisionDraft,
  projectQuestionAuthoringState as clientProject,
  questionAuthoringRevision as clientRevision,
  sanitizeQuestionRevision,
} from "../../src/features/questions/services/questionRevision";
import {
  projectQuestionAuthoringState as serverProject,
  questionAuthoringRevision as serverRevision,
  sanitizeQuestionAuthoringState as serverSanitize,
} from "../../functions/src/questions/questionRevision";
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

/** The server reads a plain Firestore document, so hand it the same shape. */
const asDocument = (q: Question): Record<string, unknown> => ({
  ownerId: q.ownerId,
  classId: q.classId,
  subject: q.subject,
  topic: q.topic,
  description: q.description,
  choices: q.choices,
  correctChoice: q.correctChoice,
  choiceFeedback: q.choiceFeedback,
  hints: q.hints,
  answerCount: q.answerCount,
  likeCount: q.likeCount,
  commentCount: q.commentCount,
});

const cases: [string, Question][] = [
  ["the baseline question", question()],
  ["changed question text", question({ description: "3x + 6 = 15 ise x kaçtır?" })],
  ["no question text", question({ description: null })],
  ["changed option text", question({ choices: { A: "3", B: "4", C: "7", D: "12" } })],
  ["a removed option", question({ choices: { A: "3", B: "4", C: "7" } })],
  ["only two options", question({ choices: { A: "3", B: "4" } })],
  ["a different correct answer", question({ correctChoice: "C" })],
  [
    "a remapped shared definition",
    question({
      choiceFeedback: {
        A: { text: "İşareti kontrol et.", semanticDefinitionId: DEF_B, semanticLabel: "Negatif", conceptKey: null },
      },
    }),
  ],
  [
    "a cleared shared mapping",
    question({
      choiceFeedback: {
        A: { text: "İşareti kontrol et.", semanticDefinitionId: null, semanticLabel: null, conceptKey: null },
      },
    }),
  ],
  [
    "a legacy private conceptKey only",
    question({
      choiceFeedback: {
        A: { text: "İşareti kontrol et.", semanticDefinitionId: null, semanticLabel: null, conceptKey: "Sign-Transfer Error" },
      },
    }),
  ],
  [
    "both a shared reference and a private key on one entry",
    question({
      choiceFeedback: {
        A: { text: "İşareti kontrol et.", semanticDefinitionId: DEF_A, semanticLabel: "X", conceptKey: "should_be_dropped" },
      },
    }),
  ],
  ["changed hints", question({ hints: ["Önce sabiti sadeleştir.", "Sonra katsayıya böl."] })],
  ["no hints", question({ hints: [] })],
  ["more hints than the ladder allows", question({ hints: ["bir", "iki", "üç", "dört", "beş"] })],
  ["a blank hint among real ones", question({ hints: ["bir", "   ", "üç"] })],
  ["counters moved", question({ answerCount: 99, likeCount: 42, commentCount: 7 })],
  ["metadata changed", question({ ownerId: "someone-else", classId: "class-2", visibility: "public" })],
  ["scope metadata changed", question({ subject: "Fizik", topic: "Kuvvet", gradeLevel: "11" })],
  ["a note on the correct answer", question({
    choiceFeedback: {
      B: { text: "Doğru şıkka not.", semanticDefinitionId: DEF_A, semanticLabel: "X", conceptKey: null },
      A: { text: "İşareti kontrol et.", semanticDefinitionId: DEF_A, semanticLabel: "X", conceptKey: null },
    },
  })],
  ["a note on an option that does not exist", question({
    choiceFeedback: {
      E: { text: "Olmayan şıkka not.", semanticDefinitionId: null, semanticLabel: null, conceptKey: null },
      A: { text: "İşareti kontrol et.", semanticDefinitionId: DEF_A, semanticLabel: "X", conceptKey: null },
    },
  })],
  ["a blank note", question({
    choiceFeedback: {
      A: { text: "   ", semanticDefinitionId: DEF_A, semanticLabel: "X", conceptKey: null },
    },
  })],
  ["whitespace everywhere", question({
    description: "   2x + 6 = 14 ise x kaçtır?   ",
    choices: { A: " 3 ", B: " 4 ", C: " 7 ", D: " 10 " },
    hints: ["  Sabiti karşı tarafa geçir.  "],
  })],
  ["no feedback at all", question({ choiceFeedback: null })],
  ["no choices at all", question({ choices: null, correctChoice: null, choiceFeedback: null })],
];

describe("client and server produce the same fingerprint", () => {
  for (const [name, q] of cases) {
    it(`agrees on ${name}`, () => {
      expect(serverRevision(asDocument(q))).toBe(clientRevision(q));
    });
  }
});

describe("client and server produce the same sanitised authoring state", () => {
  for (const [name, q] of cases) {
    it(`agrees on ${name}`, () => {
      expect(serverProject(asDocument(q))).toEqual(clientProject(q));
    });
  }
});

describe("the server sanitiser matches the client's on raw payloads", () => {
  it("agrees on what a real draft would persist", () => {
    for (const [, q] of cases) {
      const clientPayload = sanitizeQuestionRevision(createQuestionRevisionDraft(q));
      const serverPayload = serverSanitize({
        description: q.description,
        choices: q.choices ?? {},
        correctChoice: q.correctChoice,
        choiceFeedback: q.choiceFeedback,
        hints: q.hints,
      });
      expect(serverPayload).toEqual(clientPayload);
    }
  });

  it("agrees on hostile input the client would never send", () => {
    // A forged payload reaches the server directly, so the server's sanitiser
    // is the one that has to hold. It must land on the same answer the client's
    // would for the parts that are legal, and drop the rest.
    const hostile = {
      description: 12345,
      choices: { A: "doğru", B: "yanlış", Z: "olmayan şık", C: 99 },
      correctChoice: "Z",
      choiceFeedback: {
        B: { text: "not", semanticDefinitionId: "a/b", semanticLabel: 5, conceptKey: "  " },
        Q: { text: "geçersiz şık" },
      },
      hints: ["bir", 42, null, "iki"],
    };
    const server = serverSanitize(hostile);
    expect(server.description).toBeNull();
    expect(server.choices).toEqual({ A: "doğru", B: "yanlış" });
    // "Z" is not a real label, so there is no valid correct answer left.
    expect(server.correctChoice).toBeNull();
    // A definition id containing "/" is refused; the entry keeps its text.
    expect(server.choiceFeedback?.B?.semanticDefinitionId).toBeNull();
    expect(server.hints).toEqual(["bir", "iki"]);
  });
});

describe("the shared constants have not drifted apart", () => {
  it("caps hints, feedback and ids at the same numbers on both sides", async () => {
    const client = await import("../../src/features/questions/services/questionHints");
    const feedback = await import("../../src/features/questions/services/choiceFeedback");
    const semantic = await import("../../src/features/questions/services/semanticDefinition");
    const revision = await import("../../src/features/questions/services/questionRevision");
    const server = await import("../../functions/src/questions/questionRevision");

    expect(server.MAX_QUESTION_HINTS).toBe(client.MAX_QUESTION_HINTS);
    expect(server.MAX_HINT_LENGTH).toBe(client.MAX_HINT_LENGTH);
    expect(server.MAX_CHOICE_FEEDBACK_LENGTH).toBe(feedback.MAX_CHOICE_FEEDBACK_LENGTH);
    expect(server.MAX_CONCEPT_KEY_LENGTH).toBe(feedback.MAX_CONCEPT_KEY_LENGTH);
    expect(server.MAX_SEMANTIC_DEFINITION_ID_LENGTH).toBe(feedback.MAX_SEMANTIC_DEFINITION_ID_LENGTH);
    expect(server.MAX_SEMANTIC_LABEL_LENGTH).toBe(semantic.MAX_SEMANTIC_LABEL_LENGTH);
    expect(server.MAX_QUESTION_DESCRIPTION_LENGTH).toBe(revision.MAX_QUESTION_DESCRIPTION_LENGTH);
    expect([...server.CHOICE_LABELS]).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("normalizes a concept key identically", async () => {
    const feedback = await import("../../src/features/questions/services/choiceFeedback");
    const server = await import("../../functions/src/questions/questionRevision");
    for (const raw of ["Sign Transfer Error", "sign-transfer-error", "  __SIGN__  ", "???", "", "a".repeat(80)]) {
      expect(server.normalizeConceptKey(raw)).toBe(feedback.normalizeConceptKey(raw));
    }
  });

  it("canonicalizes identically for key-order differences", () => {
    const forward = question();
    const shuffled = question({
      choices: { D: "10", B: "4", C: "7", A: "3" },
    });
    expect(serverRevision(asDocument(shuffled))).toBe(serverRevision(asDocument(forward)));
    expect(clientCanonicalize(clientProject(shuffled))).toBe(serverRevision(asDocument(forward)));
  });
});

describe("new-reference detection", () => {
  it("treats an already-present definition as not new, and a changed one as new", async () => {
    const server = await import("../../functions/src/questions/questionRevision");
    const current = serverProject(asDocument(question()));
    const unchanged = serverProject(asDocument(question()));
    expect(server.newlyReferencedDefinitionIds(current, unchanged)).toEqual([]);

    const remapped = serverProject(
      asDocument(
        question({
          choiceFeedback: {
            A: { text: "İşareti kontrol et.", semanticDefinitionId: DEF_B, semanticLabel: "B", conceptKey: null },
          },
        }),
      ),
    );
    expect(server.newlyReferencedDefinitionIds(current, remapped)).toEqual([DEF_B]);
  });

  it("bounds referenced ids by the number of choice labels", async () => {
    const server = await import("../../functions/src/questions/questionRevision");
    const many = serverSanitize({
      choices: { A: "a", B: "b", C: "c", D: "d", E: "e" },
      correctChoice: "A",
      choiceFeedback: {
        B: { text: "n", semanticDefinitionId: "d1" },
        C: { text: "n", semanticDefinitionId: "d2" },
        D: { text: "n", semanticDefinitionId: "d3" },
        E: { text: "n", semanticDefinitionId: "d4" },
      },
      hints: [],
    });
    expect(server.referencedDefinitionIds(many).length).toBeLessThanOrEqual(5);
    expect(server.referencedDefinitionIds(many)).toEqual(["d1", "d2", "d3", "d4"]);
  });
});
