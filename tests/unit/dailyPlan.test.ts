import type { StudentAssignmentCard } from "../../src/features/assignments/hooks/useStudentAssignments";
import type { Assignment } from "../../src/features/assignments/domain/assignmentTypes";
import { buildAdaptivePracticePlan } from "../../src/features/study/services/dailyPracticePlan";
import { buildLearningInsights } from "../../src/features/study/services/learningInsights";
import { buildConceptMasteryMap } from "../../src/features/study/services/conceptMasteryMap";
import type { StudyItem } from "../../src/features/study/services/studyService";
import { toAnalyticsItem, resolveArchiveState } from "../../src/features/studentAnalytics/services/studentAnalytics";
import type { AnalyticsItem } from "../../src/features/studentAnalytics/services/studentAnalytics";
import type { Question } from "../../src/types/question";
import {
  buildDailyPlan,
  MAX_PLAN_STEPS,
  MIN_PLAN_STEPS,
  nextPendingStep,
  pendingRevisitCount,
  planCompletionSentence,
  stepCompletionFacts,
} from "../../src/features/studyPlan/services/dailyPlan";
import { localDayKey } from "../../src/features/studyPlan/services/planDay";
import {
  PLAN_INTRO_EMPTY,
  PLAN_INTRO_EVIDENCE,
  stepContents,
  stepStartLabel,
  stepWhy,
} from "../../src/features/studyPlan/services/planPresentation";

// Phase 108 — the daily planner.
//
// Pins the priority order (the student's own unresolved questions first),
// the capacity, the determinism, the honesty of every completion state and
// that none of it re-decides what Phase 42 / Phase 70 / the scheduler
// already decided.

const NOW = new Date(2026, 8, 18, 12, 0, 0).getTime(); // local noon
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: "q",
    ownerId: "teacher",
    organizationId: null,
    visibility: "class",
    imageUrl: "https://example.test/q.jpg",
    classId: "c1",
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "8",
    description: null,
    posterRole: "teacher",
    createdAt: 0,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    choices: null,
    correctChoice: null,
    hints: [],
    choiceFeedback: null,
    ...overrides,
  };
}

function studyItem(
  questionId: string,
  counts: { solved: number; struggled: number; again: number },
  overrides: Partial<StudyItem> = {},
): StudyItem {
  return {
    questionId,
    status: "learning",
    lastOutcome: "solved",
    intervalDays: 1,
    successfulReviews: 0,
    attemptCount: counts.solved + counts.struggled + counts.again,
    nextReviewAt: NOW + DAY,
    lastReviewedAt: NOW - DAY,
    source: "class",
    sourceClassId: "c1",
    solvedCount: counts.solved,
    struggledCount: counts.struggled,
    againCount: counts.again,
    ...overrides,
  };
}

interface Fixture {
  subject?: string;
  topic?: string;
  nextReviewAt?: number;
  lastReviewedAt?: number;
  status?: StudyItem["status"];
  question?: Question | null;
}

/** An archived (pending) question: struggled, still unsolved, due now. */
function unresolved(id: string, f: Fixture = {}): AnalyticsItem {
  return toAnalyticsItem(
    studyItem(
      id,
      { solved: 0, struggled: 2, again: 0 },
      {
        lastOutcome: "struggled",
        nextReviewAt: f.nextReviewAt ?? NOW - HOUR,
        lastReviewedAt: f.lastReviewedAt ?? NOW - 3 * DAY,
        status: f.status ?? "learning",
      },
    ),
    f.question === undefined
      ? question({ id, subject: f.subject ?? "Matematik", topic: f.topic ?? "Denklemler" })
      : f.question,
  );
}

/** Phase 42 "recovering": >= 2 struggles, last solved, success standing. */
function recovering(id: string, f: Fixture = {}): AnalyticsItem {
  return toAnalyticsItem(
    studyItem(
      id,
      { solved: 2, struggled: 2, again: 0 },
      {
        lastOutcome: "solved",
        successfulReviews: 2,
        nextReviewAt: f.nextReviewAt ?? NOW + 3 * DAY,
        lastReviewedAt: f.lastReviewedAt ?? NOW - 2 * DAY,
        status: "review",
      },
    ),
    question({ id, subject: f.subject ?? "Fizik", topic: f.topic ?? "Kuvvet" }),
  );
}

/** Phase 42 "stable": three solves, nothing else. */
function stable(id: string, f: Fixture = {}): AnalyticsItem {
  return toAnalyticsItem(
    studyItem(
      id,
      { solved: 3, struggled: 0, again: 0 },
      {
        lastOutcome: "solved",
        successfulReviews: 3,
        nextReviewAt: f.nextReviewAt ?? NOW + 5 * DAY,
        lastReviewedAt: f.lastReviewedAt ?? NOW - 2 * DAY,
        status: f.status ?? "review",
      },
    ),
    question({ id, subject: f.subject ?? "Kimya", topic: f.topic ?? "Mol" }),
  );
}

/** One recorded outcome: too little to say anything. */
function thin(id: string, f: Fixture = {}): AnalyticsItem {
  return toAnalyticsItem(
    studyItem(
      id,
      { solved: 1, struggled: 0, again: 0 },
      { lastOutcome: "solved", nextReviewAt: f.nextReviewAt ?? NOW + 2 * DAY, lastReviewedAt: f.lastReviewedAt ?? NOW - DAY },
    ),
    question({ id, subject: f.subject ?? "Biyoloji", topic: f.topic ?? "Hücre" }),
  );
}

function adaptiveFor(items: readonly AnalyticsItem[], reviewedToday = 0, dailyGoal = 10) {
  const insights = buildLearningInsights({ items, now: NOW, reviewedToday, dailyGoal });
  return buildAdaptivePracticePlan({
    items,
    weakTopics: insights.weakTopics,
    topicInsights: insights.allTopics,
    now: NOW,
    reviewedToday,
    dailyGoal,
  });
}

function assignmentCard(id: string, overrides: Partial<Assignment> = {}, status: StudentAssignmentCard["status"] = "not_started"): StudentAssignmentCard {
  const assignment: Assignment = {
    id,
    classId: "c1",
    organizationId: null,
    teacherId: "t1",
    title: "Ödev",
    description: null,
    subject: "Matematik",
    topic: "Oran",
    gradeLevel: "8",
    targetStudentIds: ["s1"],
    questionIds: ["a1", "a2", "a3"],
    targetCount: 3,
    dueAt: NOW + 2 * DAY,
    createdAt: NOW - DAY,
    status: "published",
    ...overrides,
  } as Assignment;
  return { assignment, submission: null, status };
}

function plan(items: readonly AnalyticsItem[], extra: Partial<Parameters<typeof buildDailyPlan>[0]> = {}) {
  return buildDailyPlan({
    items,
    adaptivePlan: extra.adaptivePlan ?? adaptiveFor(items),
    assignmentCards: extra.assignmentCards ?? [],
    now: NOW,
    ...extra,
  });
}

describe("1 — an unresolved question is eligible for the daily plan", () => {
  it("puts a due, still-unsolved archived question in a revisit step that opens the topic archive", () => {
    const items = [unresolved("q1")];
    const result = plan(items);
    const step = result.steps[0];
    expect(step?.kind).toBe("revisit");
    expect(step?.questionIds).toEqual(["q1"]);
    expect(step?.target).toEqual({ kind: "archive", subject: "Matematik", topic: "Denklemler" });
    expect(step?.reason).toBe("Bu soruyu daha önce çözememiştin; tekrar zamanı geldi.");
    expect(result.isEvidenceBased).toBe(true);
  });

  it("does not revisit an archived question the scheduler has not released yet", () => {
    const result = plan([unresolved("q1", { nextReviewAt: NOW + 2 * DAY })]);
    expect(result.steps.some((step) => step.kind === "revisit")).toBe(false);
    expect(result.steps.some((step) => step.kind === "review")).toBe(false);
  });
});

describe("2 — personally unresolved work outranks community difficulty", () => {
  it("a community 'challenging' band never adds a step and never reorders a personal one above it", () => {
    const items = [unresolved("mine"), stable("theirs", { subject: "Kimya", topic: "Mol" })];
    const bands = new Map([["theirs", "challenging" as const]]);
    const result = plan(items, { communityBandByQuestionId: bands });
    expect(result.steps.map((step) => step.kind)).toContain("revisit");
    expect(result.steps.every((step) => !step.questionIds.includes("theirs"))).toBe(true);
    expect(result.steps[0]?.questionIds).toEqual(["mine"]);
  });

  it("only breaks an exact tie between two otherwise equal revisit topics", () => {
    const a = unresolved("a1", { subject: "Matematik", topic: "Alan" });
    const b = unresolved("b1", { subject: "Matematik", topic: "Hacim" });
    const withoutBand = plan([a, b]);
    expect(withoutBand.steps[0]?.topic).toBe("Alan");
    const withBand = plan([a, b], { communityBandByQuestionId: new Map([["b1", "challenging" as const]]) });
    expect(withBand.steps[0]?.topic).toBe("Hacim");
    expect(withBand.steps[1]?.topic).toBe("Alan");
    // Same steps, same reasons: the band moved nothing in or out.
    expect(withBand.steps.map((s) => s.id).sort()).toEqual(withoutBand.steps.map((s) => s.id).sort());
  });
});

describe("3 — an existing due review is respected", () => {
  it("counts due items the revisit tier did not take as one review step, with the real count", () => {
    const items = [unresolved("q1"), stable("s1", { nextReviewAt: NOW - HOUR }), stable("s2", { nextReviewAt: NOW - 2 * HOUR })];
    const result = plan(items);
    const review = result.steps.find((step) => step.kind === "review");
    expect(review?.workload).toBe("2 soru");
    expect(review?.target).toEqual({ kind: "review_session" });
  });

  it("never lists a mastered item as due and adds no review step when nothing is due", () => {
    const result = plan([stable("s1", { nextReviewAt: NOW - HOUR, status: "mastered" })]);
    expect(result.steps.some((step) => step.kind === "review")).toBe(false);
  });
});

describe("4 — persistent struggle is plan-relevant", () => {
  it("adds one reinforce step for a Phase 70 needs_attention topic", () => {
    const items = [unresolved("p1", { subject: "Fizik", topic: "Enerji", nextReviewAt: NOW + DAY })];
    const map = buildConceptMasteryMap({ items, now: NOW });
    expect(map.subjects[0]?.concepts[0]?.presentation).toBe("needs_attention");
    const result = plan(items);
    const step = result.steps.find((s) => s.kind === "reinforce");
    expect(step?.topic).toBe("Enerji");
    expect(step?.reason).toBe("Bu konuda tekrar eden zorlanma sinyali var.");
  });
});

describe("5 — a recovering topic is not treated as persistent struggle", () => {
  it("plans a short 'recover' step, never a 'reinforce' one, and keeps Phase 42's verdict", () => {
    const items = [recovering("r1")];
    // Phase 42's own verdict, read at the boundary and never re-decided here.
    expect(items[0]?.learningState).toBe("recovering");
    const result = plan(items);
    expect(result.steps.some((s) => s.kind === "reinforce")).toBe(false);
    const step = result.steps.find((s) => s.kind === "recover");
    expect(step?.reason).toBe("Bu konu toparlanıyor; kısa bir tekrar planlandı.");
  });
});

describe("6 — a stable topic is not mislabeled weak", () => {
  it("never plans reinforce/recover/revisit for a steady topic", () => {
    const items = [stable("s1"), stable("s2", { subject: "Kimya", topic: "Mol" }), stable("s3", { subject: "Kimya", topic: "Mol" })];
    const result = plan(items);
    expect(result.steps.filter((s) => s.kind === "reinforce" || s.kind === "recover" || s.kind === "revisit")).toEqual([]);
  });
});

describe("7 — insufficient data is not weak", () => {
  it("does not plan a topic with one recorded outcome as a problem", () => {
    const result = plan([thin("t1")]);
    expect(result.steps.filter((s) => s.kind === "reinforce" || s.kind === "recover" || s.kind === "revisit")).toEqual([]);
    expect(result.isEvidenceBased).toBe(false);
  });
});

describe("8 — assignment inclusion", () => {
  it("adds the soonest-due open assignment as one step with its remaining count", () => {
    const later = assignmentCard("a-later", { dueAt: NOW + 5 * DAY });
    const soon = assignmentCard("a-soon", { dueAt: NOW + DAY });
    const done = assignmentCard("a-done", { dueAt: NOW }, "completed");
    const result = plan([], { assignmentCards: [later, soon, done] });
    const steps = result.steps.filter((s) => s.kind === "assignment");
    expect(steps).toHaveLength(1);
    expect(steps[0]?.id).toBe("assignment:a-soon");
    expect(steps[0]?.workload).toBe("3 soru");
    expect(steps[0]?.target).toEqual({ kind: "assignment", assignmentId: "a-soon" });
  });

  it("marks the assignment step completed from the submission, never from a tap", () => {
    const result = plan([], { assignmentCards: [assignmentCard("a1", {}, "completed")] });
    expect(result.steps.some((s) => s.kind === "assignment")).toBe(false);
  });
});

describe("9 — plan maximum size", () => {
  const busy = [
    unresolved("m1", { subject: "Matematik", topic: "Alan" }),
    unresolved("m2", { subject: "Matematik", topic: "Hacim" }),
    unresolved("m3", { subject: "Türkçe", topic: "Fiil", nextReviewAt: NOW + DAY }),
    stable("s1", { nextReviewAt: NOW - HOUR }),
    recovering("r1"),
  ];

  it("never exceeds the preference and clamps preferences to 3..5", () => {
    expect(plan(busy, { assignmentCards: [assignmentCard("a1")] }).steps.length).toBeLessThanOrEqual(5);
    expect(plan(busy, { preferences: { maxSteps: 3, focusSubjects: [] } }).steps).toHaveLength(3);
    expect(plan(busy, { preferences: { maxSteps: 99, focusSubjects: [] } }).steps.length).toBeLessThanOrEqual(MAX_PLAN_STEPS);
    expect(plan(busy, { preferences: { maxSteps: 1, focusSubjects: [] } }).steps).toHaveLength(MIN_PLAN_STEPS);
  });

  it("keeps the priority order when cutting: revisit, review, reinforce, recover, assignment", () => {
    const result = plan(busy, { assignmentCards: [assignmentCard("a1")], preferences: { maxSteps: 5, focusSubjects: [] } });
    expect(result.steps.map((s) => s.kind)).toEqual(["revisit", "revisit", "review", "reinforce", "recover"]);
  });
});

describe("10 — deterministic output for the same input and date", () => {
  it("produces byte-identical plans across calls and input orderings", () => {
    const items = [unresolved("b"), unresolved("a"), recovering("r"), stable("s", { nextReviewAt: NOW - HOUR })];
    const first = plan(items);
    const second = plan(items);
    const shuffled = plan([...items].reverse());
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(first));
    expect(first.dayKey).toBe(localDayKey(NOW));
  });
});

describe("11 — a resolved question refreshes out of the plan", () => {
  it("a revisit step completes only when every one of its questions was worked today, and reads pending from the archive", () => {
    const pendingStep = plan([unresolved("q1"), unresolved("q2")]).steps[0];
    expect(pendingStep?.state).toBe("pending");
    expect(pendingStep?.workedToday).toBe(0);

    // The same two questions after the student worked both today: q1 solved
    // (Phase 107 now reads it as "solved later"), q2 struggled again.
    const solvedLater = toAnalyticsItem(
      studyItem("q1", { solved: 1, struggled: 2, again: 0 }, { lastOutcome: "solved", nextReviewAt: NOW + 2 * DAY, lastReviewedAt: NOW - HOUR }),
      question({ id: "q1" }),
    );
    const struggledAgain = unresolved("q2", { lastReviewedAt: NOW - HOUR, nextReviewAt: NOW + DAY });
    expect(resolveArchiveState(solvedLater)).toBe("solved_later");
    const after = plan([solvedLater, struggledAgain]);
    // No longer due, so the revisit tier is empty; nothing else claims them.
    expect(after.steps.some((s) => s.kind === "revisit")).toBe(false);

    // A step built this morning, re-read against the refreshed archive.
    const step = pendingStep as NonNullable<typeof pendingStep>;
    expect(pendingRevisitCount(step, [solvedLater, struggledAgain])).toBe(1);
  });

  it("derives the completed state and the completion facts from evidence only", () => {
    const worked = unresolved("q1", { lastReviewedAt: NOW - HOUR });
    const result = plan([worked]);
    const step = result.steps[0];
    expect(step?.state).toBe("completed");
    expect(stepCompletionFacts(step as NonNullable<typeof step>)).toEqual(["çözemediğin 1 soruya yeniden çalıştın"]);
    expect(result.isComplete).toBe(true);
    expect(planCompletionSentence(result)).toBe("Bugün 1 adımı tamamladın. Çözemediğin 1 sorudan 1 tanesine yeniden çalıştın.");
  });

  it("a skipped step is plan-local: it changes the plan's state and nothing about the items", () => {
    const items = [unresolved("q1"), recovering("r1")];
    const before = JSON.stringify(items);
    const result = plan(items, { skippedStepIds: ["revisit:Matematik|Denklemler"] });
    expect(result.steps[0]?.state).toBe("skipped");
    expect(result.skippedCount).toBe(1);
    expect(nextPendingStep(result)?.kind).toBe("recover");
    expect(JSON.stringify(items)).toBe(before);
    // Skipped-only never counts as a completed day.
    expect(plan([unresolved("q1")], { skippedStepIds: ["revisit:Matematik|Denklemler"] }).isComplete).toBe(false);
  });
});

describe("12 — no duplicate question steps", () => {
  it("a question claimed by a revisit step is not counted again as due and its topic is not reinforced again", () => {
    const items = [unresolved("q1"), unresolved("q2", { topic: "Denklemler" })];
    const result = plan(items);
    expect(result.steps.filter((s) => s.kind === "revisit")).toHaveLength(1);
    expect(result.steps.some((s) => s.kind === "review")).toBe(false);
    expect(result.steps.some((s) => s.kind === "reinforce")).toBe(false);
    const ids = result.steps.flatMap((s) => s.questionIds);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("caps a revisit step at three questions and never repeats a step id", () => {
    const items = ["a", "b", "c", "d", "e"].map((id) => unresolved(id));
    const result = plan(items);
    expect(result.steps[0]?.questionIds).toEqual(["a", "b", "c"]);
    const ids = result.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("13 — daily goal capacity behaviour", () => {
  it("adds a practice step only while the goal has room and the adaptive plan has filler", () => {
    const items = [stable("s1"), stable("s2", { subject: "Kimya", topic: "Mol" })];
    const open = plan(items, { adaptivePlan: adaptiveFor(items, 0, 5) });
    const practice = open.steps.find((s) => s.kind === "practice");
    expect(practice?.reason).toBe("Günlük hedefin için 5 soru kaldı.");
    expect(practice?.target).toEqual({ kind: "adaptive_session" });

    const met = plan(items, { adaptivePlan: adaptiveFor(items, 5, 5) });
    expect(met.steps.some((s) => s.kind === "practice")).toBe(false);
  });

  it("the practice step is completed by the goal being met, not by opening it", () => {
    const items = [stable("s1")];
    const adaptivePlan = adaptiveFor(items, 0, 2);
    const result = plan(items, { adaptivePlan: { ...adaptivePlan, isGoalComplete: true } });
    expect(result.steps.find((s) => s.kind === "practice")?.state).toBe("completed");
  });

  it("never fabricates minutes: every workload is a count or a word", () => {
    const items = [unresolved("q1"), recovering("r1"), stable("s1", { nextReviewAt: NOW - HOUR })];
    const result = plan(items, { assignmentCards: [assignmentCard("a1")] });
    for (const step of result.steps) {
      expect(step.workload).not.toMatch(/dk|dakika|saat|min/i);
    }
  });
});

describe("14 — missing metadata resilience", () => {
  it("an archived question whose document is gone is not planned by topic, and never crashes the plan", () => {
    const orphan = unresolved("gone", { question: null });
    expect(orphan.isQuestionAvailable).toBe(false);
    const result = plan([orphan, unresolved("q1")]);
    expect(result.steps.every((s) => !s.questionIds.includes("gone"))).toBe(true);
    // The orphan is still due for the scheduler, so it is counted, not lost.
    expect(result.steps.find((s) => s.kind === "review")?.workload).toBe("1 soru");
  });

  it("an empty history yields an empty, honest plan", () => {
    const result = plan([]);
    expect(result.steps).toEqual([]);
    expect(result.isComplete).toBe(false);
    expect(result.isEvidenceBased).toBe(false);
    expect(PLAN_INTRO_EMPTY).toBe("Planını kişiselleştirmek için birkaç çalışma tamamlaman gerekiyor.");
  });
});

describe("presentation — every step can explain itself, calmly", () => {
  it("gives each kind a start label, contents and a why-sentence without AI claims", () => {
    const items = [unresolved("q1"), recovering("r1"), stable("s1", { nextReviewAt: NOW - HOUR })];
    const result = plan(items, { assignmentCards: [assignmentCard("a1")], adaptivePlan: adaptiveFor(items, 0, 10) });
    for (const step of result.steps) {
      expect(stepStartLabel(step).length).toBeGreaterThan(0);
      expect(stepContents(step, step.questionIds.length).length).toBeGreaterThan(0);
      const why = stepWhy(step);
      expect(why.length).toBeGreaterThan(0);
      expect(`${why} ${step.reason}`).not.toMatch(/yapay zek|AI|algoritma/i);
    }
    expect(PLAN_INTRO_EVIDENCE).toBe("Bugünkü planın öğrenme geçmişine göre hazırlandı.");
  });
});
