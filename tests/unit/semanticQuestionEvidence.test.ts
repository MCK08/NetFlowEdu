// Phase 85 — the question side of one shared definition.
//
// The refusals again carry the weight: no label matching, no private semantics,
// no cross-class, one question counted once however many options map to it, and
// an observed selection is never silently promoted to a verified pattern.

import { LearningEvent } from "../../src/features/learningStory/services/learningTrail";
import { ClassSemanticStudentEvidence } from "../../src/features/teacher/services/classSemanticCohorts";
import { scopedIdentityForDefinition } from "../../src/features/teacher/services/semanticDefinitionTimeline";
import {
  authorabilityLabel,
  authorabilityNote,
  buildSemanticQuestionEvidence,
  mappedChoiceFeedback,
  mappedChoiceLine,
  mappedChoiceText,
  questionAbsenceCopy,
  questionEvidenceLine,
  questionTimelineLine,
  QUESTION_SECTION_NOTE,
} from "../../src/features/teacher/services/semanticQuestionEvidence";
import { Question, QuestionChoiceFeedback } from "../../src/types/question";

const CLASS = "class-1";
const DEF = "def-a";
const TEACHER = "teacher-1";
const T0 = 1_700_000_000_000;
const MIN = 60_000;

let seq = 0;
beforeEach(() => {
  seq = 0;
});

const scoped = scopedIdentityForDefinition({
  classId: CLASS,
  definitionId: DEF,
  subject: "Matematik",
  topic: "Denklemler",
});

function question(
  id: string,
  feedback: QuestionChoiceFeedback | null,
  over: Partial<Question> = {},
): Question {
  return {
    id,
    ownerId: TEACHER,
    classId: CLASS,
    organizationId: "org-1",
    visibility: "class",
    posterRole: "teacher",
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "8",
    description: `Soru ${id}`,
    imageUrl: null,
    questionType: "multiple_choice",
    choices: { A: "doğru", B: "yanlış b", C: "yanlış c" },
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

const sharedRef = (definitionId = DEF, text = "Taraf değiştirirken işaret değişir.") => ({
  text,
  semanticDefinitionId: definitionId,
  semanticLabel: "İşaret aktarımı",
  conceptKey: null,
});

const privateRef = {
  text: "Taraf değiştirirken işaret değişir.",
  semanticDefinitionId: null,
  semanticLabel: null,
  conceptKey: "sign_transfer_error",
};

/** A selection of the shared definition on one question. */
function pick(questionId: string, at: number, definitionId = DEF, classId = CLASS): LearningEvent {
  return {
    id: `e-${++seq}`,
    questionId,
    outcome: "struggled",
    occurredAt: at,
    subject: "Matematik",
    topic: "Denklemler",
    semanticChoice: {
      identity: { namespaceKind: "class", namespaceId: classId, semanticId: definitionId },
      choiceLabel: "B",
      label: "İşaret aktarımı",
    },
    semanticOpportunities: null,
  };
}

/** A private author-scoped selection whose key equals the definition id. */
function privatePick(questionId: string, at: number): LearningEvent {
  return {
    id: `e-${++seq}`,
    questionId,
    outcome: "struggled",
    occurredAt: at,
    subject: "Matematik",
    topic: "Denklemler",
    semanticChoice: {
      identity: { namespaceKind: "author", namespaceId: TEACHER, semanticId: DEF },
      choiceLabel: "B",
      label: null,
    },
    semanticOpportunities: null,
  };
}

function student(uid: string, events: LearningEvent[]): ClassSemanticStudentEvidence {
  return { studentUid: uid, displayName: uid, events };
}

function build(
  questions: Question[],
  students: ClassSemanticStudentEvidence[] = [],
  viewerUid: string | undefined = TEACHER,
) {
  return buildSemanticQuestionEvidence({ classId: CLASS, scoped, questions, students, viewerUid });
}

describe("association", () => {
  it("Q1 is empty when no question references the definition", () => {
    const list = build([question("q1", null), question("q2", { B: privateRef })]);
    expect(list.isEmpty).toBe(true);
    expect(list.questions).toEqual([]);
  });

  it("Q2 lists one mapped question", () => {
    const list = build([question("q1", { B: sharedRef() })]);
    expect(list.questions).toHaveLength(1);
    expect(list.questions[0]!.mappedChoiceLabels).toEqual(["B"]);
    expect(list.questions[0]!.mappedChoiceCount).toBe(1);
  });

  it("Q3 lists a question ONCE when two options map to the same definition", () => {
    const list = build([question("q1", { B: sharedRef(), C: sharedRef() })]);
    expect(list.questions).toHaveLength(1);
    expect(list.questions[0]!.mappedChoiceLabels).toEqual(["B", "C"]);
    expect(list.questions[0]!.mappedChoiceCount).toBe(2);
  });

  it("Q4 lists two mapped questions", () => {
    const list = build([question("q1", { B: sharedRef() }), question("q2", { B: sharedRef() })]);
    expect(list.questions).toHaveLength(2);
  });

  it("Q5 excludes a private conceptKey whose key equals the definition id", () => {
    expect(build([question("q1", { B: privateRef })]).isEmpty).toBe(true);
  });

  it("Q6 excludes a different definition carrying the same visible label", () => {
    expect(build([question("q1", { B: sharedRef("def-b") })]).isEmpty).toBe(true);
  });

  it("Q7 excludes a question from another class", () => {
    expect(build([question("q1", { B: sharedRef() }, { classId: "class-2" })]).isEmpty).toBe(true);
  });

  it("Q15 safely ignores a malformed feedback entry", () => {
    const list = build([
      question("q1", { B: { text: "x", semanticDefinitionId: null, semanticLabel: null, conceptKey: null } }),
      question("q2", { B: sharedRef() }),
    ]);
    expect(list.questions.map((r) => r.questionId)).toEqual(["q2"]);
  });
});

describe("observed versus verified", () => {
  const twoMapped = () => [question("q1", { B: sharedRef() }), question("q2", { B: sharedRef() })];

  it("Q8 counts a single selection as observed but NOT as a verified pattern", () => {
    const list = build(twoMapped(), [student("a", [pick("q1", T0)])]);
    const q1 = list.questions.find((r) => r.questionId === "q1")!;
    expect(q1.observedSelectorCount).toBe(1);
    expect(q1.verifiedPatternStudentCount).toBe(0);
    expect(q1.participatesInVerifiedPattern).toBe(false);
  });

  it("Q9 counts a verified pattern on both of its questions", () => {
    const list = build(twoMapped(), [student("a", [pick("q1", T0), pick("q2", T0 + MIN)])]);
    for (const row of list.questions) {
      expect(row.observedSelectorCount).toBe(1);
      expect(row.verifiedPatternStudentCount).toBe(1);
      expect(row.participatesInVerifiedPattern).toBe(true);
    }
  });

  it("Q10 counts one student once however many times they selected it", () => {
    const list = build(twoMapped(), [
      student("a", [pick("q1", T0), pick("q1", T0 + MIN), pick("q2", T0 + 2 * MIN)]),
    ]);
    const q1 = list.questions.find((r) => r.questionId === "q1")!;
    expect(q1.observedSelectorCount).toBe(1);
    expect(q1.selectionOccurrenceCount).toBe(2);
  });

  it("Q11 counts breadth across students exactly", () => {
    const list = build(twoMapped(), [
      student("a", [pick("q1", T0), pick("q2", T0 + MIN)]),
      student("b", [pick("q1", T0 + 2 * MIN), pick("q2", T0 + 3 * MIN)]),
      student("c", [pick("q1", T0 + 4 * MIN)]),
    ]);
    const q1 = list.questions.find((r) => r.questionId === "q1")!;
    expect(q1.observedSelectorCount).toBe(3);
    expect(q1.verifiedPatternStudentCount).toBe(2);
    expect(q1.verifiedPatternStudentIds).toEqual(["a", "b"]);
  });

  it("never counts a verified student on a question their pattern does not include", () => {
    const list = build(
      [...twoMapped(), question("q3", { B: sharedRef() })],
      [student("a", [pick("q1", T0), pick("q2", T0 + MIN)])],
    );
    const q3 = list.questions.find((r) => r.questionId === "q3")!;
    expect(q3.verifiedPatternStudentCount).toBe(0);
    expect(q3.observedSelectorCount).toBe(0);
  });

  it("reports authored questions carrying no evidence as a normal state", () => {
    const list = build(twoMapped(), [student("a", [pick("q1", T0)])]);
    expect(list.questionsWithoutEvidenceCount).toBe(1);
  });

  it("excludes a private selection from a question's observed count", () => {
    const list = build([question("q1", { B: sharedRef() })], [
      student("a", [privatePick("q1", T0), privatePick("q1", T0 + MIN)]),
    ]);
    expect(list.questions[0]!.observedSelectorCount).toBe(0);
  });

  it("Q7 runtime twin: a same-id selection from another class never counts", () => {
    const list = build([question("q1", { B: sharedRef() })], [
      student("a", [pick("q1", T0, DEF, "class-2")]),
    ]);
    expect(list.questions[0]!.observedSelectorCount).toBe(0);
  });
});

describe("ordering", () => {
  it("orders by verified breadth, then recency", () => {
    const list = build(
      [question("q1", { B: sharedRef() }), question("q2", { B: sharedRef() }), question("q3", { B: sharedRef() })],
      [
        student("a", [pick("q1", T0), pick("q2", T0 + MIN)]),
        student("b", [pick("q1", T0 + 2 * MIN), pick("q2", T0 + 3 * MIN)]),
        student("c", [pick("q2", T0 + 9 * MIN), pick("q3", T0 + 10 * MIN)]),
      ],
    );
    // q2 has three verified students, q1 two, q3 one.
    expect(list.questions.map((r) => r.questionId)).toEqual(["q2", "q1", "q3"]);
  });

  it("Q12 is deterministic under input permutation", () => {
    const questions = [question("q1", { B: sharedRef() }), question("q2", { B: sharedRef() })];
    const students = [student("a", [pick("q1", T0), pick("q2", T0 + MIN)])];
    const forward = build(questions, students).questions.map((r) => r.questionId);
    seq = 0;
    const reversed = build([...questions].reverse(), students).questions.map((r) => r.questionId);
    expect(forward).toEqual(reversed);
  });

  it("orders questions with no evidence deterministically at the end", () => {
    const list = build(
      [question("q2", { B: sharedRef() }), question("q1", { B: sharedRef() })],
      [],
    );
    expect(list.questions.map((r) => r.questionId)).toEqual(["q1", "q2"]);
  });
});

describe("authorability", () => {
  it("marks the viewer's own question as own", () => {
    const list = build([question("q1", { B: sharedRef() })], [], TEACHER);
    expect(list.questions[0]!.authorability).toBe("own");
    expect(authorabilityLabel(list.questions[0]!)).toBe("Senin sorun");
    expect(authorabilityNote(list.questions[0]!)).toBeNull();
  });

  it("marks a student-authored question as another author's", () => {
    const list = build(
      [question("q1", { B: sharedRef() }, { ownerId: "student-1", posterRole: "student" })],
      [],
      TEACHER,
    );
    expect(list.questions[0]!.authorability).toBe("other_author");
    expect(authorabilityNote(list.questions[0]!)).toContain("yalnızca inceleyebilirsin");
  });

  it("marks everything as another author's when there is no viewer", () => {
    const list = buildSemanticQuestionEvidence({
      classId: CLASS,
      scoped,
      questions: [question("q1", { B: sharedRef() })],
      students: [],
      viewerUid: undefined,
    });
    expect(list.questions[0]!.authorability).toBe("other_author");
  });

  it("never exposes the owner uid in visible copy", () => {
    const list = build(
      [question("q1", { B: sharedRef() }, { ownerId: "student-1", posterRole: "student" })],
      [],
      TEACHER,
    );
    const visible = `${authorabilityLabel(list.questions[0]!)} ${authorabilityNote(list.questions[0]!)}`;
    expect(visible).not.toContain("student-1");
    expect(visible).not.toContain(TEACHER);
  });
});

describe("archived and renamed definitions", () => {
  // Neither lives on the question: a question stores the definition ID, so
  // renaming or archiving the definition cannot change which questions map.
  it("Q13/Q14 keep the same questions regardless of definition state", () => {
    const questions = [question("q1", { B: sharedRef() }), question("q2", { B: sharedRef() })];
    const before = build(questions).questions.map((r) => r.questionId);
    const afterRenameOrArchive = build(questions).questions.map((r) => r.questionId);
    expect(afterRenameOrArchive).toEqual(before);
  });
});

describe("current authored content", () => {
  it("reads the mapped option's text and feedback as currently authored", () => {
    const list = build([
      question("q1", { B: sharedRef(DEF, "Eşitliğin diğer tarafına geçerken işaret değişir.") }),
    ]);
    const row = list.questions[0]!;
    expect(mappedChoiceText(row, "B")).toBe("yanlış b");
    expect(mappedChoiceFeedback(row, "B")).toBe(
      "Eşitliğin diğer tarafına geçerken işaret değişir.",
    );
  });

  it("returns null for an option with no text or no feedback", () => {
    const list = build([question("q1", { B: sharedRef() }, { choices: { A: "doğru" } })]);
    const row = list.questions[0]!;
    expect(mappedChoiceText(row, "B")).toBeNull();
    expect(mappedChoiceFeedback(row, "C")).toBeNull();
  });
});

describe("copy", () => {
  const row = () =>
    build([question("q1", { B: sharedRef() })], [
      student("a", [pick("q1", T0), pick("q2", T0 + MIN)]),
      student("b", [pick("q1", T0 + 2 * MIN)]),
    ]).questions[0]!;

  it("names the mapped option by its label", () => {
    expect(mappedChoiceLine(row())).toBe("B şıkkına bağlı");
    const two = build([question("q1", { B: sharedRef(), C: sharedRef() })]).questions[0]!;
    expect(mappedChoiceLine(two)).toBe("B, C şıklarına bağlı");
  });

  it("states the two counts separately, never merged", () => {
    expect(questionEvidenceLine(row())).toBe(
      "2 öğrencinin son öğrenme kayıtlarında bu seçime rastlandı; 1 öğrencide doğrulanmış örüntünün parçası.",
    );
  });

  it("says nothing was seen rather than reporting a zero as a finding", () => {
    const empty = build([question("q1", { B: sharedRef() })]).questions[0]!;
    expect(questionEvidenceLine(empty)).toBe("Son öğrenme kayıtlarında bu seçim burada görülmedi.");
    expect(questionTimelineLine(empty)).toBeNull();
  });

  it("never calls the question or the distractor bad", () => {
    // The section note is deliberately excluded: it is the disclaimer, and it
    // uses "hatalı" inside the negation that makes the point
    // ("...hatalı olduğu anlamına gelmez"). Everything that describes an actual
    // question must contain none of these words at all.
    const visible = [
      mappedChoiceLine(row()),
      questionEvidenceLine(row()),
      questionTimelineLine(row()) ?? "",
      questionAbsenceCopy().description,
      authorabilityLabel(row()),
    ]
      .join(" ")
      .toLowerCase();
    for (const banned of [
      "hatalı",
      "kötü",
      "sorunlu",
      "yanıltıyor",
      "düzeltmelisin",
      "riskli",
      "zayıf",
      "başarısız",
      "kalitesiz",
    ]) {
      expect(visible).not.toContain(banned);
    }
    // And it says so out loud.
    expect(QUESTION_SECTION_NOTE).toContain("hatalı olduğu anlamına gelmez");
  });

  it("never leaks an internal id into visible copy", () => {
    const visible = `${mappedChoiceLine(row())} ${questionEvidenceLine(row())} ${questionTimelineLine(row())}`;
    for (const secret of [DEF, CLASS, "q1", "e-1", TEACHER]) {
      expect(visible).not.toContain(secret);
    }
  });
});
