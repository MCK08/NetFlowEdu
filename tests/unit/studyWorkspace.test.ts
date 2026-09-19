import { readFileSync } from "fs";
import { join } from "path";

import type { LearningEvent } from "../../src/features/learningStory/services/learningTrail";
import { buildAdaptivePracticePlan } from "../../src/features/study/services/dailyPracticePlan";
import { buildLearningInsights } from "../../src/features/study/services/learningInsights";
import type { StudyItem } from "../../src/features/study/services/studyService";
import { buildQuestionArchive, toAnalyticsItem } from "../../src/features/studentAnalytics/services/studentAnalytics";
import type { AnalyticsItem } from "../../src/features/studentAnalytics/services/studentAnalytics";
import { buildDailyPlan } from "../../src/features/studyPlan/services/dailyPlan";
import { buildGapMap, buildStrongAreas } from "../../src/features/studyPlan/services/learningMaps";
import {
  ARCHIVE_PREVIEW_LIMIT,
  buildStudyWorkspace,
  STRUGGLE_TOPIC_LIMIT,
} from "../../src/features/studyPlan/services/studyWorkspace";
import type { Question } from "../../src/types/question";

// Phase 109 — Çalış as one workspace: every inline section is a projection
// of a canonical source (Phase 108 plan, Phase 107 archive, Phase 70 map,
// Phase 59 events), never a second engine.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative)
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");

const NOW = new Date(2026, 8, 18, 12, 0, 0).getTime();
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

const pending = (id: string, meta?: { subject?: string; topic?: string }, nextReviewAt = NOW - HOUR) =>
  build(id, { solved: 0, struggled: 2, again: 0 }, { lastOutcome: "struggled", nextReviewAt }, meta);
const solvedLater = (id: string, meta?: { subject?: string; topic?: string }) =>
  build(id, { solved: 1, struggled: 2, again: 0 }, { lastOutcome: "solved", successfulReviews: 1, lastReviewedAt: NOW - 2 * HOUR }, meta);
const recovering = (id: string, meta?: { subject?: string; topic?: string }) =>
  build(id, { solved: 2, struggled: 2, again: 0 }, { lastOutcome: "solved", successfulReviews: 2, status: "review", nextReviewAt: NOW + 3 * DAY }, meta);
const stable = (id: string, meta?: { subject?: string; topic?: string }) =>
  build(id, { solved: 3, struggled: 0, again: 0 }, { lastOutcome: "solved", successfulReviews: 3, status: "review" }, meta);

function planFor(items: readonly AnalyticsItem[]) {
  const insights = buildLearningInsights({ items, now: NOW, reviewedToday: 0, dailyGoal: 10 });
  const adaptivePlan = buildAdaptivePracticePlan({
    items,
    weakTopics: insights.weakTopics,
    topicInsights: insights.allTopics,
    now: NOW,
    reviewedToday: 0,
    dailyGoal: 10,
  });
  return buildDailyPlan({ items, adaptivePlan, assignmentCards: [], now: NOW });
}

function workspace(items: readonly AnalyticsItem[], events: LearningEvent[] = []) {
  return buildStudyWorkspace({ plan: planFor(items), items, now: NOW, completedDays: [], events });
}

describe("focus — one action", () => {
  it("is the plan's next pending step when there is one", () => {
    const items = [pending("q1")];
    const plan = planFor(items);
    const ws = workspace(items);
    expect(ws.focus.kind).toBe("step");
    if (ws.focus.kind === "step") {
      expect(ws.focus.step.id).toBe(plan.steps[0]?.id);
      expect(ws.focus.index).toBe(0);
      expect(ws.focus.total).toBe(plan.steps.length);
    }
  });

  it("is a plain start with no history, and the completion sentence when the plan is done", () => {
    expect(workspace([]).focus).toEqual({ kind: "start" });
    const done = [pending("q1", undefined, NOW - HOUR)];
    // Worked today → the revisit step completes from evidence.
    const worked = [build("q1", { solved: 0, struggled: 2, again: 0 }, { lastOutcome: "struggled", nextReviewAt: NOW - HOUR, lastReviewedAt: NOW - HOUR })];
    expect(planFor(done).steps[0]?.state).toBe("pending");
    const ws = workspace(worked);
    expect(ws.focus.kind).toBe("complete");
    if (ws.focus.kind === "complete") expect(ws.focus.sentence).toContain("Bugün 1 adımı tamamladın.");
  });
});

describe("unresolved questions — Phase 107's archive, inline", () => {
  it("previews pending entries in the archive's own order and reports the real counts", () => {
    const items = [pending("a"), pending("b"), pending("c"), pending("d"), solvedLater("s")];
    const ws = workspace(items);
    const archive = buildQuestionArchive(items).filter((entry) => entry.state === "pending");
    expect(ws.archivePreview.map((entry) => entry.questionId)).toEqual(archive.slice(0, ARCHIVE_PREVIEW_LIMIT).map((entry) => entry.questionId));
    expect(ws.archivePendingCount).toBe(4);
    expect(ws.archiveSolvedLaterCount).toBe(1);
    expect(ws.archivePreview.every((entry) => entry.state === "pending")).toBe(true);
  });

  it("shows nothing as unresolved without struggle evidence", () => {
    const ws = workspace([stable("s1"), stable("s2")]);
    expect(ws.archivePreview).toEqual([]);
    expect(ws.archivePendingCount).toBe(0);
  });
});

describe("struggle topics and strengths — canonical semantics", () => {
  it("struggle topics are the gap map's waiting topics, most waiting first, capped", () => {
    const items = [
      pending("a", { topic: "Denklemler" }),
      pending("b", { topic: "Denklemler" }),
      pending("c", { subject: "Fizik", topic: "Kuvvet" }),
      solvedLater("d", { subject: "Kimya", topic: "Mol" }),
      ...Array.from({ length: 6 }, (_, i) => pending(`t${i}`, { subject: "Türkçe", topic: `Konu${i}` })),
    ];
    const ws = workspace(items);
    expect(ws.struggleTopics.length).toBe(STRUGGLE_TOPIC_LIMIT);
    expect(ws.struggleTopics[0]).toMatchObject({ subject: "Matematik", topic: "Denklemler", pendingCount: 2 });
    expect(ws.struggleTopics.every((topic) => topic.pendingCount > 0)).toBe(true);
    const gapTopics = buildGapMap(items, NOW).subjects.flatMap((s) => s.topics).filter((t) => t.pendingCount > 0);
    expect(gapTopics.some((t) => t.topic === "Mol")).toBe(false);
  });

  it("strengths are Phase 70's steady topics and nothing else", () => {
    const items = [stable("a"), stable("b"), stable("c"), recovering("r", { subject: "Fizik", topic: "Kuvvet" })];
    const ws = workspace(items);
    expect(ws.strongAreas.map((a) => a.topic)).toEqual(buildStrongAreas(items, NOW).map((a) => a.topic));
    expect(ws.strongAreas.map((a) => a.topic)).toEqual(["Denklemler"]);
  });
});

describe("progress — evidence only", () => {
  it("lists only facts with something behind them, and the newest recorded events", () => {
    const items = [solvedLater("s"), recovering("r", { subject: "Fizik", topic: "Kuvvet" })];
    const events: LearningEvent[] = [
      { id: "e1", questionId: "s", outcome: "solved", occurredAt: NOW - 3 * HOUR, subject: "Matematik", topic: "Denklemler" },
    ];
    const ws = workspace(items, events);
    expect(ws.progressFacts.map((f) => f.id)).toEqual(["solved_later", "recovering"]);
    // "r" is recovering AND, by Phase 107's rule, solved later — both rows are real.
    expect(ws.progressEvents.map((e) => e.kind)).toEqual(["solved_later", "outcome", "solved_later"]);
    const times = ws.progressEvents.map((e) => e.occurredAt);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(workspace([]).progressFacts).toEqual([]);
    expect(workspace([]).progressEvents).toEqual([]);
    expect(workspace([]).hasAnyEvidence).toBe(false);
  });
});

describe("the screen — no second planner, no second archive, one feed", () => {
  const STUDY = "src/features/study/screens/StudyScreen.tsx";

  it("renders the plan inline from useStudyPlan and the archive rows from Phase 107's components", () => {
    const study = code(STUDY);
    expect(study).toContain("useStudyPlan(uid)");
    expect(study).toContain("<PlanStepRow");
    expect(study).toContain("<ArchiveEntryRow");
    expect(study).toContain("archivedQuestionRoute(questionId)");
    expect(study).not.toMatch(/buildDailyPlan|buildLearningState|buildConceptMasteryMap|resolveArchiveState|useStudyQueue|resolveStudentNextAction/);
    const ws = code("src/features/studyPlan/services/studyWorkspace.ts");
    expect(ws).toContain("buildQuestionArchive(items)");
    expect(ws).toContain("nextPendingStep(plan)");
    expect(ws).toContain("buildGapMap(items, now)");
    expect(ws).toContain("buildStrongAreas(items, now)");
    expect(ws).not.toMatch(/persistent_struggle|struggledCount\s*>=|nextReviewAt\s*<=/);
  });

  it("launches the one question feed with the chosen filter context", () => {
    const launcher = code("src/features/study/components/PracticeLauncher.tsx");
    expect(launcher).toContain('launch({ filter, channel: unresolvedOnly ? "struggles" : "for_you" })');
    expect(launcher).toContain('export const PRACTICE_START_LABEL = "Soruları Başlat";');
    expect(launcher).not.toMatch(/FlatList|QuestionFeedPage|useSocialFeed/);
    const hook = code("src/features/feed/hooks/useFeedLaunch.ts");
    expect(hook).toContain("router.navigate({ pathname: FEED_LAUNCH_ROUTE, params: buildFeedLaunchParams(context) }");
    const study = code(STUDY);
    expect(study).toContain('launchFeed({ channel: "struggles" })');
  });

  it("has one primary action per screenful and no navigation-card menu", () => {
    const study = code(STUDY);
    const body = study.slice(study.indexOf("return ("));
    // The focus block holds the only PrimaryButton in the workspace.
    const focus = body.slice(body.indexOf("FOCUS_TITLE"), body.indexOf("TODAY_TITLE"));
    expect((focus.match(/<PrimaryButton/g) ?? []).length).toBe(3); // one per focus branch
    expect((body.match(/<PrimaryButton/g) ?? []).length).toBe(3);
    expect(body).not.toMatch(/<AnalyticsNavRow|<ActionTile|title="Çalışma Planım"/);
    // Deep readings are quiet text rows at the foot.
    for (const label of ["Plan tercihleri", "Kişisel Analiz", "Öğrenme Atlasım", "İlerleme Hikâyem"]) {
      expect(body).toContain(`label="${label}"`);
    }
  });

  it("speaks calmly and paints with tokens", () => {
    for (const file of [STUDY, "src/features/study/components/PracticeLauncher.tsx", "src/features/profile/components/ProfileLearningSummary.tsx"]) {
      const source = code(file);
      expect(source).not.toMatch(/Yapay zek|AI |liderlik|percentile|leaderboard|\bTYT\b/i);
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|"white"|"black"/);
      expect(source).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2705}\u{2728}]/u);
      expect(source.match(/fontSize:\s*\d+/g) ?? []).toEqual([]);
      expect(source).toContain("useThemeSubscription()");
    }
  });
});
