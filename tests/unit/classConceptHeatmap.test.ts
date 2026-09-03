// Phase 73 — the class concept heatmap.
//
// The honesty blocks matter most: a topic where two students are stuck must not
// be smoothed over by the eight who are fine, and a topic where one student is
// steady and four have no usable evidence must not read as steady.

import {
  buildClassConceptHeatmap,
  ClassConceptHeatmap,
  ClassStudentEvidence,
  conceptCellFacts,
  conceptCellLabel,
  standingLabel,
} from "../../src/features/teacher/services/classConceptHeatmap";
import { StudyItem } from "../../src/features/study/services/studyService";
import { Question } from "../../src/types/question";

const NOW = 1_700_000_000_000;

function question(id: string, subject = "Matematik", topic = "Denklemler"): Question {
  return {
    id, ownerId: "t1", organizationId: "org", visibility: "class",
    imageUrl: "", classId: "c1", subject, topic, gradeLevel: "9",
    description: null, posterRole: "teacher", createdAt: 0,
    likeCount: 0, commentCount: 0, answerCount: 0,
    choices: null, correctChoice: null, hints: [],
  };
}

function baseItem(questionId: string): StudyItem {
  return {
    questionId, status: "review", lastOutcome: "solved", intervalDays: 2,
    successfulReviews: 1, attemptCount: 3, nextReviewAt: NOW + 86400000,
    lastReviewedAt: NOW, source: "class", sourceClassId: "c1",
    solvedCount: 3, struggledCount: 0, againCount: 0,
  };
}

/** Phase 42 stable: no struggles across >= 3 recorded outcomes. */
const stableItem = (qid: string) => baseItem(qid);

/** Phase 42 persistent_struggle: >= 2 struggles, no standing recovery. */
function persistentItem(qid: string): StudyItem {
  return { ...baseItem(qid), lastOutcome: "struggled", successfulReviews: 0,
    attemptCount: 5, solvedCount: 1, struggledCount: 4, againCount: 0 };
}

/** Phase 42 recovering: >= 2 struggles, last solved, success standing. */
function recoveringItem(qid: string): StudyItem {
  return { ...baseItem(qid), lastOutcome: "solved", successfulReviews: 2,
    attemptCount: 4, solvedCount: 2, struggledCount: 2, againCount: 0 };
}

/** Pre-Phase-41: counters absent, history genuinely unknown. */
function legacyItem(qid: string): StudyItem {
  return { ...baseItem(qid), solvedCount: null, struggledCount: null, againCount: null };
}

function build(
  students: ClassStudentEvidence[],
  questions: Question[] = [question("q1"), question("q2"), question("q3"), question("q4"), question("q5")],
): ClassConceptHeatmap {
  const map = new Map<string, Question | null>(questions.map((q) => [q.id, q]));
  return buildClassConceptHeatmap({ students, questionsById: map });
}

function student(uid: string, name: string, items: StudyItem[]): ClassStudentEvidence {
  return { studentUid: uid, displayName: name, items };
}

describe("class heatmap — shape", () => {
  it("is empty with no students", () => {
    const heatmap = build([]);
    expect(heatmap.isEmpty).toBe(true);
    expect(heatmap.cells).toHaveLength(0);
  });

  it("is empty when no student has any item", () => {
    expect(build([student("a", "A", [])]).isEmpty).toBe(true);
  });

  it("groups a topic across students", () => {
    const heatmap = build([
      student("a", "Ayşe", [stableItem("q1")]),
      student("b", "Berk", [stableItem("q2")]),
    ]);
    expect(heatmap.cells).toHaveLength(1);
    expect(heatmap.cells[0]!.studentCount).toBe(2);
  });

  it("keeps different topics separate", () => {
    const heatmap = build(
      [student("a", "Ayşe", [stableItem("q1"), stableItem("q2")])],
      [question("q1"), question("q2", "Matematik", "Geometri")],
    );
    expect(heatmap.cells).toHaveLength(2);
  });

  it("does not merge the same topic name under different subjects", () => {
    const heatmap = build(
      [student("a", "Ayşe", [stableItem("q1"), stableItem("q2")])],
      [question("q1", "Matematik", "Denklemler"), question("q2", "Fizik", "Denklemler")],
    );
    expect(heatmap.cells).toHaveLength(2);
  });

  it("counts a student once per topic however many questions they have", () => {
    const heatmap = build([student("a", "Ayşe", [stableItem("q1"), stableItem("q2"), stableItem("q3")])]);
    expect(heatmap.cells[0]!.studentCount).toBe(1);
  });
});

describe("class heatmap — missing metadata", () => {
  it("omits an item whose question cannot be resolved", () => {
    const map = new Map<string, Question | null>([["q1", null]]);
    const heatmap = buildClassConceptHeatmap({
      students: [student("a", "Ayşe", [stableItem("q1")])],
      questionsById: map,
    });
    expect(heatmap.isEmpty).toBe(true);
  });

  it("omits an item with no topic", () => {
    const heatmap = build([student("a", "Ayşe", [stableItem("q1")])], [question("q1", "Matematik", "")]);
    expect(heatmap.isEmpty).toBe(true);
  });

  it("omits an item with no subject", () => {
    const heatmap = build([student("a", "Ayşe", [stableItem("q1")])], [question("q1", "", "Denklemler")]);
    expect(heatmap.isEmpty).toBe(true);
  });
});

describe("class heatmap — student standing", () => {
  it("reads a stuck student as repeated struggle", () => {
    const cell = build([student("a", "Ayşe", [persistentItem("q1")])]).cells[0]!;
    expect(cell.persistentStruggleStudents).toBe(1);
    expect(cell.students[0]!.standing).toBe("persistent_struggle");
  });

  it("reads a recovering student", () => {
    const cell = build([student("a", "Ayşe", [recoveringItem("q1")])]).cells[0]!;
    expect(cell.recoveringStudents).toBe(1);
  });

  it("reads a steady student", () => {
    const cell = build([student("a", "Ayşe", [stableItem("q1")])]).cells[0]!;
    expect(cell.steadyStudents).toBe(1);
  });

  it("reads a legacy student as insufficient, never as steady", () => {
    const cell = build([student("a", "Ayşe", [legacyItem("q1")])]).cells[0]!;
    expect(cell.insufficientStudents).toBe(1);
    expect(cell.steadyStudents).toBe(0);
  });

  it("lets one stuck question outrank the student's other questions", () => {
    const cell = build([
      student("a", "Ayşe", [stableItem("q1"), stableItem("q2"), persistentItem("q3")]),
    ]).cells[0]!;
    expect(cell.persistentStruggleStudents).toBe(1);
  });

  it("needs a majority of steady questions before calling a student steady", () => {
    const cell = build([
      student("a", "Ayşe", [stableItem("q1"), legacyItem("q2"), legacyItem("q3")]),
    ]).cells[0]!;
    expect(cell.steadyStudents).toBe(0);
    expect(cell.insufficientStudents).toBe(1);
  });
});

describe("class heatmap — conservative class aggregation", () => {
  // §77 — the mandatory honesty case.
  it("does not call a topic steady when most students have no usable evidence", () => {
    const cell = build([
      student("a", "Ayşe", [stableItem("q1")]),
      student("b", "Berk", [legacyItem("q2")]),
      student("c", "Ceren", [legacyItem("q3")]),
      student("d", "Deniz", [legacyItem("q4")]),
      student("e", "Ece", [legacyItem("q5")]),
    ]).cells[0]!;
    expect(cell.presentation).toBe("insufficient");
    expect(cell.presentation).not.toBe("steady");
    expect(conceptCellLabel(cell)).toBe("Yeterli kanıt yok");
  });

  // §78 — persistent struggle must never be averaged away.
  it("keeps two stuck students visible behind eight steady ones", () => {
    const steady = Array.from({ length: 8 }, (_, i) =>
      student(`s${i}`, `S${i}`, [stableItem("q1")]),
    );
    const cell = build([
      ...steady,
      student("x", "Xavier", [persistentItem("q2")]),
      student("y", "Yasemin", [persistentItem("q3")]),
    ]).cells[0]!;
    expect(cell.presentation).toBe("needs_attention");
    expect(cell.persistentStruggleStudents).toBe(2);
    expect(cell.steadyStudents).toBe(8);
  });

  it("calls a topic steady only when steady students are the majority", () => {
    const cell = build([
      student("a", "Ayşe", [stableItem("q1")]),
      student("b", "Berk", [stableItem("q2")]),
      student("c", "Ceren", [legacyItem("q3")]),
    ]).cells[0]!;
    expect(cell.presentation).toBe("steady");
  });

  it("refuses steady at an exact half", () => {
    const cell = build([
      student("a", "Ayşe", [stableItem("q1")]),
      student("b", "Berk", [stableItem("q2")]),
      student("c", "Ceren", [legacyItem("q3")]),
      student("d", "Deniz", [legacyItem("q4")]),
    ]).cells[0]!;
    expect(cell.presentation).toBe("insufficient");
  });

  it("prefers attention over recovery when both are present", () => {
    const cell = build([
      student("a", "Ayşe", [persistentItem("q1")]),
      student("b", "Berk", [recoveringItem("q2")]),
    ]).cells[0]!;
    expect(cell.presentation).toBe("needs_attention");
  });

  it("reports recovery when nobody is still stuck", () => {
    const cell = build([
      student("a", "Ayşe", [recoveringItem("q1")]),
      student("b", "Berk", [stableItem("q2")]),
    ]).cells[0]!;
    expect(cell.presentation).toBe("recovering");
  });
});

describe("class heatmap — determinism", () => {
  const students = [
    student("c", "Ceren", [stableItem("q3")]),
    student("a", "Ayşe", [persistentItem("q1")]),
    student("b", "Berk", [recoveringItem("q2")]),
  ];

  it("orders students by standing then name", () => {
    const cell = build(students).cells[0]!;
    expect(cell.students.map((s) => s.displayName)).toEqual(["Ayşe", "Berk", "Ceren"]);
  });

  it("is identical whatever order students arrive in", () => {
    const forward = build(students).cells[0]!.students.map((s) => s.studentUid);
    const reversed = build([...students].reverse()).cells[0]!.students.map((s) => s.studentUid);
    expect(reversed).toEqual(forward);
  });

  it("orders topics with attention first", () => {
    const heatmap = build(
      [
        student("a", "Ayşe", [stableItem("q1"), persistentItem("q2")]),
      ],
      [question("q1", "Matematik", "Alpha"), question("q2", "Matematik", "Beta")],
    );
    expect(heatmap.cells.map((c) => c.topic)).toEqual(["Beta", "Alpha"]);
  });
});

describe("class heatmap — factual counts", () => {
  it("states counts of people, never a share", () => {
    const cell = build([
      student("a", "Ayşe", [persistentItem("q1")]),
      student("b", "Berk", [persistentItem("q2")]),
      student("c", "Ceren", [recoveringItem("q3")]),
      student("d", "Deniz", [legacyItem("q4")]),
    ]).cells[0]!;
    const facts = conceptCellFacts(cell);
    expect(facts).toContain("2 öğrencide tekrar eden zorlanma");
    expect(facts).toContain("1 öğrencide toparlanma");
    expect(facts).toContain("1 öğrencide yeterli kanıt yok");
    expect(facts.join(" ")).not.toMatch(/%/);
  });

  it("omits a fact that would report an absence", () => {
    const facts = conceptCellFacts(build([student("a", "Ayşe", [stableItem("q1")])]).cells[0]!);
    expect(facts).toEqual(["1 öğrencide istikrarlı kanıt"]);
  });
});

describe("class heatmap — copy safety", () => {
  function allCopy(): string {
    const heatmap = build([
      student("a", "Ayşe", [persistentItem("q1")]),
      student("b", "Berk", [recoveringItem("q2")]),
      student("c", "Ceren", [legacyItem("q3")]),
    ]);
    const parts: string[] = [];
    for (const cell of heatmap.cells) {
      parts.push(conceptCellLabel(cell), ...conceptCellFacts(cell));
      for (const s of cell.students) parts.push(standingLabel(s.standing));
    }
    return parts.join(" | ");
  }

  it("states no percentage, mastery or score", () => {
    const copy = allCopy();
    expect(copy).not.toMatch(/%/);
    expect(copy).not.toMatch(/puan|skor|başarı oranı|ustalık|risk/i);
  });

  it("never labels a student as weak or failing", () => {
    const copy = allCopy().toLocaleLowerCase("tr");
    for (const word of ["zayıf", "başarısız", "kötü", "riskli", "sorunlu"]) {
      expect(copy).not.toContain(word);
    }
  });

  it("never exposes an internal enum", () => {
    const copy = allCopy();
    for (const leak of [
      "persistent_struggle", "insufficient_data", "needs_attention",
      "recovering", "studyItems", "struggledCount",
    ]) {
      expect(copy).not.toContain(leak);
    }
  });
});
