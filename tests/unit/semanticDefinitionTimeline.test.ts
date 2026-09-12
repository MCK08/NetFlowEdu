// Phase 84 — the chronology of one shared definition's verified evidence.
//
// Most of these prove a REFUSAL: no milestone from one selection, none from a
// repeated question, none from a single decline, none from a rating, and never
// a claim that outruns Phase 78/79's own verdict.

import { LearningEvent } from "../../src/features/learningStory/services/learningTrail";
import { buildVerifiedChoicePatterns } from "../../src/features/study/services/verifiedChoicePatterns";
import {
  buildClassSemanticCohorts,
  ClassSemanticStudentEvidence,
} from "../../src/features/teacher/services/classSemanticCohorts";
import {
  buildSemanticDefinitionEvidenceIndex,
  evidenceForDefinition,
} from "../../src/features/teacher/services/semanticDefinitionEvidence";
import {
  buildSemanticDefinitionTimeline,
  isTimelineMilestone,
  MAX_INITIAL_TIMELINE_ENTRIES,
  scopedIdentityForDefinition,
  SemanticTimelineEntryKind,
  timelineAbsenceCopy,
  timelineEntryLabel,
  timelineEntryText,
  TIMELINE_WINDOW_NOTE,
  visibleTimelineEntries,
} from "../../src/features/teacher/services/semanticDefinitionTimeline";

const CLASS = "class-1";
const DEF = "def-a";
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

/** A selection of the shared definition. */
function pick(
  questionId: string,
  at: number,
  over: { definitionId?: string; classId?: string; subject?: string; topic?: string } = {},
): LearningEvent {
  return {
    id: `e-${++seq}`,
    questionId,
    outcome: "struggled",
    occurredAt: at,
    subject: over.subject ?? "Matematik",
    topic: over.topic ?? "Denklemler",
    semanticChoice: {
      identity: {
        namespaceKind: "class",
        namespaceId: over.classId ?? CLASS,
        semanticId: over.definitionId ?? DEF,
      },
      choiceLabel: "B",
      label: "İşaret aktarımı",
    },
    semanticOpportunities: {
      items: [
        {
          namespaceKind: "class",
          namespaceId: over.classId ?? CLASS,
          semanticId: over.definitionId ?? DEF,
        },
      ],
      selectedChoice: "B",
    },
  };
}

/** The meaning was genuinely offered and something else was taken. */
function decline(questionId: string, at: number, definitionId = DEF): LearningEvent {
  return {
    id: `e-${++seq}`,
    questionId,
    outcome: "solved",
    occurredAt: at,
    subject: "Matematik",
    topic: "Denklemler",
    semanticChoice: null,
    semanticOpportunities: {
      items: [{ namespaceKind: "class", namespaceId: CLASS, semanticId: definitionId }],
      selectedChoice: "A",
    },
  };
}

/** An outcome recorded without an actual pick — Phase 79 must not read this as
 *  a declined opportunity. */
function ratingOnly(questionId: string, at: number): LearningEvent {
  return {
    id: `e-${++seq}`,
    questionId,
    outcome: "again",
    occurredAt: at,
    subject: "Matematik",
    topic: "Denklemler",
    semanticChoice: null,
    semanticOpportunities: null,
  };
}

/** A private author-scoped selection whose key looks like the shared one. */
function privatePick(questionId: string, at: number): LearningEvent {
  return {
    id: `e-${++seq}`,
    questionId,
    outcome: "struggled",
    occurredAt: at,
    subject: "Matematik",
    topic: "Denklemler",
    semanticChoice: {
      identity: { namespaceKind: "author", namespaceId: "teacher-1", semanticId: DEF },
      choiceLabel: "B",
      label: null,
    },
    semanticOpportunities: null,
  };
}

function student(uid: string, events: LearningEvent[], name = uid): ClassSemanticStudentEvidence {
  return { studentUid: uid, displayName: name, events };
}

function build(students: ClassSemanticStudentEvidence[], identity = scoped) {
  return buildSemanticDefinitionTimeline({ scoped: identity, students });
}

const kinds = (students: ClassSemanticStudentEvidence[]): SemanticTimelineEntryKind[] =>
  build(students).entries.map((entry) => entry.kind);

describe("nothing to report", () => {
  it("T1 is empty with no students and no events", () => {
    expect(build([]).isEmpty).toBe(true);
    expect(build([student("a", [])]).isEmpty).toBe(true);
  });

  it("T2 ignores private semantics entirely, even with a matching key", () => {
    const timeline = build([student("a", [privatePick("q1", T0), privatePick("q2", T0 + MIN)])]);
    expect(timeline.isEmpty).toBe(true);
    expect(timeline.appearingStudentCount).toBe(0);
  });

  it("omits a student who only ever declined and never selected", () => {
    // A decline is only meaningful after a selection; there is nothing to have
    // recovered from otherwise.
    const timeline = build([student("a", [decline("q1", T0), decline("q2", T0 + MIN)])]);
    expect(timeline.isEmpty).toBe(true);
  });
});

describe("selections and the repeated-pattern milestone", () => {
  it("T3 records one selection and raises no milestone", () => {
    expect(kinds([student("a", [pick("q1", T0)])])).toEqual(["selection"]);
  });

  it("T4 raises no milestone from two selections on the SAME question", () => {
    const list = kinds([student("a", [pick("q1", T0), pick("q1", T0 + MIN)])]);
    expect(list).toEqual(["selection", "selection"]);
    expect(list).not.toContain("repeated_pattern_reached");
  });

  it("T5 raises exactly one milestone at the second DISTINCT question", () => {
    const timeline = build([student("a", [pick("q1", T0), pick("q2", T0 + MIN)])]);
    expect(timeline.entries.map((e) => e.kind)).toEqual([
      "selection",
      "selection",
      "repeated_pattern_reached",
    ]);
    // The milestone lands at the moment of the crossing, not at the end.
    expect(timeline.entries[2]!.occurredAt).toBe(T0 + MIN);
  });

  it("T6 never raises the repeated milestone twice", () => {
    const list = kinds([
      student("a", [pick("q1", T0), pick("q2", T0 + MIN), pick("q3", T0 + 2 * MIN)]),
    ]);
    expect(list.filter((k) => k === "repeated_pattern_reached")).toHaveLength(1);
  });
});

describe("opportunities and the recovery milestone", () => {
  const qualified = () => [pick("q1", T0), pick("q2", T0 + MIN)];

  it("T7 raises no recovery milestone from ONE qualifying decline", () => {
    const list = kinds([student("a", [...qualified(), decline("q3", T0 + 2 * MIN)])]);
    expect(list).not.toContain("recovery_signal_reached");
    expect(list.filter((k) => k === "declined_opportunity")).toHaveLength(1);
  });

  it("T8 raises it at the second DISTINCT qualifying decline", () => {
    const timeline = build([
      student("a", [...qualified(), decline("q3", T0 + 2 * MIN), decline("q4", T0 + 3 * MIN)]),
    ]);
    expect(timeline.entries.map((e) => e.kind)).toEqual([
      "selection",
      "selection",
      "repeated_pattern_reached",
      "declined_opportunity",
      "declined_opportunity",
      "recovery_signal_reached",
    ]);
    expect(timeline.students[0]!.hasCurrentRecoverySignal).toBe(true);
  });

  it("T9 raises no recovery milestone from two declines on the SAME question", () => {
    const list = kinds([
      student("a", [...qualified(), decline("q3", T0 + 2 * MIN), decline("q3", T0 + 3 * MIN)]),
    ]);
    expect(list).not.toContain("recovery_signal_reached");
  });

  it("T10 never treats a rating-only outcome as an opportunity", () => {
    const list = kinds([
      student("a", [...qualified(), ratingOnly("q3", T0 + 2 * MIN), ratingOnly("q4", T0 + 3 * MIN)]),
    ]);
    expect(list).not.toContain("declined_opportunity");
    expect(list).not.toContain("recovery_signal_reached");
  });

  it("raises no recovery before the repeated pattern exists", () => {
    // One selection, then two declines: nothing to recover from yet.
    const list = kinds([
      student("a", [pick("q1", T0), decline("q2", T0 + MIN), decline("q3", T0 + 2 * MIN)]),
    ]);
    expect(list).not.toContain("recovery_signal_reached");
  });

  it("T44 does not require the later answer to be correct", () => {
    const wrongButDifferent: LearningEvent = {
      ...decline("q3", T0 + 2 * MIN),
      outcome: "struggled",
    };
    const list = kinds([
      student("a", [...qualified(), wrongButDifferent, decline("q4", T0 + 3 * MIN)]),
    ]);
    expect(list).toContain("recovery_signal_reached");
  });
});

describe("reselection", () => {
  const recovered = () => [
    pick("q1", T0),
    pick("q2", T0 + MIN),
    decline("q3", T0 + 2 * MIN),
    decline("q4", T0 + 3 * MIN),
  ];

  it("T11 withdraws current recovery on a later selection, keeping the history", () => {
    const timeline = build([student("a", [...recovered(), pick("q5", T0 + 4 * MIN)])]);
    const list = timeline.entries.map((e) => e.kind);
    expect(list).toContain("recovery_signal_reached");
    expect(list).toContain("recovery_signal_withdrawn");
    expect(list[list.length - 1]).toBe("recovery_signal_withdrawn");
    expect(timeline.students[0]!.hasCurrentRecoverySignal).toBe(false);
    // The milestone that DID happen is not erased.
    expect(timeline.students[0]!.recoveryReachedAt).toBe(T0 + 3 * MIN);
  });

  it("T12 lets recovery become current again from FRESH declines only", () => {
    const timeline = build([
      student("a", [
        ...recovered(),
        pick("q5", T0 + 4 * MIN),
        decline("q6", T0 + 5 * MIN),
        decline("q7", T0 + 6 * MIN),
      ]),
    ]);
    const list = timeline.entries.map((e) => e.kind);
    expect(list.filter((k) => k === "recovery_signal_reached")).toHaveLength(2);
    expect(timeline.students[0]!.hasCurrentRecoverySignal).toBe(true);
  });

  it("does not let pre-reselection declines satisfy the fresh window", () => {
    // One fresh decline after the reselection is not enough, even though two
    // older ones exist.
    const timeline = build([
      student("a", [...recovered(), pick("q5", T0 + 4 * MIN), decline("q6", T0 + 5 * MIN)]),
    ]);
    expect(timeline.students[0]!.hasCurrentRecoverySignal).toBe(false);
    expect(
      timeline.entries.filter((e) => e.kind === "recovery_signal_reached"),
    ).toHaveLength(1);
  });
});

describe("identity isolation", () => {
  const qualified = (over: Parameters<typeof pick>[2] = {}) => [
    pick("q1", T0, over),
    pick("q2", T0 + MIN, over),
  ];

  it("T13 ignores a different definition carrying the same label", () => {
    expect(build([student("a", qualified({ definitionId: "def-b" }))]).isEmpty).toBe(true);
  });

  it("T14 ignores a private conceptKey whose key equals the definition id", () => {
    expect(build([student("a", [privatePick("q1", T0), privatePick("q2", T0 + MIN)])]).isEmpty).toBe(
      true,
    );
  });

  it("T15 ignores the same definition id in another class", () => {
    expect(build([student("a", qualified({ classId: "class-2" }))]).isEmpty).toBe(true);
  });

  it("T16 keeps the scope: same definition, different topic, is not this timeline", () => {
    expect(build([student("a", qualified({ topic: "Oranlar" }))]).isEmpty).toBe(true);
    expect(build([student("a", qualified({ subject: "Fizik" }))]).isEmpty).toBe(true);
  });

  it("does not regress to definitionId-only grouping", () => {
    // Two students meet the same definition id in DIFFERENT topics. Only the
    // one matching this timeline's scope appears.
    const timeline = build([
      student("a", qualified()),
      student("b", qualified({ topic: "Oranlar" })),
    ]);
    expect(timeline.students.map((s) => s.studentUid)).toEqual(["a"]);
  });
});

describe("chronology", () => {
  it("orders oldest to newest across students", () => {
    const timeline = build([
      student("b", [pick("q3", T0 + 2 * MIN)], "Berk"),
      student("a", [pick("q1", T0), pick("q2", T0 + MIN)], "Ada"),
    ]);
    const times = timeline.entries.map((e) => e.occurredAt);
    expect(times).toEqual([...times].sort((x, y) => x - y));
    expect(timeline.entries[0]!.displayName).toBe("Ada");
  });

  it("places a milestone immediately after the event that caused it", () => {
    const timeline = build([student("a", [pick("q1", T0), pick("q2", T0 + MIN)])]);
    const last = timeline.entries[timeline.entries.length - 1]!;
    expect(last.kind).toBe("repeated_pattern_reached");
    expect(last.occurredAt).toBe(timeline.entries[1]!.occurredAt);
  });

  it("T20 is identical under input permutation", () => {
    const roster = [
      student("a", [pick("q1", T0), pick("q2", T0 + MIN)]),
      student("b", [pick("q2", T0 + 2 * MIN), pick("q3", T0 + 3 * MIN)]),
    ];
    const forward = build(roster);
    seq = 0;
    const rosterAgain = [
      student("a", [pick("q1", T0), pick("q2", T0 + MIN)]),
      student("b", [pick("q2", T0 + 2 * MIN), pick("q3", T0 + 3 * MIN)]),
    ];
    const reversed = build([...rosterAgain].reverse());
    expect(forward.entries.map((e) => `${e.kind}@${e.occurredAt}`)).toEqual(
      reversed.entries.map((e) => `${e.kind}@${e.occurredAt}`),
    );
  });

  it("T21 is deterministic when timestamps are identical", () => {
    const make = () => [
      student("a", [pick("q1", T0), pick("q2", T0)]),
      student("b", [pick("q3", T0), pick("q4", T0)]),
    ];
    const first = JSON.stringify(build(make()).entries.map((e) => e.id));
    seq = 0;
    const second = JSON.stringify(build(make()).entries.map((e) => e.id));
    expect(first).toBe(second);
  });

  it("T22 safely ignores an event whose question metadata never resolved", () => {
    const unscoped: LearningEvent = { ...pick("q1", T0), subject: "", topic: "" };
    expect(build([student("a", [unscoped, pick("q2", T0 + MIN)])]).entries).toHaveLength(1);
  });
});

describe("who appears and who counts", () => {
  it("T27 shows a single-selection student without counting them as verified", () => {
    const timeline = build([
      student("a", [pick("q1", T0), pick("q2", T0 + MIN)]),
      student("c", [pick("q3", T0 + 2 * MIN)]),
    ]);
    expect(timeline.appearingStudentCount).toBe(2);
    expect(timeline.verifiedStudentCount).toBe(1);
    const c = timeline.students.find((s) => s.studentUid === "c")!;
    expect(c.isVerified).toBe(false);
    expect(c.repeatedPatternReachedAt).toBeNull();
  });

  it("counts per-student breadth without aggregating it", () => {
    const timeline = build([
      student("a", [pick("q1", T0), pick("q2", T0 + MIN), pick("q2", T0 + 2 * MIN)]),
    ]);
    const a = timeline.students[0]!;
    expect(a.selectionCount).toBe(3);
    expect(a.distinctSelectionQuestionCount).toBe(2);
    expect(a.supportingQuestionIds).toEqual(["q1", "q2"]);
  });
});

describe("agreement with the canonical phases", () => {
  const roster = () => [
    student("a", [pick("q1", T0), pick("q2", T0 + MIN)], "Ada"),
    student("b", [
      pick("q2", T0 + 2 * MIN),
      pick("q3", T0 + 3 * MIN),
      decline("q4", T0 + 4 * MIN),
      decline("q5", T0 + 5 * MIN),
    ], "Berk"),
    student("c", [pick("q6", T0 + 6 * MIN)], "Cem"),
  ];

  it("T24 final recovery state equals Phase 79's own verdict", () => {
    const timeline = build(roster());
    for (const state of timeline.students) {
      const memory = buildVerifiedChoicePatterns({
        events: roster().find((s) => s.studentUid === state.studentUid)!.events,
        maxPatterns: Number.POSITIVE_INFINITY,
      });
      const pattern = memory.patterns.find(
        (p) => p.identity.semanticId === DEF && p.subject === "Matematik" && p.topic === "Denklemler",
      );
      expect(state.hasCurrentRecoverySignal).toBe(pattern?.recovery != null);
      expect(state.isVerified).toBe(pattern !== undefined);
    }
  });

  it("T25 verified count, membership and question union equal Phase 83", () => {
    const students = roster();
    const index = buildSemanticDefinitionEvidenceIndex({ classId: CLASS, students });
    const evidence = evidenceForDefinition(index, {
      id: DEF,
      subject: "Matematik",
      topic: "Denklemler",
    });
    const timeline = build(students);

    expect(timeline.verifiedStudentCount).toBe(evidence.verifiedStudentCount);
    expect(timeline.students.filter((s) => s.isVerified).map((s) => s.studentUid).sort()).toEqual(
      evidence.students.map((s) => s.studentUid).sort(),
    );
    const union = new Set(
      timeline.students.filter((s) => s.isVerified).flatMap((s) => s.supportingQuestionIds),
    );
    expect([...union].sort()).toEqual(evidence.supportingQuestionIds);
    expect(
      timeline.students.filter((s) => s.hasCurrentRecoverySignal).map((s) => s.studentUid).sort(),
    ).toEqual([...evidence.recoverySignalStudentIds].sort());
  });

  it("T46 agrees with Phase 81 on whether a cohort exists", () => {
    const students = roster();
    const cohorts = buildClassSemanticCohorts({
      classId: CLASS,
      students,
      interventionCandidates: [],
    });
    const timeline = build(students);
    const cohort = cohorts.cohorts.find((c) => c.definitionId === DEF);
    expect(timeline.verifiedStudentCount >= 2).toBe(cohort !== undefined);
    expect(cohort!.qualifyingStudentCount).toBe(timeline.verifiedStudentCount);
    expect(cohort!.recoverySignalStudentIds.sort()).toEqual(
      timeline.students.filter((s) => s.hasCurrentRecoverySignal).map((s) => s.studentUid).sort(),
    );
  });

  it("one verified student means no Phase 81 cohort, and the timeline says so", () => {
    const students = [
      student("a", [pick("q1", T0), pick("q2", T0 + MIN)]),
      student("c", [pick("q3", T0 + 2 * MIN)]),
    ];
    const cohorts = buildClassSemanticCohorts({
      classId: CLASS,
      students,
      interventionCandidates: [],
    });
    expect(cohorts.cohorts).toHaveLength(0);
    expect(build(students).verifiedStudentCount).toBe(1);
  });
});

describe("presentation", () => {
  function longRoster() {
    const events: LearningEvent[] = [];
    for (let i = 0; i < 14; i += 1) events.push(pick(`q${i}`, T0 + i * MIN));
    return [student("a", events)];
  }

  it("T61 truncates to the most recent stretch, still oldest-first", () => {
    const timeline = build(longRoster());
    const visible = visibleTimelineEntries(timeline, false);
    expect(visible).toHaveLength(MAX_INITIAL_TIMELINE_ENTRIES);
    // The LAST entries, in order.
    expect(visible).toEqual(timeline.entries.slice(-MAX_INITIAL_TIMELINE_ENTRIES));
    expect(visible[0]!.occurredAt).toBeLessThan(visible[visible.length - 1]!.occurredAt);
  });

  it("expansion changes nothing but how many are shown", () => {
    const timeline = build(longRoster());
    expect(visibleTimelineEntries(timeline, true)).toEqual(timeline.entries);
    expect(timeline.verifiedStudentCount).toBe(1);
  });

  it("never truncates a short timeline", () => {
    const timeline = build([student("a", [pick("q1", T0), pick("q2", T0 + MIN)])]);
    expect(visibleTimelineEntries(timeline, false)).toEqual(timeline.entries);
  });

  it("marks milestones apart from recorded events", () => {
    const timeline = build([student("a", [pick("q1", T0), pick("q2", T0 + MIN)])]);
    expect(timeline.entries.map(isTimelineMilestone)).toEqual([false, false, true]);
  });

  it("T23 never claims lifetime coverage", () => {
    const copy = [
      TIMELINE_WINDOW_NOTE,
      timelineAbsenceCopy().description,
      timelineEntryText({
        id: "x",
        kind: "repeated_pattern_reached",
        occurredAt: T0,
        studentUid: "a",
        displayName: "Ada",
        questionId: null,
      }),
    ]
      .join(" ")
      .toLowerCase();
    expect(copy).toContain("yüklenen");
    for (const banned of ["tüm zamanlar", "ilk kez", "hiç", "her zaman"]) {
      expect(copy).not.toContain(banned);
    }
  });

  it("never editorialises about the learner", () => {
    const all: SemanticTimelineEntryKind[] = [
      "selection",
      "declined_opportunity",
      "repeated_pattern_reached",
      "recovery_signal_reached",
      "recovery_signal_withdrawn",
    ];
    const copy = all
      .map((kind) =>
        `${timelineEntryLabel({ id: "x", kind, occurredAt: T0, studentUid: "a", displayName: "Ada", questionId: null })} ${timelineEntryText({ id: "x", kind, occurredAt: T0, studentUid: "a", displayName: "Ada", questionId: null })}`,
      )
      .join(" ")
      .toLowerCase();
    for (const banned of [
      "iyileşiyor",
      "kötüleşiyor",
      "gelişiyor",
      "öğrendi",
      "anlamıyor",
      "yanılgı",
      "riskli",
      "çözüldü",
      "kazandı",
      "başarısız",
    ]) {
      expect(copy).not.toContain(banned);
    }
  });

  it("never leaks an internal id into visible copy", () => {
    const entry = build([student("a", [pick("q1", T0), pick("q2", T0 + MIN)])]).entries[0]!;
    const visible = `${timelineEntryLabel(entry)} ${timelineEntryText(entry)}`;
    for (const secret of [DEF, CLASS, "e-1", "q1"]) {
      expect(visible).not.toContain(secret);
    }
  });
});
