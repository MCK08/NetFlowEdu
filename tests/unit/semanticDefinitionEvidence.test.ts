import { LearningEvent } from "../../src/features/learningStory/services/learningTrail";
import {
  buildClassSemanticCohorts,
  ClassSemanticStudentEvidence,
  MIN_COHORT_STUDENTS,
} from "../../src/features/teacher/services/classSemanticCohorts";
import {
  buildSemanticDefinitionEvidenceIndex,
  BOUNDED_WINDOW_NOTE,
  cohortStatusLine,
  coverageVersusEvidenceLine,
  emptyDefinitionEvidence,
  evidenceForDefinition,
  MAX_INITIAL_EVIDENCE_STUDENTS,
  recoveryLine,
  SemanticDefinitionEvidence,
  studentEvidenceStateLabel,
  supportingQuestionsLine,
  verifiedStudentsLine,
} from "../../src/features/teacher/services/semanticDefinitionEvidence";
import { buildClassSemanticVocabulary } from "../../src/features/teacher/services/semanticDefinitionCoverage";
import { SemanticDefinition } from "../../src/features/questions/services/semanticDefinition";
import { Question } from "../../src/types/question";

// Phase 83 — the definition-centric view over the SAME shared evidence stage
// Phase 81 reads. The matrix below is the spec's AP1–AP18, then the Phase 81
// (AQ) and Phase 82 (AR) compatibility contracts.

const T0 = 1_700_000_000_000;
const CLASS = "class-1";
const DEF = "def-a";

let seq = 0;
beforeEach(() => {
  seq = 0;
});

function shared(
  over: Partial<LearningEvent> & { definitionId?: string; classId?: string; label?: string } = {},
): LearningEvent {
  const { definitionId = DEF, classId = CLASS, label = "İşaret aktarımı", ...rest } = over;
  return {
    id: `e-${++seq}`,
    questionId: "q1",
    outcome: "struggled",
    occurredAt: T0,
    subject: "Matematik",
    topic: "Denklemler",
    semanticChoice: {
      identity: { namespaceKind: "class", namespaceId: classId, semanticId: definitionId },
      choiceLabel: "B",
      label,
    },
    ...rest,
  };
}

function priv(over: Partial<LearningEvent> & { key?: string } = {}): LearningEvent {
  const { key = "isaret_aktarimi", ...rest } = over;
  return {
    id: `e-${++seq}`,
    questionId: "q1",
    outcome: "struggled",
    occurredAt: T0,
    subject: "Matematik",
    topic: "Denklemler",
    semanticChoice: {
      identity: { namespaceKind: "author", namespaceId: "teacher-1", semanticId: key },
      choiceLabel: "B",
      label: null,
    },
    ...rest,
  };
}

/** Two distinct-question selections — Phase 78's own threshold, stated once. */
function qualifying(options: { definitionId?: string; questions?: [string, string]; at?: number } = {}) {
  const at = options.at ?? T0;
  const [q1, q2] = options.questions ?? ["q1", "q2"];
  return [
    shared({ questionId: q1, occurredAt: at, definitionId: options.definitionId }),
    shared({ questionId: q2, occurredAt: at + 1_000, definitionId: options.definitionId }),
  ];
}

/** Two later, distinct questions that OFFERED the meaning and were declined —
 *  Phase 79's own recovery contract. */
function declines(at: number, definitionId = DEF): LearningEvent[] {
  const offer = (q: string, when: number): LearningEvent => ({
    ...shared({ questionId: q, occurredAt: when }),
    semanticChoice: null,
    semanticOpportunities: {
      items: [{ namespaceKind: "class", namespaceId: CLASS, semanticId: definitionId }],
      selectedChoice: "A",
    },
  });
  return [offer("q7", at), offer("q8", at + 1_000)];
}

function student(uid: string, events: LearningEvent[], displayName = uid): ClassSemanticStudentEvidence {
  return { studentUid: uid, displayName, events };
}

function definition(id = DEF, over: Partial<SemanticDefinition> = {}): SemanticDefinition {
  return {
    id,
    classId: CLASS,
    label: "İşaret aktarımı",
    description: null,
    subject: "Matematik",
    topic: "Denklemler",
    archived: false,
    createdBy: "teacher-1",
    createdAt: T0,
    updatedAt: T0,
    ...over,
  } as SemanticDefinition;
}

function trail(students: ClassSemanticStudentEvidence[], def = definition()): SemanticDefinitionEvidence {
  return evidenceForDefinition(buildSemanticDefinitionEvidenceIndex({ classId: CLASS, students }), def);
}

// ---------------------------------------------------------------- AP1–AP4
describe("definition evidence — nothing qualifies", () => {
  it("AP1 — no events: zero verified students, not a cohort", () => {
    const e = trail([student("a", [])]);
    expect(e.verifiedStudentCount).toBe(0);
    expect(e.students).toEqual([]);
    expect(e.classCohortQualified).toBe(false);
    expect(e.latestEvidenceAt).toBeNull();
  });

  it("AP2 — private-only patterns never enter a definition trail", () => {
    const e = trail([
      student("a", [priv({ questionId: "q1" }), priv({ questionId: "q2", occurredAt: T0 + 1 })]),
    ]);
    expect(e.verifiedStudentCount).toBe(0);
  });

  it("AP3 — one shared selection is not a pattern", () => {
    expect(trail([student("a", [shared()])]).verifiedStudentCount).toBe(0);
  });

  it("AP4 — two selections on the SAME question are not a pattern", () => {
    const e = trail([
      student("a", [shared({ questionId: "q1" }), shared({ questionId: "q1", occurredAt: T0 + 1 })]),
    ]);
    expect(e.verifiedStudentCount).toBe(0);
  });

  it("an index with no students examines zero and reports it", () => {
    const index = buildSemanticDefinitionEvidenceIndex({ classId: CLASS, students: [] });
    expect(index.examinedStudentCount).toBe(0);
    expect(index.qualifyingStudentCount).toBe(0);
  });
});

// ---------------------------------------------------------------- AP5–AP8
describe("definition evidence — qualifying students", () => {
  it("AP5 — one qualifying student is individual evidence, not a cohort", () => {
    const e = trail([student("a", qualifying())]);
    expect(e.verifiedStudentCount).toBe(1);
    expect(e.classCohortQualified).toBe(false);
    expect(e.students[0]?.studentUid).toBe("a");
    expect(e.students[0]?.distinctQuestionCount).toBe(2);
    expect(e.students[0]?.occurrenceCount).toBe(2);
  });

  it("AP6 — two qualifying students satisfy the Phase 81 threshold", () => {
    const e = trail([student("a", qualifying()), student("b", qualifying())]);
    expect(e.verifiedStudentCount).toBe(2);
    expect(e.classCohortQualified).toBe(true);
    expect(MIN_COHORT_STUDENTS).toBe(2);
  });

  it("AP7 — supporting questions are a UNION, not a sum", () => {
    const e = trail([
      student("a", qualifying({ questions: ["q1", "q2"] })),
      student("b", qualifying({ questions: ["q2", "q3"] })),
    ]);
    expect(e.distinctSupportingQuestionCount).toBe(3);
    expect(e.supportingQuestionIds).toEqual(["q1", "q2", "q3"]);
    // …while each student's own breadth is untouched.
    expect(e.students.map((s) => s.distinctQuestionCount)).toEqual([2, 2]);
  });

  it("AP8 — one active, one recovery: counts are exact and the recovering student stays", () => {
    const e = trail([
      student("a", qualifying()),
      student("b", [...qualifying(), ...declines(T0 + 5_000)]),
    ]);
    expect(e.verifiedStudentCount).toBe(2);
    expect(e.activeRepeatedStudentIds).toEqual(["a"]);
    expect(e.recoverySignalStudentIds).toEqual(["b"]);
    expect(e.classCohortQualified).toBe(true);
  });

  it("counts each student exactly once", () => {
    const e = trail([student("a", [...qualifying(), ...qualifying({ questions: ["q3", "q4"] })])]);
    expect(e.verifiedStudentCount).toBe(1);
    expect(e.students).toHaveLength(1);
  });

  it("sums occurrences across counted students as a plain count", () => {
    const e = trail([student("a", qualifying()), student("b", qualifying({ questions: ["q3", "q4"] }))]);
    expect(e.selectedOccurrenceCount).toBe(4);
  });
});

// ---------------------------------------------------------------- AP9
describe("definition evidence — reselection", () => {
  it("AP9 — a later reselection withdraws the recovery signal (Phase 79, unchanged)", () => {
    const e = trail([
      student("b", [
        ...qualifying(),
        ...declines(T0 + 5_000),
        shared({ questionId: "q9", occurredAt: T0 + 20_000 }),
      ]),
    ]);
    expect(e.recoverySignalStudentIds).toEqual([]);
    expect(e.activeRepeatedStudentIds).toEqual(["b"]);
    expect(e.students[0]?.hasRecoverySignal).toBe(false);
  });
});

// ---------------------------------------------------------------- AP10–AP12
describe("definition evidence — identity isolation", () => {
  it("AP10 — same visible label, different ids: never merged", () => {
    const students = [
      student("a", qualifying({ definitionId: "def-1" })),
      student("b", qualifying({ definitionId: "def-2" })),
    ];
    const index = buildSemanticDefinitionEvidenceIndex({ classId: CLASS, students });
    const one = evidenceForDefinition(index, definition("def-1"));
    const two = evidenceForDefinition(index, definition("def-2"));
    expect(one.verifiedStudentCount).toBe(1);
    expect(two.verifiedStudentCount).toBe(1);
    expect(one.classCohortQualified).toBe(false);
    expect(two.classCohortQualified).toBe(false);
    expect(one.students[0]?.studentUid).toBe("a");
    expect(two.students[0]?.studentUid).toBe("b");
  });

  it("AP11 — a private key whose text matches the label contributes nothing", () => {
    const e = trail([
      student("a", qualifying()),
      student("b", [
        priv({ questionId: "q1", key: "isaret_aktarimi" }),
        priv({ questionId: "q2", key: "isaret_aktarimi", occurredAt: T0 + 1 }),
      ]),
    ]);
    expect(e.verifiedStudentCount).toBe(1);
    expect(e.students.map((s) => s.studentUid)).toEqual(["a"]);
  });

  it("AP12 — the same definition id string in ANOTHER class never merges", () => {
    const e = trail([
      student("a", qualifying()),
      student("b", [
        shared({ questionId: "q1", classId: "class-2" }),
        shared({ questionId: "q2", classId: "class-2", occurredAt: T0 + 1 }),
      ]),
    ]);
    expect(e.verifiedStudentCount).toBe(1);
    expect(e.students.map((s) => s.studentUid)).toEqual(["a"]);
  });

  it("keeps the same definition met under a different topic separate, as Phase 81 does", () => {
    const students = [
      student("a", qualifying()),
      student("b", [
        shared({ questionId: "q1", topic: "Kesirler" }),
        shared({ questionId: "q2", topic: "Kesirler", occurredAt: T0 + 1 }),
      ]),
    ];
    const index = buildSemanticDefinitionEvidenceIndex({ classId: CLASS, students });
    expect(evidenceForDefinition(index, definition()).students.map((s) => s.studentUid)).toEqual(["a"]);
    expect(
      evidenceForDefinition(index, definition(DEF, { topic: "Kesirler" })).students.map((s) => s.studentUid),
    ).toEqual(["b"]);
  });
});

// ---------------------------------------------------------------- AP13–AP15
describe("definition evidence — rename / archive / unarchive", () => {
  const students = [
    student("a", qualifying({ questions: ["q1", "q2"] })),
    student("b", [...qualifying({ questions: ["q2", "q3"] }), ...declines(T0 + 5_000)]),
  ];

  function snapshot(e: SemanticDefinitionEvidence) {
    return {
      id: e.definitionId,
      members: e.students.map((s) => s.studentUid),
      questions: e.supportingQuestionIds,
      recovery: e.recoverySignalStudentIds,
      cohort: e.classCohortQualified,
    };
  }

  it("AP13 — renaming changes nothing about the evidence", () => {
    const before = snapshot(trail(students, definition(DEF, { label: "İşaret aktarımı" })));
    const after = snapshot(trail(students, definition(DEF, { label: "İşaret geçişi" })));
    expect(after).toEqual(before);
  });

  it("AP14 — archiving retains the trail", () => {
    const before = snapshot(trail(students, definition()));
    const after = snapshot(trail(students, definition(DEF, { archived: true })));
    expect(after).toEqual(before);
    expect(after.members).toHaveLength(2);
  });

  it("AP15 — unarchiving is the same identity and the same trail", () => {
    const archived = snapshot(trail(students, definition(DEF, { archived: true })));
    const restored = snapshot(trail(students, definition(DEF, { archived: false })));
    expect(restored).toEqual(archived);
  });
});

// ---------------------------------------------------------------- AP16–AP18
describe("definition evidence — robustness", () => {
  it("AP16 — output is identical under any event order", () => {
    const base = [
      ...qualifying({ questions: ["q1", "q2"] }),
      ...declines(T0 + 5_000),
      shared({ questionId: "q5", occurredAt: T0 + 2_000 }),
    ];
    const reference = trail([student("a", base), student("b", qualifying({ questions: ["q2", "q3"] }))]);
    for (let i = 0; i < 12; i += 1) {
      const shuffled = [...base].sort(() => (Math.sin(i * 9973 + base.length) > 0 ? 1 : -1));
      const again = trail([student("b", qualifying({ questions: ["q2", "q3"] })), student("a", shuffled)]);
      expect(again).toEqual(reference);
    }
  });

  it("AP17 — malformed / legacy semantic payloads are ignored, never guessed", () => {
    // Every shape here is one the read path can actually deliver: a legacy
    // event with no semantic payload, an event whose identity component is
    // blank, and an event whose question metadata never resolved. A null or
    // structurally broken identity is NOT among them, because
    // learningEventService's parser already refuses to build such an event —
    // that guard lives upstream, once, and is not re-implemented here.
    const e = trail([
      student("a", [
        { ...shared({ questionId: "q1" }), semanticChoice: null },
        { ...shared({ questionId: "q2" }), semanticChoice: undefined },
        shared({ questionId: "q3", definitionId: "   " }),
        shared({ questionId: "q4", classId: "" }),
        shared({ questionId: "q5", subject: "" }),
        shared({ questionId: "q6", topic: "   " }),
        { ...shared({ questionId: "" }) },
      ]),
    ]);
    expect(e.verifiedStudentCount).toBe(0);
    // …and a legitimate pattern beside the garbage is still found, so the
    // garbage was skipped rather than the whole student discarded.
    const mixed = trail([
      student("a", [
        { ...shared({ questionId: "q1" }), semanticChoice: null },
        shared({ questionId: "q8", definitionId: "" }),
        ...qualifying({ questions: ["q2", "q3"] }),
      ]),
    ]);
    expect(mixed.verifiedStudentCount).toBe(1);
  });

  it("AP18 — the output is a function of the supplied bounded window only", () => {
    const window = [student("a", qualifying())];
    expect(trail(window)).toEqual(trail(window));
    expect(BOUNDED_WINDOW_NOTE).toMatch(/son öğrenme kayıtları/);
    expect(BOUNDED_WINDOW_NOTE).not.toMatch(/tüm|bütün|her zaman/);
  });

  it("does not mutate its inputs", () => {
    const events = qualifying();
    const copy = JSON.parse(JSON.stringify(events));
    trail([student("a", events)]);
    expect(events).toEqual(copy);
  });

  it("an unknown definition resolves to the empty trail, not null", () => {
    const index = buildSemanticDefinitionEvidenceIndex({ classId: CLASS, students: [student("a", qualifying())] });
    expect(evidenceForDefinition(index, definition("def-nope"))).toEqual(emptyDefinitionEvidence(definition("def-nope")));
  });

  it("orders students: still-repeating first, then most recent, then breadth, then name", () => {
    const e = trail([
      student("recovering", [...qualifying({ at: T0 + 9_000 }), ...declines(T0 + 20_000)]),
      student("older", qualifying({ at: T0 })),
      student("newer", qualifying({ at: T0 + 5_000 })),
      student("newer-broad", [...qualifying({ at: T0 + 5_000 }), shared({ questionId: "q3", occurredAt: T0 + 5_500 })]),
    ]);
    expect(e.students.map((s) => s.studentUid)).toEqual(["newer-broad", "newer", "older", "recovering"]);
  });
});

// ---------------------------------------------------------------- AQ
describe("Phase 81 compatibility — one truth, not two", () => {
  const cases: { name: string; students: ClassSemanticStudentEvidence[] }[] = [
    { name: "none", students: [student("a", [shared()])] },
    { name: "one", students: [student("a", qualifying())] },
    {
      name: "two with union and recovery",
      students: [
        student("a", qualifying({ questions: ["q1", "q2"] })),
        student("b", [...qualifying({ questions: ["q2", "q3"] }), ...declines(T0 + 5_000)]),
      ],
    },
    {
      name: "three across two definitions",
      students: [
        student("a", qualifying({ definitionId: "def-1" })),
        student("b", qualifying({ definitionId: "def-1", questions: ["q3", "q4"] })),
        student("c", qualifying({ definitionId: "def-2" })),
      ],
    },
  ];

  for (const c of cases) {
    it(`agrees with Phase 81 on membership, question union and recovery — ${c.name}`, () => {
      const index = buildSemanticDefinitionEvidenceIndex({ classId: CLASS, students: c.students });
      const summary = buildClassSemanticCohorts({ classId: CLASS, students: c.students, interventionCandidates: [] });

      for (const [definitionId, scopes] of index.byDefinitionId) {
        for (const e of scopes) {
          const cohort = summary.cohorts.find(
            (x) => x.definitionId === definitionId && x.subject === e.subject && x.topic === e.topic,
          );
          if (e.verifiedStudentCount < MIN_COHORT_STUDENTS) {
            expect(cohort).toBeUndefined();
            expect(e.classCohortQualified).toBe(false);
          } else {
            expect(cohort).toBeDefined();
            expect(e.classCohortQualified).toBe(true);
            expect([...e.students.map((s) => s.studentUid)].sort()).toEqual(
              [...cohort!.members.map((m) => m.studentUid)].sort(),
            );
            expect(e.distinctSupportingQuestionCount).toBe(cohort!.distinctQuestionCount);
            expect([...e.recoverySignalStudentIds].sort()).toEqual([...cohort!.recoverySignalStudentIds].sort());
            expect([...e.activeRepeatedStudentIds].sort()).toEqual([...cohort!.activeRepeatedStudentIds].sort());
            expect(e.latestEvidenceAt).toBe(cohort!.lastSeenAt);
          }
        }
      }
      // And nothing Phase 81 built is missing from the index.
      for (const cohort of summary.cohorts) {
        expect(index.byDefinitionId.get(cohort.definitionId)).toBeDefined();
      }
      expect(index.qualifyingStudentCount).toBe(summary.qualifyingStudentCount);
    });
  }
});

// ---------------------------------------------------------------- AR
describe("Phase 82 coverage compatibility — two numbers, kept apart", () => {
  function question(id: string, feedbackDefinition: string | null): Question {
    return {
      id,
      ownerId: "teacher-1",
      organizationId: "org",
      visibility: "class",
      imageUrl: "",
      classId: CLASS,
      subject: "Matematik",
      topic: "Denklemler",
      gradeLevel: "9",
      description: null,
      posterRole: "teacher",
      createdAt: T0,
      likeCount: 0,
      commentCount: 0,
      answerCount: 0,
      choices: { A: "1", B: "2" },
      correctChoice: "A",
      hints: [],
      choiceFeedback: feedbackDefinition
        ? { B: { text: "x", semanticDefinitionId: feedbackDefinition, semanticLabel: "İşaret aktarımı", conceptKey: null } }
        : null,
    };
  }

  const questions = ["q1", "q2", "q3", "q4", "q5", "q6"].map((id) => question(id, DEF));
  const students = [
    student("a", qualifying({ questions: ["q1", "q2"] })),
    student("b", qualifying({ questions: ["q2", "q3"] })),
  ];

  it("coverage 6 and evidence 3 are reported as different numbers", () => {
    const coverage = buildClassSemanticVocabulary({
      classId: CLASS,
      definitions: [definition()],
      questions,
      isBounded: false,
    });
    const entry = coverage.active[0]!;
    const e = trail(students);
    expect(entry.questionCount).toBe(6);
    expect(e.distinctSupportingQuestionCount).toBe(3);
    expect(coverageVersusEvidenceLine({ coverageQuestionCount: entry.questionCount, evidence: e })).toBe(
      "Kullanım: 6 soru · Öğrenme kanıtı: 3 soru",
    );
  });

  it("rename leaves coverage and evidence unchanged", () => {
    const renamed = definition(DEF, { label: "İşaret geçişi" });
    const coverage = buildClassSemanticVocabulary({
      classId: CLASS,
      definitions: [renamed],
      questions,
      isBounded: false,
    });
    expect(coverage.active[0]?.questionCount).toBe(6);
    expect(trail(students, renamed).distinctSupportingQuestionCount).toBe(3);
  });

  it("archive preserves both", () => {
    const archived = definition(DEF, { archived: true });
    const coverage = buildClassSemanticVocabulary({
      classId: CLASS,
      definitions: [archived],
      questions,
      isBounded: false,
    });
    expect(coverage.archived[0]?.questionCount).toBe(6);
    expect(trail(students, archived).verifiedStudentCount).toBe(2);
  });

  it("duplicate labels stay two separate trails", () => {
    const d1 = definition("def-1");
    const d2 = definition("def-2");
    const both = [
      student("a", qualifying({ definitionId: "def-1" })),
      student("b", qualifying({ definitionId: "def-2" })),
    ];
    const index = buildSemanticDefinitionEvidenceIndex({ classId: CLASS, students: both });
    expect(evidenceForDefinition(index, d1).students.map((s) => s.studentUid)).toEqual(["a"]);
    expect(evidenceForDefinition(index, d2).students.map((s) => s.studentUid)).toEqual(["b"]);
  });
});

// ---------------------------------------------------------------- copy
describe("definition evidence — teacher copy", () => {
  it("never calls one student a cohort, and never says resolved", () => {
    const one = trail([student("a", qualifying())]);
    expect(verifiedStudentsLine(one)).toBe("1 öğrencide tekrar eden seçim örüntüsü doğrulandı.");
    expect(cohortStatusLine(one)).toBe("Tek öğrenci; sınıf örüntüsü değil.");

    const two = trail([student("a", qualifying()), student("b", [...qualifying(), ...declines(T0 + 5_000)])]);
    expect(verifiedStudentsLine(two)).toBe("2 öğrencide ortak doğrulanmış seçim örüntüsü.");
    expect(cohortStatusLine(two)).toBe("Sınıf örüntüsü eşiği karşılandı.");
    expect(recoveryLine(two)).toBe("1 öğrencide sonraki doğrulanmış fırsatlarda bu seçim yeniden görülmedi.");
    expect(supportingQuestionsLine(two)).toBe("2 farklı soruda doğrulandı.");

    for (const text of [verifiedStudentsLine(two), recoveryLine(two)!, cohortStatusLine(two)!]) {
      expect(text).not.toMatch(/çözüldü|giderildi|aşıldı|riskli|yanılgı|zayıf|problemli/i);
    }
  });

  it("zero evidence is a calm absence, not a claim of understanding", () => {
    const none = trail([student("a", [])]);
    expect(verifiedStudentsLine(none)).toBe("Henüz tekrar eden doğrulanmış bir öğrenci örüntüsü yok.");
    expect(supportingQuestionsLine(none)).toBeNull();
    expect(recoveryLine(none)).toBeNull();
    expect(cohortStatusLine(none)).toBeNull();
    expect(verifiedStudentsLine(none)).not.toMatch(/anladı|kavradı|öğrendi|yok\b.*sorun/i);
  });

  it("labels a student's state from the canonical flag only", () => {
    const e = trail([student("a", qualifying()), student("b", [...qualifying(), ...declines(T0 + 5_000)])]);
    expect(studentEvidenceStateLabel(e.students[0]!)).toBe("Tekrar eden örüntü");
    expect(studentEvidenceStateLabel(e.students[1]!)).toBe("Toparlanma sinyali");
  });

  it("caps the initial student list at a small number", () => {
    expect(MAX_INITIAL_EVIDENCE_STUDENTS).toBeLessThanOrEqual(5);
  });
});
