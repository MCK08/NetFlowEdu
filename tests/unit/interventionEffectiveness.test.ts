import { StudyOutcome } from "../../src/features/study/domain/studyTypes";
import { LearningStateInput } from "../../src/features/study/services/learningState";
import {
  buildInterventionEffectiveness,
  InterventionAssignment,
  InterventionQuestionEvidence,
  InterventionStudyItem,
  resolveStateAtIntervention,
  selectMostRecentIntervention,
  toInterventionEvidence,
} from "../../src/features/teacher/services/interventionEffectiveness";

// Phase 44 — did the intervention work?
//
// The rule every test here defends: a verdict must be BACKED BY WORK DONE
// AFTER the intervention. Two states differing is not evidence an
// intervention caused the difference, so "nothing studied since" always
// outranks any state comparison, however dramatic that comparison looks.

const INTERVENTION_AT = 1_700_000_000_000;
const AFTER = INTERVENTION_AT + 60_000;
const BEFORE = INTERVENTION_AT - 60_000;

// Defaults to a question the student is persistently struggling with:
// repeated struggle, no standing solve (see learningState.ts).
function current(overrides: Partial<LearningStateInput> = {}): LearningStateInput {
  return {
    history: { solvedCount: 0, struggledCount: 3, againCount: 0, knownOutcomeCount: 3 },
    lastOutcome: "struggled",
    status: "review",
    successfulReviews: 0,
    ...overrides,
  };
}

// Repeated struggle, but the most recent outcome was a solve and it stands.
function recoveringInput(): LearningStateInput {
  return current({
    history: { solvedCount: 1, struggledCount: 2, againCount: 0, knownOutcomeCount: 3 },
    lastOutcome: "solved",
    successfulReviews: 1,
  });
}

// The server's own mastery verdict outranks any older struggle history.
function stableInput(): LearningStateInput {
  return current({ status: "mastered" });
}

// Exactly one struggle ever — a slip, not a pattern.
function oneOffInput(): LearningStateInput {
  return current({
    history: { solvedCount: 2, struggledCount: 1, againCount: 0, knownOutcomeCount: 3 },
    lastOutcome: "solved",
    successfulReviews: 1,
  });
}

function question(overrides: Partial<InterventionQuestionEvidence> = {}): InterventionQuestionEvidence {
  return {
    questionId: "q1",
    outcomeAtIntervention: "struggled",
    current: current(),
    lastReviewedAt: AFTER,
    ...overrides,
  };
}

function build(questions: InterventionQuestionEvidence[], interventionAt = INTERVENTION_AT) {
  return buildInterventionEffectiveness({
    interventionId: "assignment-1",
    interventionAt,
    questions,
  });
}

describe("resolveStateAtIntervention — reading the frozen record", () => {
  // No record of that moment exists. A student who completed nothing must
  // never be classified as struggling on that basis.
  it("returns insufficient_data when nothing was completed in the intervention", () => {
    expect(resolveStateAtIntervention([])).toBe("insufficient_data");
  });

  it("reports repeated difficulty across the intervention's questions", () => {
    expect(resolveStateAtIntervention(["struggled", "struggled"])).toBe("persistent_struggle");
    expect(resolveStateAtIntervention(["struggled", "solved", "struggled"])).toBe("persistent_struggle");
  });

  it("treats a single struggle as a slip, not a pattern", () => {
    expect(resolveStateAtIntervention(["struggled", "solved", "solved"])).toBe("one_off_struggle");
  });

  it("needs a real sample before making a positive claim", () => {
    expect(resolveStateAtIntervention(["solved", "solved", "solved"])).toBe("stable");
    // One solved question is not a track record.
    expect(resolveStateAtIntervention(["solved"])).toBe("insufficient_data");
    expect(resolveStateAtIntervention(["solved", "solved"])).toBe("insufficient_data");
  });

  // The deliberate divergence from assignmentOutcomeInsights.ts's broader
  // isStruggleOutcome: this function's output is compared against a
  // buildLearningState result, which counts `struggled` alone. Both sides of
  // the comparison must mean the same thing by "zorlanma". This mirrors
  // learningState.ts rule 3 exactly (struggledCount 0 + a real sample =
  // stable), so the two classifiers can never disagree.
  it("does not count 'again' as a struggle", () => {
    expect(resolveStateAtIntervention(["again", "again", "again"])).toBe("stable");
    expect(resolveStateAtIntervention(["again", "struggled"])).toBe("one_off_struggle");
  });

  // A frozen record holds one outcome per question and no notion of "since",
  // so it can never evidence a standing recovery.
  it("never claims recovering", () => {
    const inputs = [
      [],
      ["solved"],
      ["struggled"],
      ["struggled", "struggled"],
      ["again", "solved", "struggled"],
      ["solved", "solved", "solved"],
    ] as const;
    for (const outcomes of inputs) {
      expect(resolveStateAtIntervention([...outcomes])).not.toBe("recovering");
    }
  });

  it("is deterministic and does not mutate its input", () => {
    const outcomes = ["struggled", "solved"] as const;
    const input = [...outcomes];
    expect(resolveStateAtIntervention(input)).toBe(resolveStateAtIntervention(input));
    expect(input).toEqual([...outcomes]);
  });
});

describe("buildInterventionEffectiveness — the post-intervention evidence gate", () => {
  // The headline rule. The states differ dramatically, but the student has
  // not touched a single question since — nothing connects that difference
  // to the intervention.
  it("refuses a verdict when nothing was studied after the intervention", () => {
    const result = build([
      question({ outcomeAtIntervention: "struggled", current: stableInput(), lastReviewedAt: BEFORE }),
      question({ questionId: "q2", outcomeAtIntervention: "struggled", current: stableInput(), lastReviewedAt: BEFORE }),
    ]);
    expect(result.previousState).toBe("persistent_struggle");
    expect(result.currentState).toBe("stable");
    // Would be "improved" on state alone — deliberately is not.
    expect(result.effectiveness).toBe("insufficient_data");
    expect(result.reviewedSinceCount).toBe(0);
  });

  it("does not count a review at the exact intervention timestamp as 'since'", () => {
    const result = build([
      question({ current: recoveringInput(), lastReviewedAt: INTERVENTION_AT }),
      question({ questionId: "q2", current: recoveringInput(), lastReviewedAt: INTERVENTION_AT }),
    ]);
    expect(result.reviewedSinceCount).toBe(0);
    expect(result.effectiveness).toBe("insufficient_data");
  });

  it("does not count a question that was never reviewed", () => {
    const result = build([
      question({ current: recoveringInput(), lastReviewedAt: null }),
      question({ questionId: "q2", current: recoveringInput(), lastReviewedAt: null }),
    ]);
    expect(result.reviewedSinceCount).toBe(0);
  });

  it("counts only the questions reviewed after the intervention", () => {
    const result = build([
      question({ questionId: "q1", lastReviewedAt: AFTER }),
      question({ questionId: "q2", lastReviewedAt: BEFORE }),
      question({ questionId: "q3", lastReviewedAt: null }),
      question({ questionId: "q4", lastReviewedAt: AFTER }),
    ]);
    expect(result.reviewedSinceCount).toBe(2);
  });

  // An unusable boundary cannot establish "since" for anything. Conservative
  // direction: no evidence, never a verdict built on a broken timestamp.
  it("yields no evidence for a non-finite intervention timestamp", () => {
    for (const badTimestamp of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = build(
        [question({ current: stableInput(), lastReviewedAt: AFTER })],
        badTimestamp,
      );
      expect(result.reviewedSinceCount).toBe(0);
      expect(result.effectiveness).toBe("insufficient_data");
    }
  });
});

describe("buildInterventionEffectiveness — transitions", () => {
  it("persistent_struggle → recovering is an improvement", () => {
    const result = build([
      question({ outcomeAtIntervention: "struggled", current: recoveringInput() }),
      question({ questionId: "q2", outcomeAtIntervention: "struggled", current: recoveringInput() }),
    ]);
    expect(result.previousState).toBe("persistent_struggle");
    expect(result.currentState).toBe("recovering");
    expect(result.effectiveness).toBe("improved");
  });

  it("persistent_struggle → stable is an improvement", () => {
    const result = build([
      question({ outcomeAtIntervention: "struggled", current: stableInput() }),
      question({ questionId: "q2", outcomeAtIntervention: "struggled", current: stableInput() }),
    ]);
    expect(result.previousState).toBe("persistent_struggle");
    expect(result.currentState).toBe("stable");
    expect(result.effectiveness).toBe("improved");
  });

  it("reports no change when the student worked but the state held", () => {
    const result = build([
      question({ outcomeAtIntervention: "struggled", current: current() }),
      question({ questionId: "q2", outcomeAtIntervention: "struggled", current: current() }),
    ]);
    expect(result.previousState).toBe("persistent_struggle");
    expect(result.currentState).toBe("persistent_struggle");
    expect(result.effectiveness).toBe("no_change");
  });

  it("reports a regression when the state moved backwards", () => {
    const result = build([
      question({ outcomeAtIntervention: "solved", current: current() }),
      question({ questionId: "q2", outcomeAtIntervention: "solved", current: current() }),
      question({ questionId: "q3", outcomeAtIntervention: "solved", current: current() }),
    ]);
    expect(result.previousState).toBe("stable");
    expect(result.currentState).toBe("persistent_struggle");
    expect(result.effectiveness).toBe("worsened");
  });

  // The conservative judgement call. Getting here means the student
  // struggled a SECOND time after the intervention and then solved it — they
  // now have a repeated-struggle pattern they did not have before, so the
  // intervention is not credited with a recovery from a pattern it preceded.
  it("treats one_off_struggle → recovering as a regression, not a recovery", () => {
    const result = build([
      question({ outcomeAtIntervention: "struggled", current: recoveringInput() }),
      question({ questionId: "q2", outcomeAtIntervention: "solved", current: recoveringInput() }),
      question({ questionId: "q3", outcomeAtIntervention: "solved", current: recoveringInput() }),
    ]);
    expect(result.previousState).toBe("one_off_struggle");
    expect(result.currentState).toBe("recovering");
    expect(result.effectiveness).toBe("worsened");
  });

  it("carries the intervention id through untouched", () => {
    expect(build([question()]).interventionId).toBe("assignment-1");
  });
});

describe("buildInterventionEffectiveness — aggregating the current state", () => {
  // Worst-wins: two mastered questions must never hide one the student
  // still cannot do — the exact failure Phase 42 exists to make visible.
  it("takes the worst state across the intervention's questions", () => {
    const result = build([
      question({ questionId: "q1", current: stableInput() }),
      question({ questionId: "q2", current: stableInput() }),
      question({ questionId: "q3", current: current() }),
    ]);
    expect(result.currentState).toBe("persistent_struggle");
  });

  // The conservative ranking, exercised through the aggregate: a question
  // with a repeated-struggle history that is currently standing on a solve
  // is a WORSE reading than one that only ever slipped once, so it is the
  // one that surfaces.
  it("ranks a recovering question below a one-off slip", () => {
    const result = build([
      question({ questionId: "q1", current: oneOffInput() }),
      question({ questionId: "q2", current: recoveringInput() }),
    ]);
    expect(result.currentState).toBe("recovering");
  });

  it("is independent of the order the questions arrive in", () => {
    const questions = [
      question({ questionId: "q1", current: stableInput() }),
      question({ questionId: "q2", current: current() }),
      question({ questionId: "q3", current: recoveringInput() }),
    ];
    expect(build(questions).currentState).toBe(build([...questions].reverse()).currentState);
  });

  // A question with no trustworthy reading can make the verdict neither
  // better nor worse.
  it("ignores questions with no current reading", () => {
    const withUnknown = build([
      question({ questionId: "q1", current: recoveringInput() }),
      question({ questionId: "q2", current: null }),
    ]);
    const withoutUnknown = build([question({ questionId: "q1", current: recoveringInput() })]);
    expect(withUnknown.currentState).toBe(withoutUnknown.currentState);
    expect(withUnknown.currentState).toBe("recovering");
  });

  // Legacy items (pre-Phase-41 counters) resolve to null history, which
  // buildLearningState reports as insufficient_data — it must never be
  // ranked, or it would manufacture a direction out of an absence.
  it("returns insufficient_data when no question has a trustworthy reading", () => {
    const result = build([
      question({ questionId: "q1", current: null }),
      question({ questionId: "q2", current: current({ history: null }) }),
    ]);
    expect(result.currentState).toBe("insufficient_data");
    expect(result.effectiveness).toBe("insufficient_data");
  });
});

describe("buildInterventionEffectiveness — confidence", () => {
  it("is high once enough questions were reviewed since", () => {
    const result = build([
      question({ questionId: "q1", current: recoveringInput() }),
      question({ questionId: "q2", current: recoveringInput() }),
      question({ questionId: "q3", current: recoveringInput() }),
    ]);
    expect(result.effectiveness).toBe("improved");
    expect(result.reviewedSinceCount).toBe(3);
    expect(result.confidence).toBe("high");
  });

  it("is medium on a thin but real sample", () => {
    const result = build([
      question({ questionId: "q1", current: recoveringInput(), lastReviewedAt: AFTER }),
      question({ questionId: "q2", current: recoveringInput(), lastReviewedAt: BEFORE }),
    ]);
    expect(result.confidence).toBe("medium");
  });

  it("is low when there is no verdict at all", () => {
    const result = build([question({ current: stableInput(), lastReviewedAt: BEFORE })]);
    expect(result.effectiveness).toBe("insufficient_data");
    expect(result.confidence).toBe("low");
  });

  // Plenty of post-intervention work does not rescue a verdict that could
  // not be formed — there is no conclusion for the evidence to support.
  it("stays low for an unformable verdict even with plenty of reviews", () => {
    const result = build([
      question({ questionId: "q1", outcomeAtIntervention: null, current: current() }),
      question({ questionId: "q2", outcomeAtIntervention: null, current: current() }),
      question({ questionId: "q3", outcomeAtIntervention: null, current: current() }),
    ]);
    expect(result.previousState).toBe("insufficient_data");
    expect(result.effectiveness).toBe("insufficient_data");
    expect(result.reviewedSinceCount).toBe(3);
    expect(result.confidence).toBe("low");
  });
});

describe("buildInterventionEffectiveness — explanation", () => {
  it("names the missing work when nothing was studied since", () => {
    const result = build([question({ current: stableInput(), lastReviewedAt: BEFORE })]);
    expect(result.explanation).toBe("Müdahaleden bu yana bu sorularda çalışma yok");
  });

  it("names the unknown side when the record before is missing", () => {
    const result = build([question({ outcomeAtIntervention: null })]);
    expect(result.explanation).toBe("Müdahale öncesi durum için yeterli veri yok");
  });

  // The student HAS worked since, but the questions' counters are not
  // trustworthy (pre-Phase-41 items), so today's reading is the unknown one.
  it("names the unknown side when the current reading is missing", () => {
    const result = build([
      question({ questionId: "q1", outcomeAtIntervention: "struggled", current: null }),
      question({ questionId: "q2", outcomeAtIntervention: "struggled", current: null }),
    ]);
    expect(result.previousState).toBe("persistent_struggle");
    expect(result.currentState).toBe("insufficient_data");
    expect(result.explanation).toBe("Şu anki durum için yeterli veri yok");
  });

  it("distinguishes a full grasp from the start of a recovery", () => {
    const mastered = build([
      question({ outcomeAtIntervention: "struggled", current: stableInput() }),
      question({ questionId: "q2", outcomeAtIntervention: "struggled", current: stableInput() }),
    ]);
    expect(mastered.explanation).toBe("Müdahale sonrası öğrenci bu soruları kavradı");

    const climbing = build([
      question({ outcomeAtIntervention: "struggled", current: recoveringInput() }),
      question({ questionId: "q2", outcomeAtIntervention: "struggled", current: recoveringInput() }),
    ]);
    expect(climbing.explanation).toBe("Müdahale sonrası öğrenci toparlanmaya başladı");
  });

  it("states plainly that the work happened but the state held", () => {
    const result = build([
      question({ outcomeAtIntervention: "struggled", current: current() }),
      question({ questionId: "q2", outcomeAtIntervention: "struggled", current: current() }),
    ]);
    expect(result.explanation).toBe("Müdahale sonrası çalışma var, ancak durum değişmedi");
  });

  it("states a regression rather than softening it", () => {
    const result = build([
      question({ outcomeAtIntervention: "solved", current: current() }),
      question({ questionId: "q2", outcomeAtIntervention: "solved", current: current() }),
      question({ questionId: "q3", outcomeAtIntervention: "solved", current: current() }),
    ]);
    expect(result.explanation).toBe("Müdahale sonrası öğrencinin durumu geriledi");
  });
});

describe("buildInterventionEffectiveness — purity", () => {
  it("is deterministic across repeated calls", () => {
    const questions = [
      question({ questionId: "q1", current: recoveringInput() }),
      question({ questionId: "q2", current: current() }),
    ];
    expect(build(questions)).toEqual(build(questions));
  });

  it("does not mutate the input it is given", () => {
    const questions = [
      question({ questionId: "q1", current: recoveringInput() }),
      question({ questionId: "q2", current: null, lastReviewedAt: BEFORE }),
    ];
    const before = JSON.stringify(questions);
    build(questions);
    expect(JSON.stringify(questions)).toBe(before);
  });

  it("handles an intervention with no questions at all", () => {
    const result = build([]);
    expect(result.previousState).toBe("insufficient_data");
    expect(result.currentState).toBe("insufficient_data");
    expect(result.effectiveness).toBe("insufficient_data");
    expect(result.confidence).toBe("low");
    expect(result.reviewedSinceCount).toBe(0);
  });
});

describe("selectMostRecentIntervention", () => {
  function assignment(overrides: Partial<InterventionAssignment> = {}): InterventionAssignment {
    return {
      id: "a1",
      title: "Denklemler Takip",
      createdAt: INTERVENTION_AT,
      status: "published",
      targetStudentIds: ["s1"],
      questionIds: ["q1"],
      ...overrides,
    };
  }

  it("returns null when the student was never targeted by anything", () => {
    expect(selectMostRecentIntervention([], "s1")).toBeNull();
    expect(
      selectMostRecentIntervention([assignment({ targetStudentIds: ["other"] })], "s1"),
    ).toBeNull();
  });

  // A draft was never delivered, so it cannot have had an effect to measure.
  it("ignores drafts", () => {
    expect(selectMostRecentIntervention([assignment({ status: "draft" })], "s1")).toBeNull();
  });

  it("keeps archived assignments — they were still delivered", () => {
    expect(selectMostRecentIntervention([assignment({ status: "archived" })], "s1")?.id).toBe("a1");
  });

  it("picks the most recent delivered assignment for that student", () => {
    const picked = selectMostRecentIntervention(
      [
        assignment({ id: "old", createdAt: INTERVENTION_AT - 1000 }),
        assignment({ id: "new", createdAt: INTERVENTION_AT }),
        assignment({ id: "newest-but-other-student", createdAt: INTERVENTION_AT + 1000, targetStudentIds: ["x"] }),
      ],
      "s1",
    );
    expect(picked?.id).toBe("new");
  });

  it("breaks a same-millisecond tie deterministically by id", () => {
    const tied = [assignment({ id: "b" }), assignment({ id: "a" })];
    expect(selectMostRecentIntervention(tied, "s1")?.id).toBe("a");
    expect(selectMostRecentIntervention([...tied].reverse(), "s1")?.id).toBe("a");
  });

  it("does not mutate its input", () => {
    const assignments = [assignment({ id: "b" }), assignment({ id: "a", createdAt: 1 })];
    const before = assignments.map((a) => a.id);
    selectMostRecentIntervention(assignments, "s1");
    expect(assignments.map((a) => a.id)).toEqual(before);
  });

  // Phase 44 — the real bug this rewrite fixes: before explicit metadata
  // existed, "the intervention" was guessed as simply the most recent
  // delivered assignment for the student, so an unrelated LATER ordinary
  // assignment silently hijacked the effectiveness card.
  describe("Phase 44 — explicit interventionOf attribution", () => {
    const intervention = { subject: "Matematik", topic: "Denklemler" };

    it("A — legacy-only history (no assignment carries interventionOf) preserves the original heuristic", () => {
      const picked = selectMostRecentIntervention(
        [
          assignment({ id: "old", createdAt: INTERVENTION_AT - 1000 }),
          assignment({ id: "new", createdAt: INTERVENTION_AT }),
        ],
        "s1",
      );
      expect(picked?.id).toBe("new");
    });

    it("B — an explicit intervention is selected over a legacy assignment for the same student", () => {
      const picked = selectMostRecentIntervention(
        [
          assignment({ id: "legacy", createdAt: INTERVENTION_AT + 1000 }),
          assignment({ id: "real-intervention", createdAt: INTERVENTION_AT, interventionOf: intervention }),
        ],
        "s1",
      );
      expect(picked?.id).toBe("real-intervention");
    });

    it("C — explicit intervention, then a NEWER ordinary assignment: the intervention is still selected, not the newer one", () => {
      const picked = selectMostRecentIntervention(
        [
          assignment({ id: "intervention-A", createdAt: INTERVENTION_AT, interventionOf: intervention }),
          assignment({ id: "ordinary-B", createdAt: INTERVENTION_AT + 60_000, interventionOf: null }),
        ],
        "s1",
      );
      expect(picked?.id).toBe("intervention-A");
    });

    it("D — two explicit interventions: the most recent explicit one is selected", () => {
      const picked = selectMostRecentIntervention(
        [
          assignment({ id: "intervention-A", createdAt: INTERVENTION_AT, interventionOf: intervention }),
          assignment({
            id: "intervention-C",
            createdAt: INTERVENTION_AT + 120_000,
            interventionOf: { subject: "Fizik", topic: "Optik" },
          }),
        ],
        "s1",
      );
      expect(picked?.id).toBe("intervention-C");
    });

    it("E — normal-assignments-only history yields no explicit result, but still returns the legacy pick (never null when real work exists)", () => {
      const picked = selectMostRecentIntervention(
        [assignment({ id: "ordinary", interventionOf: null })],
        "s1",
      );
      expect(picked?.id).toBe("ordinary");
      expect(picked?.interventionOf ?? null).toBeNull();
    });

    it("F — an explicit intervention for a DIFFERENT student is never cross-attributed", () => {
      const picked = selectMostRecentIntervention(
        [
          assignment({ id: "intervention-for-s2", targetStudentIds: ["s2"], interventionOf: intervention }),
          assignment({ id: "ordinary-for-s1", targetStudentIds: ["s1"], interventionOf: null }),
        ],
        "s1",
      );
      expect(picked?.id).toBe("ordinary-for-s1");
    });

    it("H — a draft explicit intervention is still excluded, exactly like a draft ordinary assignment", () => {
      const picked = selectMostRecentIntervention(
        [assignment({ id: "draft-intervention", status: "draft", interventionOf: intervention })],
        "s1",
      );
      expect(picked).toBeNull();
    });

    it("I — deterministic: same input, same output, repeatable", () => {
      const assignments = [
        assignment({ id: "b", createdAt: INTERVENTION_AT, interventionOf: intervention }),
        assignment({ id: "a", createdAt: INTERVENTION_AT, interventionOf: intervention }),
      ];
      expect(selectMostRecentIntervention(assignments, "s1")?.id).toBe(
        selectMostRecentIntervention(assignments, "s1")?.id,
      );
      expect(selectMostRecentIntervention(assignments, "s1")?.id).toBe("a");
    });

    it("J — does not mutate its input when explicit metadata is present", () => {
      const assignments = [
        assignment({ id: "b", interventionOf: intervention }),
        assignment({ id: "a", createdAt: 1, interventionOf: intervention }),
      ];
      const before = assignments.map((a) => a.id);
      selectMostRecentIntervention(assignments, "s1");
      expect(assignments.map((a) => a.id)).toEqual(before);
    });

    it("legacy `undefined` interventionOf (field never migrated) is treated exactly like null, never thrown", () => {
      const legacy = assignment({ id: "pre-phase-44" });
      delete (legacy as { interventionOf?: unknown }).interventionOf;
      expect(() => selectMostRecentIntervention([legacy], "s1")).not.toThrow();
      expect(selectMostRecentIntervention([legacy], "s1")?.id).toBe("pre-phase-44");
    });
  });
});

describe("toInterventionEvidence — joining the two records", () => {
  function item(overrides: Partial<InterventionStudyItem> = {}): InterventionStudyItem {
    return {
      questionId: "q1",
      status: "review",
      lastOutcome: "struggled",
      successfulReviews: 0,
      attemptCount: 3,
      solvedCount: 0,
      struggledCount: 3,
      againCount: 0,
      lastReviewedAt: AFTER,
      ...overrides,
    };
  }

  const outcomes: Record<string, StudyOutcome> = { q1: "struggled", q2: "solved" };

  // Driven by the assignment's own questionIds: dropping an unopened
  // question would quietly shrink the intervention to only the parts that
  // went well.
  it("emits one entry per assigned question, in the assignment's own order", () => {
    const evidence = toInterventionEvidence({
      questionIds: ["q1", "q2", "q3"],
      questionOutcomes: outcomes,
      studyItems: [item()],
    });
    expect(evidence.map((entry) => entry.questionId)).toEqual(["q1", "q2", "q3"]);
  });

  it("carries the frozen outcome through, and null where none was recorded", () => {
    const evidence = toInterventionEvidence({
      questionIds: ["q1", "q2", "q3"],
      questionOutcomes: outcomes,
      studyItems: [],
    });
    expect(evidence[0]?.outcomeAtIntervention).toBe("struggled");
    expect(evidence[1]?.outcomeAtIntervention).toBe("solved");
    // Never completed inside the assignment — an absence, not a zero.
    expect(evidence[2]?.outcomeAtIntervention).toBeNull();
  });

  it("has no current reading for a question with no study item", () => {
    const evidence = toInterventionEvidence({
      questionIds: ["q1"],
      questionOutcomes: outcomes,
      studyItems: [],
    });
    expect(evidence[0]?.current).toBeNull();
    expect(evidence[0]?.lastReviewedAt).toBeNull();
  });

  it("builds the current reading from the item's own fields", () => {
    const evidence = toInterventionEvidence({
      questionIds: ["q1"],
      questionOutcomes: outcomes,
      studyItems: [item()],
    });
    expect(evidence[0]?.current).toEqual({
      history: { solvedCount: 0, struggledCount: 3, againCount: 0, knownOutcomeCount: 3 },
      lastOutcome: "struggled",
      status: "review",
      successfulReviews: 0,
    });
  });

  // Phase 41's completeness rule: counters that cannot account for the whole
  // history are not trusted, and must never be substituted with zeros.
  it("yields a null history for a legacy item whose counters are incomplete", () => {
    const legacy = toInterventionEvidence({
      questionIds: ["q1"],
      questionOutcomes: outcomes,
      // attemptCount 5 but only 3 counted — earlier history was never counted.
      studyItems: [item({ attemptCount: 5 })],
    });
    expect(legacy[0]?.current?.history).toBeNull();

    const preCounters = toInterventionEvidence({
      questionIds: ["q1"],
      questionOutcomes: outcomes,
      studyItems: [item({ solvedCount: null, struggledCount: null, againCount: null })],
    });
    expect(preCounters[0]?.current?.history).toBeNull();
  });

  // 0 means "never reviewed" on a StudyItem — it must never be compared as
  // a real timestamp against the intervention date.
  it("treats a zero lastReviewedAt as never reviewed", () => {
    const evidence = toInterventionEvidence({
      questionIds: ["q1"],
      questionOutcomes: outcomes,
      studyItems: [item({ lastReviewedAt: 0 })],
    });
    expect(evidence[0]?.lastReviewedAt).toBeNull();
  });

  it("ignores study items for questions this intervention never covered", () => {
    const evidence = toInterventionEvidence({
      questionIds: ["q1"],
      questionOutcomes: outcomes,
      studyItems: [item(), item({ questionId: "unrelated" })],
    });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.questionId).toBe("q1");
  });

  it("does not mutate its inputs", () => {
    const studyItems = [item()];
    const questionOutcomes = { ...outcomes };
    const before = JSON.stringify({ studyItems, questionOutcomes });
    toInterventionEvidence({ questionIds: ["q1", "q2"], questionOutcomes, studyItems });
    expect(JSON.stringify({ studyItems, questionOutcomes })).toBe(before);
  });
});

// The join the hook actually performs, end to end through the pure layer:
// a real intervention record + real live items in, a verdict out.
describe("intervention pipeline — selection through verdict", () => {
  it("reports a recovery from the same records the teacher screen holds", () => {
    const assignments: InterventionAssignment[] = [
      {
        id: "intervention-1",
        title: "Denklemler Takip",
        createdAt: INTERVENTION_AT,
        status: "published",
        targetStudentIds: ["s1"],
        questionIds: ["q1", "q2"],
      },
    ];
    const selected = selectMostRecentIntervention(assignments, "s1");
    expect(selected?.id).toBe("intervention-1");

    const result = buildInterventionEffectiveness({
      interventionId: selected!.id,
      interventionAt: selected!.createdAt,
      questions: toInterventionEvidence({
        questionIds: selected!.questionIds,
        questionOutcomes: { q1: "struggled", q2: "struggled" },
        studyItems: [
          {
            questionId: "q1",
            status: "review",
            lastOutcome: "solved",
            successfulReviews: 1,
            attemptCount: 3,
            solvedCount: 1,
            struggledCount: 2,
            againCount: 0,
            lastReviewedAt: AFTER,
          },
          {
            questionId: "q2",
            status: "review",
            lastOutcome: "solved",
            successfulReviews: 2,
            attemptCount: 4,
            solvedCount: 2,
            struggledCount: 2,
            againCount: 0,
            lastReviewedAt: AFTER,
          },
        ],
      }),
    });

    expect(result.previousState).toBe("persistent_struggle");
    expect(result.currentState).toBe("recovering");
    expect(result.effectiveness).toBe("improved");
    expect(result.reviewedSinceCount).toBe(2);
    expect(result.explanation).toBe("Müdahale sonrası öğrenci toparlanmaya başladı");
  });

  // The end-to-end version of the headline rule: an assignment the student
  // never touched after it was created yields no verdict, however good the
  // current numbers look.
  it("refuses a verdict when the student never worked after the assignment", () => {
    const result = buildInterventionEffectiveness({
      interventionId: "intervention-1",
      interventionAt: INTERVENTION_AT,
      questions: toInterventionEvidence({
        questionIds: ["q1"],
        questionOutcomes: { q1: "struggled" },
        studyItems: [
          {
            questionId: "q1",
            status: "mastered",
            lastOutcome: "solved",
            successfulReviews: 4,
            attemptCount: 4,
            solvedCount: 4,
            struggledCount: 0,
            againCount: 0,
            lastReviewedAt: BEFORE,
          },
        ],
      }),
    });
    expect(result.currentState).toBe("stable");
    expect(result.effectiveness).toBe("insufficient_data");
    expect(result.explanation).toBe("Müdahaleden bu yana bu sorularda çalışma yok");
  });
});
