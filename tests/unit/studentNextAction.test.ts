import { Assignment, AssignmentSubmission } from "../../src/features/assignments/domain/assignmentTypes";
import { StudentAssignmentCard } from "../../src/features/assignments/hooks/useStudentAssignments";
import { resolveStudentAssignmentStatus } from "../../src/features/assignments/services/assignmentProgress";
import { buildAdaptivePracticePlan } from "../../src/features/study/services/dailyPracticePlan";
import {
  buildLearningInsights,
  LearningInsightItem,
} from "../../src/features/study/services/learningInsights";
import {
  resolveStudentNextAction,
  StudentNextAction,
} from "../../src/features/study/services/studentNextAction";
import { nextActionCopy } from "../../src/features/study/services/studyPresentation";

// Phase 39 — the Learning Hub's single answer to "Şimdi en mantıklı çalışma
// ne?". Every case below feeds the engine the SAME shapes the real screen
// feeds it: the plan comes from buildAdaptivePracticePlan and the weak
// topics from buildLearningInsights, never from a hand-written literal that
// could describe a state the app can't actually produce.

const NOW = new Date(2026, 7, 17, 12, 0, 0, 0).getTime();
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function endOfLocalDayFrom(now: number, offsetDays: number): number {
  const date = new Date(now);
  date.setDate(date.getDate() + offsetDays);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

function item(overrides: Partial<LearningInsightItem> = {}): LearningInsightItem {
  return {
    questionId: "q1",
    status: "review",
    lastOutcome: "solved",
    nextReviewAt: NOW + 3 * DAY_MS,
    subject: "Matematik",
    topic: "Türev",
    successfulReviews: 1,
    lastReviewedAt: NOW - DAY_MS,
    ...overrides,
  };
}

function assignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: "a1",
    classId: "c1",
    organizationId: "org1",
    teacherId: "t1",
    title: "Türev Tekrarı",
    description: null,
    subject: "Matematik",
    topic: "Türev",
    gradeLevel: "12",
    targetStudentIds: ["s1"],
    questionIds: ["aq1", "aq2", "aq3"],
    targetCount: 3,
    dueAt: null,
    status: "published",
    createdAt: NOW - 7 * DAY_MS,
    updatedAt: NOW - 7 * DAY_MS,
    ...overrides,
  };
}

function submission(completedCount: number): AssignmentSubmission {
  return {
    studentId: "s1",
    completedQuestionIds: ["aq1", "aq2", "aq3"].slice(0, completedCount),
    completedCount,
    startedAt: NOW - DAY_MS,
    lastCompletedAt: NOW - DAY_MS,
    completedAt: null,
    questionOutcomes: {},
  };
}

function card(
  overrides: Partial<Assignment> = {},
  completedCount = 0,
  now = NOW,
): StudentAssignmentCard {
  const a = assignment(overrides);
  const s = completedCount > 0 ? submission(completedCount) : null;
  return {
    assignment: a,
    submission: s,
    status: resolveStudentAssignmentStatus({
      submission: s,
      targetCount: a.targetCount,
      dueAt: a.dueAt,
      now,
    }),
  };
}

interface ResolveOptions {
  reviewedToday?: number;
  dailyGoal?: number;
  now?: number;
}

// Builds the Hub's real in-memory state and runs the engine on it — the
// exact composition StudyScreen performs.
function resolve(
  items: readonly LearningInsightItem[],
  assignmentCards: readonly StudentAssignmentCard[] = [],
  options: ResolveOptions = {},
): StudentNextAction {
  const now = options.now ?? NOW;
  const reviewedToday = options.reviewedToday ?? 0;
  const dailyGoal = options.dailyGoal ?? 10;

  const insights = buildLearningInsights({ items, now, reviewedToday, dailyGoal });
  const plan = buildAdaptivePracticePlan({
    items,
    weakTopics: insights.weakTopics,
    topicInsights: insights.allTopics,
    now,
    reviewedToday,
    dailyGoal,
  });

  return resolveStudentNextAction({
    items,
    plan,
    weakTopics: insights.weakTopics,
    assignmentCards,
    now,
  });
}

const dueItem = item({ questionId: "due1", nextReviewAt: NOW - HOUR_MS });
const struggledItem = item({
  questionId: "hard1",
  lastOutcome: "struggled",
  subject: "Matematik",
  topic: "Limit",
});
const calmItem = item({ questionId: "calm1", lastOutcome: "solved", topic: "İntegral" });

describe("resolveStudentNextAction — nothing to do", () => {
  it("says so plainly for a student with no study data and no assignments", () => {
    const action = resolve([], []);
    expect(action.kind).toBe("no_action");
    expect(action).toMatchObject({ target: { kind: "none" }, reason: "no_study_data" });
  });

  it("distinguishes 'goal complete' from 'no data' — a finished day is not an empty one", () => {
    const action = resolve([calmItem], [], { reviewedToday: 10, dailyGoal: 10 });
    expect(action).toMatchObject({ kind: "no_action", reason: "goal_complete" });
  });

  it("distinguishes 'nothing pending' — real history, but no due work and nothing left to practice", () => {
    const mastered = item({ questionId: "m1", status: "mastered", nextReviewAt: NOW + 9 * DAY_MS });
    const action = resolve([mastered], [], { reviewedToday: 0, dailyGoal: 10 });
    expect(action).toMatchObject({ kind: "no_action", reason: "nothing_pending" });
  });

  it("never offers a button when there is nothing to open", () => {
    expect(nextActionCopy(resolve([], []), NOW).cta).toBeNull();
  });
});

describe("resolveStudentNextAction — due reviews", () => {
  it("recommends the review session when anything is due, and counts it live", () => {
    const action = resolve([dueItem, item({ questionId: "due2", nextReviewAt: NOW - DAY_MS }), calmItem]);
    expect(action).toMatchObject({
      kind: "due_review",
      target: { kind: "review_session" },
      dueCount: 2,
    });
  });

  it("counts due-ness against the passed clock, not a stale snapshot", () => {
    // The SAME item is not due an hour before its nextReviewAt and is due
    // an hour after — nothing about the data changed, only the clock.
    const soon = item({ questionId: "soon", nextReviewAt: NOW });
    expect(resolve([soon, calmItem], [], { now: NOW - HOUR_MS }).kind).not.toBe("due_review");
    expect(resolve([soon, calmItem], [], { now: NOW + HOUR_MS }).kind).toBe("due_review");
  });

  it("treats the exact boundary as due — same inclusive rule the plan's tier 1 uses", () => {
    expect(resolve([item({ questionId: "edge", nextReviewAt: NOW })]).kind).toBe("due_review");
  });

  it("beats an assignment that is not imminent — the review is the product's core loop", () => {
    const action = resolve([dueItem], [card({ id: "later", dueAt: endOfLocalDayFrom(NOW, 9) })]);
    expect(action.kind).toBe("due_review");
  });

  it("beats a past-due assignment too — a missed deadline does not become more urgent than the loop", () => {
    const action = resolve([dueItem], [card({ id: "late", dueAt: endOfLocalDayFrom(NOW, -4) })]);
    expect(action.kind).toBe("due_review");
  });
});

describe("resolveStudentNextAction — assignments", () => {
  // The one case where an assignment outranks a due review, and the reason
  // it does: a due review stays due tomorrow, a deadline does not.
  it("an imminent deadline outranks due reviews", () => {
    const action = resolve([dueItem], [card({ id: "today", dueAt: endOfLocalDayFrom(NOW, 0) })]);
    expect(action).toMatchObject({
      kind: "continue_assignment",
      target: { kind: "assignment", assignmentId: "today" },
    });
  });

  it("tomorrow still counts as imminent; the day after does not", () => {
    expect(resolve([dueItem], [card({ id: "t", dueAt: endOfLocalDayFrom(NOW, 1) })]).kind).toBe(
      "continue_assignment",
    );
    expect(resolve([dueItem], [card({ id: "t", dueAt: endOfLocalDayFrom(NOW, 2) })]).kind).toBe(
      "due_review",
    );
  });

  it("a non-urgent assignment still outranks self-directed practice", () => {
    const action = resolve([struggledItem], [card({ id: "open", dueAt: null })]);
    expect(action).toMatchObject({
      kind: "continue_assignment",
      target: { kind: "assignment", assignmentId: "open" },
    });
  });

  it("reports the student's real remaining work, never an estimate", () => {
    const action = resolve([], [card({ id: "a1" }, 1)]);
    expect(action).toMatchObject({ kind: "continue_assignment", remainingCount: 2, isStarted: true });
  });

  it("excludes completed assignments entirely", () => {
    const action = resolve([struggledItem], [card({ id: "done", dueAt: endOfLocalDayFrom(NOW, 0) }, 3)]);
    expect(action.kind).not.toBe("continue_assignment");
  });

  it("marks a past-due assignment as such rather than hiding it", () => {
    const action = resolve([], [card({ id: "late", dueAt: endOfLocalDayFrom(NOW, -2) })]);
    expect(action).toMatchObject({ kind: "continue_assignment", isPastDue: true });
  });

  it("carries the real stored deadline through, so the copy never invents one", () => {
    const dueAt = endOfLocalDayFrom(NOW, 0);
    const action = resolve([], [card({ id: "today", dueAt })]);
    expect(action).toMatchObject({ kind: "continue_assignment", dueAt });
    expect(nextActionCopy(action, NOW).detail).toContain("Son tarih: Bugün");
  });
});

describe("resolveStudentNextAction — practice", () => {
  it("names the topic the student actually struggled in", () => {
    const action = resolve([struggledItem, calmItem]);
    expect(action).toMatchObject({
      kind: "struggled_topic",
      target: { kind: "adaptive_session" },
      subject: "Matematik",
      topic: "Limit",
      struggledCount: 1,
    });
  });

  it("falls back to a nameless reinforcement round rather than inventing a topic", () => {
    // A legacy question whose metadata cannot be resolved carries "" for
    // both subject and topic (learningInsights.ts's own convention), so it
    // is real reinforcement work with nothing honest to call it.
    const legacy = item({ questionId: "legacy", lastOutcome: "struggled", subject: "", topic: "" });
    const action = resolve([legacy]);
    expect(action).toMatchObject({
      kind: "adaptive_practice",
      target: { kind: "adaptive_session" },
      itemCount: 1,
    });
  });

  it("offers goal-fill practice when nothing is due and nothing was struggled with", () => {
    const action = resolve([calmItem], [], { reviewedToday: 3, dailyGoal: 10 });
    expect(action).toMatchObject({
      kind: "goal_fill",
      target: { kind: "adaptive_session" },
      reviewedToday: 3,
      dailyGoal: 10,
    });
  });

  // The gap this phase exists to close: plan.planItems is capped by
  // remainingGoal, so it empties the moment the daily goal is met — and the
  // Hub's plan card disappears with it. A real weakness still has a real
  // question to open.
  it("still answers with the weak topic's own question after the daily goal is met", () => {
    const action = resolve([struggledItem, calmItem], [], { reviewedToday: 10, dailyGoal: 10 });
    expect(action).toMatchObject({
      kind: "struggled_topic",
      target: { kind: "question", questionId: "hard1" },
      topic: "Limit",
    });
  });

  // The invariant that makes the adaptive recommendation safe:
  // useAdaptiveStudySession resolves its questions from exactly
  // plan.planItems, so recommending that route while the array is empty
  // would open a session with nothing in it.
  it("NEVER routes to the adaptive session when the plan has no items", () => {
    const cases: readonly StudentNextAction[] = [
      resolve([struggledItem], [], { reviewedToday: 10, dailyGoal: 10 }),
      resolve([calmItem], [], { reviewedToday: 10, dailyGoal: 10 }),
      resolve([], []),
      resolve([item({ questionId: "m", status: "mastered", nextReviewAt: NOW + DAY_MS })]),
    ];
    for (const action of cases) {
      expect(action.target.kind).not.toBe("adaptive_session");
    }
  });
});

describe("resolveStudentNextAction — determinism", () => {
  const items = [dueItem, struggledItem, calmItem];
  const cards = [
    card({ id: "b", dueAt: endOfLocalDayFrom(NOW, 5) }),
    card({ id: "a", dueAt: endOfLocalDayFrom(NOW, 5) }),
  ];

  it("returns the same action for the same input, call after call", () => {
    expect(resolve(items, cards)).toEqual(resolve(items, cards));
  });

  it("is unaffected by the order of the inputs", () => {
    expect(resolve([...items].reverse(), [...cards].reverse())).toEqual(resolve(items, cards));
  });

  it("mutates neither the items nor the assignment cards it is given", () => {
    const itemIds = items.map((i) => i.questionId);
    const cardIds = cards.map((c) => c.assignment.id);
    resolve(items, cards);
    expect(items.map((i) => i.questionId)).toEqual(itemIds);
    expect(cards.map((c) => c.assignment.id)).toEqual(cardIds);
  });

  it("falls back to a real clock rather than producing NaN-driven nonsense", () => {
    const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
    const plan = buildAdaptivePracticePlan({
      items,
      weakTopics: insights.weakTopics,
      topicInsights: insights.allTopics,
      now: NOW,
      reviewedToday: 0,
      dailyGoal: 10,
    });
    const action = resolveStudentNextAction({
      items,
      plan,
      weakTopics: insights.weakTopics,
      assignmentCards: [],
      now: Number.NaN,
    });
    expect(action.kind).toBe("due_review");
  });
});

describe("nextActionCopy — explainability", () => {
  const actions: readonly StudentNextAction[] = [
    resolve([dueItem]),
    resolve([], [card({ id: "a", dueAt: endOfLocalDayFrom(NOW, 0) })]),
    resolve([struggledItem, calmItem]),
    resolve([item({ questionId: "legacy", lastOutcome: "struggled", subject: "", topic: "" })]),
    resolve([calmItem], [], { reviewedToday: 3, dailyGoal: 10 }),
    resolve([], []),
    resolve([calmItem], [], { reviewedToday: 10, dailyGoal: 10 }),
  ];

  it("always produces a non-empty label, title and detail", () => {
    for (const action of actions) {
      const copy = nextActionCopy(action, NOW);
      expect(copy.label.length).toBeGreaterThan(0);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.detail.length).toBeGreaterThan(0);
    }
  });

  // §9 — the explanation must be a recorded fact the student can check,
  // never a score, a probability, or a system opinion.
  it("never claims a score, a percentage, or an AI opinion", () => {
    const banned = [/%/, /\bskor/i, /\bAI\b/i, /yapay zek/i, /ihtimal/i, /tahmin/i, /puan/i];
    for (const action of actions) {
      const copy = nextActionCopy(action, NOW);
      const text = `${copy.label} ${copy.title} ${copy.detail} ${copy.cta ?? ""}`;
      for (const pattern of banned) {
        expect(text).not.toMatch(pattern);
      }
    }
  });

  it("states the real due count, straight from the action", () => {
    const action = resolve([dueItem, item({ questionId: "due2", nextReviewAt: NOW - DAY_MS })]);
    expect(nextActionCopy(action, NOW).detail).toContain("2 soru");
  });

  it("says 'Başla' for an untouched assignment and 'Devam Et' for a started one", () => {
    expect(nextActionCopy(resolve([], [card({ id: "a" }, 0)]), NOW).cta).toBe("Ödeve Başla");
    expect(nextActionCopy(resolve([], [card({ id: "a" }, 1)]), NOW).cta).toBe("Ödeve Devam Et");
  });

  it("offers the right verb for each weak-topic target", () => {
    expect(nextActionCopy(resolve([struggledItem, calmItem]), NOW).cta).toBe("Bu Konuyu Çalış");
    expect(
      nextActionCopy(resolve([struggledItem, calmItem], [], { reviewedToday: 10, dailyGoal: 10 }), NOW)
        .cta,
    ).toBe("Soruyu Aç");
  });

  it("reuses the Hub's existing goal wording rather than a second progress format", () => {
    const action = resolve([calmItem], [], { reviewedToday: 3, dailyGoal: 10 });
    expect(nextActionCopy(action, NOW).detail).toBe("3 / 10 tamamlandı");
  });
});
