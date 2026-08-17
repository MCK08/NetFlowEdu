import { StudentAssignmentCard } from "@features/assignments/hooks/useStudentAssignments";
import { pickNextAssignment, RankedAssignment } from "@features/assignments/services/assignmentUrgency";

import { DailyPracticePlan } from "./dailyPracticePlan";
import { TopicInsight } from "./learningInsights";
import { countDueNow, DueCheckItem } from "./studyDueCheck";

// Phase 39 — the Learning Hub's single answer to "Şimdi en mantıklı çalışma
// ne?". Pure, Firebase/React-free, deterministic: the same input always
// produces byte-identical output, which is what makes it directly testable
// without a clock, a network, or a renderer.
//
// This is NOT a second study engine. It does not schedule, score, rank
// questions, or fetch anything. It reads state the Study Hub ALREADY holds
// in memory (the study items, the plan buildAdaptivePracticePlan already
// produced, the weak topics buildLearningInsights already ranked, the
// assignment cards useStudentAssignments already loaded) and answers one
// question: of the surfaces that already exist, which single one should the
// student open right now, and what real recorded fact justifies it.
//
// Every field on the returned action is a real count or a real stored
// value. There is no score, no probability, no "AI suggests", and no
// invented denominator — nothing in the current schema could support one
// honestly (the same rule learningInsights.ts's own header states).
//
// PRIORITY, and why it is this order rather than the obvious one:
//
//  1. An IMMINENT assignment (due today/tomorrow) outranks a due review.
//     Not a preference — an asymmetry in the data. A due review never
//     expires: `nextReviewAt <= now` stays true until the student acts on
//     it, so postponing it costs nothing. A deadline is the only thing here
//     that can actually be lost by waiting.
//  2. Due reviews. The product's core loop: questions the student already
//     got wrong, resurfacing on schedule.
//  3. Any other incomplete assignment. Teacher-assigned accountability
//     outranks self-directed practice — but not the review loop, because
//     it is not going anywhere either. Past-due ranks LAST within this
//     tier, matching the judgment already encoded in useStudentAssignments'
//     sortForStudent.
//  4-6. The plan's own tiers, in the order dailyPracticePlan already
//     established (struggled/weak_topic before goal_fill). Never reordered
//     here: this module chooses which SURFACE to open, never which question.
//  7. A real weak topic when the plan is empty. `plan.planItems` is capped
//     by remainingGoal, so it empties the moment the daily goal is met —
//     which is exactly when the Hub used to fall silent. A weak topic still
//     has a real sampleQuestionId to open, so the answer stays honest
//     without touching the plan's cap or building anything new.
//  8. Nothing. Said plainly, never padded with invented work.

export type StudentNextActionKind =
  | "continue_assignment"
  | "due_review"
  | "struggled_topic"
  | "adaptive_practice"
  | "goal_fill"
  | "no_action";

// Every target is an EXISTING route the Hub already navigates to — this
// module adds no route and no screen (see StudyScreen's own openAssignment /
// startSession / startAdaptiveSession / handleOpen callbacks).
export type StudentNextActionTarget =
  | { kind: "assignment"; assignmentId: string }
  | { kind: "review_session" }
  | { kind: "adaptive_session" }
  | { kind: "question"; questionId: string }
  | { kind: "none" };

// Why there is nothing to do — three genuinely different situations that
// deserve three different sentences, all derived from real state.
export type NoActionReason =
  // The student met today's goal and nothing is due.
  | "goal_complete"
  // No study items and no assignments at all — a brand-new student.
  | "no_study_data"
  // Has history, but nothing is due, assigned, or left in the plan.
  | "nothing_pending";

export type StudentNextAction =
  | {
      kind: "continue_assignment";
      target: { kind: "assignment"; assignmentId: string };
      title: string;
      subject: string;
      topic: string;
      remainingCount: number;
      dueAt: number | null;
      isStarted: boolean;
      isPastDue: boolean;
    }
  | {
      kind: "due_review";
      target: { kind: "review_session" };
      dueCount: number;
    }
  | {
      kind: "struggled_topic";
      // Either the adaptive session (the plan has reinforcement items to
      // run) or the single most actionable question in the topic (the plan
      // is empty — see priority note 7).
      target: { kind: "adaptive_session" } | { kind: "question"; questionId: string };
      subject: string;
      topic: string;
      struggledCount: number;
    }
  | {
      kind: "adaptive_practice";
      target: { kind: "adaptive_session" };
      // Real reinforcement items in the plan whose question has no
      // resolvable subject/topic (a legacy question, per
      // learningInsights.ts's ""-for-legacy convention). Named as a count
      // precisely because there is no honest topic name to show.
      itemCount: number;
    }
  | {
      kind: "goal_fill";
      target: { kind: "adaptive_session" };
      itemCount: number;
      reviewedToday: number;
      dailyGoal: number;
    }
  | {
      kind: "no_action";
      target: { kind: "none" };
      reason: NoActionReason;
    };

export interface ResolveStudentNextActionParams {
  // The Hub's in-memory study items — used ONLY for the live due count and
  // for "does this student have any history at all". Typed as the minimal
  // DueCheckItem shape so this never accidentally grows a dependency on the
  // full insight item.
  items: readonly DueCheckItem[];
  plan: DailyPracticePlan;
  // buildLearningInsights' already-ranked weak topics — never re-ranked
  // here; a second weakness ranking is exactly the divergence-prone
  // duplication dailyPracticePlan.ts avoids by taking the same input.
  weakTopics: readonly TopicInsight[];
  assignmentCards: readonly StudentAssignmentCard[];
  // Must be a FRESH reading at decision time, not the memoized `now` the
  // plan was built with — see studyDueCheck.ts's header for why.
  now: number;
}

function toAssignmentAction(ranked: RankedAssignment): StudentNextAction {
  return {
    kind: "continue_assignment",
    target: { kind: "assignment", assignmentId: ranked.card.assignment.id },
    title: ranked.card.assignment.title,
    subject: ranked.card.assignment.subject,
    topic: ranked.card.assignment.topic,
    remainingCount: ranked.remainingCount,
    dueAt: ranked.card.assignment.dueAt,
    isStarted: ranked.isStarted,
    isPastDue: ranked.urgency === "past_due",
  };
}

// The weak topic the plan itself focused on, resolved back to its full
// insight so the copy can state a REAL struggled count rather than a bare
// name. Falls back to the top-ranked weak topic when the plan named no
// focus — both come from the same buildLearningInsights output, so they can
// never contradict each other.
function resolveFocusTopic(
  plan: DailyPracticePlan,
  weakTopics: readonly TopicInsight[],
): TopicInsight | null {
  if (plan.topicFocus) {
    const focus = plan.topicFocus;
    const matched = weakTopics.find(
      (topic) => topic.subject === focus.subject && topic.topic === focus.topic,
    );
    if (matched) return matched;
  }
  return weakTopics[0] ?? null;
}

function resolveNoActionReason(params: ResolveStudentNextActionParams): NoActionReason {
  if (params.items.length === 0 && params.assignmentCards.length === 0) return "no_study_data";
  if (params.plan.isGoalComplete) return "goal_complete";
  return "nothing_pending";
}

// The single entry point. Deterministic and side-effect free — calling it
// twice with the same input returns the same action, and it never mutates
// anything it is given.
export function resolveStudentNextAction(
  params: ResolveStudentNextActionParams,
): StudentNextAction {
  const now = Number.isFinite(params.now) ? params.now : Date.now();
  const nextAssignment = pickNextAssignment(params.assignmentCards, now);

  // 1 — the only obligation that can be irreversibly lost by waiting.
  if (nextAssignment && nextAssignment.urgency === "imminent") {
    return toAssignmentAction(nextAssignment);
  }

  // 2 — the core loop, re-checked against a fresh clock (never plan.dueCount).
  const dueCount = countDueNow(params.items, now);
  if (dueCount > 0) {
    return { kind: "due_review", target: { kind: "review_session" }, dueCount };
  }

  // 3 — remaining assignments, already ordered open-before-past-due.
  if (nextAssignment) {
    return toAssignmentAction(nextAssignment);
  }

  // 4/5/6 — the plan's own tiers. Guarded on planItems being non-empty
  // because the adaptive session resolves its questions from exactly this
  // array (useAdaptiveStudySession) — recommending it while empty would
  // open a session with nothing in it.
  const reinforceItems = params.plan.planItems.filter(
    (item) => item.reason === "struggled" || item.reason === "weak_topic",
  );

  if (reinforceItems.length > 0) {
    const focus = resolveFocusTopic(params.plan, params.weakTopics);
    if (focus) {
      return {
        kind: "struggled_topic",
        target: { kind: "adaptive_session" },
        subject: focus.subject,
        topic: focus.topic,
        struggledCount: focus.struggledCount,
      };
    }
    // Real reinforcement work with no nameable topic (legacy questions).
    // Surfaced as its own kind rather than mislabeled "goal_fill" or given
    // an invented topic name.
    return {
      kind: "adaptive_practice",
      target: { kind: "adaptive_session" },
      itemCount: reinforceItems.length,
    };
  }

  if (params.plan.planItems.length > 0) {
    return {
      kind: "goal_fill",
      target: { kind: "adaptive_session" },
      itemCount: params.plan.planItems.length,
      reviewedToday: params.plan.reviewedToday,
      dailyGoal: params.plan.dailyGoal,
    };
  }

  // 7 — the plan is empty (typically because the daily goal is met, which
  // zeroes its cap) but a real weakness remains. The topic's own
  // sampleQuestionId is already the "most actionable question here" pick
  // (learningInsights.ts), and the question route already exists.
  const weakest = params.weakTopics[0] ?? null;
  if (weakest && weakest.sampleQuestionId !== "") {
    return {
      kind: "struggled_topic",
      target: { kind: "question", questionId: weakest.sampleQuestionId },
      subject: weakest.subject,
      topic: weakest.topic,
      struggledCount: weakest.struggledCount,
    };
  }

  // 8 — genuinely nothing. Say so.
  return {
    kind: "no_action",
    target: { kind: "none" },
    reason: resolveNoActionReason({ ...params, now }),
  };
}
