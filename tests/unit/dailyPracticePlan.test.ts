import {
  buildAdaptivePracticePlan,
  buildDailyPracticePlan,
  MAX_PLAN_ITEMS,
} from "../../src/features/study/services/dailyPracticePlan";
import {
  buildLearningInsights,
  LearningInsightItem,
  TopicInsight,
} from "../../src/features/study/services/learningInsights";
import { buildChronologyProfiles } from "../../src/features/study/services/chronologyTieBreak";
import { LearningEvent } from "../../src/features/learningStory/services/learningTrail";
import { StudyOutcome } from "../../src/features/study/domain/studyTypes";

const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function item(overrides: Partial<LearningInsightItem> = {}): LearningInsightItem {
  return {
    questionId: "q1",
    status: "review",
    lastOutcome: "solved",
    nextReviewAt: NOW + DAY_MS,
    subject: "Matematik",
    topic: "Türev",
    successfulReviews: 1,
    lastReviewedAt: NOW - DAY_MS,
    ...overrides,
  };
}

// Real weakTopics, derived the exact same way the Hub itself derives them
// (via buildLearningInsights) — the plan builder never recomputes topic
// weakness ranking on its own.
function weakTopicsFor(items: LearningInsightItem[], now = NOW): readonly TopicInsight[] {
  return buildLearningInsights({ items, now, reviewedToday: 0, dailyGoal: 10 }).weakTopics;
}

// Same reasoning as weakTopicsFor — buildAdaptivePracticePlan consumes the
// Hub's own real allTopics output, never a second topic-ranking pass.
function topicInsightsFor(items: LearningInsightItem[], now = NOW): readonly TopicInsight[] {
  return buildLearningInsights({ items, now, reviewedToday: 0, dailyGoal: 10 }).allTopics;
}

describe("buildDailyPracticePlan — empty input", () => {
  it("produces an all-empty plan for a student with no study items", () => {
    const plan = buildDailyPracticePlan({
      items: [],
      weakTopics: [],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.dueCount).toBe(0);
    expect(plan.planItems).toEqual([]);
    expect(plan.topicFocus).toBeNull();
    expect(plan.remainingGoal).toBe(10);
    expect(plan.reasonByQuestionId).toEqual({});
  });
});

describe("buildDailyPracticePlan — due-only", () => {
  it("counts due items without producing any planItems", () => {
    const items = [
      item({ questionId: "q1", nextReviewAt: NOW - 1000 }),
      item({ questionId: "q2", nextReviewAt: NOW - 2000 }),
    ];
    const plan = buildDailyPracticePlan({
      items,
      weakTopics: [],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.dueCount).toBe(2);
    expect(plan.planItems).toEqual([]);
    expect(plan.reasonByQuestionId).toEqual({ q1: "due", q2: "due" });
  });
});

describe("buildDailyPracticePlan — struggled-only", () => {
  it("surfaces a non-due struggled item with reason 'struggled'", () => {
    const items = [
      item({ questionId: "q1", lastOutcome: "struggled", nextReviewAt: NOW + DAY_MS }),
    ];
    const plan = buildDailyPracticePlan({
      items,
      weakTopics: [],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.dueCount).toBe(0);
    expect(plan.planItems).toEqual([
      { questionId: "q1", reason: "struggled", subject: "Matematik", topic: "Türev" },
    ]);
  });
});

describe("buildDailyPracticePlan — due beats struggled for the same question", () => {
  it("classifies a due-and-struggled item as 'due', not 'struggled'", () => {
    const items = [
      item({ questionId: "q1", lastOutcome: "struggled", nextReviewAt: NOW - 1000 }),
    ];
    const plan = buildDailyPracticePlan({
      items,
      weakTopics: [],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.dueCount).toBe(1);
    expect(plan.planItems).toEqual([]);
    expect(plan.reasonByQuestionId.q1).toBe("due");
  });
});

describe("buildDailyPracticePlan — weak topic", () => {
  it("surfaces a non-due item from the top weak topic with reason 'weak_topic'", () => {
    const items = [
      item({ questionId: "q1", subject: "Matematik", topic: "Türev", lastOutcome: "struggled", nextReviewAt: NOW + DAY_MS }),
      item({ questionId: "q2", subject: "Matematik", topic: "Türev", lastOutcome: "solved", nextReviewAt: NOW + DAY_MS }),
    ];
    const weakTopics = weakTopicsFor(items);
    const plan = buildDailyPracticePlan({
      items,
      weakTopics,
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    // q1 is claimed by the struggled tier first; q2 is the topic's other
    // member, picked up by the weak-topic tier.
    expect(plan.reasonByQuestionId.q1).toBe("struggled");
    expect(plan.reasonByQuestionId.q2).toBe("weak_topic");
    expect(plan.topicFocus).toEqual({ subject: "Matematik", topic: "Türev" });
  });
});

describe("buildDailyPracticePlan — daily goal remaining", () => {
  it("computes remainingGoal as dailyGoal minus reviewedToday", () => {
    const plan = buildDailyPracticePlan({
      items: [],
      weakTopics: [],
      now: NOW,
      reviewedToday: 13,
      dailyGoal: 20,
    });
    expect(plan.remainingGoal).toBe(7);
    expect(plan.isGoalComplete).toBe(false);
  });
});

describe("buildDailyPracticePlan — daily goal complete", () => {
  it("stops surfacing non-due recommendations once the goal is met, but keeps due items", () => {
    const items = [
      item({ questionId: "due1", nextReviewAt: NOW - 1000 }),
      item({ questionId: "filler1", nextReviewAt: NOW + DAY_MS }),
    ];
    const plan = buildDailyPracticePlan({
      items,
      weakTopics: [],
      now: NOW,
      reviewedToday: 20,
      dailyGoal: 20,
    });
    expect(plan.isGoalComplete).toBe(true);
    expect(plan.remainingGoal).toBe(0);
    expect(plan.dueCount).toBe(1);
    expect(plan.planItems).toEqual([]);
  });
});

describe("buildDailyPracticePlan — due obligation is never capped by the goal", () => {
  it("reports the full due count even when it exceeds remainingGoal", () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      item({ questionId: `due${i}`, nextReviewAt: NOW - 1000 }),
    );
    const plan = buildDailyPracticePlan({
      items,
      weakTopics: [],
      now: NOW,
      reviewedToday: 13,
      dailyGoal: 20,
    });
    expect(plan.remainingGoal).toBe(7);
    expect(plan.dueCount).toBe(12);
  });
});

describe("buildDailyPracticePlan — duplicate protection across all three categories", () => {
  it("classifies one question exactly once, by highest priority", () => {
    const topic: TopicInsight = {
      subject: "Matematik",
      topic: "Türev",
      struggledCount: 1,
      // Phase 41 — the plan's tier rules read struggledCount/lastOutcome,
      // never the cumulative counters, so this stays "unknown".
      struggledAttemptCount: null,
      masteredCount: 0,
      dueCount: 1,
      totalCount: 1,
      sampleQuestionId: "q1",
      masteryBand: "shaky",
      recency: "aging",
    };
    const items = [
      item({
        questionId: "q1",
        subject: "Matematik",
        topic: "Türev",
        lastOutcome: "struggled",
        nextReviewAt: NOW - 1000, // due AND struggled AND in the weak topic
      }),
    ];
    const plan = buildDailyPracticePlan({
      items,
      weakTopics: [topic],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(Object.keys(plan.reasonByQuestionId)).toEqual(["q1"]);
    expect(plan.reasonByQuestionId.q1).toBe("due");
    expect(plan.planItems).toEqual([]);
  });
});

describe("buildDailyPracticePlan — deterministic ordering", () => {
  it("orders non-due candidates by soonest nextReviewAt first", () => {
    const items = [
      item({ questionId: "later", lastOutcome: "struggled", nextReviewAt: NOW + 2 * DAY_MS }),
      item({ questionId: "sooner", lastOutcome: "struggled", nextReviewAt: NOW + DAY_MS }),
    ];
    const plan = buildDailyPracticePlan({
      items,
      weakTopics: [],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.planItems.map((p) => p.questionId)).toEqual(["sooner", "later"]);
  });
});

describe("buildDailyPracticePlan — tie ordering", () => {
  it("breaks an identical nextReviewAt tie by questionId ascending", () => {
    const items = [
      item({ questionId: "b", lastOutcome: "struggled", nextReviewAt: NOW + DAY_MS }),
      item({ questionId: "a", lastOutcome: "struggled", nextReviewAt: NOW + DAY_MS }),
    ];
    const plan = buildDailyPracticePlan({
      items,
      weakTopics: [],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.planItems.map((p) => p.questionId)).toEqual(["a", "b"]);
  });
});

describe("buildDailyPracticePlan — legacy metadata", () => {
  it("keeps a legacy (empty subject/topic) item due, unconditionally", () => {
    const items = [
      item({ questionId: "q1", subject: "", topic: "", nextReviewAt: NOW - 1000 }),
    ];
    const plan = buildDailyPracticePlan({
      items,
      weakTopics: [],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.dueCount).toBe(1);
    expect(plan.reasonByQuestionId.q1).toBe("due");
  });
});

describe("buildDailyPracticePlan — missing metadata does not crash filler selection", () => {
  it("includes a non-due legacy item as goal_fill without throwing", () => {
    const items = [
      item({ questionId: "q1", subject: "", topic: "", nextReviewAt: NOW + DAY_MS }),
    ];
    expect(() =>
      buildDailyPracticePlan({ items, weakTopics: [], now: NOW, reviewedToday: 0, dailyGoal: 10 }),
    ).not.toThrow();
    const plan = buildDailyPracticePlan({
      items,
      weakTopics: [],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.planItems).toEqual([
      { questionId: "q1", reason: "goal_fill", subject: "", topic: "" },
    ]);
  });
});

describe("buildDailyPracticePlan — mastered item exclusion", () => {
  it("excludes a non-due mastered item from every reinforcement tier", () => {
    const items = [
      item({ questionId: "q1", status: "mastered", lastOutcome: "struggled", nextReviewAt: NOW + 30 * DAY_MS }),
    ];
    const plan = buildDailyPracticePlan({
      items,
      weakTopics: [],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.planItems).toEqual([]);
  });

  it("still counts a due mastered item as due — mastery never overrides a real due obligation", () => {
    const items = [
      item({ questionId: "q1", status: "mastered", nextReviewAt: NOW - 1000 }),
    ];
    const plan = buildDailyPracticePlan({
      items,
      weakTopics: [],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.dueCount).toBe(1);
    expect(plan.reasonByQuestionId.q1).toBe("due");
  });
});

describe("buildDailyPracticePlan — future items are never falsely due", () => {
  it("excludes an item whose nextReviewAt is still in the future from dueCount", () => {
    const items = [item({ questionId: "q1", nextReviewAt: NOW + 1000 })];
    const plan = buildDailyPracticePlan({
      items,
      weakTopics: [],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.dueCount).toBe(0);
  });
});

describe("buildDailyPracticePlan — current-time boundary", () => {
  it("treats nextReviewAt === now as due (inclusive boundary)", () => {
    const items = [item({ questionId: "q1", nextReviewAt: NOW })];
    const plan = buildDailyPracticePlan({
      items,
      weakTopics: [],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.dueCount).toBe(1);
  });
});

describe("buildDailyPracticePlan — robustness", () => {
  it("does not mutate the input items or weakTopics arrays", () => {
    const items = [
      item({ questionId: "q1", lastOutcome: "struggled" }),
      item({ questionId: "q2", nextReviewAt: NOW - 1000 }),
    ];
    const weakTopics = weakTopicsFor(items);
    const itemsSnapshot = JSON.parse(JSON.stringify(items));
    const weakTopicsSnapshot = JSON.parse(JSON.stringify(weakTopics));
    buildDailyPracticePlan({ items, weakTopics, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(items).toEqual(itemsSnapshot);
    expect(weakTopics).toEqual(weakTopicsSnapshot);
  });

  it("produces byte-identical output across repeated calls with the same input", () => {
    const items = [
      item({ questionId: "q1", lastOutcome: "struggled" }),
      item({ questionId: "q2", nextReviewAt: NOW - 1000 }),
    ];
    const a = buildDailyPracticePlan({ items, weakTopics: [], now: NOW, reviewedToday: 3, dailyGoal: 10 });
    const b = buildDailyPracticePlan({ items, weakTopics: [], now: NOW, reviewedToday: 3, dailyGoal: 10 });
    expect(a).toEqual(b);
  });

  it("never produces NaN or Infinity for garbage daily-goal input", () => {
    const items = [item({ questionId: "q1", lastOutcome: "struggled" })];
    for (const [reviewed, goal] of [
      [NaN, 10],
      [5, NaN],
      [Infinity, 10],
      [5, -3],
      [-5, 10],
    ] as const) {
      const plan = buildDailyPracticePlan({ items, weakTopics: [], now: NOW, reviewedToday: reviewed, dailyGoal: goal });
      expect(Number.isFinite(plan.remainingGoal)).toBe(true);
      expect(Number.isFinite(plan.dailyGoal)).toBe(true);
      expect(Number.isFinite(plan.reviewedToday)).toBe(true);
    }
  });

  it("falls back to Date.now()-safe behavior for a non-finite `now`, without throwing", () => {
    const items = [item({ questionId: "q1", nextReviewAt: NOW })];
    expect(() =>
      buildDailyPracticePlan({ items, weakTopics: [], now: NaN, reviewedToday: 0, dailyGoal: 10 }),
    ).not.toThrow();
  });
});

describe("buildDailyPracticePlan — maximum visible recommendations", () => {
  it("never returns more than MAX_PLAN_ITEMS, even with a large remaining goal", () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      item({ questionId: `q${i}`, lastOutcome: "struggled", nextReviewAt: NOW + DAY_MS }),
    );
    const plan = buildDailyPracticePlan({
      items,
      weakTopics: [],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 1000,
    });
    expect(plan.remainingGoal).toBe(1000);
    expect(plan.planItems.length).toBe(MAX_PLAN_ITEMS);
  });
});

describe("buildDailyPracticePlan — pure, in-memory only", () => {
  it("is synchronous and requires no metadata beyond the items it was given", () => {
    const items = [item({ questionId: "q1", subject: "", topic: "", lastOutcome: "struggled" })];
    const result = buildDailyPracticePlan({ items, weakTopics: [], now: NOW, reviewedToday: 0, dailyGoal: 10 });
    // A pure sync function returns a plain object, never a Promise — proof
    // this never triggers (or awaits) a second metadata resolution.
    expect(result).not.toBeInstanceOf(Promise);
    expect(result.planItems).toHaveLength(1);
  });
});

describe("buildDailyPracticePlan — refresh after outcome", () => {
  it("reclassifies a question from 'struggled' to excluded once its outcome changes to solved-and-not-due", () => {
    const before = buildDailyPracticePlan({
      items: [item({ questionId: "q1", lastOutcome: "struggled", nextReviewAt: NOW + DAY_MS })],
      weakTopics: [],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(before.reasonByQuestionId.q1).toBe("struggled");

    // Simulates recordStudyOutcome("solved") having rescheduled the item —
    // useLearningInsights re-derives the plan from fresh items on refresh,
    // never from cached plan state.
    const after = buildDailyPracticePlan({
      items: [item({ questionId: "q1", lastOutcome: "solved", nextReviewAt: NOW + 4 * DAY_MS })],
      weakTopics: [],
      now: NOW,
      reviewedToday: 1,
      dailyGoal: 10,
    });
    expect(after.reasonByQuestionId.q1).toBe("goal_fill");
  });

  it("moves a question from 'struggled' to 'due' once its scheduled review time arrives", () => {
    const items = (nextReviewAt: number) => [
      item({ questionId: "q1", lastOutcome: "struggled", nextReviewAt }),
    ];
    const before = buildDailyPracticePlan({
      items: items(NOW + DAY_MS),
      weakTopics: [],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    const after = buildDailyPracticePlan({
      items: items(NOW - 1000),
      weakTopics: [],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(before.reasonByQuestionId.q1).toBe("struggled");
    expect(after.reasonByQuestionId.q1).toBe("due");
  });
});

// Phase 25 §5/§14 — buildAdaptivePracticePlan must select and categorize
// EXACTLY like buildDailyPracticePlan (same tiers, same predicates, same
// dedupe) — mastery/recency may only reorder WITHIN a tier, never move a
// question across tiers or change its PlanReason.
describe("buildAdaptivePracticePlan — tier priority is unchanged (§14)", () => {
  it("due always beats everything, exactly as buildDailyPracticePlan", () => {
    const items = [
      item({ questionId: "due1", nextReviewAt: NOW - 1000 }),
      item({ questionId: "struggled1", lastOutcome: "struggled", nextReviewAt: NOW + DAY_MS }),
    ];
    const plan = buildAdaptivePracticePlan({
      items,
      weakTopics: [],
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.dueCount).toBe(1);
    expect(plan.reasonByQuestionId.due1).toBe("due");
    expect(plan.reasonByQuestionId.struggled1).toBe("struggled");
  });

  it("struggled beats weak_topic, weak_topic beats goal_fill — same as the base plan", () => {
    const items = [
      item({ questionId: "s1", lastOutcome: "struggled", subject: "Fizik", topic: "Optik", nextReviewAt: NOW + DAY_MS }),
      item({ questionId: "w1", subject: "Matematik", topic: "Türev", nextReviewAt: NOW + DAY_MS }),
      item({ questionId: "f1", subject: "Kimya", topic: "Asitler", nextReviewAt: NOW + DAY_MS }),
    ];
    const weakTopics = weakTopicsFor([
      item({ questionId: "w1", subject: "Matematik", topic: "Türev", lastOutcome: "struggled" }),
    ]);
    const plan = buildAdaptivePracticePlan({
      items,
      weakTopics,
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.reasonByQuestionId.s1).toBe("struggled");
    expect(plan.reasonByQuestionId.w1).toBe("weak_topic");
    expect(plan.reasonByQuestionId.f1).toBe("goal_fill");
  });

  it("excludes mastered items exactly like buildDailyPracticePlan", () => {
    const items = [
      item({ questionId: "m1", status: "mastered", lastOutcome: "struggled", nextReviewAt: NOW + DAY_MS }),
    ];
    const plan = buildAdaptivePracticePlan({
      items,
      weakTopics: [],
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.planItems).toHaveLength(0);
    expect(plan.reasonByQuestionId.m1).toBeUndefined();
  });

  it("never produces a duplicate question across categories", () => {
    const items = [
      item({ questionId: "q1", subject: "Matematik", topic: "Türev", lastOutcome: "struggled", nextReviewAt: NOW + DAY_MS }),
    ];
    const weakTopics = weakTopicsFor(items);
    const plan = buildAdaptivePracticePlan({
      items,
      weakTopics,
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    const ids = plan.planItems.map((p) => p.questionId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(plan.reasonByQuestionId)).toHaveLength(1);
  });
});

describe("buildAdaptivePracticePlan — mastery/recency reorder WITHIN a tier (§5)", () => {
  it("surfaces the weaker-mastery struggled question first when the tier exceeds MAX_PLAN_ITEMS", () => {
    // Two struggled items in two DIFFERENT topics: one topic has never
    // succeeded (shaky), the other already has a mastered sibling
    // question (strong) — the shaky one should be prioritized.
    const shakyItem = item({
      questionId: "shaky1",
      subject: "Fizik",
      topic: "Optik",
      lastOutcome: "struggled",
      successfulReviews: 0,
      nextReviewAt: NOW + DAY_MS,
    });
    const strongSibling = item({
      questionId: "strong-sibling",
      subject: "Kimya",
      topic: "Asitler",
      status: "mastered",
      lastOutcome: "solved",
      successfulReviews: 5,
      nextReviewAt: NOW + 30 * DAY_MS,
    });
    const strongStruggled = item({
      questionId: "strong1",
      subject: "Kimya",
      topic: "Asitler",
      lastOutcome: "struggled",
      successfulReviews: 3,
      nextReviewAt: NOW + DAY_MS,
    });
    const items = [strongStruggled, shakyItem, strongSibling];
    const topicInsights = topicInsightsFor(items);

    const plan = buildAdaptivePracticePlan({
      items,
      weakTopics: [],
      topicInsights,
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });

    const struggledOrder = plan.planItems
      .filter((p) => p.reason === "struggled")
      .map((p) => p.questionId);
    expect(struggledOrder[0]).toBe("shaky1");
  });

  it("falls back to the base nextReviewAt/id order for a legacy item with no resolvable topic (§21)", () => {
    const legacyA = item({ questionId: "legacyA", subject: "", topic: "", lastOutcome: "struggled" });
    const legacyB = item({ questionId: "legacyB", subject: "", topic: "", lastOutcome: "struggled" });
    const items = [legacyB, legacyA];
    const basePlan = buildDailyPracticePlan({ items, weakTopics: [], now: NOW, reviewedToday: 0, dailyGoal: 10 });
    const adaptivePlan = buildAdaptivePracticePlan({
      items,
      weakTopics: [],
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(adaptivePlan.planItems.map((p) => p.questionId)).toEqual(
      basePlan.planItems.map((p) => p.questionId),
    );
  });

  it("is deterministic — same input always produces the same order", () => {
    const items = [
      item({ questionId: "a", subject: "Matematik", topic: "Türev", lastOutcome: "struggled" }),
      item({ questionId: "b", subject: "Fizik", topic: "Optik", lastOutcome: "struggled" }),
    ];
    const params = {
      items,
      weakTopics: [],
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    };
    const first = buildAdaptivePracticePlan(params).planItems.map((p) => p.questionId);
    const second = buildAdaptivePracticePlan(params).planItems.map((p) => p.questionId);
    expect(first).toEqual(second);
  });

  it("does not mutate its inputs", () => {
    const items = [item({ questionId: "a", lastOutcome: "struggled" })];
    const topicInsights = topicInsightsFor(items);
    const itemsCopy = items.map((i) => ({ ...i }));
    const topicsCopy = topicInsights.map((t) => ({ ...t }));

    buildAdaptivePracticePlan({
      items,
      weakTopics: [],
      topicInsights,
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });

    expect(items).toEqual(itemsCopy);
    expect(topicInsights).toEqual(topicsCopy);
  });

  it("handles an empty topicInsights list without throwing (legacy-only feed)", () => {
    const items = [item({ questionId: "a", subject: "", topic: "", lastOutcome: "struggled" })];
    expect(() =>
      buildAdaptivePracticePlan({
        items,
        weakTopics: [],
        topicInsights: [],
        now: NOW,
        reviewedToday: 0,
        dailyGoal: 10,
      }),
    ).not.toThrow();
  });
});

// Phase 45 — cumulative struggle history as the FINAL tie-break, once
// mastery band and recency (both topic-level, so two questions in the same
// topic always share them) have already failed to distinguish a pair.
describe("buildAdaptivePracticePlan — Phase 45: cumulative struggle history tie-break", () => {
  // A real Phase 41 OutcomeHistory shape — helper only, not a new fixture
  // concept: attemptCount always equals the sum, matching resolveOutcomeHistory's
  // own completeness rule, so this always describes TRUSTWORTHY history.
  function outcomeHistory(solvedCount: number, struggledCount: number, againCount = 0) {
    return {
      solvedCount,
      struggledCount,
      againCount,
      knownOutcomeCount: solvedCount + struggledCount + againCount,
    };
  }

  // A. CORE — the exact regression fixture the audit demonstrated: two
  // questions with identical current-state signals (same lastOutcome,
  // status, successfulReviews, topic — so identical mastery band and
  // recency) but materially different cumulative struggle histories were
  // PREVIOUSLY TIED (fell through to nextReviewAt/id, arbitrary relative to
  // actual struggle severity). Question A (8/10 struggle) must now rank
  // ahead of Question B (2/10 struggle).
  //
  // IDs are chosen so alphabetical order (the old fallback tie-break)
  // DISAGREES with struggle-severity order — "alpha-light-struggle" sorts
  // before "zulu-heavy-struggle" by id alone, so the PRE-Phase-45 baseline
  // test below provably picks the WRONG (low-struggle) question first, and
  // this test provably picks the right one, rather than the two assertions
  // coincidentally agreeing.
  it("A/CORE — 8/10 struggle ranks ahead of 2/10 struggle when current-state signals are identical", () => {
    const common = {
      subject: "Matematik",
      topic: "Denklemler",
      lastOutcome: "struggled" as const,
      status: "review" as const,
      successfulReviews: 1,
      lastReviewedAt: NOW - DAY_MS,
      nextReviewAt: NOW + DAY_MS,
    };
    const heavyStruggle = item({
      ...common,
      questionId: "zulu-heavy-struggle",
      // attemptCount not modeled on LearningInsightItem directly — history
      // is resolved upstream (useLearningInsights.ts) and carried as-is.
      outcomeHistory: outcomeHistory(2, 8),
    });
    const lightStruggle = item({
      ...common,
      questionId: "alpha-light-struggle",
      outcomeHistory: outcomeHistory(8, 2),
    });
    const items = [lightStruggle, heavyStruggle]; // input order must not matter
    const plan = buildAdaptivePracticePlan({
      items,
      weakTopics: [],
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.planItems.map((p) => p.questionId)).toEqual([
      "zulu-heavy-struggle",
      "alpha-light-struggle",
    ]);
  });

  // Same fixture, but PRE-Phase-45 semantics (no outcomeHistory at all):
  // documents the exact tie this phase resolves — order falls back to
  // nextReviewAt/id, so the LOW-struggle question (alphabetically first)
  // wins, with no regard to which question actually struggled more.
  it("PRE-PHASE-45 BASELINE — without outcomeHistory, the same two questions were an arbitrary tie decided by id, not struggle severity", () => {
    const common = {
      subject: "Matematik",
      topic: "Denklemler",
      lastOutcome: "struggled" as const,
      status: "review" as const,
      successfulReviews: 1,
      lastReviewedAt: NOW - DAY_MS,
      nextReviewAt: NOW + DAY_MS,
    };
    const heavyStruggle = item({ ...common, questionId: "zulu-heavy-struggle" });
    const lightStruggle = item({ ...common, questionId: "alpha-light-struggle" });
    const items = [lightStruggle, heavyStruggle];
    const plan = buildAdaptivePracticePlan({
      items,
      weakTopics: [],
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    // Identical nextReviewAt -> falls to questionId ascending: the LIGHT
    // struggle question wins purely because "alpha" < "zulu" — the exact
    // arbitrary-relative-to-severity behavior Phase 45 fixes above.
    expect(plan.planItems.map((p) => p.questionId)).toEqual([
      "alpha-light-struggle",
      "zulu-heavy-struggle",
    ]);
  });

  // B. LEGACY — neither side has trustworthy history: exact old fallback
  // behavior (nextReviewAt/id), never treated as "0 struggles" for either.
  it("B/LEGACY — two legacy items (no outcomeHistory) preserve the exact pre-Phase-45 fallback order", () => {
    const items = [
      item({ questionId: "legacyB", lastOutcome: "struggled", nextReviewAt: NOW + DAY_MS }),
      item({ questionId: "legacyA", lastOutcome: "struggled", nextReviewAt: NOW + DAY_MS }),
    ];
    const plan = buildAdaptivePracticePlan({
      items,
      weakTopics: [],
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.planItems.map((p) => p.questionId)).toEqual(["legacyA", "legacyB"]);
  });

  // Mixed: one side trustworthy, one side legacy — incomparable, so the
  // struggle tie-break must not apply at all (never substitutes 0 for the
  // legacy side), falling through to the base tie-break unchanged.
  it("LEGACY MIX — one item with real history and one without never has the legacy side treated as zero struggles", () => {
    const items = [
      item({
        questionId: "has-history",
        lastOutcome: "struggled",
        nextReviewAt: NOW + DAY_MS,
        outcomeHistory: outcomeHistory(0, 8),
      }),
      item({ questionId: "legacy-no-history", lastOutcome: "struggled", nextReviewAt: NOW + DAY_MS }),
    ];
    const plan = buildAdaptivePracticePlan({
      items,
      weakTopics: [],
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    // Falls to id-ascending (compareByReviewOrder), NOT to "has-history"
    // automatically winning just because it is the only side with data.
    expect(plan.planItems.map((p) => p.questionId)).toEqual(["has-history", "legacy-no-history"]);
  });

  // C. SAME HISTORY — genuinely tied cumulative evidence still resolves via
  // the existing deterministic tie-breaker (nextReviewAt/id), not a coin
  // flip.
  it("C/SAME-HISTORY — identical struggledCount falls through to the existing deterministic tie-breaker", () => {
    const items = [
      item({
        questionId: "b",
        lastOutcome: "struggled",
        nextReviewAt: NOW + DAY_MS,
        outcomeHistory: outcomeHistory(3, 4),
      }),
      item({
        questionId: "a",
        lastOutcome: "struggled",
        nextReviewAt: NOW + DAY_MS,
        outcomeHistory: outcomeHistory(1, 4),
      }),
    ];
    const plan = buildAdaptivePracticePlan({
      items,
      weakTopics: [],
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.planItems.map((p) => p.questionId)).toEqual(["a", "b"]);
  });

  // D. RECOVERY SAFETY — high lifetime struggle but CURRENTLY solved
  // (excluded from the struggled tier entirely by tier membership, which
  // this phase never touches) must not outrank an item genuinely still
  // struggling now. The "recovered" item cannot even reach this
  // comparator's struggled-tier comparison at all, because it never enters
  // that tier (isActive / lastOutcome === "struggled" gates membership).
  it("D/RECOVERY — a historically-heavy-struggle item that is now solved never displaces a currently-struggling item from the struggled tier", () => {
    const recoveredButHeavyHistory = item({
      questionId: "recovered",
      subject: "Matematik",
      topic: "Denklemler",
      lastOutcome: "solved",
      status: "review",
      successfulReviews: 2,
      nextReviewAt: NOW + 5 * DAY_MS,
      outcomeHistory: outcomeHistory(2, 8),
    });
    const currentlyStruggling = item({
      questionId: "still-struggling",
      subject: "Matematik",
      topic: "Denklemler",
      lastOutcome: "struggled",
      status: "review",
      successfulReviews: 0,
      nextReviewAt: NOW + DAY_MS,
      outcomeHistory: outcomeHistory(0, 4),
    });
    const items = [recoveredButHeavyHistory, currentlyStruggling];
    const plan = buildAdaptivePracticePlan({
      items,
      weakTopics: [],
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    const struggledOrder = plan.planItems.filter((p) => p.reason === "struggled").map((p) => p.questionId);
    // "recovered" never appears here: lastOutcome !== "struggled" excludes
    // it from the struggled tier regardless of its lifetime history.
    expect(struggledOrder).toEqual(["still-struggling"]);
  });

  // E. ONE-OFF — a single struggle does not acquire an exaggerated
  // advantage over strong persistent evidence; plain ordered comparison
  // (8 > 1) already produces the correct relative order without any new
  // "persistent" threshold.
  it("E/ONE-OFF — 1/1 struggle does not outrank 8/10 persistent struggle evidence", () => {
    const common = {
      subject: "Matematik",
      topic: "Denklemler",
      lastOutcome: "struggled" as const,
      status: "review" as const,
      successfulReviews: 1,
      nextReviewAt: NOW + DAY_MS,
    };
    const persistent = item({ ...common, questionId: "persistent", outcomeHistory: outcomeHistory(2, 8) });
    const oneOff = item({ ...common, questionId: "one-off", outcomeHistory: outcomeHistory(0, 1) });
    const items = [oneOff, persistent];
    const plan = buildAdaptivePracticePlan({
      items,
      weakTopics: [],
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(plan.planItems.map((p) => p.questionId)).toEqual(["persistent", "one-off"]);
  });

  // F. DUE — due items are never enumerated/sorted by adaptiveComparator at
  // all (buildTieredPlan only counts them, tier 1); the struggle tie-break
  // cannot affect due priority because it is only ever consulted for the
  // non-due tiers 2-4.
  it("F/DUE — a due item's priority is untouched: it is never compared by the struggle tie-break at all", () => {
    const dueItem = item({
      questionId: "due-now",
      nextReviewAt: NOW - 1,
      outcomeHistory: outcomeHistory(0, 1),
    });
    const nonDueHeavyStruggle = item({
      questionId: "not-due-heavy-struggle",
      nextReviewAt: NOW + DAY_MS,
      lastOutcome: "struggled",
      outcomeHistory: outcomeHistory(0, 9),
    });
    const items = [dueItem, nonDueHeavyStruggle];
    const plan = buildAdaptivePracticePlan({
      items,
      weakTopics: [],
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    // Due items are a count, never enumerated in planItems — heavy struggle
    // evidence on a NON-due item can never promote it ahead of a due
    // obligation, because due membership is decided before any comparator
    // runs.
    expect(plan.dueCount).toBe(1);
    expect(plan.planItems.map((p) => p.questionId)).toEqual(["not-due-heavy-struggle"]);
  });

  // G. PLAN SIZE — unchanged: the struggle tie-break only reorders within a
  // tier, it never changes how many items are admitted.
  it("G/PLAN-SIZE — MAX_PLAN_ITEMS cap is unaffected by the new tie-break", () => {
    const items = Array.from({ length: MAX_PLAN_ITEMS + 3 }, (_, i) =>
      item({
        questionId: `q${i}`,
        lastOutcome: "struggled",
        nextReviewAt: NOW + DAY_MS,
        outcomeHistory: outcomeHistory(0, i),
      }),
    );
    const plan = buildAdaptivePracticePlan({
      items,
      weakTopics: [],
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 100,
    });
    expect(plan.planItems.length).toBe(MAX_PLAN_ITEMS);
  });

  // H. DEDUPE — unchanged: still exactly one entry per question.
  it("H/DEDUPE — still exactly one planItem per question with the new tie-break active", () => {
    const items = [
      item({ questionId: "dup", lastOutcome: "struggled", outcomeHistory: outcomeHistory(0, 3) }),
      item({ questionId: "dup", lastOutcome: "struggled", outcomeHistory: outcomeHistory(0, 3) }),
    ];
    const plan = buildAdaptivePracticePlan({
      items,
      weakTopics: [],
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    const ids = plan.planItems.map((p) => p.questionId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // I. NO MUTATION.
  it("I/NO-MUTATION — does not mutate outcomeHistory-bearing inputs", () => {
    const items = [
      item({ questionId: "a", lastOutcome: "struggled", outcomeHistory: outcomeHistory(1, 4) }),
      item({ questionId: "b", lastOutcome: "struggled", outcomeHistory: outcomeHistory(2, 3) }),
    ];
    const itemsCopy = items.map((i) => ({ ...i, outcomeHistory: i.outcomeHistory ? { ...i.outcomeHistory } : null }));
    buildAdaptivePracticePlan({
      items,
      weakTopics: [],
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    expect(items).toEqual(itemsCopy);
  });

  // J. DETERMINISM.
  it("J/DETERMINISM — same input with real outcomeHistory always produces the same order", () => {
    const items = [
      item({ questionId: "a", lastOutcome: "struggled", outcomeHistory: outcomeHistory(1, 6) }),
      item({ questionId: "b", lastOutcome: "struggled", outcomeHistory: outcomeHistory(4, 3) }),
    ];
    const params = {
      items,
      weakTopics: [],
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    };
    const first = buildAdaptivePracticePlan(params).planItems.map((p) => p.questionId);
    const second = buildAdaptivePracticePlan(params).planItems.map((p) => p.questionId);
    expect(first).toEqual(second);
  });
});

// Phase 61 — chronology as the LAST tie-break.
//
// These are safety tests before they are feature tests. The feature is one
// line in the comparator; the risk is that it quietly outranks something
// stronger, which nothing on screen would reveal.
describe("buildAdaptivePracticePlan — Phase 61: chronology tie-break", () => {
  function outcomeHistory(solvedCount: number, struggledCount: number, againCount = 0) {
    return {
      solvedCount,
      struggledCount,
      againCount,
      knownOutcomeCount: solvedCount + struggledCount + againCount,
    };
  }

  // Identical current-state signals, so mastery and recency both tie and the
  // comparator reaches the keys under test.
  const common = {
    subject: "Matematik",
    topic: "Denklemler",
    lastOutcome: "struggled" as const,
    status: "review" as const,
    successfulReviews: 1,
    lastReviewedAt: NOW - DAY_MS,
    nextReviewAt: NOW + DAY_MS,
  };

  function chronologyEvent(id: string, outcome: StudyOutcome, occurredAt: number, questionId: string): LearningEvent {
    return { id, questionId, outcome, occurredAt, subject: "Matematik", topic: "Denklemler" };
  }

  function repeatedStruggle(questionId: string): LearningEvent[] {
    return [
      chronologyEvent(`${questionId}-1`, "struggled", NOW - 3 * DAY_MS, questionId),
      chronologyEvent(`${questionId}-2`, "struggled", NOW - 2 * DAY_MS, questionId),
      chronologyEvent(`${questionId}-3`, "struggled", NOW - DAY_MS, questionId),
    ];
  }

  function steadySolving(questionId: string): LearningEvent[] {
    return [
      chronologyEvent(`${questionId}-1`, "solved", NOW - 3 * DAY_MS, questionId),
      chronologyEvent(`${questionId}-2`, "solved", NOW - 2 * DAY_MS, questionId),
      chronologyEvent(`${questionId}-3`, "solved", NOW - DAY_MS, questionId),
    ];
  }

  function rank(items: LearningInsightItem[], events: LearningEvent[]): string[] {
    return buildAdaptivePracticePlan({
      items,
      weakTopics: [],
      topicInsights: topicInsightsFor(items),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
      chronologyByQuestionId: buildChronologyProfiles(events),
    }).planItems.map((p) => p.questionId);
  }

  // §48 — the actual feature: a true tie, resolved by real recent evidence.
  it("breaks a TRUE tie in favour of repeated recent struggle", () => {
    // Equal cumulative history on both sides, so Phase 45 returns 0 and the
    // comparator reaches chronology. Ids are chosen so the alphabetical
    // fallback would pick the OTHER question, proving chronology decided it.
    const a = item({ ...common, questionId: "zulu-recent-struggle", outcomeHistory: outcomeHistory(5, 5) });
    const b = item({ ...common, questionId: "alpha-recent-steady", outcomeHistory: outcomeHistory(5, 5) });
    const events = [...repeatedStruggle("zulu-recent-struggle"), ...steadySolving("alpha-recent-steady")];
    expect(rank([b, a], events)[0]).toBe("zulu-recent-struggle");
  });

  // §47 — the non-negotiable one.
  it("NEVER overrides stronger cumulative struggle evidence", () => {
    // A has far more trustworthy lifetime struggle but a calm recent run;
    // B has less lifetime struggle but a bad recent run. Phase 45 must win.
    const a = item({ ...common, questionId: "alpha-heavy-lifetime", outcomeHistory: outcomeHistory(2, 8) });
    const b = item({ ...common, questionId: "zulu-light-lifetime", outcomeHistory: outcomeHistory(8, 2) });
    const events = [...steadySolving("alpha-heavy-lifetime"), ...repeatedStruggle("zulu-light-lifetime")];
    expect(rank([b, a], events)[0]).toBe("alpha-heavy-lifetime");
  });

  // §51 — legacy items keep the existing path; chronology cannot repair
  // unknown lifetime history.
  it("does not let chronology promote an item whose lifetime history is unknown", () => {
    const legacy = item({ ...common, questionId: "alpha-legacy", outcomeHistory: null });
    const trustworthy = item({ ...common, questionId: "zulu-trustworthy", outcomeHistory: outcomeHistory(2, 8) });
    // The legacy item has the worse-looking recent run, but its lifetime
    // evidence is unknown — it must not leapfrog on chronology alone.
    const events = [...repeatedStruggle("alpha-legacy"), ...steadySolving("zulu-trustworthy")];
    const order = rank([trustworthy, legacy], events);
    // Falls through to the existing stable fallback (equal nextReviewAt → id).
    expect(order).toEqual(["alpha-legacy", "zulu-trustworthy"]);
  });

  // §50 — rollout fairness.
  it("does not favour a question merely for having chronology at all", () => {
    const withEvents = item({ ...common, questionId: "zulu-has-events", outcomeHistory: outcomeHistory(5, 5) });
    const without = item({ ...common, questionId: "alpha-no-events", outcomeHistory: outcomeHistory(5, 5) });
    const order = rank([without, withEvents], repeatedStruggle("zulu-has-events"));
    // Stable fallback, unchanged — the event log simply started later for one.
    expect(order).toEqual(["alpha-no-events", "zulu-has-events"]);
  });

  // §49 / §24 — absent chronology must be byte-for-byte the old behaviour.
  it("is identical to the pre-Phase-61 ordering when no chronology exists", () => {
    const a = item({ ...common, questionId: "alpha", outcomeHistory: outcomeHistory(5, 5) });
    const b = item({ ...common, questionId: "zulu", outcomeHistory: outcomeHistory(5, 5) });
    const withEmpty = rank([b, a], []);
    const withoutParam = buildAdaptivePracticePlan({
      items: [b, a],
      weakTopics: [],
      topicInsights: topicInsightsFor([b, a]),
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    }).planItems.map((p) => p.questionId);
    expect(withEmpty).toEqual(withoutParam);
    expect(withEmpty).toEqual(["alpha", "zulu"]);
  });

  // §52 — no meaningless churn.
  it("falls back to the stable order when both sides share a signal", () => {
    const a = item({ ...common, questionId: "alpha", outcomeHistory: outcomeHistory(5, 5) });
    const b = item({ ...common, questionId: "zulu", outcomeHistory: outcomeHistory(5, 5) });
    const events = [...repeatedStruggle("alpha"), ...repeatedStruggle("zulu")];
    expect(rank([b, a], events)).toEqual(["alpha", "zulu"]);
  });

  // §53 — the signature comparison.
  it("prefers repeated struggle over a recovering sequence", () => {
    const a = item({ ...common, questionId: "zulu-struggling", outcomeHistory: outcomeHistory(5, 5) });
    const b = item({ ...common, questionId: "alpha-recovering", outcomeHistory: outcomeHistory(5, 5) });
    const events = [
      ...repeatedStruggle("zulu-struggling"),
      chronologyEvent("r1", "struggled", NOW - 3 * DAY_MS, "alpha-recovering"),
      chronologyEvent("r2", "struggled", NOW - 2 * DAY_MS, "alpha-recovering"),
      chronologyEvent("r3", "solved", NOW - DAY_MS, "alpha-recovering"),
    ];
    expect(rank([b, a], events)[0]).toBe("zulu-struggling");
  });

  it("never moves a question across tiers", () => {
    // The tier boundary inside planItems is struggled > weak_topic >
    // goal_fill (due items are tracked separately as dueCount and never
    // enter planItems at all). A goal_fill candidate with the worst possible
    // recent run must still sit behind a struggled one with a calm run:
    // buildTieredPlan claims each tier before the comparator ever runs, so
    // chronology can only ever reorder WITHIN a tier.
    const struggled = item({
      ...common,
      questionId: "zulu-struggled-tier",
      lastOutcome: "struggled",
      outcomeHistory: outcomeHistory(5, 5),
    });
    const filler = item({
      ...common,
      questionId: "alpha-goal-fill-tier",
      lastOutcome: "solved",
      outcomeHistory: outcomeHistory(5, 5),
    });
    const events = [
      ...steadySolving("zulu-struggled-tier"),
      ...repeatedStruggle("alpha-goal-fill-tier"),
    ];
    const order = rank([filler, struggled], events);
    expect(order[0]).toBe("zulu-struggled-tier");
  });

  it("is deterministic across repeated runs", () => {
    const a = item({ ...common, questionId: "zulu", outcomeHistory: outcomeHistory(5, 5) });
    const b = item({ ...common, questionId: "alpha", outcomeHistory: outcomeHistory(5, 5) });
    const events = [...repeatedStruggle("zulu"), ...steadySolving("alpha")];
    expect(rank([a, b], events)).toEqual(rank([b, a], events));
  });
});
