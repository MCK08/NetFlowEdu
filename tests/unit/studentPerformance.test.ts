import {
  buildClassPerformanceSummary,
  buildStudentPerformanceSnapshot,
  classifyStudentSupportTier,
  sortStudentPerformanceCards,
  StudentPerformanceCard,
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
    ...overrides,
  };
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

describe("buildStudentPerformanceSnapshot — empty / no data", () => {
  it("returns an all-zero, no-fake-data snapshot for a student with zero class-sourced items", () => {
    const snapshot = buildStudentPerformanceSnapshot([], new Map(), NOW);
    expect(snapshot.totalCount).toBe(0);
    expect(snapshot.masteredCount).toBe(0);
    expect(snapshot.dueCount).toBe(0);
    expect(snapshot.successRatePercent).toBeNull(); // never a fake 0%
    expect(snapshot.today).toEqual({ reviewedToday: 0, solvedToday: 0, struggledToday: 0 });
    expect(snapshot.weakTopics).toEqual([]);
    expect(snapshot.strongTopics).toEqual([]);
    expect(snapshot.lastStudiedAt).toBeNull();
    expect(snapshot.trend).toBe("insufficient_data");
    expect(snapshot.daysActiveRecently).toBe(0);
  });
});

describe("buildStudentPerformanceSnapshot — real signals", () => {
  it("computes successRatePercent from real attemptCount/successfulReviews across items", () => {
    const items = [
      studyItem({ questionId: "a", attemptCount: 4, successfulReviews: 3 }),
      studyItem({ questionId: "b", attemptCount: 2, successfulReviews: 1 }),
    ];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a"), question("b")), NOW);
    // 4 successful out of 6 attempts total
    expect(snapshot.successRatePercent).toBe(Math.round((4 / 6) * 100));
  });

  it("counts due items via the real nextReviewAt <= now rule", () => {
    const items = [
      studyItem({ questionId: "due1", nextReviewAt: NOW - 1000 }),
      studyItem({ questionId: "notdue", nextReviewAt: NOW + DAY_MS }),
    ];
    const snapshot = buildStudentPerformanceSnapshot(
      items,
      questionsMap(question("due1"), question("notdue")),
      NOW,
    );
    expect(snapshot.dueCount).toBe(1);
  });

  it("surfaces a real weak topic from struggled outcomes", () => {
    const items = [studyItem({ questionId: "a", lastOutcome: "struggled" })];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(snapshot.weakTopics).toHaveLength(1);
    expect(snapshot.weakTopics[0]?.topic).toBe("Kesirler");
  });

  it("counts a mastered item toward masteredCount and strongTopics", () => {
    const items = [studyItem({ questionId: "a", status: "mastered", successfulReviews: 5 })];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(snapshot.masteredCount).toBe(1);
    expect(snapshot.strongTopics).toHaveLength(1);
  });

  it("reports today's activity only for items actually reviewed today", () => {
    const items = [
      studyItem({ questionId: "today1", lastReviewedAt: NOW, lastOutcome: "solved" }),
      studyItem({ questionId: "today2", lastReviewedAt: NOW, lastOutcome: "struggled" }),
      studyItem({ questionId: "yesterday", lastReviewedAt: NOW - 3 * DAY_MS, lastOutcome: "solved" }),
    ];
    const snapshot = buildStudentPerformanceSnapshot(
      items,
      questionsMap(question("today1"), question("today2"), question("yesterday")),
      NOW,
    );
    expect(snapshot.today).toEqual({ reviewedToday: 2, solvedToday: 1, struggledToday: 1 });
  });

  it("reports lastStudiedAt as the MOST recent lastReviewedAt across items", () => {
    const items = [
      studyItem({ questionId: "a", lastReviewedAt: NOW - 5 * DAY_MS }),
      studyItem({ questionId: "b", lastReviewedAt: NOW - 1 * DAY_MS }),
    ];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a"), question("b")), NOW);
    expect(snapshot.lastStudiedAt).toBe(NOW - 1 * DAY_MS);
  });

  it("does not crash and reports empty topics for a legacy question with no subject/topic", () => {
    const items = [studyItem({ questionId: "legacy" })];
    const legacyQuestion = question("legacy", { subject: "", topic: "" });
    expect(() =>
      buildStudentPerformanceSnapshot(items, questionsMap(legacyQuestion), NOW),
    ).not.toThrow();
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(legacyQuestion), NOW);
    expect(snapshot.weakTopics).toEqual([]);
    expect(snapshot.totalCount).toBe(1); // still counted toward totals/due/mastered
  });

  it("does not crash when a question fails to resolve (deleted/inaccessible)", () => {
    const items = [studyItem({ questionId: "gone" })];
    expect(() => buildStudentPerformanceSnapshot(items, new Map(), NOW)).not.toThrow();
  });
});

describe("buildStudentPerformanceSnapshot — trend (reuses buildLearningTrend)", () => {
  function dayItems(dayOffset: number, count: number, outcome: "solved" | "struggled"): StudyItem[] {
    return Array.from({ length: count }, (_, i) =>
      studyItem({
        questionId: `d${dayOffset}-${i}`,
        lastReviewedAt: NOW - dayOffset * DAY_MS,
        lastOutcome: outcome,
      }),
    );
  }

  it("is 'insufficient_data' with too few total reviews", () => {
    const items = [studyItem({ questionId: "a", lastReviewedAt: NOW })];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(snapshot.trend).toBe("insufficient_data");
  });

  it("is 'improving' when recent days struggle less than earlier days", () => {
    const items = [...dayItems(1, 10, "solved"), ...dayItems(2, 10, "struggled")];
    const questions = items.map((item) => question(item.questionId));
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(...questions), NOW);
    expect(snapshot.trend).toBe("improving");
  });

  it("is 'declining' when recent days struggle more than earlier days", () => {
    const items = [...dayItems(1, 10, "struggled"), ...dayItems(2, 10, "solved")];
    const questions = items.map((item) => question(item.questionId));
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(...questions), NOW);
    expect(snapshot.trend).toBe("declining");
  });
});

describe("buildStudentPerformanceSnapshot — robustness", () => {
  it("does not mutate the input items array or questionsById map", () => {
    const items = [studyItem({ questionId: "a" })];
    const itemsCopy = items.map((i) => ({ ...i }));
    const questions = questionsMap(question("a"));
    const questionsCopy = new Map(questions);
    buildStudentPerformanceSnapshot(items, questions, NOW);
    expect(items).toEqual(itemsCopy);
    expect(questions).toEqual(questionsCopy);
  });

  it("is deterministic for the same input", () => {
    const items = [studyItem({ questionId: "a", lastOutcome: "struggled" })];
    const questions = questionsMap(question("a"));
    const a = buildStudentPerformanceSnapshot(items, questions, NOW);
    const b = buildStudentPerformanceSnapshot(items, questions, NOW);
    expect(a).toEqual(b);
  });

  it("handles a large (30-student-scale) item list without throwing", () => {
    const items = Array.from({ length: 400 }, (_, i) =>
      studyItem({ questionId: `q${i}`, lastReviewedAt: NOW - (i % 20) * DAY_MS }),
    );
    const questions = items.map((item, i) => question(item.questionId, { topic: `Konu${i % 10}` }));
    expect(() => buildStudentPerformanceSnapshot(items, questionsMap(...questions), NOW)).not.toThrow();
  });
});

function card(overrides: Partial<StudentPerformanceCard> = {}): StudentPerformanceCard {
  const snapshot = buildStudentPerformanceSnapshot([], new Map(), NOW);
  return {
    studentUid: "u1",
    displayName: "Ahmet",
    photoURL: null,
    snapshot,
    tier: "normal",
    ...overrides,
  };
}

describe("classifyStudentSupportTier", () => {
  it("is 'normal' for a student with no attempts yet — never flagged as struggling on no evidence", () => {
    const snapshot = buildStudentPerformanceSnapshot([], new Map(), NOW);
    expect(classifyStudentSupportTier(snapshot)).toBe("normal");
  });

  it("is 'needs_support' below 50% success rate", () => {
    const items = [studyItem({ questionId: "a", attemptCount: 10, successfulReviews: 4 })];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(classifyStudentSupportTier(snapshot)).toBe("needs_support");
  });

  it("is 'needs_support' with 3+ weak topics even at a decent success rate", () => {
    const items = [
      studyItem({ questionId: "a", lastOutcome: "struggled", attemptCount: 10, successfulReviews: 8 }),
      studyItem({ questionId: "b", lastOutcome: "struggled", attemptCount: 10, successfulReviews: 8 }),
      studyItem({ questionId: "c", lastOutcome: "struggled", attemptCount: 10, successfulReviews: 8 }),
    ];
    const questions = [
      question("a", { topic: "Kesirler" }),
      question("b", { topic: "Denklemler" }),
      question("c", { topic: "Olasılık" }),
    ];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(...questions), NOW);
    expect(classifyStudentSupportTier(snapshot)).toBe("needs_support");
  });

  it("is 'strong' at 80%+ success with zero weak topics", () => {
    const items = [studyItem({ questionId: "a", attemptCount: 10, successfulReviews: 9 })];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(classifyStudentSupportTier(snapshot)).toBe("strong");
  });
});

describe("sortStudentPerformanceCards", () => {
  it("orders needs_support before declining before normal before strong", () => {
    const cards = [
      card({ studentUid: "strong", displayName: "Strong", tier: "strong" }),
      card({ studentUid: "normal", displayName: "Normal", tier: "normal" }),
      card({ studentUid: "declining", displayName: "Declining", tier: "declining" }),
      card({ studentUid: "support", displayName: "Support", tier: "needs_support" }),
    ];
    const sorted = sortStudentPerformanceCards(cards);
    expect(sorted.map((c) => c.studentUid)).toEqual(["support", "declining", "normal", "strong"]);
  });

  it("breaks a tier tie by LOWEST success rate first", () => {
    const items10 = [studyItem({ questionId: "a", attemptCount: 10, successfulReviews: 1 })];
    const items30 = [studyItem({ questionId: "b", attemptCount: 10, successfulReviews: 3 })];
    const lowSnap = buildStudentPerformanceSnapshot(items10, questionsMap(question("a")), NOW);
    const higherSnap = buildStudentPerformanceSnapshot(items30, questionsMap(question("b")), NOW);
    const cards = [
      card({ studentUid: "higher", displayName: "B", snapshot: higherSnap, tier: "needs_support" }),
      card({ studentUid: "lower", displayName: "A", snapshot: lowSnap, tier: "needs_support" }),
    ];
    const sorted = sortStudentPerformanceCards(cards);
    expect(sorted.map((c) => c.studentUid)).toEqual(["lower", "higher"]);
  });

  it("breaks a full tie by displayName, deterministically", () => {
    const cards = [card({ studentUid: "b", displayName: "Zeynep" }), card({ studentUid: "a", displayName: "Ayşe" })];
    const sorted = sortStudentPerformanceCards(cards);
    expect(sorted.map((c) => c.displayName)).toEqual(["Ayşe", "Zeynep"]);
  });

  it("does not mutate the input array", () => {
    const cards = [card({ studentUid: "b", displayName: "B" }), card({ studentUid: "a", displayName: "A" })];
    const copy = [...cards];
    sortStudentPerformanceCards(cards);
    expect(cards).toEqual(copy);
  });
});

describe("buildClassPerformanceSummary", () => {
  it("handles an empty class", () => {
    const summary = buildClassPerformanceSummary([]);
    expect(summary).toEqual({
      studentCount: 0,
      averageSuccessRatePercent: null,
      totalDueCount: 0,
      needsSupportCount: 0,
    });
  });

  it("handles a single student", () => {
    const items = [studyItem({ questionId: "a", attemptCount: 10, successfulReviews: 7 })];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    const summary = buildClassPerformanceSummary([card({ snapshot })]);
    expect(summary.studentCount).toBe(1);
    expect(summary.averageSuccessRatePercent).toBe(70);
  });

  it("averages only students who have real attempts — never a fake 0% for brand-new students", () => {
    const noDataCard = card({ studentUid: "new", snapshot: buildStudentPerformanceSnapshot([], new Map(), NOW) });
    const items = [studyItem({ questionId: "a", attemptCount: 10, successfulReviews: 8 })];
    const withDataCard = card({
      studentUid: "active",
      snapshot: buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW),
    });
    const summary = buildClassPerformanceSummary([noDataCard, withDataCard]);
    expect(summary.averageSuccessRatePercent).toBe(80); // only the active student counts
  });

  it("counts needs_support students correctly across a 4-student class", () => {
    const cards = [
      card({ studentUid: "1", tier: "needs_support" }),
      card({ studentUid: "2", tier: "needs_support" }),
      card({ studentUid: "3", tier: "normal" }),
      card({ studentUid: "4", tier: "strong" }),
    ];
    const summary = buildClassPerformanceSummary(cards);
    expect(summary.studentCount).toBe(4);
    expect(summary.needsSupportCount).toBe(2);
  });

  it("scales to a 30-student class without throwing", () => {
    const cards = Array.from({ length: 30 }, (_, i) => card({ studentUid: `u${i}`, displayName: `S${i}` }));
    expect(() => buildClassPerformanceSummary(cards)).not.toThrow();
    expect(buildClassPerformanceSummary(cards).studentCount).toBe(30);
  });
});
