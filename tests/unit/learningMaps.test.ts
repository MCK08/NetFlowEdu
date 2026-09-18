import { readFileSync } from "fs";
import { join } from "path";

import type { LearningEvent } from "../../src/features/learningStory/services/learningTrail";
import { buildConceptMasteryMap, conceptStateLabel } from "../../src/features/study/services/conceptMasteryMap";
import type { StudyItem } from "../../src/features/study/services/studyService";
import { toAnalyticsItem } from "../../src/features/studentAnalytics/services/studentAnalytics";
import type { AnalyticsItem } from "../../src/features/studentAnalytics/services/studentAnalytics";
import type { Question } from "../../src/types/question";
import {
  buildGapMap,
  buildProgressHistory,
  buildProgressMap,
  buildStrongAreas,
  gapCountLabel,
  PROGRESS_STAGES,
} from "../../src/features/studyPlan/services/learningMaps";
import { localDayKey } from "../../src/features/studyPlan/services/planDay";
import {
  EMPTY_PLAN_STORE,
  parsePlanStore,
  serializePlanStore,
  skippedStepsForDay,
  withCompletedDay,
  withPreferences,
  withSkippedStep,
  withoutSkippedStep,
} from "../../src/features/studyPlan/services/planStore";
import { buildWeekView, FUTURE_DAY_PLACEHOLDER, pastDaySentence } from "../../src/features/studyPlan/services/weeklyPlan";

// Phase 108 — Eksik Haritam, Güçlü Alanlarım, İlerleme Haritam, the
// plan-local store and the weekly frame.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

const NOW = new Date(2026, 8, 18, 12, 0, 0).getTime(); // a Friday, local noon
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

function build(
  id: string,
  counts: { solved: number; struggled: number; again: number },
  overrides: Partial<StudyItem>,
  meta: { subject?: string; topic?: string } = {},
): AnalyticsItem {
  const item: StudyItem = {
    questionId: id,
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
  return toAnalyticsItem(item, question({ id, subject: meta.subject ?? "Matematik", topic: meta.topic ?? "Denklemler" }));
}

const pending = (id: string, meta?: { subject?: string; topic?: string }) =>
  build(id, { solved: 0, struggled: 2, again: 0 }, { lastOutcome: "struggled", nextReviewAt: NOW - HOUR }, meta);
const solvedLater = (id: string, meta?: { subject?: string; topic?: string }) =>
  build(id, { solved: 1, struggled: 2, again: 0 }, { lastOutcome: "solved", successfulReviews: 1, lastReviewedAt: NOW - 2 * HOUR }, meta);
const stable = (id: string, meta?: { subject?: string; topic?: string }) =>
  build(id, { solved: 3, struggled: 0, again: 0 }, { lastOutcome: "solved", successfulReviews: 3, status: "review" }, meta);
const thin = (id: string, meta?: { subject?: string; topic?: string }) =>
  build(id, { solved: 1, struggled: 0, again: 0 }, { lastOutcome: "solved" }, meta);

describe("Eksik Haritam", () => {
  it("groups unresolved questions under their subject and topic with real counts", () => {
    const map = buildGapMap(
      [pending("a"), pending("b"), pending("c", { topic: "Oran" }), pending("d", { subject: "Fizik", topic: "Kuvvet" })],
      NOW,
    );
    expect(map.subjects.map((s) => s.subject)).toEqual(["Matematik", "Fizik"]);
    expect(map.subjects[0]?.pendingCount).toBe(3);
    expect(map.subjects[0]?.topics.map((t) => [t.topic, t.pendingCount])).toEqual([
      ["Denklemler", 2],
      ["Oran", 1],
    ]);
    expect(map.pendingTotal).toBe(4);
    expect(gapCountLabel({ pendingCount: 2, solvedLaterCount: 0 })).toBe("2 tekrar bekliyor");
  });

  it("represents a question the student later solved separately, never as a deficit", () => {
    const map = buildGapMap([solvedLater("s1"), pending("p1", { topic: "Oran" })], NOW);
    const solved = map.subjects[0]?.topics.find((t) => t.topic === "Denklemler");
    expect(solved?.pendingCount).toBe(0);
    expect(solved?.solvedLaterCount).toBe(1);
    expect(gapCountLabel(solved as NonNullable<typeof solved>)).toBe("1 sonradan çözüldü");
    expect(map.solvedLaterTotal).toBe(1);
    // Waiting topics sort first.
    expect(map.subjects[0]?.topics[0]?.topic).toBe("Oran");
  });

  it("shows no fake deficit without struggle evidence", () => {
    const map = buildGapMap([stable("s1"), thin("t1", { subject: "Fizik", topic: "Kuvvet" })], NOW);
    expect(map.isEmpty).toBe(true);
    expect(map.subjects).toEqual([]);
  });

  it("carries Phase 70's own label beside the count instead of inventing one", () => {
    const items = [pending("a"), pending("b")];
    const node = buildConceptMasteryMap({ items, now: NOW }).subjects[0]?.concepts[0];
    const gap = buildGapMap(items, NOW).subjects[0]?.topics[0];
    expect(gap?.presentation).toBe(node?.presentation);
    expect(gap?.stateLabel).toBe(conceptStateLabel(node as NonNullable<typeof node>));
  });

  it("the drill-down opens the topic-filtered archive route", () => {
    const screen = read("src/features/studyPlan/screens/GapMapScreen.tsx");
    expect(screen).toContain("ANALYTICS_ROUTES.archive}?subject=${encodeURIComponent(gap.subject)}&topic=${encodeURIComponent(gap.topic)}");
    expect(read("src/features/studyPlan/hooks/usePlanStepNavigation.ts")).toContain("ANALYTICS_ROUTES.archive");
  });
});

describe("Güçlü Alanlarım", () => {
  it("lists a stable topic only with sufficient evidence, with Phase 70's supporting fact", () => {
    const strong = buildStrongAreas([stable("a"), stable("b"), stable("c")], NOW);
    expect(strong).toHaveLength(1);
    expect(strong[0]?.topic).toBe("Denklemler");
    expect(strong[0]?.fact.length).toBeGreaterThan(0);
  });

  it("does not list a topic on one solve, on a single struggle or on a majority of unknowns", () => {
    expect(buildStrongAreas([thin("t1")], NOW)).toEqual([]);
    expect(buildStrongAreas([stable("a"), pending("p", { topic: "Denklemler" })], NOW)).toEqual([]);
    expect(buildStrongAreas([stable("a"), thin("t1"), thin("t2")], NOW)).toEqual([]);
  });
});

describe("İlerleme Haritam", () => {
  it("draws only the canonical stages and counts unplaced topics instead of placing them", () => {
    expect(PROGRESS_STAGES).toEqual(["needs_attention", "watch", "recovering", "steady"]);
    const map = buildProgressMap([pending("p"), stable("s", { subject: "Kimya", topic: "Mol" }), thin("t", { subject: "Fizik", topic: "Isı" })], NOW);
    expect(map.stages.map((s) => [s.presentation, s.topics.length])).toEqual([
      ["needs_attention", 1],
      ["watch", 0],
      ["recovering", 0],
      ["steady", 1],
    ]);
    expect(map.unplacedCount).toBe(1);
    expect(map.totalTopics).toBe(3);
    expect(map.stages.map((s) => s.label)).toEqual(["Tekrar eden zorlanma", "Tek zorlanma görüldü", "Toparlanıyor", "İstikrarlı"]);
  });

  it("builds the history from provable events only, newest first, with no invented rows", () => {
    const events: LearningEvent[] = [
      { id: "e1", questionId: "q1", outcome: "struggled", occurredAt: NOW - 3 * DAY, subject: "Matematik", topic: "Denklemler" },
      { id: "e2", questionId: "q1", outcome: "solved", occurredAt: NOW - DAY, subject: "Matematik", topic: "Denklemler" },
      { id: "e0", questionId: "q9", outcome: "again", occurredAt: 0, subject: "Fizik", topic: "Isı" },
    ];
    const history = buildProgressHistory({
      events,
      items: [solvedLater("q1")],
      completedDays: [{ dayKey: localDayKey(NOW - 2 * DAY), stepsTotal: 3, stepsCompleted: 3, revisitWorked: 1 }],
    });
    expect(history.events.map((e) => e.kind)).toEqual(["solved_later", "outcome", "plan_completed", "outcome"]);
    expect(history.events.map((e) => e.sentence)).toEqual([
      "Çözemediğin bir soruyu yeniden çözdün",
      "Çözdün",
      "Günlük plan tamamlandı · 3 adım",
      "Zorlandın",
    ]);
    // Strictly descending; nothing between the rows.
    const times = history.events.map((e) => e.occurredAt);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(history.events).toHaveLength(4);
  });

  it("is empty with nothing recorded — no curve, no placeholder", () => {
    const history = buildProgressHistory({ events: [], items: [stable("s")], completedDays: [] });
    expect(history.isEmpty).toBe(true);
    expect(history.events).toEqual([]);
  });
});

describe("Phase 42 / Phase 70 remain untouched", () => {
  it("the maps import the classifier and the concept map; they never redefine them", () => {
    const maps = read("src/features/studyPlan/services/learningMaps.ts");
    const planner = read("src/features/studyPlan/services/dailyPlan.ts");
    for (const source of [maps, planner]) {
      expect(source).toContain("buildConceptMasteryMap");
      expect(source).not.toMatch(/persistent_struggle\s*[:=]/);
      expect(source).not.toMatch(/function (buildLearningState|resolvePresentation|classify)/);
      expect(source).not.toMatch(/MIN_OUTCOMES_FOR_CONFIDENT_STATE|REPEATED_STRUGGLE_MIN_EVENTS/);
    }
    // The stage ladder is Phase 70's vocabulary, verbatim.
    expect(conceptStateLabel({ presentation: "steady" } as never)).toBe("İstikrarlı");
  });
});

describe("plan store", () => {
  it("round-trips, tolerates garbage and drops another day's skips", () => {
    expect(parsePlanStore(null)).toEqual(EMPTY_PLAN_STORE);
    expect(parsePlanStore("{not json")).toEqual(EMPTY_PLAN_STORE);
    expect(parsePlanStore(JSON.stringify({ preferences: { maxSteps: 42, focusSubjects: ["Matematik", 3] } })).preferences).toEqual({
      maxSteps: 5,
      focusSubjects: ["Matematik"],
    });

    let store = withSkippedStep(EMPTY_PLAN_STORE, "2026-09-18", "review:due");
    store = withCompletedDay(store, { dayKey: "2026-09-17", stepsTotal: 4, stepsCompleted: 3, revisitWorked: 2 });
    store = withPreferences(store, { maxSteps: 3, focusSubjects: ["Fizik"] });
    const parsed = parsePlanStore(serializePlanStore(store));
    expect(parsed).toEqual(store);
    expect(skippedStepsForDay(parsed, "2026-09-18")).toEqual(["review:due"]);
    expect(skippedStepsForDay(parsed, "2026-09-19")).toEqual([]);
    expect(withoutSkippedStep(parsed, "2026-09-18", "review:due").skippedDayKey).toBeNull();
  });

  it("keeps one record per completed day", () => {
    let store = withCompletedDay(EMPTY_PLAN_STORE, { dayKey: "2026-09-17", stepsTotal: 4, stepsCompleted: 3, revisitWorked: 0 });
    store = withCompletedDay(store, { dayKey: "2026-09-17", stepsTotal: 4, stepsCompleted: 4, revisitWorked: 1 });
    expect(store.completedDays).toEqual([{ dayKey: "2026-09-17", stepsTotal: 4, stepsCompleted: 4, revisitWorked: 1 }]);
  });
});

describe("Haftalık Plan", () => {
  it("frames Monday to Sunday, shows records for past days and only a placeholder for future ones", () => {
    const week = buildWeekView({
      now: NOW,
      completedDays: [{ dayKey: localDayKey(NOW - DAY), stepsTotal: 3, stepsCompleted: 3, revisitWorked: 1 }],
      studyDays: [{ dayKey: localDayKey(NOW - 2 * DAY), reviewCount: 4, solvedCount: 3, struggledCount: 1 }],
    });
    expect(week.days).toHaveLength(7);
    expect(new Date(week.days[0]?.startsAt ?? 0).getDay()).toBe(1);
    expect(week.days.map((d) => d.kind)).toEqual(["past", "past", "past", "past", "today", "future", "future"]);
    expect(week.todayKey).toBe(localDayKey(NOW));
    expect(pastDaySentence(week.days[3] as NonNullable<(typeof week.days)[3]>)).toBe("Plan tamamlandı · 3 adım · 1 çözemediğin soruya döndün");
    expect(pastDaySentence(week.days[2] as NonNullable<(typeof week.days)[2]>)).toBe("4 tekrar kaydedildi");
    expect(pastDaySentence(week.days[0] as NonNullable<(typeof week.days)[0]>)).toBe("Kayıtlı çalışma yok");
    expect(week.completedCount).toBe(1);
    expect(week.activeCount).toBe(1);
    expect(week.days[5]?.completedPlan).toBeNull();
    expect(FUTURE_DAY_PLACEHOLDER).toBe("Plan o gün öğrenme durumuna göre hazırlanacak.");
  });
});
