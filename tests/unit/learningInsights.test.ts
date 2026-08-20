import {
  buildDailyProgress,
  buildLearningInsights,
  LearningInsightItem,
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

describe("buildDailyProgress", () => {
  it("is zero and incomplete with no goal set", () => {
    const progress = buildDailyProgress(0, 0);
    expect(progress).toEqual({ reviewedToday: 0, dailyGoal: 0, percent: 0, isComplete: false });
  });

  it("reports partial progress toward a real goal", () => {
    const progress = buildDailyProgress(3, 10);
    expect(progress.percent).toBeCloseTo(0.3);
    expect(progress.isComplete).toBe(false);
  });

  it("marks the goal complete once reviewedToday reaches it", () => {
    const progress = buildDailyProgress(10, 10);
    expect(progress.percent).toBe(1);
    expect(progress.isComplete).toBe(true);
  });

  it("clamps overachievement to 100% rather than overflowing", () => {
    const progress = buildDailyProgress(17, 10);
    expect(progress.percent).toBe(1);
    expect(progress.isComplete).toBe(true);
  });

  it("never produces NaN or Infinity for garbage input", () => {
    for (const [reviewed, goal] of [
      [NaN, 10],
      [5, NaN],
      [Infinity, 10],
      [5, -3],
      [-5, 10],
    ] as const) {
      const progress = buildDailyProgress(reviewed, goal);
      expect(Number.isFinite(progress.percent)).toBe(true);
      expect(Number.isFinite(progress.reviewedToday)).toBe(true);
      expect(Number.isFinite(progress.dailyGoal)).toBe(true);
    }
  });
});

describe("buildLearningInsights — empty data", () => {
  it("returns an all-zero, empty view-model for a student with no study items", () => {
    const insights = buildLearningInsights({ items: [], now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.dueCount).toBe(0);
    expect(insights.weakTopics).toEqual([]);
    expect(insights.strongTopics).toEqual([]);
    expect(insights.subjectSummaries).toEqual([]);
    expect(insights.dailyProgress.percent).toBe(0);
  });
});

describe("buildLearningInsights — outcome composition", () => {
  it("produces no weak topics when every outcome was solved", () => {
    const items = [
      item({ questionId: "q1", lastOutcome: "solved" }),
      item({ questionId: "q2", lastOutcome: "solved" }),
    ];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.weakTopics).toEqual([]);
  });

  it("surfaces a topic as weak from struggled outcomes alone", () => {
    const items = [
      item({ questionId: "q1", lastOutcome: "struggled" }),
      item({ questionId: "q2", lastOutcome: "struggled" }),
    ];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.weakTopics).toHaveLength(1);
    expect(insights.weakTopics[0]?.struggledCount).toBe(2);
  });

  it("separates weak and strong signals within a mixed set", () => {
    const items = [
      item({ questionId: "q1", subject: "Matematik", topic: "Türev", lastOutcome: "struggled" }),
      item({
        questionId: "q2",
        subject: "Fizik",
        topic: "Kuvvet",
        lastOutcome: "solved",
        status: "mastered",
        nextReviewAt: NOW + 20 * DAY_MS,
      }),
    ];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.weakTopics.map((t) => t.topic)).toEqual(["Türev"]);
    expect(insights.strongTopics.map((t) => t.topic)).toEqual(["Kuvvet"]);
  });
});

describe("buildLearningInsights — due prioritization", () => {
  it("counts only items whose nextReviewAt has arrived", () => {
    const items = [
      item({ questionId: "q1", nextReviewAt: NOW - 1000 }),
      item({ questionId: "q2", nextReviewAt: NOW }),
      item({ questionId: "q3", nextReviewAt: NOW + DAY_MS }),
    ];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.dueCount).toBe(2);
  });

  it("picks the actually-due item as a topic's sample, over a not-yet-due one", () => {
    const items = [
      item({ questionId: "not-due", nextReviewAt: NOW + DAY_MS, lastOutcome: "struggled" }),
      item({ questionId: "due-now", nextReviewAt: NOW - 1000, lastOutcome: "struggled" }),
    ];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.weakTopics[0]?.sampleQuestionId).toBe("due-now");
  });

  it("falls back to a non-mastered item when nothing is due", () => {
    const items = [
      item({ questionId: "mastered", status: "mastered", lastOutcome: "struggled", nextReviewAt: NOW + 30 * DAY_MS }),
      item({ questionId: "learning", status: "learning", lastOutcome: "struggled", nextReviewAt: NOW + DAY_MS }),
    ];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.weakTopics[0]?.sampleQuestionId).toBe("learning");
  });
});

describe("buildLearningInsights — mastered items", () => {
  it("counts mastered items toward strong topics and subject summaries", () => {
    const items = [
      item({ questionId: "q1", status: "mastered", lastOutcome: "solved" }),
      item({ questionId: "q2", status: "mastered", lastOutcome: "solved" }),
      item({ questionId: "q3", status: "learning", lastOutcome: "solved" }),
    ];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.strongTopics[0]?.masteredCount).toBe(2);
    expect(insights.subjectSummaries[0]?.masteredCount).toBe(2);
    expect(insights.subjectSummaries[0]?.totalCount).toBe(3);
  });
});

describe("buildLearningInsights — weak topic ranking", () => {
  it("orders by struggledCount descending", () => {
    const items = [
      item({ questionId: "a1", subject: "Matematik", topic: "Az", lastOutcome: "struggled" }),
      item({ questionId: "b1", subject: "Matematik", topic: "Cok", lastOutcome: "struggled" }),
      item({ questionId: "b2", subject: "Matematik", topic: "Cok", lastOutcome: "struggled" }),
      item({ questionId: "b3", subject: "Matematik", topic: "Cok", lastOutcome: "struggled" }),
    ];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.weakTopics.map((t) => t.topic)).toEqual(["Cok", "Az"]);
  });

  it("caps the weak topic list at 5 entries", () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      item({
        questionId: `q${i}`,
        subject: "Matematik",
        topic: `Konu${i}`,
        lastOutcome: "struggled",
      }),
    );
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.weakTopics.length).toBeLessThanOrEqual(5);
  });
});

describe("buildLearningInsights — strong topic ranking", () => {
  it("orders by masteredCount descending", () => {
    const items = [
      item({ questionId: "a1", subject: "Fizik", topic: "Az", status: "mastered" }),
      item({ questionId: "b1", subject: "Fizik", topic: "Cok", status: "mastered" }),
      item({ questionId: "b2", subject: "Fizik", topic: "Cok", status: "mastered" }),
    ];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.strongTopics.map((t) => t.topic)).toEqual(["Cok", "Az"]);
  });
});

describe("buildLearningInsights — stable tie ordering", () => {
  it("breaks a struggledCount tie alphabetically by subject then topic", () => {
    const items = [
      item({ questionId: "q1", subject: "Türkçe", topic: "Yazım", lastOutcome: "struggled" }),
      item({ questionId: "q2", subject: "Matematik", topic: "Türev", lastOutcome: "struggled" }),
      item({ questionId: "q3", subject: "Fizik", topic: "Kuvvet", lastOutcome: "struggled" }),
    ];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.weakTopics.map((t) => t.subject)).toEqual(["Fizik", "Matematik", "Türkçe"]);
  });

  it("produces byte-identical ordering across repeated calls with the same input", () => {
    const items = [
      item({ questionId: "q1", subject: "B", topic: "X", lastOutcome: "struggled" }),
      item({ questionId: "q2", subject: "A", topic: "Y", lastOutcome: "struggled" }),
      item({ questionId: "q3", subject: "C", topic: "Z", lastOutcome: "struggled" }),
    ];
    const first = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    const second = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(first.weakTopics.map((t) => t.subject)).toEqual(second.weakTopics.map((t) => t.subject));
  });
});

describe("buildLearningInsights — legacy / missing metadata", () => {
  it("excludes an item with an empty topic from topic-level insights", () => {
    const items = [item({ questionId: "q1", topic: "", lastOutcome: "struggled" })];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.weakTopics).toEqual([]);
  });

  it("still counts an empty-topic item toward its (real) subject's summary", () => {
    const items = [item({ questionId: "q1", subject: "Matematik", topic: "", lastOutcome: "struggled" })];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.subjectSummaries).toEqual([
      { subject: "Matematik", dueCount: 0, masteredCount: 0, totalCount: 1 },
    ]);
  });

  it("groups an item with an empty subject under 'Diğer' rather than dropping it", () => {
    const items = [item({ questionId: "q1", subject: "", topic: "" })];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.subjectSummaries).toHaveLength(1);
    expect(insights.subjectSummaries[0]?.subject).toBe("Diğer");
    expect(insights.subjectSummaries[0]?.totalCount).toBe(1);
  });

  it("never crashes on a fully legacy item (empty subject AND topic, struggled outcome)", () => {
    const items = [item({ questionId: "q1", subject: "", topic: "", lastOutcome: "struggled" })];
    expect(() =>
      buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 }),
    ).not.toThrow();
  });
});

describe("buildLearningInsights — daily goal states", () => {
  it("reflects an unset goal", () => {
    const insights = buildLearningInsights({ items: [], now: NOW, reviewedToday: 0, dailyGoal: 0 });
    expect(insights.dailyProgress.dailyGoal).toBe(0);
    expect(insights.dailyProgress.isComplete).toBe(false);
  });

  it("reflects a partially completed goal", () => {
    const insights = buildLearningInsights({ items: [], now: NOW, reviewedToday: 4, dailyGoal: 10 });
    expect(insights.dailyProgress.isComplete).toBe(false);
    expect(insights.dailyProgress.percent).toBeCloseTo(0.4);
  });

  it("reflects a completed goal", () => {
    const insights = buildLearningInsights({ items: [], now: NOW, reviewedToday: 10, dailyGoal: 10 });
    expect(insights.dailyProgress.isComplete).toBe(true);
  });
});

describe("buildLearningInsights — duplicate question protection", () => {
  it("counts a duplicated questionId only once", () => {
    const items = [
      item({ questionId: "q1", lastOutcome: "struggled" }),
      item({ questionId: "q1", lastOutcome: "struggled" }),
    ];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.weakTopics[0]?.struggledCount).toBe(1);
    expect(insights.weakTopics[0]?.totalCount).toBe(1);
  });

  it("keeps the FIRST occurrence when the same questionId carries conflicting data", () => {
    const items = [
      item({ questionId: "q1", subject: "Matematik", lastOutcome: "struggled" }),
      item({ questionId: "q1", subject: "Fizik", lastOutcome: "solved" }),
    ];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.subjectSummaries).toEqual([
      { subject: "Matematik", dueCount: 0, masteredCount: 0, totalCount: 1 },
    ]);
  });
});

describe("buildLearningInsights — robustness", () => {
  it("does not mutate the input items array", () => {
    const items = [item({ questionId: "q1" }), item({ questionId: "q2" })];
    const snapshot = JSON.parse(JSON.stringify(items));
    buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(items).toEqual(snapshot);
  });

  it("falls back to Date.now()-safe behavior for a non-finite `now`", () => {
    const items = [item({ questionId: "q1", nextReviewAt: NOW })];
    expect(() =>
      buildLearningInsights({ items, now: NaN, reviewedToday: 0, dailyGoal: 10 }),
    ).not.toThrow();
  });

  it("produces deterministic output for the same input across multiple calls", () => {
    const items = [
      item({ questionId: "q1", lastOutcome: "struggled" }),
      item({ questionId: "q2", status: "mastered" }),
    ];
    const a = buildLearningInsights({ items, now: NOW, reviewedToday: 3, dailyGoal: 10 });
    const b = buildLearningInsights({ items, now: NOW, reviewedToday: 3, dailyGoal: 10 });
    expect(a).toEqual(b);
  });
});

// Phase 25 — allTopics/masteryBand/recency are ADDITIVE: every test above
// this point (Phase 22 contract) still passes unmodified, proving the
// extension is backward-compatible per §6/§21.
describe("buildLearningInsights — allTopics (Phase 25)", () => {
  it("includes every real topic, not just the top-5 weak/strong ones", () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      item({ questionId: `q${i}`, subject: "Matematik", topic: `Konu${i}`, lastOutcome: "struggled" }),
    );
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.allTopics).toHaveLength(8);
    expect(insights.weakTopics.length).toBeLessThanOrEqual(5);
  });

  it("excludes items with no subject or no topic, same as the existing bucketing rule", () => {
    const items = [item({ questionId: "q1", subject: "", topic: "" })];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.allTopics).toEqual([]);
  });

  it("is sorted by subject then topic, independent of any score", () => {
    const items = [
      item({ questionId: "q1", subject: "Fizik", topic: "Optik" }),
      item({ questionId: "q2", subject: "Fizik", topic: "Elektrik" }),
      item({ questionId: "q3", subject: "Biyoloji", topic: "Hücre" }),
    ];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.allTopics.map((t) => `${t.subject}/${t.topic}`)).toEqual([
      "Biyoloji/Hücre",
      "Fizik/Elektrik",
      "Fizik/Optik",
    ]);
  });

  it("gives each topic a masteryBand and a recency computed from its items", () => {
    const items = [
      item({ questionId: "q1", subject: "Matematik", topic: "Türev", status: "mastered", successfulReviews: 5 }),
    ];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.allTopics[0]?.masteryBand).toBe("mastered");
    expect(insights.allTopics[0]?.recency).toBe("recently_practiced");
  });

  it("uses the MOST recently reviewed item in a topic for that topic's recency", () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const items = [
      item({ questionId: "old", subject: "Matematik", topic: "Türev", lastReviewedAt: NOW - 30 * DAY_MS }),
      item({ questionId: "fresh", subject: "Matematik", topic: "Türev", lastReviewedAt: NOW - 1 * DAY_MS }),
    ];
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    expect(insights.allTopics[0]?.recency).toBe("recently_practiced");
  });
});

// Phase 41 — the real struggle-EVENT count per topic.
//
// `struggledCount` counts questions currently sitting in a struggled state.
// The Weak Topics card used to render it as "N kez zorlandın" ("N times"),
// so a student who struggled eight times on one question was told "1 kez".
// `struggledAttemptCount` is the honest number for that sentence, and is
// null whenever no question in the topic has trustworthy history.
describe("buildLearningInsights — struggledAttemptCount", () => {
  function withHistory(
    solved: number,
    struggled: number,
    again: number,
    overrides: Partial<LearningInsightItem> = {},
  ): LearningInsightItem {
    return item({
      lastOutcome: "struggled",
      outcomeHistory: {
        solvedCount: solved,
        struggledCount: struggled,
        againCount: again,
        knownOutcomeCount: solved + struggled + again,
      },
      ...overrides,
    });
  }

  // Throws rather than returning undefined, so a fixture that accidentally
  // produces no weak topic fails loudly instead of silently skipping the
  // assertions below.
  function topicOf(items: LearningInsightItem[]) {
    const topic = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 })
      .weakTopics[0];
    if (!topic) throw new Error("fixture produced no weak topic");
    return topic;
  }

  it("reports the REAL number of struggled outcomes on one question", () => {
    const topic = topicOf([withHistory(0, 8, 0, { questionId: "hard" })]);
    // One question in a struggled state...
    expect(topic.struggledCount).toBe(1);
    // ...but eight real struggles. These are different questions about the
    // data, and the UI now asks the right one.
    expect(topic.struggledAttemptCount).toBe(8);
  });

  it("sums struggled events across every question in the topic", () => {
    const topic = topicOf([
      withHistory(0, 5, 0, { questionId: "a" }),
      withHistory(1, 2, 0, { questionId: "b" }),
    ]);
    expect(topic.struggledCount).toBe(2);
    expect(topic.struggledAttemptCount).toBe(7);
  });

  it("is null — never 0 — when no question in the topic has trustworthy history", () => {
    const topic = topicOf([item({ questionId: "legacy", lastOutcome: "struggled" })]);
    expect(topic.struggledCount).toBe(1);
    expect(topic.struggledAttemptCount).toBeNull();
  });

  it("counts only the questions that DO have history, ignoring legacy ones", () => {
    const topic = topicOf([
      item({ questionId: "legacy", lastOutcome: "struggled" }),
      withHistory(0, 3, 0, { questionId: "counted" }),
    ]);
    expect(topic.struggledCount).toBe(2);
    expect(topic.struggledAttemptCount).toBe(3);
  });

  it("leaves the weak-topic RANKING untouched — it still ranks on struggledCount", () => {
    const insights = buildLearningInsights({
      items: [
        // One question, many struggles.
        withHistory(0, 9, 0, { questionId: "a", topic: "Limit" }),
        // Two questions, few struggles — more questions currently struggling.
        withHistory(0, 1, 0, { questionId: "b", topic: "İntegral" }),
        withHistory(0, 1, 0, { questionId: "c", topic: "İntegral" }),
      ],
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    // İntegral outranks Limit because 2 questions are struggling vs 1 —
    // exactly as before this phase. The event counts do not reorder it.
    const [first, second] = insights.weakTopics;
    expect(first?.topic).toBe("İntegral");
    expect(first?.struggledAttemptCount).toBe(2);
    expect(second?.struggledAttemptCount).toBe(9);
  });

  it("counts struggled events only — a solved or again outcome is not a struggle", () => {
    const topic = topicOf([withHistory(4, 1, 3, { questionId: "mixed" })]);
    expect(topic.struggledAttemptCount).toBe(1);
  });
});
