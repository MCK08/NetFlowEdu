import type { LearningEvent } from "@features/learningStory/services/learningTrail";
import {
  AnalyticsItem,
  ArchiveEntry,
  buildQuestionArchive,
  summarizeArchive,
} from "@features/studentAnalytics/services/studentAnalytics";

import { DailyPlan, nextPendingStep, planCompletionSentence, PlanStep } from "./dailyPlan";
import { buildGapMap, buildProgressHistory, buildProgressMap, buildStrongAreas, GapTopic, ProgressEvent, StrongArea } from "./learningMaps";
import type { CompletedPlanDay } from "./planStore";

// Phase 109 — the Çalış workspace's view-model.
//
// One pure function composes what the tab shows, from sources that already
// exist and are not re-derived here: the Phase 108 plan (buildDailyPlan),
// the Phase 107 archive (buildQuestionArchive), Phase 70's concept readings
// (through learningMaps.ts) and the Phase 59 learning events. It decides
// how much of each to show inline and in what order; it never re-decides a
// state, a priority or a count.

export const ARCHIVE_PREVIEW_LIMIT = 3;
export const STRUGGLE_TOPIC_LIMIT = 5;
export const STRONG_AREA_LIMIT = 4;
export const PROGRESS_EVENT_LIMIT = 3;

export type WorkspaceFocus =
  | { kind: "step"; step: PlanStep; index: number; total: number }
  | { kind: "complete"; sentence: string }
  | { kind: "start" };

export interface ProgressFact {
  id: "solved_later" | "recovering" | "plan_steps";
  value: number;
  label: string;
}

export interface StudyWorkspace {
  focus: WorkspaceFocus;
  archivePreview: ArchiveEntry[];
  archivePendingCount: number;
  archiveSolvedLaterCount: number;
  struggleTopics: GapTopic[];
  strongAreas: StrongArea[];
  progressFacts: ProgressFact[];
  progressEvents: ProgressEvent[];
  hasAnyEvidence: boolean;
}

export interface BuildStudyWorkspaceParams {
  plan: DailyPlan;
  items: readonly AnalyticsItem[];
  now: number;
  completedDays: readonly CompletedPlanDay[];
  events: readonly LearningEvent[];
}

export function buildStudyWorkspace(params: BuildStudyWorkspaceParams): StudyWorkspace {
  const { plan, items, now, completedDays, events } = params;

  const next = nextPendingStep(plan);
  const focus: WorkspaceFocus = next
    ? { kind: "step", step: next, index: plan.steps.indexOf(next), total: plan.steps.length }
    : plan.isComplete
      ? { kind: "complete", sentence: planCompletionSentence(plan) }
      : { kind: "start" };

  const archive = buildQuestionArchive(items);
  const archiveSummary = summarizeArchive(archive);
  const archivePreview = archive.filter((entry) => entry.state === "pending").slice(0, ARCHIVE_PREVIEW_LIMIT);

  const gaps = buildGapMap(items, now);
  const struggleTopics = gaps.subjects
    .flatMap((subject) => subject.topics)
    .filter((topic) => topic.pendingCount > 0)
    .sort((a, b) => b.pendingCount - a.pendingCount || `${a.subject}|${a.topic}`.localeCompare(`${b.subject}|${b.topic}`, "tr"))
    .slice(0, STRUGGLE_TOPIC_LIMIT);

  const strongAreas = buildStrongAreas(items, now).slice(0, STRONG_AREA_LIMIT);

  const recoveringCount = buildProgressMap(items, now).stages.find((stage) => stage.presentation === "recovering")?.topics.length ?? 0;
  const progressFacts: ProgressFact[] = [];
  if (archiveSummary.solvedLater > 0) {
    progressFacts.push({ id: "solved_later", value: archiveSummary.solvedLater, label: "çözemediğin soruyu sonradan çözdün" });
  }
  if (recoveringCount > 0) {
    progressFacts.push({ id: "recovering", value: recoveringCount, label: "konu toparlanıyor" });
  }
  if (plan.completedCount > 0) {
    progressFacts.push({ id: "plan_steps", value: plan.completedCount, label: "plan adımı bugün tamamlandı" });
  }
  const progressEvents = buildProgressHistory({ events, items, completedDays, limit: PROGRESS_EVENT_LIMIT }).events;

  return {
    focus,
    archivePreview,
    archivePendingCount: archiveSummary.pending,
    archiveSolvedLaterCount: archiveSummary.solvedLater,
    struggleTopics,
    strongAreas,
    progressFacts,
    progressEvents,
    hasAnyEvidence: items.length > 0,
  };
}
