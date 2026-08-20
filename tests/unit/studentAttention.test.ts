import {
  buildStudentAttentionInsight,
  sortStudentAttentionCards,
  StudentAttentionCard,
} from "../../src/features/teacher/services/studentAttention";
import {
  buildStudentPerformanceSnapshot,
  StudentPerformanceSnapshot,
} from "../../src/features/teacher/services/studentPerformance";
import { StudyItem } from "../../src/features/study/services/studyService";
import { Question } from "@/types/question";

const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function studyItem(overrides: Partial<StudyItem> = {}): StudyItem {
  return {
    questionId: "q1",
    status: "review",
    lastOutcome: "solved",
    intervalDays: 2,
    successfulReviews: 1,
    attemptCount: 1,
    nextReviewAt: NOW + DAY_MS,
    lastReviewedAt: NOW,
    source: "class",
    sourceClassId: "class-1",
    // Phase 41 — counters that account for every attempt, so the snapshot's
    // successRatePercent is trustworthy (see outcomeCounters.ts).
    solvedCount: 1,
    struggledCount: 0,
    againCount: 0,
    ...overrides,
  };
}

// Phase 41 — expresses "N solved of M recorded outcomes" through the REAL
// mechanism. These fixtures used to encode it as
// `successfulReviews: N, attemptCount: M`, which is the very confusion the
// phase fixes: successfulReviews is scheduler streak state, not a tally.
function withOutcomes(
  solved: number,
  struggled: number,
  again = 0,
  overrides: Partial<StudyItem> = {},
): StudyItem {
  return studyItem({
    attemptCount: solved + struggled + again,
    solvedCount: solved,
    struggledCount: struggled,
    againCount: again,
    ...overrides,
  });
}

function question(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    ownerId: "teacher-1",
    organizationId: "org-1",
    visibility: "class",
    imageUrl: `https://example.com/${id}.jpg`,
    classId: "class-1",
    subject: "Matematik",
    topic: "Kesirler",
    gradeLevel: "7",
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

function questionsMap(...questions: Question[]): Map<string, Question | null> {
  return new Map(questions.map((q) => [q.id, q]));
}

function snapshotFor(items: StudyItem[], questions: Question[], now = NOW): StudentPerformanceSnapshot {
  return buildStudentPerformanceSnapshot(items, questionsMap(...questions), now);
}

describe("buildStudentAttentionInsight — insufficient_data", () => {
  it("categorizes a student with zero class-sourced items as insufficient_data", () => {
    const snapshot = snapshotFor([], []);
    const insight = buildStudentAttentionInsight(snapshot, NOW);
    expect(insight.category).toBe("insufficient_data");
    expect(insight.reasons.length).toBeGreaterThan(0);
  });
});

describe("buildStudentAttentionInsight — needs_attention (repeated struggle)", () => {
  it("flags a student whose last 5 reviews were mostly struggles", () => {
    const items = [
      studyItem({ questionId: "a", lastOutcome: "struggled", lastReviewedAt: NOW }),
      studyItem({ questionId: "b", lastOutcome: "struggled", lastReviewedAt: NOW - DAY_MS }),
      studyItem({ questionId: "c", lastOutcome: "struggled", lastReviewedAt: NOW - 2 * DAY_MS }),
      studyItem({ questionId: "d", lastOutcome: "struggled", lastReviewedAt: NOW - 3 * DAY_MS }),
      studyItem({ questionId: "e", lastOutcome: "solved", lastReviewedAt: NOW - 4 * DAY_MS }),
    ];
    const questions = items.map((item) => question(item.questionId));
    const snapshot = snapshotFor(items, questions);
    const insight = buildStudentAttentionInsight(snapshot, NOW);
    expect(insight.category).toBe("needs_attention");
    expect(insight.reasons[0]).toBe("Son çalışmalarında çoğunlukla zorlandı");
  });

  it("does NOT flag repeated struggle from a sample smaller than the minimum (1 of 1)", () => {
    // A single struggled review is noise, not a pattern.
    const items = [studyItem({ questionId: "a", lastOutcome: "struggled" })];
    const snapshot = snapshotFor(items, [question("a")]);
    const insight = buildStudentAttentionInsight(snapshot, NOW);
    expect(insight.category).not.toBe("needs_attention");
  });
});

describe("buildStudentAttentionInsight — needs_attention (stale + weak topic)", () => {
  it("flags a student who hasn't studied a weak topic in 3+ days as needs_attention with the real day count", () => {
    const items = [
      studyItem({
        questionId: "a",
        lastOutcome: "struggled",
        lastReviewedAt: NOW - 5 * DAY_MS,
        nextReviewAt: NOW - DAY_MS, // due
      }),
    ];
    const snapshot = snapshotFor(items, [question("a")]);
    const insight = buildStudentAttentionInsight(snapshot, NOW);
    expect(insight.category).toBe("needs_attention");
    expect(insight.reasons[0]).toBe("5 gündür tekrar yapmadı");
  });

  it("does not flag staleness alone when there is no due backlog or weak topic", () => {
    const items = [
      withOutcomes(5, 0, 0, {
        questionId: "a",
        lastOutcome: "solved",
        successfulReviews: 5,
        status: "mastered",
        lastReviewedAt: NOW - 10 * DAY_MS,
        nextReviewAt: NOW + 30 * DAY_MS, // nothing due
      }),
    ];
    const snapshot = snapshotFor(items, [question("a")]);
    const insight = buildStudentAttentionInsight(snapshot, NOW);
    expect(insight.category).not.toBe("needs_attention");
  });
});

describe("buildStudentAttentionInsight — watch (declining trend)", () => {
  function dayItems(dayOffset: number, count: number, outcome: "solved" | "struggled"): StudyItem[] {
    return Array.from({ length: count }, (_, i) =>
      studyItem({
        questionId: `d${dayOffset}-${i}`,
        lastReviewedAt: NOW - dayOffset * DAY_MS,
        lastOutcome: outcome,
        nextReviewAt: NOW + 30 * DAY_MS,
      }),
    );
  }

  it("categorizes a declining-trend student as watch when not severe enough for needs_attention", () => {
    const items = [...dayItems(1, 10, "struggled"), ...dayItems(2, 10, "solved")];
    const questions = items.map((item) => question(item.questionId));
    const snapshot = snapshotFor(items, questions);
    expect(snapshot.trend).toBe("declining");
    const insight = buildStudentAttentionInsight(snapshot, NOW);
    expect(["needs_attention", "watch"]).toContain(insight.category);
  });
});

describe("buildStudentAttentionInsight — progressing (improving)", () => {
  function dayItems(dayOffset: number, count: number, outcome: "solved" | "struggled"): StudyItem[] {
    return Array.from({ length: count }, (_, i) =>
      studyItem({
        questionId: `d${dayOffset}-${i}`,
        lastReviewedAt: NOW - dayOffset * DAY_MS,
        lastOutcome: outcome,
        nextReviewAt: NOW + 30 * DAY_MS,
      }),
    );
  }

  it("categorizes an improving-trend student as progressing", () => {
    const items = [...dayItems(1, 10, "solved"), ...dayItems(2, 10, "struggled")];
    const questions = items.map((item) => question(item.questionId));
    const snapshot = snapshotFor(items, questions);
    expect(snapshot.trend).toBe("improving");
    const insight = buildStudentAttentionInsight(snapshot, NOW);
    expect(insight.category).toBe("progressing");
    expect(insight.reasons[0]).toBe("Son çalışmalarında iyileşme var");
  });
});

describe("buildStudentAttentionInsight — strong", () => {
  it("categorizes a high-success, zero-weak-topic, no-backlog student as strong", () => {
    const items = [
      withOutcomes(9, 1, 0, {
        questionId: "a",
        lastOutcome: "solved",
        nextReviewAt: NOW + 30 * DAY_MS,
      }),
    ];
    const snapshot = snapshotFor(items, [question("a")]);
    const insight = buildStudentAttentionInsight(snapshot, NOW);
    expect(insight.category).toBe("strong");
    expect(insight.reasons[0]).toBe("Bu sınıfta güçlü durumda");
  });
});

describe("buildStudentAttentionInsight — robustness", () => {
  it("is deterministic for the same input", () => {
    const items = [studyItem({ questionId: "a", lastOutcome: "struggled" })];
    const snapshot = snapshotFor(items, [question("a")]);
    const a = buildStudentAttentionInsight(snapshot, NOW);
    const b = buildStudentAttentionInsight(snapshot, NOW);
    expect(a).toEqual(b);
  });

  it("always returns at least one reason", () => {
    const snapshots = [
      snapshotFor([], []),
      snapshotFor([studyItem({ questionId: "a" })], [question("a")]),
    ];
    for (const snapshot of snapshots) {
      expect(buildStudentAttentionInsight(snapshot, NOW).reasons.length).toBeGreaterThan(0);
    }
  });
});

function attentionCard(overrides: Partial<StudentAttentionCard> = {}): StudentAttentionCard {
  return {
    studentUid: "u1",
    displayName: "Ahmet",
    successRatePercent: null,
    insight: { category: "progressing", reasons: ["Düzenli ve istikrarlı ilerliyor"], implicatedTopic: null },
    ...overrides,
  };
}

describe("sortStudentAttentionCards", () => {
  it("orders needs_attention before watch before insufficient_data before progressing before strong", () => {
    const cards = [
      attentionCard({ studentUid: "strong", insight: { category: "strong", reasons: [], implicatedTopic: null } }),
      attentionCard({
        studentUid: "progressing",
        insight: { category: "progressing", reasons: [], implicatedTopic: null },
      }),
      attentionCard({
        studentUid: "insufficient",
        insight: { category: "insufficient_data", reasons: [], implicatedTopic: null },
      }),
      attentionCard({ studentUid: "watch", insight: { category: "watch", reasons: [], implicatedTopic: null } }),
      attentionCard({
        studentUid: "needs_attention",
        insight: { category: "needs_attention", reasons: [], implicatedTopic: null },
      }),
    ];
    const sorted = sortStudentAttentionCards(cards);
    expect(sorted.map((c) => c.studentUid)).toEqual([
      "needs_attention",
      "watch",
      "insufficient",
      "progressing",
      "strong",
    ]);
  });

  it("never produces a duplicate student even when the input has one entry per student", () => {
    const cards = [
      attentionCard({ studentUid: "a" }),
      attentionCard({ studentUid: "b" }),
      attentionCard({ studentUid: "c" }),
    ];
    const sorted = sortStudentAttentionCards(cards);
    const uids = sorted.map((c) => c.studentUid);
    expect(new Set(uids).size).toBe(uids.length);
    expect(uids).toHaveLength(3);
  });

  it("breaks a same-category tie by LOWEST success rate first", () => {
    const cards = [
      attentionCard({
        studentUid: "higher",
        successRatePercent: 40,
        insight: { category: "needs_attention", reasons: [], implicatedTopic: null },
      }),
      attentionCard({
        studentUid: "lower",
        successRatePercent: 10,
        insight: { category: "needs_attention", reasons: [], implicatedTopic: null },
      }),
    ];
    const sorted = sortStudentAttentionCards(cards);
    expect(sorted.map((c) => c.studentUid)).toEqual(["lower", "higher"]);
  });

  it("breaks a full tie (same category, same score) by displayName deterministically", () => {
    const cards = [
      attentionCard({ studentUid: "b", displayName: "Zeynep", successRatePercent: 50 }),
      attentionCard({ studentUid: "a", displayName: "Ayşe", successRatePercent: 50 }),
    ];
    const sorted = sortStudentAttentionCards(cards);
    expect(sorted.map((c) => c.displayName)).toEqual(["Ayşe", "Zeynep"]);
  });

  it("does not mutate the input array", () => {
    const cards = [attentionCard({ studentUid: "b" }), attentionCard({ studentUid: "a" })];
    const copy = [...cards];
    sortStudentAttentionCards(cards);
    expect(cards).toEqual(copy);
  });
});
