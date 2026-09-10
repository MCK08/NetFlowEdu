// Phase 80 — when two authors may be said to mean the same thing, and when
// they may not.
//
// Split across the two halves that have to agree: the SERVER deciding what
// identity to write, and the AGGREGATOR deciding what merges. A gap between
// them would either lose a shared meaning or invent one.

import { LearningEvent } from "../../src/features/learningStory/services/learningTrail";
import {
  resolveSemanticChoiceEvidence,
  resolveSemanticOpportunities,
} from "../../functions/src/study/semanticChoiceEvidence";
import { buildVerifiedChoicePatterns } from "../../src/features/study/services/verifiedChoicePatterns";

const T0 = 1_700_000_000_000;
const CLASS_A = "class-a";
const DEF = "def-sign-transfer";

/** A class question whose wrong option A points at a SHARED definition. */
function sharedQuestion(over: Record<string, unknown> = {}) {
  return {
    ownerId: "teacher-1",
    classId: CLASS_A,
    choices: { A: "3", B: "4", C: "7", D: "10" },
    correctChoice: "B",
    choiceFeedback: {
      A: { text: "İşareti kontrol et.", semanticDefinitionId: DEF, semanticLabel: "İşaret aktarımı" },
    },
    ...over,
  };
}

/** The Phase 78 shape: a private, author-scoped key. */
function privateQuestion(over: Record<string, unknown> = {}) {
  return {
    ownerId: "teacher-1",
    classId: CLASS_A,
    choices: { A: "3", B: "4", C: "7", D: "10" },
    correctChoice: "B",
    choiceFeedback: { A: { text: "İşareti kontrol et.", conceptKey: "sign_transfer_error" } },
    ...over,
  };
}

describe("server — which identity gets written", () => {
  it("writes a class-scoped identity for a shared reference", () => {
    expect(resolveSemanticChoiceEvidence({ question: sharedQuestion(), selectedChoice: "A" }))
      .toMatchObject({
        namespaceKind: "class",
        namespaceId: CLASS_A,
        conceptKey: DEF,
        label: "İşaret aktarımı",
      });
  });

  it("writes an author-scoped identity for a private key, exactly as before", () => {
    const evidence = resolveSemanticChoiceEvidence({
      question: privateQuestion(),
      selectedChoice: "A",
    });
    expect(evidence).toMatchObject({
      namespaceKind: "author",
      namespaceId: "teacher-1",
      conceptKey: "sign_transfer_error",
    });
    // An author-scoped key has no reader-facing wording, and inventing prose
    // from the slug is what Phase 78 refused.
    expect(evidence?.label).toBeUndefined();
  });

  it("takes the shared namespace from the QUESTION's class, never the reference", () => {
    // The same definition id on a question in another class is another
    // meaning. This is what makes cross-class contamination impossible
    // without any verification read.
    expect(
      resolveSemanticChoiceEvidence({
        question: sharedQuestion({ classId: "class-b" }),
        selectedChoice: "A",
      })?.namespaceId,
    ).toBe("class-b");
  });

  it("drops a shared reference on a question with no class to scope it", () => {
    // A private/public question has no shared vocabulary. Silently downgrading
    // to the author's namespace would turn what the author selected into
    // something they did not.
    expect(
      resolveSemanticChoiceEvidence({
        question: sharedQuestion({ classId: null }),
        selectedChoice: "A",
      }),
    ).toBeNull();
  });

  it("represents a MIXED question with per-item namespaces", () => {
    // The Phase 79 shape could not express this: one namespace, one flat list.
    const mixed = sharedQuestion({
      choiceFeedback: {
        A: { text: "x", semanticDefinitionId: DEF, semanticLabel: "İşaret aktarımı" },
        C: { text: "y", conceptKey: "other_private_key" },
      },
    });
    const items = resolveSemanticOpportunities({ question: mixed, selectedChoice: "B" })?.items;
    expect(items).toEqual(
      expect.arrayContaining([
        { namespaceKind: "author", namespaceId: "teacher-1", semanticId: "other_private_key" },
        { namespaceKind: "class", namespaceId: CLASS_A, semanticId: DEF },
      ]),
    );
    expect(items).toHaveLength(2);
  });

  it("counts one shared meaning once when two options point at it", () => {
    const twice = sharedQuestion({
      choiceFeedback: {
        A: { text: "x", semanticDefinitionId: DEF, semanticLabel: "L" },
        C: { text: "y", semanticDefinitionId: DEF, semanticLabel: "L" },
      },
    });
    expect(resolveSemanticOpportunities({ question: twice, selectedChoice: "B" })?.items).toHaveLength(1);
  });

  it("never lets a client-supplied definition id become authoritative", () => {
    // There is no request parameter for one — the resolver reads the question
    // document and nothing else. This pins that shape.
    expect(
      resolveSemanticChoiceEvidence({
        question: privateQuestion(),
        selectedChoice: "A",
      })?.conceptKey,
    ).toBe("sign_transfer_error");
  });

  it("ignores a malformed reference rather than trusting it", () => {
    for (const bad of [42, {}, [], "  ", "a/b", "x".repeat(200)]) {
      const q = sharedQuestion({
        choiceFeedback: { A: { text: "x", semanticDefinitionId: bad, semanticLabel: "L" } },
      });
      expect(resolveSemanticChoiceEvidence({ question: q, selectedChoice: "A" })).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------

function event(over: Partial<LearningEvent> = {}): LearningEvent {
  return {
    id: `e-${Math.random()}`,
    questionId: "q1",
    outcome: "struggled",
    occurredAt: T0,
    subject: "Matematik",
    topic: "Denklemler",
    semanticChoice: null,
    semanticOpportunities: null,
    ...over,
  };
}

/** A selection of the SHARED definition, by whichever author. */
function sharedSelected(questionId: string, at: number, over: Partial<LearningEvent> = {}) {
  return event({
    questionId,
    occurredAt: at,
    semanticChoice: {
      identity: { namespaceKind: "class", namespaceId: CLASS_A, semanticId: DEF },
      choiceLabel: "A",
      label: "İşaret aktarımı",
    },
    semanticOpportunities: {
      items: [{ namespaceKind: "class", namespaceId: CLASS_A, semanticId: DEF }],
      selectedChoice: "A",
    },
    ...over,
  });
}

const build = (events: LearningEvent[]) => buildVerifiedChoicePatterns({ events });

describe("aggregator — what merges across authors", () => {
  it("merges two DIFFERENT authors' questions that point at the same definition", () => {
    // The whole point of the phase. Neither question knows about the other;
    // both authors chose the same canonical definition on purpose.
    const memory = build([sharedSelected("q-by-teacher", T0), sharedSelected("q-by-student", T0 + 1)]);
    expect(memory.patterns).toHaveLength(1);
    expect(memory.patterns[0]).toMatchObject({
      distinctQuestionCount: 2,
      occurrenceCount: 2,
      label: "İşaret aktarımı",
    });
  });

  it("does NOT merge the same private conceptKey across two authors", () => {
    // Unchanged from Phase 78, and still the right answer: two people typing
    // the same word have not agreed on anything.
    const priv = (q: string, author: string, at: number) =>
      event({
        questionId: q,
        occurredAt: at,
        semanticChoice: {
          identity: { namespaceKind: "author", namespaceId: author, semanticId: "sign_transfer_error" },
          choiceLabel: "A",
          label: null,
        },
      });
    expect(build([priv("q1", "teacher-1", T0), priv("q2", "student-9", T0 + 1)]).patterns).toEqual([]);
  });

  it("does NOT merge two definitions that merely share a label", () => {
    const withId = (q: string, id: string, at: number) =>
      sharedSelected(q, at, {
        semanticChoice: {
          identity: { namespaceKind: "class", namespaceId: CLASS_A, semanticId: id },
          choiceLabel: "A",
          label: "İşaret aktarımı",
        },
      });
    expect(build([withId("q1", "def-1", T0), withId("q2", "def-2", T0 + 1)]).patterns).toEqual([]);
  });

  it("does NOT merge the same definition id across two classes", () => {
    const inClass = (q: string, classId: string, at: number) =>
      sharedSelected(q, at, {
        semanticChoice: {
          identity: { namespaceKind: "class", namespaceId: classId, semanticId: DEF },
          choiceLabel: "A",
          label: "İşaret aktarımı",
        },
      });
    expect(build([inClass("q1", "class-a", T0), inClass("q2", "class-b", T0 + 1)]).patterns).toEqual([]);
  });

  it("does NOT merge a shared identity with a private one carrying the same string", () => {
    // A class id and a uid are different id spaces with no collision
    // guarantee. Comparing the KIND as well is what makes this impossible.
    const shared = sharedSelected("q1", T0, {
      semanticChoice: {
        identity: { namespaceKind: "class", namespaceId: "X", semanticId: "Y" },
        choiceLabel: "A",
        label: null,
      },
    });
    const priv = event({
      questionId: "q2",
      occurredAt: T0 + 1,
      semanticChoice: {
        identity: { namespaceKind: "author", namespaceId: "X", semanticId: "Y" },
        choiceLabel: "A",
        label: null,
      },
    });
    expect(build([shared, priv]).patterns).toEqual([]);
  });

  it("shows the label from the most recent occurrence that carried one", () => {
    const renamed = sharedSelected("q2", T0 + 100, {
      semanticChoice: {
        identity: { namespaceKind: "class", namespaceId: CLASS_A, semanticId: DEF },
        choiceLabel: "A",
        label: "İşaret aktarma",
      },
    });
    expect(build([sharedSelected("q1", T0), renamed]).patterns[0]?.label).toBe("İşaret aktarma");
  });

  it("leaves a private pattern's label null rather than inventing prose", () => {
    const priv = (q: string, at: number) =>
      event({
        questionId: q,
        occurredAt: at,
        semanticChoice: {
          identity: { namespaceKind: "author", namespaceId: "teacher-1", semanticId: "sign_transfer_error" },
          choiceLabel: "A",
          label: null,
        },
      });
    expect(build([priv("q1", T0), priv("q2", T0 + 1)]).patterns[0]?.label).toBeNull();
  });
});

describe("Phase 79 recovery works across authors for a shared identity", () => {
  const declinedByOtherAuthor = (q: string, at: number) =>
    event({
      questionId: q,
      occurredAt: at,
      outcome: "solved",
      semanticOpportunities: {
        items: [{ namespaceKind: "class", namespaceId: CLASS_A, semanticId: DEF }],
        selectedChoice: "B",
      },
    });

  it("counts declines on questions by a DIFFERENT author than the pattern's", () => {
    const memory = build([
      sharedSelected("q-a", T0),
      sharedSelected("q-b", T0 + 100),
      declinedByOtherAuthor("q-c", T0 + 200),
      declinedByOtherAuthor("q-d", T0 + 300),
    ]);
    expect(memory.patterns[0]?.recovery).toMatchObject({
      declinedOpportunityCount: 2,
      distinctQuestionCount: 2,
    });
  });

  it("still requires two DISTINCT later questions", () => {
    const memory = build([
      sharedSelected("q-a", T0),
      sharedSelected("q-b", T0 + 100),
      declinedByOtherAuthor("q-c", T0 + 200),
      declinedByOtherAuthor("q-c", T0 + 250),
    ]);
    expect(memory.patterns[0]?.recovery).toBeNull();
  });

  it("still withdraws the signal on a re-selection", () => {
    const memory = build([
      sharedSelected("q-a", T0),
      sharedSelected("q-b", T0 + 100),
      declinedByOtherAuthor("q-c", T0 + 200),
      declinedByOtherAuthor("q-d", T0 + 300),
      sharedSelected("q-e", T0 + 400),
    ]);
    expect(memory.patterns[0]?.recovery).toBeNull();
  });

  it("ignores a decline of a DIFFERENT class's identical definition id", () => {
    const foreign = (q: string, at: number) =>
      event({
        questionId: q,
        occurredAt: at,
        outcome: "solved",
        semanticOpportunities: {
          items: [{ namespaceKind: "class", namespaceId: "class-b", semanticId: DEF }],
          selectedChoice: "B",
        },
      });
    const memory = build([
      sharedSelected("q-a", T0),
      sharedSelected("q-b", T0 + 100),
      foreign("q-c", T0 + 200),
      foreign("q-d", T0 + 300),
    ]);
    expect(memory.patterns[0]?.recovery).toBeNull();
  });
});

// No backfill, no rewriting: an old document simply describes itself.
describe("legacy event compatibility", () => {
  it("reads a Phase 78 selected-only event as author-scoped", () => {
    const legacy = (q: string, at: number) =>
      event({
        questionId: q,
        occurredAt: at,
        semanticChoice: {
          identity: { namespaceKind: "author", namespaceId: "teacher-1", semanticId: "k" },
          choiceLabel: "A",
          label: null,
        },
      });
    const memory = build([legacy("q1", T0), legacy("q2", T0 + 1)]);
    expect(memory.patterns).toHaveLength(1);
    expect(memory.patterns[0]?.label).toBeNull();
    expect(memory.patterns[0]?.recovery).toBeNull();
  });

  it("never treats a legacy event as evidence of what was offered", () => {
    const legacy = (q: string, at: number) =>
      event({
        questionId: q,
        occurredAt: at,
        semanticChoice: {
          identity: { namespaceKind: "author", namespaceId: "teacher-1", semanticId: "k" },
          choiceLabel: "A",
          label: null,
        },
      });
    const memory = build([
      legacy("q1", T0),
      legacy("q2", T0 + 1),
      event({ questionId: "q3", occurredAt: T0 + 100, outcome: "solved" }),
      event({ questionId: "q4", occurredAt: T0 + 200, outcome: "solved" }),
    ]);
    expect(memory.patterns[0]?.recovery).toBeNull();
  });
});
