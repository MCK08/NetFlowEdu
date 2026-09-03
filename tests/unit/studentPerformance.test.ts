import {
  bucketItemsByDay,
  buildClassPerformanceSummary,
  buildStudentPerformanceSnapshot,
  classifyStudentSupportTier,
  RECENT_OUTCOMES_LIMIT,
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
    // Phase 41 — a post-counter item: the cumulative counters account for
    // every attempt, which is what makes its history trustworthy.
    solvedCount: 1,
    struggledCount: 0,
    againCount: 0,
    ...overrides,
  };
}

// Phase 41 — an item whose REAL outcome history is (solved, struggled,
// again). attemptCount is derived from the counters so the fixture is
// internally consistent: only counters that account for every attempt are
// trusted (see outcomeCounters.ts).
//
// These tests previously expressed "N of M correct" as
// `successfulReviews: N, attemptCount: M`, which is what the production
// defect did too — successfulReviews is the SCHEDULER's streak, decremented
// by "struggled" and reset by "again", so it can never carry that meaning.
// The intent of each test is unchanged; only the mechanism is now the real
// one.
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

// A document written BEFORE the counters existed: real attempts, no
// cumulative history at all.
function legacyItem(overrides: Partial<StudyItem> = {}): StudyItem {
  return studyItem({
    solvedCount: null,
    struggledCount: null,
    againCount: null,
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
    hints: [],
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
  it("computes successRatePercent from the cumulative outcome counters across items", () => {
    const items = [
      withOutcomes(3, 1, 0, { questionId: "a" }),
      withOutcomes(1, 1, 0, { questionId: "b" }),
    ];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a"), question("b")), NOW);
    // 4 solved out of 6 recorded outcomes total
    expect(snapshot.successRatePercent).toBe(Math.round((4 / 6) * 100));
  });

  // Phase 41 — the exact production defect, locked in as a regression test.
  // successfulReviews is reset to 0 by "again", so the old computation
  // reported this student as 0% — identical to someone who never got a
  // single question right.
  it("reports 75% for solved,solved,solved,again — the case the old successfulReviews math showed as 0%", () => {
    const items = [
      withOutcomes(3, 0, 1, { questionId: "a", lastOutcome: "again", successfulReviews: 0 }),
    ];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(snapshot.successRatePercent).toBe(75);
  });

  it("still reports 0% for a student who genuinely never solved anything", () => {
    const items = [
      withOutcomes(0, 4, 0, { questionId: "a", lastOutcome: "struggled", successfulReviews: 0 }),
    ];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(snapshot.successRatePercent).toBe(0);
  });

  it("no longer collapses those two students onto the same number", () => {
    const mostlyRight = buildStudentPerformanceSnapshot(
      [withOutcomes(3, 0, 1, { questionId: "a", successfulReviews: 0 })],
      questionsMap(question("a")),
      NOW,
    );
    const neverRight = buildStudentPerformanceSnapshot(
      [withOutcomes(0, 4, 0, { questionId: "a", successfulReviews: 0 })],
      questionsMap(question("a")),
      NOW,
    );
    expect(mostlyRight.successRatePercent).not.toBe(neverRight.successRatePercent);
  });

  it("reports null — never a fabricated 0% — for an item that predates the counters", () => {
    const items = [legacyItem({ questionId: "a", attemptCount: 10, successfulReviews: 4 })];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(snapshot.successRatePercent).toBeNull();
  });

  it("reports null for a legacy item that has since recorded a few counted outcomes — partial history is not a rate", () => {
    // 20 attempts total, only the last 2 counted: reporting 50% here would
    // describe 2 outcomes as if they described all 20.
    const items = [
      studyItem({
        questionId: "a",
        attemptCount: 20,
        solvedCount: 1,
        struggledCount: 1,
        againCount: 0,
      }),
    ];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(snapshot.successRatePercent).toBeNull();
  });

  it("ignores untrustworthy items but still reports a rate from the trustworthy ones", () => {
    const items = [
      legacyItem({ questionId: "a", attemptCount: 99, successfulReviews: 0 }),
      withOutcomes(3, 1, 0, { questionId: "b" }),
    ];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a"), question("b")), NOW);
    expect(snapshot.successRatePercent).toBe(75);
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

describe("buildStudentPerformanceSnapshot — recentOutcomes", () => {
  it("is empty when nothing has ever been reviewed", () => {
    const items = [studyItem({ questionId: "a", lastReviewedAt: 0 })];
    const snapshot = snapshotFor(items, [question("a")]);
    expect(snapshot.recentOutcomes).toEqual([]);
  });

  it("orders most-recently-reviewed first", () => {
    const items = [
      studyItem({ questionId: "old", lastReviewedAt: NOW - 2 * DAY_MS, lastOutcome: "solved" }),
      studyItem({ questionId: "new", lastReviewedAt: NOW, lastOutcome: "struggled" }),
    ];
    const snapshot = snapshotFor(items, [question("old"), question("new")]);
    expect(snapshot.recentOutcomes).toEqual(["struggled", "solved"]);
  });

  it("caps at RECENT_OUTCOMES_LIMIT even with many more reviewed items", () => {
    const items = Array.from({ length: RECENT_OUTCOMES_LIMIT + 5 }, (_, i) =>
      studyItem({ questionId: `q${i}`, lastReviewedAt: NOW - i * 1000, lastOutcome: "solved" }),
    );
    const questions = items.map((item) => question(item.questionId));
    const snapshot = snapshotFor(items, questions);
    expect(snapshot.recentOutcomes).toHaveLength(RECENT_OUTCOMES_LIMIT);
  });

  it("excludes never-reviewed items even if other items exist", () => {
    const items = [
      studyItem({ questionId: "reviewed", lastReviewedAt: NOW, lastOutcome: "solved" }),
      studyItem({ questionId: "never", lastReviewedAt: 0, lastOutcome: "solved" }),
    ];
    const snapshot = snapshotFor(items, [question("reviewed"), question("never")]);
    expect(snapshot.recentOutcomes).toEqual(["solved"]);
  });
});

describe("buildStudentPerformanceSnapshot — dayBuckets", () => {
  it("matches what bucketItemsByDay computes directly from the same items", () => {
    const items = [
      studyItem({ questionId: "a", lastReviewedAt: NOW, lastOutcome: "solved" }),
      studyItem({ questionId: "b", lastReviewedAt: NOW, lastOutcome: "struggled" }),
    ];
    const snapshot = snapshotFor(items, [question("a"), question("b")]);
    expect(snapshot.dayBuckets).toEqual(bucketItemsByDay(items, NOW));
  });

  it("daysActiveRecently equals dayBuckets.length", () => {
    const items = [
      studyItem({ questionId: "a", lastReviewedAt: NOW }),
      studyItem({ questionId: "b", lastReviewedAt: NOW - 3 * DAY_MS }),
    ];
    const snapshot = snapshotFor(items, [question("a"), question("b")]);
    expect(snapshot.daysActiveRecently).toBe(snapshot.dayBuckets.length);
  });
});

// PHASE 32 REGRESSION — every test below fails against the pre-fix
// implementation, where bucketItemsByDay had no time window at all.
describe("buildStudentPerformanceSnapshot — dayBuckets are windowed to the last 14 days", () => {
  it("EXCLUDES activity older than the 14-day window the UI label promises", () => {
    const items = [
      studyItem({ questionId: "old1", lastReviewedAt: NOW - 180 * DAY_MS }),
      studyItem({ questionId: "old2", lastReviewedAt: NOW - 179 * DAY_MS }),
      studyItem({ questionId: "old3", lastReviewedAt: NOW - 178 * DAY_MS }),
    ];
    const snapshot = snapshotFor(items, [question("old1"), question("old2"), question("old3")]);
    // Pre-fix this reported 3 "aktif gün" under the label "son 14 gün içinde"
    // for a student who had not touched the class in six months.
    expect(snapshot.daysActiveRecently).toBe(0);
    expect(snapshot.dayBuckets).toEqual([]);
    // The student's real totals are NOT erased — only the recency window is
    // corrected. The teacher still sees that work happened, and when.
    expect(snapshot.totalCount).toBe(3);
    expect(snapshot.lastStudiedAt).toBe(NOW - 178 * DAY_MS);
  });

  it("KEEPS activity inside the window", () => {
    const items = [
      studyItem({ questionId: "recent", lastReviewedAt: NOW - 2 * DAY_MS }),
      studyItem({ questionId: "old", lastReviewedAt: NOW - 60 * DAY_MS }),
    ];
    const snapshot = snapshotFor(items, [question("recent"), question("old")]);
    expect(snapshot.daysActiveRecently).toBe(1);
    expect(snapshot.totalCount).toBe(2);
  });

  it("never reports more active days than the window itself contains", () => {
    const items = Array.from({ length: 40 }, (_, i) =>
      studyItem({ questionId: `q${i}`, lastReviewedAt: NOW - i * DAY_MS }),
    );
    const snapshot = snapshotFor(
      items,
      items.map((item) => question(item.questionId)),
    );
    expect(snapshot.daysActiveRecently).toBeLessThanOrEqual(14);
  });
});

describe("buildStudentPerformanceSnapshot — thisWeek (Phase 32)", () => {
  // 2026-08-14 is a Friday; that week's Monday is 2026-08-10.
  const FRIDAY = new Date(2026, 7, 14, 10, 0, 0).getTime();
  const MONDAY = new Date(2026, 7, 10, 9, 0, 0).getTime();
  const LAST_THURSDAY = new Date(2026, 7, 6, 9, 0, 0).getTime();

  it("reports a student who studied EARLIER THIS WEEK as having studied this week", () => {
    const items = [studyItem({ questionId: "a", lastReviewedAt: MONDAY, lastOutcome: "solved" })];
    const snapshot = snapshotFor(items, [question("a")], FRIDAY);
    // The core reported bug: on Friday, Monday's work must still count.
    expect(snapshot.thisWeek.studiedThisWeek).toBe(true);
    expect(snapshot.thisWeek.reviewedThisWeek).toBe(1);
    expect(snapshot.thisWeek.activeDaysThisWeek).toBe(1);
    // ...even though "today" is correctly zero.
    expect(snapshot.today.reviewedToday).toBe(0);
  });

  it("counts solved and struggled separately from real outcomes", () => {
    const items = [
      studyItem({ questionId: "a", lastReviewedAt: MONDAY, lastOutcome: "solved" }),
      studyItem({ questionId: "b", lastReviewedAt: MONDAY, lastOutcome: "struggled" }),
      studyItem({ questionId: "c", lastReviewedAt: FRIDAY - 3600_000, lastOutcome: "again" }),
    ];
    const snapshot = snapshotFor(items, [question("a"), question("b"), question("c")], FRIDAY);
    expect(snapshot.thisWeek.reviewedThisWeek).toBe(3);
    expect(snapshot.thisWeek.solvedThisWeek).toBe(1);
    expect(snapshot.thisWeek.struggledThisWeek).toBe(1);
    expect(snapshot.thisWeek.activeDaysThisWeek).toBe(2);
  });

  it("EXCLUDES last week's activity", () => {
    const items = [studyItem({ questionId: "a", lastReviewedAt: LAST_THURSDAY })];
    const snapshot = snapshotFor(items, [question("a")], FRIDAY);
    expect(snapshot.thisWeek.studiedThisWeek).toBe(false);
    expect(snapshot.thisWeek.reviewedThisWeek).toBe(0);
  });

  it("is all-zero for a student with no activity at all, never a fake default", () => {
    const snapshot = snapshotFor([], [], FRIDAY);
    expect(snapshot.thisWeek).toEqual({
      reviewedThisWeek: 0,
      solvedThisWeek: 0,
      struggledThisWeek: 0,
      activeDaysThisWeek: 0,
      studiedThisWeek: false,
    });
  });

  it("excludes never-reviewed items (lastReviewedAt 0)", () => {
    const items = [studyItem({ questionId: "a", lastReviewedAt: 0 })];
    const snapshot = snapshotFor(items, [question("a")], FRIDAY);
    expect(snapshot.thisWeek.studiedThisWeek).toBe(false);
  });

  it("counts Monday 00:00 exactly as this week (inclusive boundary)", () => {
    const mondayMidnight = new Date(2026, 7, 10, 0, 0, 0, 0).getTime();
    const items = [studyItem({ questionId: "a", lastReviewedAt: mondayMidnight })];
    expect(snapshotFor(items, [question("a")], FRIDAY).thisWeek.studiedThisWeek).toBe(true);
  });

  it("counts the instant before Monday 00:00 as LAST week (exclusive boundary)", () => {
    const justBefore = new Date(2026, 7, 10, 0, 0, 0, 0).getTime() - 1;
    const items = [studyItem({ questionId: "a", lastReviewedAt: justBefore })];
    expect(snapshotFor(items, [question("a")], FRIDAY).thisWeek.studiedThisWeek).toBe(false);
  });

  it("still reports this week correctly when the teacher looks on a SUNDAY", () => {
    const sunday = new Date(2026, 7, 16, 20, 0, 0).getTime();
    const items = [studyItem({ questionId: "a", lastReviewedAt: MONDAY })];
    expect(snapshotFor(items, [question("a")], sunday).thisWeek.studiedThisWeek).toBe(true);
  });

  it("is deterministic for the same input", () => {
    const items = [studyItem({ questionId: "a", lastReviewedAt: MONDAY })];
    const a = snapshotFor(items, [question("a")], FRIDAY);
    const b = snapshotFor(items, [question("a")], FRIDAY);
    expect(a.thisWeek).toEqual(b.thisWeek);
  });

  it("does not depend on question metadata resolving (activity is independent of topics)", () => {
    const items = [studyItem({ questionId: "a", lastReviewedAt: MONDAY, lastOutcome: "struggled" })];
    // Metadata deliberately unresolved — a legacy/deleted question.
    const snapshot = buildStudentPerformanceSnapshot(items, new Map([["a", null]]), FRIDAY);
    expect(snapshot.thisWeek.studiedThisWeek).toBe(true);
    expect(snapshot.thisWeek.struggledThisWeek).toBe(1);
    expect(snapshot.allTopics).toEqual([]);
  });
});

function snapshotFor(items: StudyItem[], questions: Question[], now = NOW) {
  return buildStudentPerformanceSnapshot(items, questionsMap(...questions), now);
}

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
    const items = [withOutcomes(4, 6, 0, { questionId: "a" })];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(classifyStudentSupportTier(snapshot)).toBe("needs_support");
  });

  it("is 'needs_support' with 3+ weak topics even at a decent success rate", () => {
    const items = [
      withOutcomes(8, 2, 0, { questionId: "a", lastOutcome: "struggled" }),
      withOutcomes(8, 2, 0, { questionId: "b", lastOutcome: "struggled" }),
      withOutcomes(8, 2, 0, { questionId: "c", lastOutcome: "struggled" }),
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
    const items = [withOutcomes(9, 1, 0, { questionId: "a" })];
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
    const items10 = [withOutcomes(1, 9, 0, { questionId: "a" })];
    const items30 = [withOutcomes(3, 7, 0, { questionId: "b" })];
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
    const items = [withOutcomes(7, 3, 0, { questionId: "a" })];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    const summary = buildClassPerformanceSummary([card({ snapshot })]);
    expect(summary.studentCount).toBe(1);
    expect(summary.averageSuccessRatePercent).toBe(70);
  });

  it("averages only students who have real attempts — never a fake 0% for brand-new students", () => {
    const noDataCard = card({ studentUid: "new", snapshot: buildStudentPerformanceSnapshot([], new Map(), NOW) });
    const items = [withOutcomes(8, 2, 0, { questionId: "a" })];
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

// Phase 42 — struggle EVIDENCE carried onto the snapshot: how many
// questions show a repeated, unresolved struggle, and the worst single one.
// Both are pure derivations of items already fetched; no new read.
describe("buildStudentPerformanceSnapshot — persistent struggle evidence", () => {
  it("counts one question failed repeatedly as a persistent struggle", () => {
    const items = [withOutcomes(0, 8, 0, { questionId: "a", lastOutcome: "struggled", successfulReviews: 0 })];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(snapshot.persistentStruggleCount).toBe(1);
    expect(snapshot.maxItemStruggleEvents).toBe(8);
  });

  // The distinction the dashboard could not previously draw.
  it("separates four questions struggled once from one question struggled four times", () => {
    const spread = ["a", "b", "c", "d"].map((id) =>
      withOutcomes(3, 1, 0, { questionId: id, lastOutcome: "struggled", successfulReviews: 0 }),
    );
    const concentrated = [
      withOutcomes(0, 4, 0, { questionId: "a", lastOutcome: "struggled", successfulReviews: 0 }),
    ];
    const spreadSnap = buildStudentPerformanceSnapshot(
      spread,
      questionsMap(...spread.map((i) => question(i.questionId))),
      NOW,
    );
    const concentratedSnap = buildStudentPerformanceSnapshot(
      concentrated,
      questionsMap(question("a")),
      NOW,
    );
    expect(spreadSnap.persistentStruggleCount).toBe(0);
    expect(spreadSnap.maxItemStruggleEvents).toBe(1);
    expect(concentratedSnap.persistentStruggleCount).toBe(1);
    expect(concentratedSnap.maxItemStruggleEvents).toBe(4);
  });

  it("does not count a question the student has since recovered on", () => {
    const items = [withOutcomes(3, 3, 0, { questionId: "a", lastOutcome: "solved", successfulReviews: 2 })];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(snapshot.persistentStruggleCount).toBe(0);
    // The events still happened, and the teacher can still see them.
    expect(snapshot.maxItemStruggleEvents).toBe(3);
  });

  it("reports null — never 0 — for a student whose items all predate the counters", () => {
    const items = [legacyItem({ questionId: "a", attemptCount: 20, lastOutcome: "struggled" })];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(snapshot.persistentStruggleCount).toBe(0);
    expect(snapshot.maxItemStruggleEvents).toBeNull();
  });

  it("distinguishes 'no struggles recorded' (0) from 'no history' (null)", () => {
    const clean = buildStudentPerformanceSnapshot(
      [withOutcomes(4, 0, 0, { questionId: "a" })],
      questionsMap(question("a")),
      NOW,
    );
    expect(clean.maxItemStruggleEvents).toBe(0);
    expect(clean.persistentStruggleCount).toBe(0);
  });

  it("carries the real struggled-event count onto the weak topic itself", () => {
    const items = [withOutcomes(0, 8, 0, { questionId: "a", lastOutcome: "struggled", successfulReviews: 0 })];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(snapshot.weakTopics[0]?.struggledCount).toBe(1);
    expect(snapshot.weakTopics[0]?.struggledAttemptCount).toBe(8);
  });

  it("is deterministic and does not mutate the items it is given", () => {
    const items = [
      withOutcomes(0, 5, 0, { questionId: "a", lastOutcome: "struggled", successfulReviews: 0 }),
      withOutcomes(4, 0, 0, { questionId: "b" }),
    ];
    const before = JSON.stringify(items);
    const first = buildStudentPerformanceSnapshot(items, questionsMap(question("a"), question("b")), NOW);
    const second = buildStudentPerformanceSnapshot(items, questionsMap(question("a"), question("b")), NOW);
    expect(first.persistentStruggleCount).toBe(second.persistentStruggleCount);
    expect(first.maxItemStruggleEvents).toBe(second.maxItemStruggleEvents);
    expect(JSON.stringify(items)).toBe(before);
  });
});

// Phase 43 — the gate for a student-level intervention, exercised through
// the REAL snapshot rather than a hand-built list. persistentStruggleTopics
// must be empty for every case where offering an intervention would be
// wrong, and must carry honest prefill values when it is not.
describe("buildStudentPerformanceSnapshot — intervention topics", () => {
  it("offers a topic for a persistent struggle, with the real grade and event count", () => {
    const items = [withOutcomes(0, 8, 0, { questionId: "a", lastOutcome: "struggled", successfulReviews: 0 })];
    const snapshot = buildStudentPerformanceSnapshot(
      items,
      questionsMap(question("a", { subject: "Matematik", topic: "Denklemler", gradeLevel: "12" })),
      NOW,
    );
    expect(snapshot.persistentStruggleTopics).toEqual([
      { subject: "Matematik", topic: "Denklemler", gradeLevel: "12", struggledAttemptCount: 8 },
    ]);
  });

  it("offers NOTHING for a one-off struggle", () => {
    const items = [withOutcomes(3, 1, 0, { questionId: "a", lastOutcome: "struggled", successfulReviews: 0 })];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(snapshot.persistentStruggleTopics).toEqual([]);
  });

  it("offers NOTHING for a student who has recovered", () => {
    const items = [withOutcomes(3, 3, 0, { questionId: "a", lastOutcome: "solved", successfulReviews: 2 })];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(snapshot.persistentStruggleTopics).toEqual([]);
  });

  it("offers NOTHING for a student with no struggles at all", () => {
    const items = [withOutcomes(5, 0, 0, { questionId: "a" })];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(snapshot.persistentStruggleTopics).toEqual([]);
  });

  it("offers NOTHING for a legacy item — no counters, no intervention", () => {
    const items = [legacyItem({ questionId: "a", attemptCount: 20, lastOutcome: "struggled" })];
    const snapshot = buildStudentPerformanceSnapshot(items, questionsMap(question("a")), NOW);
    expect(snapshot.persistentStruggleTopics).toEqual([]);
  });

  // A mixed-grade topic must not resolve to a guessed grade.
  it("omits the grade when the topic's questions disagree about it", () => {
    const items = [
      withOutcomes(0, 4, 0, { questionId: "a", lastOutcome: "struggled", successfulReviews: 0 }),
      withOutcomes(0, 3, 0, { questionId: "b", lastOutcome: "struggled", successfulReviews: 0 }),
    ];
    const snapshot = buildStudentPerformanceSnapshot(
      items,
      questionsMap(
        question("a", { topic: "Denklemler", gradeLevel: "9" }),
        question("b", { topic: "Denklemler", gradeLevel: "12" }),
      ),
      NOW,
    );
    expect(snapshot.persistentStruggleTopics).toHaveLength(1);
    expect(snapshot.persistentStruggleTopics[0]?.gradeLevel).toBeNull();
    // The struggle itself is still real and still summed.
    expect(snapshot.persistentStruggleTopics[0]?.struggledAttemptCount).toBe(7);
  });

  // A persistently-struggled question whose metadata never resolved still
  // counts as a struggle, but cannot seed a composer.
  it("counts an unresolvable question but never turns it into an intervention", () => {
    const items = [withOutcomes(0, 5, 0, { questionId: "ghost", lastOutcome: "struggled", successfulReviews: 0 })];
    const snapshot = buildStudentPerformanceSnapshot(items, new Map([["ghost", null]]), NOW);
    expect(snapshot.persistentStruggleCount).toBe(1);
    expect(snapshot.persistentStruggleTopics).toEqual([]);
  });

  it("groups several persistent questions in one topic into a single intervention", () => {
    const items = [
      withOutcomes(0, 4, 0, { questionId: "a", lastOutcome: "struggled", successfulReviews: 0 }),
      withOutcomes(0, 2, 0, { questionId: "b", lastOutcome: "struggled", successfulReviews: 0 }),
    ];
    const snapshot = buildStudentPerformanceSnapshot(
      items,
      questionsMap(
        question("a", { topic: "Denklemler", gradeLevel: "12" }),
        question("b", { topic: "Denklemler", gradeLevel: "12" }),
      ),
      NOW,
    );
    expect(snapshot.persistentStruggleTopics).toHaveLength(1);
    expect(snapshot.persistentStruggleTopics[0]?.struggledAttemptCount).toBe(6);
  });

  it("is deterministic", () => {
    const items = [withOutcomes(0, 6, 0, { questionId: "a", lastOutcome: "struggled", successfulReviews: 0 })];
    const map = questionsMap(question("a"));
    expect(buildStudentPerformanceSnapshot(items, map, NOW).persistentStruggleTopics).toEqual(
      buildStudentPerformanceSnapshot(items, map, NOW).persistentStruggleTopics,
    );
  });
});
