import type { StudentAssignmentCard } from "@features/assignments/hooks/useStudentAssignments";
import { assignmentDueLabel } from "@features/assignments/services/assignmentUrgency";
import { buildConceptMasteryMap, ConceptNode } from "@features/study/services/conceptMasteryMap";
import type { DailyPracticePlan } from "@features/study/services/dailyPracticePlan";
import {
  AnalyticsItem,
  buildQuestionArchive,
  resolveArchiveState,
} from "@features/studentAnalytics/services/studentAnalytics";

import type { CommunityBand } from "@features/communityDifficulty/services/communityBand";
import { isSameLocalDay, localDayKey } from "./planDay";

// Phase 108 — "Çalışma Planım": the day's few steps, derived from evidence.
//
// WHAT THIS IS
//
// A deterministic, explainable SELECTION over verdicts the product already
// makes. Every step names the real fact that put it in the plan, and the
// same inputs on the same day produce the same plan, byte for byte. There is
// no model, no randomness and no clock beyond `now`.
//
// WHAT THIS IS NOT
//
// Not a scheduler: which questions are DUE is the review scheduler's verdict
// (`nextReviewAt`), read as-is. Not a classifier: whether a topic shows
// repeated struggle, recovery or standing success is Phase 42's per-question
// verdict as grouped by Phase 70's concept map, read as-is. Not a second
// archive: "questions you could not solve" is Phase 107's archive, read
// as-is. This module only decides which of those already-true things go
// into today's short list, in what order, and how each one is explained.
//
// PRIORITY (fixed, documented, tested)
//
//  1. revisit   — archived questions the student could not solve, whose
//                 review the scheduler now considers due. Grouped by topic.
//  2. review    — any other due review work, as the count the review
//                 session will re-fetch for itself.
//  3. reinforce — a topic with repeated, unresolved struggle (Phase 70
//                 "needs_attention") not already covered above.
//  4. recover   — a topic that is recovering; a short reinforcement.
//  5. assignment— open work a teacher assigned.
//  6. practice  — the adaptive plan's remaining goal-fill, only when there
//                 is still room in the day and in the daily goal.
//
// Personal evidence always comes first. The anonymous community signal is
// consulted in exactly one place: as the LAST tie-breaker between two revisit
// groups that are otherwise equal, and it can never add a step on its own.

export type PlanStepKind = "revisit" | "review" | "reinforce" | "recover" | "assignment" | "practice";

/** Where "Adıma Başla" goes. Every target is an EXISTING surface. */
export type PlanStepTarget =
  // Phase 107's archive, scoped to this topic's waiting questions.
  | { kind: "archive"; subject: string; topic: string }
  // The review session, which re-fetches its own due working set.
  | { kind: "review_session" }
  // The adaptive session (the adaptive plan has items for this topic).
  | { kind: "adaptive_session" }
  // One real question in the topic, when the adaptive plan does not carry it.
  | { kind: "question"; questionId: string }
  | { kind: "assignment"; assignmentId: string };

export type PlanStepState = "pending" | "completed" | "skipped";

export interface PlanStep {
  /** Stable within a day: `${kind}:${subject}|${topic}` or `${kind}:${assignmentId}`. */
  id: string;
  kind: PlanStepKind;
  subject: string;
  topic: string;
  /** Real question ids this step is about (revisit/reinforce/recover);
   *  empty for steps whose working set another surface owns. */
  questionIds: string[];
  /** Count-based workload words — never minutes. */
  workload: string;
  /** The recorded fact that put this step in the plan. */
  reason: string;
  target: PlanStepTarget;
  state: PlanStepState;
  /** How many of `questionIds` were worked on today (revisit/reinforce/recover);
   *  null for the other kinds. */
  workedToday: number | null;
}

export interface PlanPreferences {
  /** How many steps a day, MIN_PLAN_STEPS..MAX_PLAN_STEPS. */
  maxSteps: number;
  /** Subjects the student asked to see first. A tie-breaker inside a tier
   *  only — a preference never adds work the evidence did not, and never
   *  removes work the evidence did. */
  focusSubjects: readonly string[];
}

export const MIN_PLAN_STEPS = 3;
export const MAX_PLAN_STEPS = 5;
export const DEFAULT_PLAN_STEPS = 4;

/** At most this many archived questions per revisit step, so one topic with
 *  a long history does not become the whole day. */
export const MAX_QUESTIONS_PER_REVISIT_STEP = 3;
/** At most this many revisit steps; the rest of the archive keeps waiting. */
const MAX_REVISIT_STEPS = 2;

export const DEFAULT_PLAN_PREFERENCES: PlanPreferences = {
  maxSteps: DEFAULT_PLAN_STEPS,
  focusSubjects: [],
};

export function clampPlanSteps(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PLAN_STEPS;
  return Math.min(MAX_PLAN_STEPS, Math.max(MIN_PLAN_STEPS, Math.round(value)));
}

export interface DailyPlan {
  dayKey: string;
  steps: PlanStep[];
  completedCount: number;
  skippedCount: number;
  /** Steps that still need attention (pending). */
  remainingCount: number;
  isComplete: boolean;
  /** True when at least one step rests on the student's own recorded
   *  evidence (archive, due, struggle, recovery). An assignment-only or
   *  practice-only plan is real work but is not "personalised by history". */
  isEvidenceBased: boolean;
  /** Real counts behind the completion sentence. */
  revisitTotal: number;
  revisitWorkedToday: number;
}

export interface BuildDailyPlanParams {
  items: readonly AnalyticsItem[];
  /** The Hub's own adaptive plan for today (buildAdaptivePracticePlan), read
   *  for its due count and its reinforcement/goal-fill items. */
  adaptivePlan: DailyPracticePlan;
  assignmentCards: readonly StudentAssignmentCard[];
  now: number;
  preferences?: PlanPreferences;
  /** Steps the student skipped today (plan-local; never touches learning data). */
  skippedStepIds?: readonly string[];
  /** Anonymous community bands by question id — tie-breaker only. */
  communityBandByQuestionId?: ReadonlyMap<string, CommunityBand>;
}

function topicKey(subject: string, topic: string): string {
  return `${subject}|${topic}`;
}

function workedToday(item: AnalyticsItem, now: number): boolean {
  return Number.isFinite(item.lastReviewedAt) && item.lastReviewedAt > 0 && isSameLocalDay(item.lastReviewedAt, now);
}

function isDue(item: AnalyticsItem, now: number): boolean {
  return item.status !== "mastered" && Number.isFinite(item.nextReviewAt) && item.nextReviewAt <= now;
}

const BAND_RANK: Readonly<Record<CommunityBand, number>> = {
  challenging: 0,
  average: 1,
  light: 2,
  insufficient: 3,
};

function communityRank(
  questionIds: readonly string[],
  bands: ReadonlyMap<string, CommunityBand> | undefined,
): number {
  if (!bands) return BAND_RANK.insufficient;
  let best = BAND_RANK.insufficient;
  for (const id of questionIds) {
    const band = bands.get(id);
    if (band !== undefined) best = Math.min(best, BAND_RANK[band]);
  }
  return best;
}

function questionWord(count: number): string {
  return `${count} soru`;
}

interface RevisitGroup {
  subject: string;
  topic: string;
  /** Due, pending archive questions in this topic, deterministic order. */
  questionIds: string[];
  /** Total struggle evidence across those questions (real counts only). */
  struggleTotal: number;
  /** All pending archive questions in the topic, due or not. */
  pendingTotal: number;
}

/** Tier 1 — archived questions whose review is due, grouped by topic. */
function buildRevisitGroups(items: readonly AnalyticsItem[], now: number): RevisitGroup[] {
  const groups = new Map<string, RevisitGroup>();
  for (const item of items) {
    if (resolveArchiveState(item) !== "pending") continue;
    if (!item.subject || !item.topic) continue;
    const key = topicKey(item.subject, item.topic);
    let group = groups.get(key);
    if (!group) {
      group = { subject: item.subject, topic: item.topic, questionIds: [], struggleTotal: 0, pendingTotal: 0 };
      groups.set(key, group);
    }
    group.pendingTotal += 1;
    if (!isDue(item, now)) continue;
    group.questionIds.push(item.questionId);
    group.struggleTotal += item.outcomeHistory?.struggledCount ?? 1;
  }
  const result: RevisitGroup[] = [];
  for (const group of groups.values()) {
    if (group.questionIds.length === 0) continue;
    group.questionIds.sort();
    result.push(group);
  }
  return result;
}

function focusRank(subject: string, preferences: PlanPreferences): number {
  return preferences.focusSubjects.includes(subject) ? 0 : 1;
}

export function buildDailyPlan(params: BuildDailyPlanParams): DailyPlan {
  const { items, adaptivePlan, assignmentCards, now } = params;
  const preferences: PlanPreferences = {
    maxSteps: clampPlanSteps(params.preferences?.maxSteps ?? DEFAULT_PLAN_STEPS),
    focusSubjects: params.preferences?.focusSubjects ?? [],
  };
  const skipped = new Set(params.skippedStepIds ?? []);
  const claimed = new Set<string>();
  const claimedTopics = new Set<string>();
  const itemById = new Map(items.map((item) => [item.questionId, item] as const));
  const candidates: Omit<PlanStep, "state" | "workedToday">[] = [];

  // ── 1. revisit ──────────────────────────────────────────────────────────
  const revisitGroups = buildRevisitGroups(items, now).sort((a, b) => {
    const focus = focusRank(a.subject, preferences) - focusRank(b.subject, preferences);
    if (focus !== 0) return focus;
    if (a.questionIds.length !== b.questionIds.length) return b.questionIds.length - a.questionIds.length;
    if (a.struggleTotal !== b.struggleTotal) return b.struggleTotal - a.struggleTotal;
    const community =
      communityRank(a.questionIds, params.communityBandByQuestionId) -
      communityRank(b.questionIds, params.communityBandByQuestionId);
    if (community !== 0) return community;
    return topicKey(a.subject, a.topic).localeCompare(topicKey(b.subject, b.topic), "tr");
  });
  for (const group of revisitGroups.slice(0, MAX_REVISIT_STEPS)) {
    const questionIds = group.questionIds.slice(0, MAX_QUESTIONS_PER_REVISIT_STEP);
    for (const id of questionIds) claimed.add(id);
    claimedTopics.add(topicKey(group.subject, group.topic));
    candidates.push({
      id: `revisit:${topicKey(group.subject, group.topic)}`,
      kind: "revisit",
      subject: group.subject,
      topic: group.topic,
      questionIds,
      workload: `Çözemediğin ${questionWord(questionIds.length)}`,
      reason:
        questionIds.length === 1
          ? "Bu soruyu daha önce çözememiştin; tekrar zamanı geldi."
          : `Bu ${questionIds.length} soruyu daha önce çözememiştin; tekrar zamanları geldi.`,
      target: { kind: "archive", subject: group.subject, topic: group.topic },
    });
  }

  // ── 2. review ───────────────────────────────────────────────────────────
  // The scheduler's own due verdict, minus the questions tier 1 already
  // took. The review session re-fetches the real due set itself; this step
  // is the count and the reason, never a second queue.
  let remainingDue = 0;
  for (const item of items) if (isDue(item, now) && !claimed.has(item.questionId)) remainingDue += 1;
  if (remainingDue > 0) {
    candidates.push({
      id: "review:due",
      kind: "review",
      subject: "",
      topic: "",
      questionIds: [],
      workload: questionWord(remainingDue),
      reason: `Tekrar zamanı gelen ${questionWord(remainingDue)} var.`,
      target: { kind: "review_session" },
    });
  }

  // ── 3 & 4. reinforce / recover — Phase 70's reading of each topic ───────
  const map = buildConceptMasteryMap({ items, now });
  const concepts: ConceptNode[] = map.subjects.flatMap((region) => region.concepts);
  const adaptiveTopics = new Set(
    adaptivePlan.planItems.map((item) => topicKey(item.subject, item.topic)),
  );

  function topicQuestionIds(node: ConceptNode): string[] {
    return items
      .filter((item) => item.subject === node.subject && item.topic === node.topic && !claimed.has(item.questionId))
      .map((item) => item.questionId)
      .sort();
  }

  function targetFor(node: ConceptNode, questionIds: readonly string[]): PlanStepTarget | null {
    if (adaptiveTopics.has(topicKey(node.subject, node.topic))) return { kind: "adaptive_session" };
    // Prefer a question not yet worked on today, then the first by id.
    const fresh = questionIds.find((id) => {
      const item = itemById.get(id);
      return item !== undefined && !workedToday(item, now);
    });
    const questionId = fresh ?? questionIds[0];
    return questionId ? { kind: "question", questionId } : null;
  }

  const byFocusThenName = (a: ConceptNode, b: ConceptNode) => {
    const focus = focusRank(a.subject, preferences) - focusRank(b.subject, preferences);
    if (focus !== 0) return focus;
    if (a.questionCount !== b.questionCount) return b.questionCount - a.questionCount;
    return topicKey(a.subject, a.topic).localeCompare(topicKey(b.subject, b.topic), "tr");
  };

  const attention = concepts
    .filter((node) => node.presentation === "needs_attention" && !claimedTopics.has(topicKey(node.subject, node.topic)))
    .sort(byFocusThenName);
  for (const node of attention.slice(0, 1)) {
    const questionIds = topicQuestionIds(node);
    const target = targetFor(node, questionIds);
    if (!target) continue;
    claimedTopics.add(topicKey(node.subject, node.topic));
    candidates.push({
      id: `reinforce:${topicKey(node.subject, node.topic)}`,
      kind: "reinforce",
      subject: node.subject,
      topic: node.topic,
      questionIds,
      workload: "Konu tekrarı",
      reason: "Bu konuda tekrar eden zorlanma sinyali var.",
      target,
    });
  }

  const recovering = concepts
    .filter((node) => node.presentation === "recovering" && !claimedTopics.has(topicKey(node.subject, node.topic)))
    .sort(byFocusThenName);
  for (const node of recovering.slice(0, 1)) {
    const questionIds = topicQuestionIds(node);
    const target = targetFor(node, questionIds);
    if (!target) continue;
    claimedTopics.add(topicKey(node.subject, node.topic));
    candidates.push({
      id: `recover:${topicKey(node.subject, node.topic)}`,
      kind: "recover",
      subject: node.subject,
      topic: node.topic,
      questionIds,
      workload: "Kısa tekrar",
      reason: "Bu konu toparlanıyor; kısa bir tekrar planlandı.",
      target,
    });
  }

  // ── 5. assignment ───────────────────────────────────────────────────────
  const openAssignments = assignmentCards
    .filter((card) => card.status !== "completed")
    .sort((a, b) => {
      const focus = focusRank(a.assignment.subject, preferences) - focusRank(b.assignment.subject, preferences);
      if (focus !== 0) return focus;
      const dueA = a.assignment.dueAt ?? Number.MAX_SAFE_INTEGER;
      const dueB = b.assignment.dueAt ?? Number.MAX_SAFE_INTEGER;
      if (dueA !== dueB) return dueA - dueB;
      return a.assignment.id.localeCompare(b.assignment.id);
    });
  for (const card of openAssignments.slice(0, 1)) {
    const remaining = Math.max(0, card.assignment.targetCount - (card.submission?.completedCount ?? 0));
    const due = assignmentDueLabel(card.assignment.dueAt, now);
    candidates.push({
      id: `assignment:${card.assignment.id}`,
      kind: "assignment",
      subject: card.assignment.subject,
      topic: card.assignment.topic,
      questionIds: [],
      workload: remaining > 0 ? questionWord(remaining) : "Atanan çalışma",
      reason: `Bu çalışma öğretmenin tarafından atandı${due ? ` · ${due}` : ""}.`,
      target: { kind: "assignment", assignmentId: card.assignment.id },
    });
  }

  // ── 6. practice ─────────────────────────────────────────────────────────
  const goalFill = adaptivePlan.planItems.filter((item) => item.reason === "goal_fill");
  if (candidates.length < preferences.maxSteps && adaptivePlan.remainingGoal > 0 && goalFill.length > 0) {
    const subject = goalFill.find((item) => item.subject)?.subject ?? "";
    candidates.push({
      id: "practice:goal",
      kind: "practice",
      subject,
      topic: "",
      questionIds: [],
      workload: questionWord(Math.min(goalFill.length, adaptivePlan.remainingGoal)),
      reason: `Günlük hedefin için ${questionWord(adaptivePlan.remainingGoal)} kaldı.`,
      target: { kind: "adaptive_session" },
    });
  }

  // ── capacity + state ────────────────────────────────────────────────────
  const steps: PlanStep[] = candidates.slice(0, preferences.maxSteps).map((candidate) => {
    const tracked = candidate.questionIds.length > 0;
    const worked = tracked
      ? candidate.questionIds.filter((id) => {
          const item = itemById.get(id);
          return item !== undefined && workedToday(item, now);
        }).length
      : null;
    return { ...candidate, workedToday: worked, state: resolveStepState(candidate, worked, skipped, { adaptivePlan, assignmentCards, now, items }) };
  });

  const completedCount = steps.filter((step) => step.state === "completed").length;
  const skippedCount = steps.filter((step) => step.state === "skipped").length;
  let revisitTotal = 0;
  let revisitWorkedToday = 0;
  for (const step of steps) {
    if (step.kind !== "revisit") continue;
    revisitTotal += step.questionIds.length;
    revisitWorkedToday += step.workedToday ?? 0;
  }

  return {
    dayKey: localDayKey(now),
    steps,
    completedCount,
    skippedCount,
    remainingCount: steps.length - completedCount - skippedCount,
    isComplete: steps.length > 0 && completedCount + skippedCount === steps.length && completedCount > 0,
    isEvidenceBased: steps.some((step) => step.kind !== "assignment" && step.kind !== "practice"),
    revisitTotal,
    revisitWorkedToday,
  };
}

/** A step is "completed" only when recorded evidence says so — never by a
 *  tap. Revisit/reinforce/recover: every tracked question (or, for a topic
 *  step, at least one) was worked on today. Review: nothing is due any more.
 *  Assignment: the submission is complete. Practice: the goal is met.
 *  "skipped" is plan-local and never touches learning data. */
function resolveStepState(
  step: Omit<PlanStep, "state" | "workedToday">,
  worked: number | null,
  skipped: ReadonlySet<string>,
  context: {
    adaptivePlan: DailyPracticePlan;
    assignmentCards: readonly StudentAssignmentCard[];
    now: number;
    items: readonly AnalyticsItem[];
  },
): PlanStepState {
  let completed = false;
  switch (step.kind) {
    case "revisit":
      completed = worked !== null && step.questionIds.length > 0 && worked >= step.questionIds.length;
      break;
    case "reinforce":
    case "recover":
      completed = worked !== null && worked > 0;
      break;
    case "review":
      completed = !context.items.some((item) => isDue(item, context.now));
      break;
    case "assignment": {
      const id = step.target.kind === "assignment" ? step.target.assignmentId : "";
      completed = context.assignmentCards.some((card) => card.assignment.id === id && card.status === "completed");
      break;
    }
    case "practice":
      completed = context.adaptivePlan.isGoalComplete;
      break;
  }
  if (completed) return "completed";
  return skipped.has(step.id) ? "skipped" : "pending";
}

/** The next step the student should open: the first pending one. */
export function nextPendingStep(plan: DailyPlan): PlanStep | null {
  return plan.steps.find((step) => step.state === "pending") ?? null;
}

// ── Completion facts — only things that happened ──────────────────────────

/** Sentences for the completed-step and completed-plan states. Each names a
 *  real count; a fact with nothing behind it is simply not in the list. */
export function stepCompletionFacts(step: PlanStep): string[] {
  const facts: string[] = [];
  switch (step.kind) {
    case "revisit":
      if ((step.workedToday ?? 0) > 0) {
        facts.push(`çözemediğin ${step.workedToday} soruya yeniden çalıştın`);
      }
      break;
    case "reinforce":
    case "recover":
      facts.push("konu tekrarı yapıldı");
      if ((step.workedToday ?? 0) > 0) facts.push(`bu konuda ${step.workedToday} soru çalışıldı`);
      break;
    case "review":
      facts.push("tekrar zamanı gelen sorular çalışıldı");
      break;
    case "assignment":
      facts.push("atanan çalışma tamamlandı");
      break;
    case "practice":
      facts.push("günlük hedefe ulaşıldı");
      break;
  }
  return facts;
}

export function planCompletionSentence(plan: DailyPlan): string {
  const parts = [`Bugün ${plan.completedCount} adımı tamamladın.`];
  if (plan.revisitTotal > 0) {
    parts.push(`Çözemediğin ${plan.revisitTotal} sorudan ${plan.revisitWorkedToday} tanesine yeniden çalıştın.`);
  }
  return parts.join(" ");
}

// ── Archive-derived helper for the step screen ────────────────────────────

/** How many of this step's revisit questions are still pending in the
 *  archive right now — so a step never keeps claiming "çözemediğin" about a
 *  question the student has since provably solved. */
export function pendingRevisitCount(step: PlanStep, items: readonly AnalyticsItem[]): number {
  if (step.kind !== "revisit") return 0;
  const archive = buildQuestionArchive(items);
  const pending = new Set(archive.filter((entry) => entry.state === "pending").map((entry) => entry.questionId));
  return step.questionIds.filter((id) => pending.has(id)).length;
}
