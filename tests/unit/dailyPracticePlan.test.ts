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
