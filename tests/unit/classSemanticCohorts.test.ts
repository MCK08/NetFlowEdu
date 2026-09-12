// Phase 81 — verified shared semantic cohorts.
//
// Most of these tests exist to prove the aggregator REFUSES to report
// something: not from private semantics, not from one event each, not from one
// qualifying student, not from two identical labels, and never as an
// intervention verdict of its own.

import { LearningEvent } from "../../src/features/learningStory/services/learningTrail";
import {
  buildClassSemanticCohorts,
  canDraftSmallGroup,
  ClassSemanticStudentEvidence,
  cohortAbsenceCopy,
  cohortActionReadyFact,
  cohortEvidenceLine,
  cohortFact,
  cohortMemberInitials,
  cohortRecoveryFact,
  MAX_VISIBLE_SEMANTIC_COHORTS,
  MIN_COHORT_STUDENTS,
} from "../../src/features/teacher/services/classSemanticCohorts";
import { InterventionCandidate } from "../../src/features/teacher/services/teacherIntervention";

const T0 = 1_700_000_000_000;
const CLASS = "class-1";

let seq = 0;

/** One selection of a SHARED class definition. */
function shared(
  over: Partial<LearningEvent> & { definitionId?: string; classId?: string } = {},
): LearningEvent {
  const { definitionId = "def-shared", classId = CLASS, ...rest } = over;
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
      label: "İşaret aktarımı",
    },
    ...rest,
  };
}

/** One selection of a PRIVATE author-scoped conceptKey. */
function priv(over: Partial<LearningEvent> & { ownerId?: string } = {}): LearningEvent {
  const { ownerId = "teacher-1", ...rest } = over;
  return {
    id: `e-${++seq}`,
    questionId: "q1",
    outcome: "struggled",
    occurredAt: T0,
    subject: "Matematik",
    topic: "Denklemler",
    semanticChoice: {
      identity: {
        namespaceKind: "author",
        namespaceId: ownerId,
        semanticId: "sign_transfer_error",
      },
      choiceLabel: "B",
      label: null,
    },
    ...rest,
  };
}

/** The two distinct-question selections that make ONE student qualify under
 *  Phase 78, expressed once so no test re-states the threshold. */
function qualifyingShared(options: { definitionId?: string; at?: number } = {}): LearningEvent[] {
  const at = options.at ?? T0;
  return [
    shared({ questionId: "q1", occurredAt: at, definitionId: options.definitionId }),
    shared({ questionId: "q2", occurredAt: at + 1_000, definitionId: options.definitionId }),
  ];
}

function student(
  studentUid: string,
  events: LearningEvent[],
  displayName = studentUid,
): ClassSemanticStudentEvidence {
  return { studentUid, displayName, events };
}

function build(
  students: ClassSemanticStudentEvidence[],
  interventionCandidates: InterventionCandidate[] = [],
  classId = CLASS,
) {
  return buildClassSemanticCohorts({ classId, students, interventionCandidates });
}

function persistentIn(studentUid: string, subject = "Matematik", topic = "Denklemler"): InterventionCandidate {
  return {
    studentUid,
    persistentStruggleTopics: [{ subject, topic, gradeLevel: null, struggledAttemptCount: 4 }],
  };
}

beforeEach(() => {
  seq = 0;
});

describe("nothing to report", () => {
  it("is empty with no students", () => {
    const summary = build([]);
    expect(summary.isEmpty).toBe(true);
    expect(summary.cohorts).toEqual([]);
    expect(summary.qualifyingStudentCount).toBe(0);
  });

  it("is empty when students have no events", () => {
    expect(build([student("a", []), student("b", [])]).isEmpty).toBe(true);
  });

  it("never builds a cohort from PRIVATE semantics, even when every key matches", () => {
    const summary = build([
      student("a", [priv({ questionId: "q1" }), priv({ questionId: "q2" })]),
      student("b", [priv({ questionId: "q1" }), priv({ questionId: "q2" })]),
    ]);
    expect(summary.isEmpty).toBe(true);
    // Nor does a private pattern count toward "someone qualified individually":
    // that sentence is about SHARED meanings, and using it for private ones
    // would promise a cohort that can never arrive.
    expect(summary.qualifyingStudentCount).toBe(0);
  });

  it("never builds a cohort from private semantics authored by the SAME teacher", () => {
    const summary = build([
      student("a", [priv({ questionId: "q1", ownerId: "t" }), priv({ questionId: "q2", ownerId: "t" })]),
      student("b", [priv({ questionId: "q3", ownerId: "t" }), priv({ questionId: "q4", ownerId: "t" })]),
    ]);
    expect(summary.isEmpty).toBe(true);
  });

  it("refuses raw pooling: one shared selection each is not a cohort", () => {
    const summary = build([
      student("a", [shared({ questionId: "q1" })]),
      student("b", [shared({ questionId: "q2" })]),
    ]);
    expect(summary.isEmpty).toBe(true);
    expect(summary.qualifyingStudentCount).toBe(0);
  });

  it("refuses a cohort when only ONE student qualifies individually", () => {
    const summary = build([
      student("a", qualifyingShared()),
      student("b", [shared({ questionId: "q3" })]),
    ]);
    expect(summary.isEmpty).toBe(true);
    expect(summary.qualifyingStudentCount).toBe(1);
  });

  it("refuses a cohort when one student repeats on a SINGLE question", () => {
    // Two occurrences, one question — Phase 71's territory, not this one.
    const summary = build([
      student("a", [shared({ questionId: "q1" }), shared({ questionId: "q1", occurredAt: T0 + 1 })]),
      student("b", qualifyingShared()),
    ]);
    expect(summary.isEmpty).toBe(true);
    expect(summary.qualifyingStudentCount).toBe(1);
  });

  it("drops shared selections whose question metadata never resolved", () => {
    const noScope = () => [
      shared({ questionId: "q1", subject: "", topic: "" }),
      shared({ questionId: "q2", subject: "", topic: "", occurredAt: T0 + 1 }),
    ];
    expect(build([student("a", noScope()), student("b", noScope())]).isEmpty).toBe(true);
  });

  it("drops a shared identity carrying no authored label", () => {
    const unlabelled = (q: string, at: number) => ({
      ...shared({ questionId: q, occurredAt: at }),
      semanticChoice: {
        identity: { namespaceKind: "class" as const, namespaceId: CLASS, semanticId: "def-shared" },
        choiceLabel: "B" as const,
        label: null,
      },
    });
    const summary = build([
      student("a", [unlabelled("q1", T0), unlabelled("q2", T0 + 1)]),
      student("b", [unlabelled("q1", T0), unlabelled("q2", T0 + 1)]),
    ]);
    expect(summary.isEmpty).toBe(true);
  });
});

describe("a cohort forms", () => {
  it("forms from two INDEPENDENTLY qualifying students", () => {
    const summary = build([
      student("a", qualifyingShared()),
      student("b", qualifyingShared()),
    ]);
    expect(summary.cohorts).toHaveLength(1);
    const cohort = summary.cohorts[0]!;
    expect(cohort.qualifyingStudentCount).toBe(2);
    expect(cohort.label).toBe("İşaret aktarımı");
    expect(cohort.subject).toBe("Matematik");
    expect(cohort.topic).toBe("Denklemler");
    expect(cohort.members.map((m) => m.studentUid).sort()).toEqual(["a", "b"]);
  });

  it("counts three qualifying students exactly", () => {
    const summary = build([
      student("a", qualifyingShared()),
      student("b", qualifyingShared()),
      student("c", qualifyingShared()),
    ]);
    expect(summary.cohorts[0]!.qualifyingStudentCount).toBe(3);
    expect(summary.qualifyingStudentCount).toBe(3);
  });

  it("excludes a student who selected the meaning only once", () => {
    const summary = build([
      student("a", qualifyingShared()),
      student("b", qualifyingShared()),
      student("c", [shared({ questionId: "q9" })]),
    ]);
    expect(summary.cohorts[0]!.qualifyingStudentCount).toBe(2);
    expect(summary.cohorts[0]!.members.map((m) => m.studentUid)).not.toContain("c");
  });

  it("UNIONS the supporting questions rather than summing them", () => {
    const summary = build([
      student("a", [
        shared({ questionId: "q1" }),
        shared({ questionId: "q2", occurredAt: T0 + 1 }),
      ]),
      student("b", [
        shared({ questionId: "q2", occurredAt: T0 + 2 }),
        shared({ questionId: "q3", occurredAt: T0 + 3 }),
      ]),
    ]);
    // q1 q2 q3 — three, not four.
    expect(summary.cohorts[0]!.distinctQuestionCount).toBe(3);
  });

  it("keeps each member's own counts unaggregated", () => {
    const summary = build([
      student("a", [
        shared({ questionId: "q1" }),
        shared({ questionId: "q2", occurredAt: T0 + 1 }),
        shared({ questionId: "q2", occurredAt: T0 + 2 }),
      ]),
      student("b", qualifyingShared({ at: T0 + 10 })),
    ]);
    const byUid = new Map(summary.cohorts[0]!.members.map((m) => [m.studentUid, m]));
    expect(byUid.get("a")!.occurrenceCount).toBe(3);
    expect(byUid.get("a")!.distinctQuestionCount).toBe(2);
    expect(byUid.get("b")!.occurrenceCount).toBe(2);
  });

  it("is not blocked by a student having many unrelated patterns", () => {
    // The per-student display cap is 4. A student with five other shared
    // meanings must still contribute to the sixth one's cohort.
    const noise = (n: number) =>
      qualifyingShared({ definitionId: `def-noise-${n}`, at: T0 + n * 100 });
    const busy = [0, 1, 2, 3, 4].flatMap(noise).concat(qualifyingShared({ at: T0 + 9_000 }));
    const summary = build([student("a", busy), student("b", qualifyingShared({ at: T0 + 9_000 }))]);
    const target = summary.cohorts.find((c) => c.qualifyingStudentCount === 2);
    expect(target).toBeDefined();
    expect(target!.members.map((m) => m.studentUid).sort()).toEqual(["a", "b"]);
  });
});

describe("isolation", () => {
  it("does NOT merge two definitions that share a visible label", () => {
    const summary = build([
      student("a", qualifyingShared({ definitionId: "def-one" })),
      student("b", qualifyingShared({ definitionId: "def-two" })),
    ]);
    // Same label on both, different ids — two individually qualifying students
    // and zero cohorts.
    expect(summary.isEmpty).toBe(true);
    expect(summary.qualifyingStudentCount).toBe(2);
  });

  it("does NOT merge a private conceptKey with a shared definition", () => {
    const summary = build([
      student("a", qualifyingShared()),
      student("b", [priv({ questionId: "q1" }), priv({ questionId: "q2", occurredAt: T0 + 1 })]),
    ]);
    expect(summary.isEmpty).toBe(true);
  });

  it("does NOT merge the same definition id across DIFFERENT classes", () => {
    const summary = build([
      student("a", qualifyingShared()),
      student("b", [
        shared({ questionId: "q1", classId: "class-2" }),
        shared({ questionId: "q2", classId: "class-2", occurredAt: T0 + 1 }),
      ]),
    ]);
    // Only the viewed class's namespace participates at all.
    expect(summary.isEmpty).toBe(true);
    expect(summary.qualifyingStudentCount).toBe(1);
  });

  it("does NOT merge the same definition across different topics", () => {
    const summary = build([
      student("a", qualifyingShared()),
      student("b", [
        shared({ questionId: "q1", topic: "Oranlar" }),
        shared({ questionId: "q2", topic: "Oranlar", occurredAt: T0 + 1 }),
      ]),
    ]);
    expect(summary.isEmpty).toBe(true);
  });

  it("does NOT merge the same definition across different subjects", () => {
    const summary = build([
      student("a", qualifyingShared()),
      student("b", [
        shared({ questionId: "q1", subject: "Fizik" }),
        shared({ questionId: "q2", subject: "Fizik", occurredAt: T0 + 1 }),
      ]),
    ]);
    expect(summary.isEmpty).toBe(true);
  });
});

describe("recovery", () => {
  /** Two later, distinct questions that OFFERED the shared meaning and where
   *  the student took something else. */
  function declines(at: number): LearningEvent[] {
    const offer = (q: string, when: number): LearningEvent => ({
      ...shared({ questionId: q, occurredAt: when }),
      semanticChoice: null,
      semanticOpportunities: {
        items: [{ namespaceKind: "class", namespaceId: CLASS, semanticId: "def-shared" }],
        selectedChoice: "A",
      },
    });
    return [offer("q7", at), offer("q8", at + 1_000)];
  }

  it("keeps a recovering student IN the cohort and names the subset", () => {
    const summary = build([
      student("a", [...qualifyingShared(), ...declines(T0 + 5_000)]),
      student("b", qualifyingShared()),
    ]);
    const cohort = summary.cohorts[0]!;
    expect(cohort.qualifyingStudentCount).toBe(2);
    expect(cohort.recoverySignalStudentIds).toEqual(["a"]);
    expect(cohort.activeRepeatedStudentIds).toEqual(["b"]);
  });

  it("withdraws the recovery signal when the meaning is selected again", () => {
    const summary = build([
      student("a", [
        ...qualifyingShared(),
        ...declines(T0 + 5_000),
        // A later reselection reopens the window; the earlier declines fall
        // out of it. Phase 79's rule, unchanged.
        shared({ questionId: "q9", occurredAt: T0 + 20_000 }),
      ]),
      student("b", qualifyingShared()),
    ]);
    const cohort = summary.cohorts[0]!;
    expect(cohort.recoverySignalStudentIds).toEqual([]);
    expect(cohort.activeRepeatedStudentIds.sort()).toEqual(["a", "b"]);
  });

  it("never reports a resolved or mastered state", () => {
    const summary = build([
      student("a", [...qualifyingShared(), ...declines(T0 + 5_000)]),
      student("b", [...qualifyingShared(), ...declines(T0 + 5_000)]),
    ]);
    const cohort = summary.cohorts[0]!;
    expect(cohort.recoverySignalStudentIds).toHaveLength(2);
    expect(JSON.stringify(cohort).toLowerCase()).not.toContain("resolved");
    const copy = `${cohortFact(cohort)} ${cohortRecoveryFact(cohort)}`.toLowerCase();
    for (const banned of ["çözüldü", "düzeldi", "öğrendi", "kazandı", "tamamlandı"]) {
      expect(copy).not.toContain(banned);
    }
  });

  it("orders still-repeating members before recovering ones", () => {
    const summary = build([
      student("a", [...qualifyingShared(), ...declines(T0 + 5_000)]),
      student("b", qualifyingShared()),
      student("c", qualifyingShared()),
    ]);
    const members = summary.cohorts[0]!.members;
    expect(members[members.length - 1]!.studentUid).toBe("a");
  });
});

describe("canonical intervention intersection", () => {
  const twoQualifying = () => [
    student("a", qualifyingShared()),
    student("b", qualifyingShared()),
  ];

  it("marks nobody action-ready without canonical evidence", () => {
    const cohort = build(twoQualifying(), [])!.cohorts[0]!;
    expect(cohort.actionReadyStudentIds).toEqual([]);
    expect(cohort.members.every((m) => !m.isActionReady)).toBe(true);
  });

  it("treats an empty persistent-struggle list as NOT action-ready", () => {
    // "No topics" is Phase 42 declining to make a claim — stable, one-off,
    // recovering and insufficient_data all arrive here the same way, and none
    // of them may become targetable.
    const cohort = build(twoQualifying(), [
      { studentUid: "a", persistentStruggleTopics: [] },
      { studentUid: "b", persistentStruggleTopics: [] },
    ])!.cohorts[0]!;
    expect(cohort.actionReadyStudentIds).toEqual([]);
  });

  it("marks a persistently struggling cohort member action-ready", () => {
    const cohort = build(twoQualifying(), [persistentIn("a")])!.cohorts[0]!;
    expect(cohort.actionReadyStudentIds).toEqual(["a"]);
  });

  it("requires the SAME subject and topic, never a subject-only match", () => {
    const cohort = build(twoQualifying(), [
      persistentIn("a", "Matematik", "Oranlar"),
    ])!.cohorts[0]!;
    expect(cohort.actionReadyStudentIds).toEqual([]);
  });

  it("requires the SAME subject and topic, never a topic-only match", () => {
    const cohort = build(twoQualifying(), [
      persistentIn("a", "Fizik", "Denklemler"),
    ])!.cohorts[0]!;
    expect(cohort.actionReadyStudentIds).toEqual([]);
  });

  it("does not make a NON-cohort student action-ready", () => {
    const summary = build(
      [...twoQualifying(), student("c", [shared({ questionId: "q9" })])],
      [persistentIn("a"), persistentIn("c")],
    );
    expect(summary.cohorts[0]!.actionReadyStudentIds).toEqual(["a"]);
  });

  it("keeps semantic recovery and Phase 43 independent", () => {
    const offer = (q: string, when: number): LearningEvent => ({
      ...shared({ questionId: q, occurredAt: when }),
      semanticChoice: null,
      semanticOpportunities: {
        items: [{ namespaceKind: "class", namespaceId: CLASS, semanticId: "def-shared" }],
        selectedChoice: "A",
      },
    });
    const cohort = build(
      [
        student("a", [...qualifyingShared(), offer("q7", T0 + 5_000), offer("q8", T0 + 6_000)]),
        student("b", qualifyingShared()),
      ],
      [persistentIn("a")],
    )!.cohorts[0]!;
    // Recovering semantically AND still persistently struggling: both true,
    // neither overrides the other.
    expect(cohort.recoverySignalStudentIds).toEqual(["a"]);
    expect(cohort.actionReadyStudentIds).toEqual(["a"]);
  });

  it("returns action-ready ids in a stable sorted order", () => {
    const cohort = build(
      [
        student("c", qualifyingShared()),
        student("a", qualifyingShared()),
        student("b", qualifyingShared()),
      ],
      [persistentIn("c"), persistentIn("a"), persistentIn("b")],
    )!.cohorts[0]!;
    expect(cohort.actionReadyStudentIds).toEqual(["a", "b", "c"]);
  });
});

describe("small-group gate", () => {
  const threeQualifying = () => [
    student("a", qualifyingShared()),
    student("b", qualifyingShared()),
    student("c", qualifyingShared()),
  ];

  it("refuses a draft with zero action-ready students", () => {
    expect(canDraftSmallGroup(build(threeQualifying(), []).cohorts[0]!)).toBe(false);
  });

  it("refuses a draft with ONE action-ready student", () => {
    const cohort = build(threeQualifying(), [persistentIn("a")]).cohorts[0]!;
    expect(cohort.actionReadyStudentIds).toHaveLength(1);
    expect(canDraftSmallGroup(cohort)).toBe(false);
  });

  it("allows a draft at two action-ready students", () => {
    const cohort = build(threeQualifying(), [persistentIn("a"), persistentIn("b")]).cohorts[0]!;
    expect(cohort.actionReadyStudentIds).toEqual(["a", "b"]);
    expect(canDraftSmallGroup(cohort)).toBe(true);
    expect(MIN_COHORT_STUDENTS).toBe(2);
  });

  it("never pads the recipient list with non-eligible cohort members", () => {
    const cohort = build(threeQualifying(), [persistentIn("a"), persistentIn("b")]).cohorts[0]!;
    expect(cohort.qualifyingStudentCount).toBe(3);
    expect(cohort.actionReadyStudentIds).not.toContain("c");
  });
});

describe("ordering and bounds", () => {
  it("orders by qualifying student breadth first", () => {
    const summary = build([
      student("a", qualifyingShared({ definitionId: "def-small", at: T0 + 50_000 })),
      student("b", qualifyingShared({ definitionId: "def-small", at: T0 + 50_000 })),
      student("c", qualifyingShared({ definitionId: "def-big" })),
      student("d", qualifyingShared({ definitionId: "def-big" })),
      student("e", qualifyingShared({ definitionId: "def-big" })),
    ]);
    // def-big has three students; def-small is more RECENT and still comes
    // second, because breadth of people leads.
    expect(summary.cohorts[0]!.qualifyingStudentCount).toBe(3);
    expect(summary.cohorts[1]!.qualifyingStudentCount).toBe(2);
  });

  it("breaks a breadth tie by the most recent evidence", () => {
    const summary = build([
      student("a", qualifyingShared({ definitionId: "def-old" })),
      student("b", qualifyingShared({ definitionId: "def-old" })),
      student("c", qualifyingShared({ definitionId: "def-new", at: T0 + 90_000 })),
      student("d", qualifyingShared({ definitionId: "def-new", at: T0 + 90_000 })),
    ]);
    expect(summary.cohorts[0]!.lastSeenAt).toBeGreaterThan(summary.cohorts[1]!.lastSeenAt);
  });

  it("is deterministic under input permutation", () => {
    const roster = [
      student("a", qualifyingShared({ definitionId: "def-1" })),
      student("b", qualifyingShared({ definitionId: "def-1" })),
      student("c", qualifyingShared({ definitionId: "def-2", at: T0 + 5 })),
      student("d", qualifyingShared({ definitionId: "def-2", at: T0 + 5 })),
    ];
    const forward = JSON.stringify(build(roster));
    const reversed = JSON.stringify(build([...roster].reverse()));
    expect(forward).toBe(reversed);
  });

  it("truncates deterministically at the visible maximum", () => {
    const roster = Array.from({ length: MAX_VISIBLE_SEMANTIC_COHORTS + 3 }, (_, index) => [
      student(`a${index}`, qualifyingShared({ definitionId: `def-${index}`, at: T0 + index * 10 })),
      student(`b${index}`, qualifyingShared({ definitionId: `def-${index}`, at: T0 + index * 10 })),
    ]).flat();
    const summary = build(roster);
    expect(summary.cohorts).toHaveLength(MAX_VISIBLE_SEMANTIC_COHORTS);
    expect(JSON.stringify(build(roster))).toBe(JSON.stringify(build([...roster].reverse())));
  });
});

// Phase 82 — the label a cohort DISPLAYS may be refreshed from the current
// vocabulary. None of it may touch identity, membership or counts.
describe("current label resolution", () => {
  const twoQualifying = () => [
    student("a", qualifyingShared()),
    student("b", qualifyingShared()),
  ];

  function withLabels(labels: Map<string, string> | undefined) {
    return buildClassSemanticCohorts({
      classId: CLASS,
      students: twoQualifying(),
      interventionCandidates: [],
      currentLabels: labels,
    });
  }

  it("X1 shows the current label when it matches the snapshot", () => {
    const cohort = withLabels(new Map([["def-shared", "İşaret aktarımı"]])).cohorts[0]!;
    expect(cohort.label).toBe("İşaret aktarımı");
  });

  it("X2 shows the RENAMED label while identity, membership and counts stand", () => {
    const before = withLabels(undefined).cohorts[0]!;
    const after = withLabels(new Map([["def-shared", "Negatif işaret aktarımı"]])).cohorts[0]!;

    expect(after.label).toBe("Negatif işaret aktarımı");
    // Everything that is not the display string is untouched.
    expect(after.id).toBe(before.id);
    expect(after.definitionId).toBe(before.definitionId);
    expect(after.qualifyingStudentCount).toBe(before.qualifyingStudentCount);
    expect(after.distinctQuestionCount).toBe(before.distinctQuestionCount);
    expect(after.members.map((m) => m.studentUid)).toEqual(before.members.map((m) => m.studentUid));
    expect(after.lastSeenAt).toBe(before.lastSeenAt);
  });

  it("X3 falls back to the stored snapshot when the definition cannot be resolved", () => {
    const cohort = withLabels(new Map([["some-other-definition", "Alakasız"]])).cohorts[0]!;
    expect(cohort.label).toBe("İşaret aktarımı");
  });

  it("X4 never borrows a same-looking label from a DIFFERENT definition", () => {
    // The decoy carries the identical visible label. Resolution is by id, so a
    // rename of the decoy cannot reach this cohort.
    const cohort = withLabels(new Map([["def-decoy", "Tamamen başka bir ad"]])).cohorts[0]!;
    expect(cohort.label).toBe("İşaret aktarımı");
  });

  it("renaming does not merge two same-label cohorts", () => {
    const summary = buildClassSemanticCohorts({
      classId: CLASS,
      students: [
        student("a", qualifyingShared({ definitionId: "def-one" })),
        student("b", qualifyingShared({ definitionId: "def-one" })),
        student("c", qualifyingShared({ definitionId: "def-two" })),
        student("d", qualifyingShared({ definitionId: "def-two" })),
      ],
      interventionCandidates: [],
      // Both renamed to the SAME text.
      currentLabels: new Map([
        ["def-one", "Ortak ad"],
        ["def-two", "Ortak ad"],
      ]),
    });
    expect(summary.cohorts).toHaveLength(2);
    expect(summary.cohorts.every((c) => c.label === "Ortak ad")).toBe(true);
    expect(new Set(summary.cohorts.map((c) => c.definitionId)).size).toBe(2);
  });

  it("exposes the definition id without it reaching any copy function", () => {
    const cohort = withLabels(undefined).cohorts[0]!;
    expect(cohort.definitionId).toBe("def-shared");
    const visible = `${cohortEvidenceLine(cohort)} ${cohortFact(cohort)}`;
    expect(visible).not.toContain("def-shared");
  });
});

describe("copy", () => {
  const cohort = build(
    [
      student("a", qualifyingShared(), "Ayşe Yılmaz"),
      student("b", qualifyingShared(), "Bora Kaya"),
    ],
    [persistentIn("a")],
  ).cohorts[0]!;

  it("states people and questions as counts, never as a rate", () => {
    expect(cohortEvidenceLine(cohort)).toBe("2 öğrenci · 2 farklı soru");
    expect(cohortEvidenceLine(cohort)).not.toContain("%");
  });

  it("says the students qualified SEPARATELY", () => {
    expect(cohortFact(cohort)).toBe("2 öğrencide aynı seçim örüntüsü ayrı ayrı doğrulandı.");
  });

  it("marks the Phase 43 fact as additional, not consequent", () => {
    const fact = cohortActionReadyFact(cohort)!;
    expect(fact).toContain("ayrıca");
    expect(fact).toBe("1 öğrenci bu konuda ayrıca tekrar eden zorlanma kanıtı taşıyor.");
  });

  it("omits absent facts rather than reporting a zero", () => {
    const plain = build([student("a", qualifyingShared()), student("b", qualifyingShared())])
      .cohorts[0]!;
    expect(cohortRecoveryFact(plain)).toBeNull();
    expect(cohortActionReadyFact(plain)).toBeNull();
  });

  it("never leaks an internal id into visible copy", () => {
    const visible = [
      cohortEvidenceLine(cohort),
      cohortFact(cohort),
      cohortActionReadyFact(cohort),
      cohortMemberInitials("Ayşe Yılmaz"),
    ].join(" ");
    for (const secret of [CLASS, "def-shared", "class:", "namespace"]) {
      expect(visible).not.toContain(secret);
    }
  });

  it("never uses punitive or diagnostic words about students", () => {
    const visible = [
      cohortEvidenceLine(cohort),
      cohortFact(cohort),
      cohortRecoveryFact(cohort),
      cohortActionReadyFact(cohort),
      cohortAbsenceCopy({ cohorts: [], qualifyingStudentCount: 0, isEmpty: true }).description,
    ]
      .join(" ")
      .toLowerCase();
    for (const banned of ["riskli", "yanılgı", "problemli", "başarısız", "zayıf", "kötü"]) {
      expect(visible).not.toContain(banned);
    }
  });

  it("distinguishes the three empty situations", () => {
    const none = cohortAbsenceCopy({ cohorts: [], qualifyingStudentCount: 0, isEmpty: true });
    const one = cohortAbsenceCopy({ cohorts: [], qualifyingStudentCount: 1, isEmpty: true });
    const many = cohortAbsenceCopy({ cohorts: [], qualifyingStudentCount: 3, isEmpty: true });
    expect(new Set([none.title, one.title, many.title]).size).toBe(3);
  });

  it("builds markers from the display name, in Turkish casing", () => {
    expect(cohortMemberInitials("Ayşe Yılmaz")).toBe("AY");
    expect(cohortMemberInitials("ilker")).toBe("İ");
    expect(cohortMemberInitials("  ")).toBe("?");
    expect(cohortMemberInitials("Ada Nur Çelik")).toBe("AÇ");
  });
});
