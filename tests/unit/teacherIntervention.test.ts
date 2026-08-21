import { GRADE_LEVELS } from "../../src/features/questions/data/questionTaxonomy";
import {
  hasRecentTopicIntervention,
  InterventionTopic,
  resolveEvidenceGrade,
  resolveStudentInterventionTopic,
  resolveTopicInterventionTargets,
} from "../../src/features/teacher/services/teacherIntervention";

// Phase 43 — diagnosis to intervention.
//
// The rule every test here defends: an OMITTED parameter is safe (the
// composer keeps its own default and the teacher picks), a WRONG one is
// not. gradeLevel feeds smartAssignmentSelection's baseMatchScore, so a
// confidently-wrong grade silently changes which questions get selected —
// which is exactly what the class-level paths were doing by dropping it and
// letting the composer fall back to GRADE_LEVELS[0] ("5").

function topic(overrides: Partial<InterventionTopic> = {}): InterventionTopic {
  return {
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "12",
    struggledAttemptCount: 4,
    ...overrides,
  };
}

describe("resolveEvidenceGrade", () => {
  it("returns the grade when every question agrees", () => {
    expect(resolveEvidenceGrade(["9", "9", "9"])).toBe("9");
  });

  it("returns the grade from a single question", () => {
    expect(resolveEvidenceGrade(["12"])).toBe("12");
  });

  // The case that must never become a guess.
  it("returns null for a mixed-grade topic", () => {
    expect(resolveEvidenceGrade(["9", "12"])).toBeNull();
  });

  it("returns null when there is no evidence at all", () => {
    expect(resolveEvidenceGrade([])).toBeNull();
    expect(resolveEvidenceGrade(["", "", ""])).toBeNull();
    expect(resolveEvidenceGrade([null, undefined])).toBeNull();
  });

  // Absent is a lack of evidence, not evidence of a different grade — the
  // same "absent is not zero" principle Phase 41's counters follow.
  it("ignores unknown grades rather than treating them as a conflict", () => {
    expect(resolveEvidenceGrade(["11", "", null, undefined])).toBe("11");
  });

  // A value the composer would reject anyway must not be forwarded: it
  // would fall back to "5" and look like a deliberate choice.
  it("treats a value outside the taxonomy as unknown", () => {
    expect(resolveEvidenceGrade(["13"])).toBeNull();
    expect(resolveEvidenceGrade(["Üniversite"])).toBeNull();
    expect(resolveEvidenceGrade(["13", "9"])).toBe("9");
  });

  it("never returns the taxonomy's first entry as a fallback", () => {
    expect(resolveEvidenceGrade(["9", "12"])).not.toBe(GRADE_LEVELS[0]);
    expect(resolveEvidenceGrade([])).not.toBe(GRADE_LEVELS[0]);
  });

  it("accepts every real grade in the taxonomy", () => {
    for (const grade of GRADE_LEVELS) {
      expect(resolveEvidenceGrade([grade])).toBe(grade);
    }
  });

  it("is deterministic and does not mutate its input", () => {
    const input = ["9", "9"];
    expect(resolveEvidenceGrade(input)).toBe(resolveEvidenceGrade(input));
    expect(input).toEqual(["9", "9"]);
  });
});

describe("resolveStudentInterventionTopic — the gate", () => {
  // Empty means "the evidence does not support an intervention". The
  // snapshot leaves it empty for one-off slips, recovered students, and
  // every pre-Phase-41 item (see studentPerformance.ts).
  it("returns null when there is nothing to intervene on", () => {
    expect(resolveStudentInterventionTopic([])).toBeNull();
  });

  it("returns the only topic when there is one", () => {
    const only = topic();
    expect(resolveStudentInterventionTopic([only])).toEqual(only);
  });

  it("picks the topic with the most real struggle events", () => {
    const picked = resolveStudentInterventionTopic([
      topic({ topic: "Az", struggledAttemptCount: 2 }),
      topic({ topic: "Cok", struggledAttemptCount: 9 }),
    ]);
    expect(picked?.topic).toBe("Cok");
  });

  it("breaks a tie deterministically by subject then topic", () => {
    const tied = [
      topic({ subject: "Matematik", topic: "Zeta", struggledAttemptCount: 3 }),
      topic({ subject: "Fizik", topic: "Alfa", struggledAttemptCount: 3 }),
      topic({ subject: "Matematik", topic: "Alfa", struggledAttemptCount: 3 }),
    ];
    expect(resolveStudentInterventionTopic(tied)?.subject).toBe("Fizik");
    expect(resolveStudentInterventionTopic([...tied].reverse())?.subject).toBe("Fizik");
  });

  it("carries a null gradeLevel through untouched", () => {
    expect(resolveStudentInterventionTopic([topic({ gradeLevel: null })])?.gradeLevel).toBeNull();
  });

  it("does not mutate the array it is given", () => {
    const topics = [
      topic({ topic: "A", struggledAttemptCount: 1 }),
      topic({ topic: "B", struggledAttemptCount: 5 }),
    ];
    const before = topics.map((t) => t.topic);
    resolveStudentInterventionTopic(topics);
    expect(topics.map((t) => t.topic)).toEqual(before);
  });
});

describe("resolveTopicInterventionTargets", () => {
  function candidate(uid: string, topics: InterventionTopic[]) {
    return { studentUid: uid, persistentStruggleTopics: topics };
  }

  // The headline case: 4 of 25 struggling must produce exactly those 4.
  it("targets exactly the students persistently struggling in that topic", () => {
    const candidates = [
      ...["s1", "s2", "s3", "s4"].map((uid) => candidate(uid, [topic()])),
      ...Array.from({ length: 21 }, (_, i) => candidate(`other${i}`, [])),
    ];
    const targets = resolveTopicInterventionTargets(candidates, "Matematik", "Denklemler");
    expect(targets).toEqual(["s1", "s2", "s3", "s4"]);
  });

  // Nobody qualifying must NOT silently become "the whole class".
  it("returns an empty list when nobody is persistently struggling", () => {
    const candidates = Array.from({ length: 25 }, (_, i) => candidate(`s${i}`, []));
    expect(resolveTopicInterventionTargets(candidates, "Matematik", "Denklemler")).toEqual([]);
  });

  it("excludes students struggling in a DIFFERENT topic", () => {
    const candidates = [
      candidate("match", [topic({ topic: "Denklemler" })]),
      candidate("other", [topic({ topic: "Türev" })]),
    ];
    expect(resolveTopicInterventionTargets(candidates, "Matematik", "Denklemler")).toEqual(["match"]);
  });

  it("distinguishes the same topic name under a different subject", () => {
    const candidates = [
      candidate("mat", [topic({ subject: "Matematik", topic: "Kuvvet" })]),
      candidate("fiz", [topic({ subject: "Fizik", topic: "Kuvvet" })]),
    ];
    expect(resolveTopicInterventionTargets(candidates, "Fizik", "Kuvvet")).toEqual(["fiz"]);
  });

  it("is order-independent and deterministic", () => {
    const candidates = [
      candidate("zeta", [topic()]),
      candidate("alpha", [topic()]),
    ];
    expect(resolveTopicInterventionTargets(candidates, "Matematik", "Denklemler")).toEqual([
      "alpha",
      "zeta",
    ]);
    expect(resolveTopicInterventionTargets([...candidates].reverse(), "Matematik", "Denklemler")).toEqual([
      "alpha",
      "zeta",
    ]);
  });

  it("never produces a duplicate uid", () => {
    const targets = resolveTopicInterventionTargets(
      [candidate("s1", [topic(), topic({ struggledAttemptCount: 2 })])],
      "Matematik",
      "Denklemler",
    );
    expect(targets).toEqual(["s1"]);
  });

  it("does not mutate its input", () => {
    const candidates = [candidate("s1", [topic()])];
    const before = JSON.stringify(candidates);
    resolveTopicInterventionTargets(candidates, "Matematik", "Denklemler");
    expect(JSON.stringify(candidates)).toBe(before);
  });
});

describe("hasRecentTopicIntervention — duplicate guard", () => {
  it("is true when a recent assignment already covers every target", () => {
    expect(hasRecentTopicIntervention([{ targetStudentIds: ["a", "b", "c"] }], ["a", "b"])).toBe(true);
  });

  it("is false when the recent assignment covers only some of them", () => {
    expect(hasRecentTopicIntervention([{ targetStudentIds: ["a"] }], ["a", "b"])).toBe(false);
  });

  it("is false when there is no recent assignment at all", () => {
    expect(hasRecentTopicIntervention([], ["a"])).toBe(false);
  });

  // Nothing to duplicate when the intervention has no targets.
  it("is false for an empty target list", () => {
    expect(hasRecentTopicIntervention([{ targetStudentIds: ["a"] }], [])).toBe(false);
  });

  it("checks each recent assignment independently", () => {
    const recent = [{ targetStudentIds: ["x"] }, { targetStudentIds: ["a", "b"] }];
    expect(hasRecentTopicIntervention(recent, ["a", "b"])).toBe(true);
  });

  it("does not mutate its input", () => {
    const recent = [{ targetStudentIds: ["a", "b"] }];
    const before = JSON.stringify(recent);
    hasRecentTopicIntervention(recent, ["a"]);
    expect(JSON.stringify(recent)).toBe(before);
  });
});
