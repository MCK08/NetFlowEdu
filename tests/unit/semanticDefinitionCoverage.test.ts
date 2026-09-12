// Phase 82 — where a class's shared labels are used.
//
// The refusals carry the weight: coverage must not count a matching label, a
// matching conceptKey, another class's question, or the same question twice.

import { SemanticDefinition } from "../../src/features/questions/services/semanticDefinition";
import {
  boundedInventoryNote,
  buildClassSemanticVocabulary,
  coverageStatusLabel,
  coverageUsageLine,
  duplicateLabelNote,
  filterCoverage,
  vocabularyAbsenceCopy,
  vocabularySubjects,
  vocabularyTopics,
} from "../../src/features/teacher/services/semanticDefinitionCoverage";
import { Question, QuestionChoiceFeedback } from "../../src/types/question";

const CLASS = "class-1";
const T0 = 1_700_000_000_000;

function definition(over: Partial<SemanticDefinition> = {}): SemanticDefinition {
  return {
    id: "def-a",
    classId: CLASS,
    label: "İşaret aktarımı",
    description: null,
    subject: "Matematik",
    topic: "Denklemler",
    createdBy: "teacher-1",
    createdAt: T0,
    updatedAt: T0,
    archived: false,
    schemaVersion: 1,
    ...over,
  };
}

function question(id: string, feedback: QuestionChoiceFeedback | null, over: Partial<Question> = {}): Question {
  return {
    id,
    ownerId: "teacher-1",
    classId: CLASS,
    organizationId: "org-1",
    visibility: "class",
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "8",
    description: `Soru ${id}`,
    imageUrl: null,
    questionType: "multiple_choice",
    choices: { A: "doğru", B: "yanlış", C: "yanlış" },
    correctChoice: "A",
    hints: [],
    choiceFeedback: feedback,
    createdAt: T0,
    updatedAt: T0,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    ...over,
  } as Question;
}

/** A wrong option pointing at a shared definition. */
function shared(definitionId: string, label = "İşaret aktarımı") {
  return { text: "Taraf değiştirirken işaret değişir.", semanticDefinitionId: definitionId, semanticLabel: label, conceptKey: null };
}

/** A wrong option carrying only a PRIVATE author conceptKey. */
const privateEntry = {
  text: "Taraf değiştirirken işaret değişir.",
  semanticDefinitionId: null,
  semanticLabel: null,
  conceptKey: "sign_transfer_error",
};

function build(
  definitions: SemanticDefinition[],
  questions: Question[],
  isBounded = false,
  classId = CLASS,
) {
  return buildClassSemanticVocabulary({ classId, definitions, questions, isBounded });
}

describe("nothing to report", () => {
  it("V1 is empty with no definitions and no questions", () => {
    const vocabulary = build([], []);
    expect(vocabulary.isEmpty).toBe(true);
    expect(vocabulary.active).toEqual([]);
    expect(vocabulary.archived).toEqual([]);
    expect(vocabulary.scannedQuestionCount).toBe(0);
  });

  it("V2 reports a definition with zero references as zero, not as missing", () => {
    const vocabulary = build([definition()], [question("q1", null)]);
    expect(vocabulary.active).toHaveLength(1);
    expect(vocabulary.active[0]!.questionCount).toBe(0);
    expect(vocabulary.active[0]!.questionIds).toEqual([]);
    expect(vocabulary.isEmpty).toBe(false);
  });
});

describe("counting", () => {
  it("V3 counts a definition referenced by one wrong option", () => {
    const vocabulary = build([definition()], [question("q1", { B: shared("def-a") })]);
    expect(vocabulary.active[0]!.questionCount).toBe(1);
    expect(vocabulary.active[0]!.questionIds).toEqual(["q1"]);
  });

  it("V4 counts ONE question once even when two options reference the same definition", () => {
    const vocabulary = build(
      [definition()],
      [question("q1", { B: shared("def-a"), C: shared("def-a") })],
    );
    expect(vocabulary.active[0]!.questionCount).toBe(1);
    expect(vocabulary.active[0]!.questionIds).toEqual(["q1"]);
  });

  it("V5 counts two distinct questions as two", () => {
    const vocabulary = build(
      [definition()],
      [question("q1", { B: shared("def-a") }), question("q2", { B: shared("def-a") })],
    );
    expect(vocabulary.active[0]!.questionCount).toBe(2);
    expect(vocabulary.active[0]!.questionIds).toEqual(["q1", "q2"]);
  });

  it("V9 gives each definition on one question its own single count", () => {
    const vocabulary = build(
      [definition(), definition({ id: "def-b", label: "Payda eşitleme" })],
      [question("q1", { B: shared("def-a"), C: shared("def-b", "Payda eşitleme") })],
    );
    const byId = new Map(vocabulary.active.map((e) => [e.definition.id, e]));
    expect(byId.get("def-a")!.questionCount).toBe(1);
    expect(byId.get("def-b")!.questionCount).toBe(1);
  });

  it("counts questions scanned, not questions matched", () => {
    const vocabulary = build(
      [definition()],
      [question("q1", { B: shared("def-a") }), question("q2", null), question("q3", null)],
    );
    expect(vocabulary.scannedQuestionCount).toBe(3);
    expect(vocabulary.active[0]!.questionCount).toBe(1);
  });
});

describe("isolation", () => {
  it("V6 ignores a private conceptKey, even when the definition's label matches", () => {
    const vocabulary = build([definition()], [question("q1", { B: privateEntry })]);
    expect(vocabulary.active[0]!.questionCount).toBe(0);
    expect(vocabulary.unresolvedReferenceCount).toBe(0);
  });

  it("V7 keeps two same-label definitions separate", () => {
    const vocabulary = build(
      [definition(), definition({ id: "def-b" })],
      [question("q1", { B: shared("def-a") }), question("q2", { B: shared("def-b") })],
    );
    const byId = new Map(vocabulary.active.map((e) => [e.definition.id, e]));
    expect(byId.get("def-a")!.questionCount).toBe(1);
    expect(byId.get("def-b")!.questionCount).toBe(1);
    expect(vocabulary.active).toHaveLength(2);
  });

  it("V8 never counts a question from another class", () => {
    const vocabulary = build(
      [definition()],
      [
        question("q1", { B: shared("def-a") }),
        question("q2", { B: shared("def-a") }, { classId: "class-2" }),
      ],
    );
    expect(vocabulary.active[0]!.questionCount).toBe(1);
    expect(vocabulary.scannedQuestionCount).toBe(1);
  });

  it("never counts a definition belonging to another class", () => {
    const vocabulary = build(
      [definition({ classId: "class-2" })],
      [question("q1", { B: shared("def-a") })],
    );
    expect(vocabulary.isEmpty).toBe(true);
    // The reference is real but unresolvable HERE, and is reported as such
    // rather than matched to a same-looking definition.
    expect(vocabulary.unresolvedReferenceCount).toBe(1);
  });
});

describe("safety", () => {
  it("V13 survives a reference to a definition that no longer resolves", () => {
    const vocabulary = build([definition()], [question("q1", { B: shared("def-gone") })]);
    expect(vocabulary.active[0]!.questionCount).toBe(0);
    expect(vocabulary.unresolvedReferenceCount).toBe(1);
    // Never matched to the same-looking definition that IS present.
    expect(vocabulary.active[0]!.definition.id).toBe("def-a");
  });

  it("V14 ignores a feedback entry carrying no definition id", () => {
    const vocabulary = build(
      [definition()],
      [
        question("q1", { B: { text: "x", semanticDefinitionId: null, semanticLabel: null, conceptKey: null } }),
        question("q2", null),
      ],
    );
    expect(vocabulary.active[0]!.questionCount).toBe(0);
    expect(vocabulary.unresolvedReferenceCount).toBe(0);
  });

  it("V11 preserves coverage for an archived definition", () => {
    const vocabulary = build(
      [definition({ archived: true })],
      [question("q1", { B: shared("def-a") }), question("q2", { B: shared("def-a") })],
    );
    expect(vocabulary.active).toHaveLength(0);
    expect(vocabulary.archived).toHaveLength(1);
    expect(vocabulary.archived[0]!.questionCount).toBe(2);
  });

  it("V12 keeps identity and coverage across a rename", () => {
    const questions = [question("q1", { B: shared("def-a") }), question("q2", { B: shared("def-a") })];
    const before = build([definition({ label: "İşaret aktarımı" })], questions);
    const after = build([definition({ label: "Negatif işaret aktarımı" })], questions);
    expect(after.active[0]!.definition.id).toBe(before.active[0]!.definition.id);
    expect(after.active[0]!.questionCount).toBe(before.active[0]!.questionCount);
    expect(after.active[0]!.questionIds).toEqual(before.active[0]!.questionIds);
    expect(after.active[0]!.definition.label).toBe("Negatif işaret aktarımı");
  });

  it("V10 is deterministic under input permutation", () => {
    const definitions = [definition(), definition({ id: "def-b", label: "Payda eşitleme" })];
    const questions = [question("q1", { B: shared("def-a") }), question("q2", { B: shared("def-b") })];
    const forward = JSON.stringify(build(definitions, questions));
    const reversed = JSON.stringify(build([...definitions].reverse(), [...questions].reverse()));
    // Definition ordering is stable; question ordering follows the inventory,
    // so compare the definition-level result.
    expect(JSON.parse(forward).active.map((e: { definition: { id: string } }) => e.definition.id)).toEqual(
      JSON.parse(reversed).active.map((e: { definition: { id: string } }) => e.definition.id),
    );
  });
});

describe("duplicate labels", () => {
  it("flags two ACTIVE definitions that read the same in one scope", () => {
    const vocabulary = build([definition(), definition({ id: "def-b" })], []);
    expect(vocabulary.active.every((e) => e.hasDuplicateLabel)).toBe(true);
    expect(duplicateLabelNote(vocabulary.active[0]!)).toContain("ayrı etiket olarak kalır");
  });

  it("compares case-insensitively and trim-only", () => {
    const vocabulary = build(
      [definition(), definition({ id: "def-b", label: "  işaret AKTARIMI  " })],
      [],
    );
    expect(vocabulary.active.every((e) => e.hasDuplicateLabel)).toBe(true);
  });

  it("does not flag the same label in a DIFFERENT scope", () => {
    const vocabulary = build([definition(), definition({ id: "def-b", topic: "Oranlar" })], []);
    expect(vocabulary.active.every((e) => !e.hasDuplicateLabel)).toBe(true);
  });

  it("does not flag against an ARCHIVED definition", () => {
    const vocabulary = build([definition(), definition({ id: "def-b", archived: true })], []);
    expect(vocabulary.active[0]!.hasDuplicateLabel).toBe(false);
    expect(duplicateLabelNote(vocabulary.active[0]!)).toBeNull();
  });

  it("never merges duplicates — both remain listed", () => {
    const vocabulary = build(
      [definition(), definition({ id: "def-b" })],
      [question("q1", { B: shared("def-a") }), question("q2", { B: shared("def-b") })],
    );
    expect(vocabulary.active).toHaveLength(2);
    expect(vocabulary.active.map((e) => e.questionCount)).toEqual([1, 1]);
  });
});

describe("filtering", () => {
  const vocabulary = build(
    [
      definition(),
      definition({ id: "def-b", label: "Payda eşitleme", topic: "Kesirler" }),
      definition({ id: "def-c", label: "Ölçek hatası", subject: "Fizik", topic: "Kuvvet", description: "Birim karışıklığı" }),
    ],
    [],
  );

  it("matches label substrings case-insensitively", () => {
    expect(filterCoverage(vocabulary.active, { search: "PAYDA", subject: null, topic: null })).toHaveLength(1);
  });

  it("matches the author's description too", () => {
    const found = filterCoverage(vocabulary.active, { search: "birim", subject: null, topic: null });
    expect(found.map((e) => e.definition.id)).toEqual(["def-c"]);
  });

  it("narrows by subject and topic", () => {
    expect(filterCoverage(vocabulary.active, { search: "", subject: "Fizik", topic: null })).toHaveLength(1);
    expect(filterCoverage(vocabulary.active, { search: "", subject: "Matematik", topic: "Kesirler" })).toHaveLength(1);
  });

  it("returns everything for an empty filter", () => {
    expect(filterCoverage(vocabulary.active, { search: "  ", subject: null, topic: null })).toHaveLength(3);
  });

  it("lists the scopes actually present", () => {
    expect(vocabularySubjects(vocabulary)).toEqual(["Fizik", "Matematik"]);
    expect(vocabularyTopics(vocabulary, "Matematik")).toEqual(["Denklemler", "Kesirler"]);
  });
});

describe("copy", () => {
  it("states usage as a count, never as a score", () => {
    const vocabulary = build([definition()], [question("q1", { B: shared("def-a") })]);
    const line = coverageUsageLine(vocabulary.active[0]!, false);
    expect(line).toBe("1 soruda kullanılıyor");
    expect(line).not.toContain("%");
  });

  it("says zero without calling it a failing", () => {
    const vocabulary = build([definition()], []);
    const line = coverageUsageLine(vocabulary.active[0]!, false).toLowerCase();
    expect(line).toBe("henüz bir soruda kullanılmıyor");
    for (const banned of ["yetersiz", "zayıf", "eksik", "kötü", "düşük"]) {
      expect(line).not.toContain(banned);
    }
  });

  it("marks counts as bounded when the inventory was bounded", () => {
    const vocabulary = build([definition()], [question("q1", { B: shared("def-a") })], true);
    expect(coverageUsageLine(vocabulary.active[0]!, true)).toBe("Yüklenen sorularda 1 soruda kullanılıyor");
    expect(boundedInventoryNote(vocabulary)).toContain("yüklenen");
  });

  it("makes no bounded claim when the inventory was complete", () => {
    const vocabulary = build([definition()], [question("q1", { B: shared("def-a") })], false);
    expect(boundedInventoryNote(vocabulary)).toBeNull();
  });

  it("states status in words", () => {
    const active = build([definition()], []);
    const gone = build([definition({ archived: true })], []);
    expect(coverageStatusLabel(active.active[0]!)).toBe("Aktif");
    expect(coverageStatusLabel(gone.archived[0]!)).toBe("Arşivlendi");
  });

  it("distinguishes the three empty situations", () => {
    const none = vocabularyAbsenceCopy(build([], []));
    const archivedOnly = vocabularyAbsenceCopy(build([definition({ archived: true })], []));
    const noMatch = vocabularyAbsenceCopy(build([definition()], []));
    expect(new Set([none.title, archivedOnly.title, noMatch.title]).size).toBe(3);
    expect(archivedOnly.description).toContain("yeni sorularda seçilemez");
  });

  it("never leaks an internal id into visible copy", () => {
    const vocabulary = build([definition()], [question("q1", { B: shared("def-a") })]);
    const entry = vocabulary.active[0]!;
    const visible = [
      coverageUsageLine(entry, false),
      coverageStatusLabel(entry),
      duplicateLabelNote(entry) ?? "",
      boundedInventoryNote(vocabulary) ?? "",
    ].join(" ");
    for (const secret of ["def-a", CLASS, "teacher-1"]) {
      expect(visible).not.toContain(secret);
    }
  });
});
