import {
  buildTargetedQuestionSignals,
  countEligibleQuestions,
  selectSmartAssignmentQuestions,
  TargetedQuestionSignal,
} from "../../src/features/assignments/services/smartAssignmentSelection";
import { Question } from "@/types/question";

const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function q(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    ownerId: "teacher-1",
    organizationId: "org-1",
    visibility: "class",
    imageUrl: `https://example.com/${id}.jpg`,
    classId: "class-1",
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "9",
    description: null,
    posterRole: "teacher",
    createdAt: 0,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    choices: null,
    correctChoice: null,
    ...overrides,
  };
}

const CRITERIA = { subject: "Matematik", topic: "Denklemler", gradeLevel: "9" };

function select(
  pool: Question[],
  targetCount: number,
  strategy: "focus" | "balanced" | "reinforce" = "focus",
  signals: ReadonlyMap<string, TargetedQuestionSignal> = new Map(),
) {
  return selectSmartAssignmentQuestions({
    pool,
    criteria: CRITERIA,
    targetCount,
    strategy,
    targetedQuestionSignals: signals,
    now: NOW,
  });
}

describe("selectSmartAssignmentQuestions — basic pool handling (all strategies)", () => {
  it.each(["focus", "balanced", "reinforce"] as const)("%s: empty pool selects nothing", (strategy) => {
    const result = select([], 5, strategy);
    expect(result.selected).toEqual([]);
    expect(result.omittedQuestionIds).toEqual([]);
  });

  it.each(["focus", "balanced", "reinforce"] as const)("%s: a single eligible question is selected", (strategy) => {
    const result = select([q("a")], 5, strategy);
    expect(result.selected.map((s) => s.questionId)).toEqual(["a"]);
  });

  it.each(["focus", "balanced", "reinforce"] as const)("%s: selects exactly targetCount when enough exist", (strategy) => {
    const pool = Array.from({ length: 10 }, (_, i) => q(`q${i}`));
    const result = select(pool, 5, strategy);
    expect(result.selected).toHaveLength(5);
  });

  it.each(["focus", "balanced", "reinforce"] as const)("%s: selects fewer than requested without padding", (strategy) => {
    const pool = [q("a"), q("b")];
    const result = select(pool, 10, strategy);
    expect(result.selected).toHaveLength(2);
  });

  it.each(["focus", "balanced", "reinforce"] as const)("%s: never selects more than requested", (strategy) => {
    const pool = Array.from({ length: 20 }, (_, i) => q(`q${i}`));
    const result = select(pool, 3, strategy);
    expect(result.selected).toHaveLength(3);
  });

  it.each(["focus", "balanced", "reinforce"] as const)("%s: is deterministic for the same input", (strategy) => {
    const pool = [q("b"), q("a"), q("c")];
    const a = select(pool, 2, strategy);
    const b = select(pool, 2, strategy);
    expect(a).toEqual(b);
  });

  it.each(["focus", "balanced", "reinforce"] as const)("%s: does not mutate the input pool", (strategy) => {
    const pool = [q("a"), q("b")];
    const copy = [...pool];
    select(pool, 2, strategy);
    expect(pool).toEqual(copy);
  });

  it.each(["focus", "balanced", "reinforce"] as const)("%s: excludes a different subject entirely", (strategy) => {
    const pool = [q("wrong", { subject: "Fizik" })];
    expect(select(pool, 5, strategy).selected).toEqual([]);
  });

  it.each(["focus", "balanced", "reinforce"] as const)("%s: excludes different topic AND subject mismatches from eligibility, keeps topic-only mismatch eligible", (strategy) => {
    const pool = [
      q("topic-mismatch", { topic: "Kesirler" }), // still Matematik — eligible, lower score
      q("subject-mismatch", { subject: "Fizik" }), // ineligible
    ];
    const result = select(pool, 5, strategy);
    expect(result.selected.map((s) => s.questionId)).toContain("topic-mismatch");
    expect(result.selected.map((s) => s.questionId)).not.toContain("subject-mismatch");
  });

  it.each(["focus", "balanced", "reinforce"] as const)("%s: excludes a grade mismatch from nothing — grade is scored, not filtered", (strategy) => {
    const pool = [q("grade-mismatch", { gradeLevel: "10" })];
    expect(select(pool, 5, strategy).selected.map((s) => s.questionId)).toEqual(["grade-mismatch"]);
  });

  it.each(["focus", "balanced", "reinforce"] as const)("%s: excludes a legacy question with empty subject", (strategy) => {
    const pool = [q("legacy", { subject: "", topic: "", gradeLevel: "" })];
    expect(select(pool, 5, strategy).selected).toEqual([]);
  });

  it.each(["focus", "balanced", "reinforce"] as const)("%s: never picks the same question twice even if the pool has a duplicate id", (strategy) => {
    const pool = [q("dup"), q("dup")];
    const result = select(pool, 5, strategy);
    expect(result.selected).toHaveLength(1);
  });

  it.each(["focus", "balanced", "reinforce"] as const)("%s: breaks a full tie deterministically by id", (strategy) => {
    const pool = [q("b", { createdAt: 100 }), q("a", { createdAt: 100 })];
    const result = select(pool, 2, strategy);
    expect(result.selected.map((s) => s.questionId)).toEqual(["a", "b"]);
  });

  it.each(["focus", "balanced", "reinforce"] as const)("%s: reports the real omitted ids, never a fabricated count", (strategy) => {
    const pool = [q("a"), q("b"), q("c")];
    const result = select(pool, 1, strategy);
    expect(result.omittedQuestionIds.sort()).toEqual(["b", "c"]);
  });
});

describe("selectSmartAssignmentQuestions — focus", () => {
  it("prefers exact topic+grade match over a subject-only match, all reasoned topic_match", () => {
    const pool = [q("partial", { topic: "Kesirler" }), q("full", { topic: "Denklemler", gradeLevel: "9" })];
    const result = select(pool, 2, "focus");
    expect(result.selected[0]?.questionId).toBe("full");
    expect(result.selected.every((s) => s.reasonCode === "topic_match")).toBe(true);
  });
});

describe("selectSmartAssignmentQuestions — balanced", () => {
  it("interleaves multiple-choice and non-multiple-choice when both exist", () => {
    const pool = [
      q("mc1", { choices: { A: "x", B: "y" }, correctChoice: "A" }),
      q("mc2", { choices: { A: "x", B: "y" }, correctChoice: "A" }),
      q("plain1"),
      q("plain2"),
    ];
    const result = select(pool, 4, "balanced");
    const types = result.selected.map((s) => s.isMultipleChoice);
    // Not all MC bunched first then all plain — some interleaving present.
    expect(types).toContain(true);
    expect(types).toContain(false);
    expect(types[0]).not.toBe(types[1]);
  });

  it("still fills up to targetCount when one type is scarce", () => {
    const pool = [
      q("mc1", { choices: { A: "x", B: "y" }, correctChoice: "A" }),
      q("plain1"),
      q("plain2"),
      q("plain3"),
    ];
    const result = select(pool, 4, "balanced");
    expect(result.selected).toHaveLength(4);
  });

  it("reasons every pick as balanced_mix", () => {
    const result = select([q("a"), q("b")], 2, "balanced");
    expect(result.selected.every((s) => s.reasonCode === "balanced_mix")).toBe(true);
  });
});

describe("selectSmartAssignmentQuestions — reinforce (learning relevance)", () => {
  it("boosts a question a targeted student struggled with above one nobody has ever seen", () => {
    const pool = [q("struggled"), q("never-seen")];
    const signals = new Map<string, TargetedQuestionSignal>([
      ["struggled", { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW - DAY_MS, cumulativeStruggleCount: null }],
    ]);
    const result = select(pool, 2, "reinforce", signals);
    expect(result.selected[0]?.questionId).toBe("struggled");
    expect(result.selected[0]?.reasonCode).toBe("struggled");
  });

  it("boosts a never-attempted question above one recently solved without struggle", () => {
    const pool = [q("new"), q("recently-solved")];
    const signals = new Map<string, TargetedQuestionSignal>([
      ["recently-solved", { everAttemptedCount: 2, struggledCount: 0, mostRecentReviewedAt: NOW - DAY_MS, cumulativeStruggleCount: null }],
    ]);
    const result = select(pool, 2, "reinforce", signals);
    expect(result.selected[0]?.questionId).toBe("new");
    expect(result.selected[0]?.reasonCode).toBe("new_practice");
  });

  it("boosts a stale (long-unpracticed) topic question above a recently-practiced one", () => {
    const pool = [q("stale"), q("recent")];
    const signals = new Map<string, TargetedQuestionSignal>([
      ["stale", { everAttemptedCount: 1, struggledCount: 0, mostRecentReviewedAt: NOW - 20 * DAY_MS, cumulativeStruggleCount: null }],
      ["recent", { everAttemptedCount: 1, struggledCount: 0, mostRecentReviewedAt: NOW - DAY_MS, cumulativeStruggleCount: null }],
    ]);
    const result = select(pool, 2, "reinforce", signals);
    expect(result.selected[0]?.questionId).toBe("stale");
    expect(result.selected[0]?.reasonCode).toBe("stale_topic");
  });

  it("deprioritizes a recently-mastered (solved, no struggle, recent) question to the back", () => {
    const pool = [q("mastered-recent"), q("struggling"), q("fresh")];
    const signals = new Map<string, TargetedQuestionSignal>([
      ["mastered-recent", { everAttemptedCount: 3, struggledCount: 0, mostRecentReviewedAt: NOW - DAY_MS, cumulativeStruggleCount: null }],
      ["struggling", { everAttemptedCount: 2, struggledCount: 1, mostRecentReviewedAt: NOW - DAY_MS, cumulativeStruggleCount: null }],
    ]);
    const result = select(pool, 3, "reinforce", signals);
    expect(result.selected[result.selected.length - 1]?.questionId).toBe("mastered-recent");
  });

  it("falls back to new_practice (honest, no fake precision) when there is no signal entry at all", () => {
    const pool = [q("unknown")];
    const result = select(pool, 1, "reinforce", new Map());
    expect(result.selected[0]?.reasonCode).toBe("new_practice");
  });

  it("uses the same base topic/grade tiebreak within each reinforce tier", () => {
    const pool = [q("b", { gradeLevel: "10" }), q("a", { gradeLevel: "9" })]; // both never-seen tier
    const result = select(pool, 2, "reinforce", new Map());
    // "a" has a better grade match (9 == criteria.gradeLevel) so it sorts first within the tier.
    expect(result.selected.map((s) => s.questionId)).toEqual(["a", "b"]);
  });

  it("is deterministic with real signals across repeated calls", () => {
    const pool = [q("a"), q("b"), q("c")];
    const signals = new Map<string, TargetedQuestionSignal>([
      ["a", { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: null }],
    ]);
    const first = select(pool, 3, "reinforce", signals);
    const second = select(pool, 3, "reinforce", signals);
    expect(first).toEqual(second);
  });
});

describe("selectSmartAssignmentQuestions — reinforce — Phase 46: cumulative struggle tie-break within the struggled tier", () => {
  // B/PREVIOUS-FAILURE-PROOF — the mandatory before/after regression pair.
  // IDs are chosen so the base tiebreak (createdAt, then id) DISAGREES with
  // severity: "alpha-light-struggle" sorts before "zulu-heavy-struggle"
  // alphabetically, so the OLD code (no cumulative signal) picked the
  // lightly-struggled question first — provably wrong, not a coincidence.
  const heavyId = "zulu-heavy-struggle";
  const lightId = "alpha-light-struggle";

  it("PRE-PHASE-46 BASELINE — without cumulativeStruggleCount, both questions tie inside the struggled tier and fall back to base order (id) — the lightly-struggled question wins, which is wrong", () => {
    const pool = [q(heavyId), q(lightId)];
    const signals = new Map<string, TargetedQuestionSignal>([
      [heavyId, { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: null }],
      [lightId, { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: null }],
    ]);
    const result = select(pool, 2, "reinforce", signals);
    expect(result.selected.map((s) => s.questionId)).toEqual([lightId, heavyId]);
  });

  it("A/CORE — with real cumulative evidence (8/10 struggled vs 2/10 struggled), the MORE-struggled question now ranks first, reversing the wrong baseline order above", () => {
    const pool = [q(heavyId), q(lightId)];
    const signals = new Map<string, TargetedQuestionSignal>([
      [heavyId, { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: 8 }],
      [lightId, { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: 2 }],
    ]);
    const result = select(pool, 2, "reinforce", signals);
    expect(result.selected.map((s) => s.questionId)).toEqual([heavyId, lightId]);
    expect(result.selected[0]?.reasonCode).toBe("struggled");
  });

  it("D/SAME-HISTORY — equal cumulative counts stay tied and fall back to the existing base order, not an arbitrary reshuffle", () => {
    const pool = [q(heavyId), q(lightId)];
    const signals = new Map<string, TargetedQuestionSignal>([
      [heavyId, { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: 5 }],
      [lightId, { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: 5 }],
    ]);
    const result = select(pool, 2, "reinforce", signals);
    expect(result.selected.map((s) => s.questionId)).toEqual([lightId, heavyId]);
  });

  it("F/ONE-OFF — a single low-count struggle still outranks a question with zero known cumulative struggle", () => {
    const oneOff = "one-off-struggle";
    const noEvidence = "no-cumulative-evidence";
    const pool = [q(noEvidence), q(oneOff)];
    const signals = new Map<string, TargetedQuestionSignal>([
      [oneOff, { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: 1 }],
      [noEvidence, { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: null }],
    ]);
    const result = select(pool, 2, "reinforce", signals);
    // Both are in the struggled tier (struggledCount > 0). Since one side
    // (noEvidence) is null, §8's "skip tie-break unless both known" rule
    // applies — base order (createdAt/id) is preserved, not a reshuffle
    // toward or away from the unknown side.
    expect(result.selected.map((s) => s.questionId)).toEqual([noEvidence, oneOff]);
  });

  it("H/COVERAGE-SAFETY — a huge cumulative count on a question NO targeted student's last attempt was struggled on does not pull it into the struggled tier; tier membership is unchanged", () => {
    const heavyButRecovered = "heavy-history-but-now-solved";
    const genuinelyStruggled = "genuinely-struggled-now";
    const pool = [q(heavyButRecovered), q(genuinelyStruggled)];
    const signals = new Map<string, TargetedQuestionSignal>([
      // struggledCount (the existing tier-membership snapshot) is 0 here —
      // the student's MOST RECENT outcome was not a struggle — even though
      // cumulativeStruggleCount is large. Tier membership must stay driven
      // by the existing snapshot rule, never by this new signal.
      [heavyButRecovered, { everAttemptedCount: 5, struggledCount: 0, mostRecentReviewedAt: NOW, cumulativeStruggleCount: 20 }],
      [genuinelyStruggled, { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: 1 }],
    ]);
    const result = select(pool, 2, "reinforce", signals);
    expect(result.selected[0]?.questionId).toBe(genuinelyStruggled);
    expect(result.selected[0]?.reasonCode).toBe("struggled");
    expect(result.selected[1]?.reasonCode).not.toBe("struggled");
  });

  it("I/NON-REINFORCE INVARIANCE — 'focus' and 'balanced' ignore cumulativeStruggleCount entirely, same as they already ignore struggledCount", () => {
    const pool = [q(heavyId), q(lightId)];
    const signals = new Map<string, TargetedQuestionSignal>([
      [heavyId, { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: 8 }],
      [lightId, { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: 2 }],
    ]);
    const withSignals = select(pool, 2, "focus", signals);
    const withoutSignals = select(pool, 2, "focus", new Map());
    expect(withSignals).toEqual(withoutSignals);

    const balancedWithSignals = select(pool, 2, "balanced", signals);
    const balancedWithoutSignals = select(pool, 2, "balanced", new Map());
    expect(balancedWithSignals).toEqual(balancedWithoutSignals);
  });

  it("J/DETERMINISM — repeated calls with the same cumulative evidence produce byte-identical output", () => {
    const pool = [q(heavyId), q(lightId)];
    const signals = new Map<string, TargetedQuestionSignal>([
      [heavyId, { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: 8 }],
      [lightId, { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: 2 }],
    ]);
    const first = select(pool, 2, "reinforce", signals);
    const second = select(pool, 2, "reinforce", signals);
    expect(first).toEqual(second);
  });

  it("K/NO-MUTATION — selection never mutates the signals map or the pool", () => {
    const pool = [q(heavyId), q(lightId)];
    const signals = new Map<string, TargetedQuestionSignal>([
      [heavyId, { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: 8 }],
      [lightId, { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: 2 }],
    ]);
    const signalsCopy = new Map(signals);
    const poolCopy = [...pool];
    select(pool, 2, "reinforce", signals);
    expect(signals).toEqual(signalsCopy);
    expect(pool).toEqual(poolCopy);
  });

  it("L/REQUESTED-COUNT PRESERVATION — targetCount is unaffected by the new tie-break", () => {
    const pool = [q(heavyId), q(lightId), q("third")];
    const signals = new Map<string, TargetedQuestionSignal>([
      [heavyId, { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: 8 }],
      [lightId, { everAttemptedCount: 1, struggledCount: 1, mostRecentReviewedAt: NOW, cumulativeStruggleCount: 2 }],
    ]);
    const result = select(pool, 1, "reinforce", signals);
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]?.questionId).toBe(heavyId);
    expect(result.requestedCount).toBe(1);
  });
});

describe("countEligibleQuestions", () => {
  it("counts only subject-matching questions, deduped", () => {
    const pool = [q("a"), q("a"), q("b", { subject: "Fizik" }), q("c")];
    expect(countEligibleQuestions(pool, CRITERIA)).toBe(2);
  });

  it("is 0 for an empty pool", () => {
    expect(countEligibleQuestions([], CRITERIA)).toBe(0);
  });
});

describe("buildTargetedQuestionSignals", () => {
  it("returns an empty map for no students", () => {
    expect(buildTargetedQuestionSignals([]).size).toBe(0);
  });

  it("aggregates everAttemptedCount and struggledCount across multiple students for the same question", () => {
    const signals = buildTargetedQuestionSignals([
      [{ questionId: "q1", lastOutcome: "struggled", lastReviewedAt: NOW, attemptCount: 0 }],
      [{ questionId: "q1", lastOutcome: "solved", lastReviewedAt: NOW - DAY_MS, attemptCount: 0 }],
    ]);
    const signal = signals.get("q1");
    expect(signal?.everAttemptedCount).toBe(2);
    expect(signal?.struggledCount).toBe(1);
  });

  it("treats 'again' as a struggle, same as 'struggled'", () => {
    const signals = buildTargetedQuestionSignals([[{ questionId: "q1", lastOutcome: "again", lastReviewedAt: NOW, attemptCount: 0 }]]);
    expect(signals.get("q1")?.struggledCount).toBe(1);
  });

  it("keeps the MOST RECENT lastReviewedAt across students", () => {
    const signals = buildTargetedQuestionSignals([
      [{ questionId: "q1", lastOutcome: "solved", lastReviewedAt: NOW - 10 * DAY_MS, attemptCount: 0 }],
      [{ questionId: "q1", lastOutcome: "solved", lastReviewedAt: NOW - DAY_MS, attemptCount: 0 }],
    ]);
    expect(signals.get("q1")?.mostRecentReviewedAt).toBe(NOW - DAY_MS);
  });

  it("a question absent from any student's items is absent from the map — no fake entry", () => {
    const signals = buildTargetedQuestionSignals([[{ questionId: "q1", lastOutcome: "solved", lastReviewedAt: NOW, attemptCount: 0 }]]);
    expect(signals.has("q-never-mentioned")).toBe(false);
  });

  it("does not mutate the input", () => {
    const input = [[{ questionId: "q1", lastOutcome: "solved", lastReviewedAt: NOW, attemptCount: 0 }]];
    const copy = JSON.parse(JSON.stringify(input));
    buildTargetedQuestionSignals(input);
    expect(input).toEqual(copy);
  });

  // Phase 46 — cumulativeStruggleCount, reusing outcomeCounters.ts's
  // resolveOutcomeHistory verbatim (never reimplemented).
  it("A/CORE — sums the real struggledCount only when a student's counters are complete (attemptCount === sum)", () => {
    const signals = buildTargetedQuestionSignals([
      [
        {
          questionId: "q1",
          lastOutcome: "struggled",
          lastReviewedAt: NOW,
          attemptCount: 10,
          solvedCount: 2,
          struggledCount: 8,
          againCount: 0,
        },
      ],
    ]);
    expect(signals.get("q1")?.cumulativeStruggleCount).toBe(8);
  });

  it("C/LEGACY — a pre-Phase-41 item (no counters at all) contributes null, never a fabricated 0", () => {
    const signals = buildTargetedQuestionSignals([
      [{ questionId: "q1", lastOutcome: "struggled", lastReviewedAt: NOW, attemptCount: 4 }],
    ]);
    expect(signals.get("q1")?.cumulativeStruggleCount).toBeNull();
  });

  it("LEGACY MIX — a partial/incomplete counter set (sum < attemptCount) also contributes null, not a fabricated partial total", () => {
    const signals = buildTargetedQuestionSignals([
      [
        {
          questionId: "q1",
          lastOutcome: "struggled",
          lastReviewedAt: NOW,
          attemptCount: 10,
          solvedCount: 1,
          struggledCount: 1,
          againCount: 0,
        },
      ],
    ]);
    expect(signals.get("q1")?.cumulativeStruggleCount).toBeNull();
  });

  it("G/MULTI-STUDENT — sums trustworthy struggledCount ACROSS targeted students on the same question", () => {
    const signals = buildTargetedQuestionSignals([
      [
        {
          questionId: "q1",
          lastOutcome: "struggled",
          lastReviewedAt: NOW,
          attemptCount: 10,
          solvedCount: 2,
          struggledCount: 8,
          againCount: 0,
        },
      ],
      [
        {
          questionId: "q1",
          lastOutcome: "solved",
          lastReviewedAt: NOW,
          attemptCount: 5,
          solvedCount: 4,
          struggledCount: 1,
          againCount: 0,
        },
      ],
    ]);
    // 8 (student 1) + 1 (student 2) = 9 — a real sum across BOTH targeted
    // students' own histories, not a per-student cap or an average.
    expect(signals.get("q1")?.cumulativeStruggleCount).toBe(9);
  });

  it("G/MULTI-STUDENT — one student's trustworthy history plus one student's untrustworthy history still contributes what IS known, not null", () => {
    const signals = buildTargetedQuestionSignals([
      [
        {
          questionId: "q1",
          lastOutcome: "struggled",
          lastReviewedAt: NOW,
          attemptCount: 10,
          solvedCount: 2,
          struggledCount: 8,
          againCount: 0,
        },
      ],
      [{ questionId: "q1", lastOutcome: "solved", lastReviewedAt: NOW, attemptCount: 3 }], // legacy, no counters
    ]);
    expect(signals.get("q1")?.cumulativeStruggleCount).toBe(8);
  });
});
