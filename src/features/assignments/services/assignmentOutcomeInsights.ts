import { Assignment, AssignmentSubmission } from "../domain/assignmentTypes";

// Phase 31 — reads ONLY what's already fetched for AssignmentDetailScreen
// (the assignment doc + its submissions subcollection, see
// useAssignmentDetail.ts: 3 reads total, none new). No Firebase, no React,
// no new signal source — every count below is a real, checkable fact about
// completedQuestionIds/questionOutcomes, never an invented score.
//
// Why per-question outcome can only be "attempted / struggled / solved /
// never attempted" and NOT a full attempt history: AssignmentSubmission
// only freezes the FIRST completion's outcome per question (see
// assignmentTypes.ts's questionOutcomes doc comment) — a student who
// re-attempts the same question later through their normal review queue
// does not change this record. That is deliberate (this is "what happened
// in this assignment", not "what is true about the student right now" —
// topicMastery.ts already owns that second question).

export interface AssignmentQuestionInsight {
  questionId: string;
  attemptedCount: number;
  struggledCount: number;
  successfulCount: number;
  neverAttemptedCount: number;
}

export type TopicOutcomeStatus = "still_weak" | "improving" | "resolved" | "insufficient_data";

export interface AssignmentTopicOutcome {
  topic: string;
  status: TopicOutcomeStatus;
  // The real fraction of recorded outcomes that were "again"/"struggled" —
  // null when there isn't enough data to trust it (see MIN_OUTCOMES_FOR_TOPIC_SIGNAL).
  struggleRate: number | null;
}

export type AssignmentEffectiveness = "effective" | "mixed" | "needs_follow_up" | "insufficient_data";

export interface AssignmentOutcomeInsights {
  targetStudentCount: number;
  completedStudentCount: number;
  attemptedStudentCount: number;
  completionRate: number | null;
  questionInsights: AssignmentQuestionInsight[];
  topicOutcome: AssignmentTopicOutcome;
  effectiveness: AssignmentEffectiveness;
}

// Below this many targeted students, any rate/status is noise, not signal —
// matches studentAttention.ts's own "a real sample, not any struggle at
// all" MIN_RECENT_SAMPLE_FOR_STRUGGLE_SIGNAL reasoning, applied here to a
// cohort instead of a single student's review history.
const MIN_STUDENTS_FOR_INSIGHT = 3;
// Below this many recorded per-question outcomes, a topic-level struggle
// rate is not trusted (one struggled outcome out of one is not "the topic
// is still weak").
const MIN_OUTCOMES_FOR_TOPIC_SIGNAL = 3;
const NEEDS_FOLLOW_UP_STRUGGLE_RATE = 0.4;
const EFFECTIVE_STRUGGLE_RATE = 0.15;
const EFFECTIVE_COMPLETION_RATE = 0.5;

function isStruggleOutcome(outcome: string): boolean {
  return outcome === "again" || outcome === "struggled";
}

export function buildAssignmentOutcomeInsights(params: {
  assignment: Pick<Assignment, "questionIds" | "targetStudentIds" | "topic" | "targetCount">;
  submissions: readonly AssignmentSubmission[];
}): AssignmentOutcomeInsights {
  const { assignment, submissions } = params;
  const targetStudentCount = assignment.targetStudentIds.length;

  const completedStudentCount = submissions.filter(
    (submission) => submission.completedCount >= assignment.targetCount && assignment.targetCount > 0,
  ).length;
  const attemptedStudentCount = submissions.filter((submission) => submission.completedCount > 0).length;
  const completionRate = targetStudentCount > 0 ? completedStudentCount / targetStudentCount : null;

  const questionInsights: AssignmentQuestionInsight[] = assignment.questionIds.map((questionId) => {
    let attemptedCount = 0;
    let struggledCount = 0;
    let successfulCount = 0;
    for (const submission of submissions) {
      const outcome = submission.questionOutcomes[questionId];
      if (outcome === undefined) continue;
      attemptedCount += 1;
      if (isStruggleOutcome(outcome)) struggledCount += 1;
      else successfulCount += 1;
    }
    return {
      questionId,
      attemptedCount,
      struggledCount,
      successfulCount,
      neverAttemptedCount: Math.max(0, targetStudentCount - attemptedCount),
    };
  });

  const totalOutcomes = questionInsights.reduce((sum, insight) => sum + insight.attemptedCount, 0);
  const totalStruggled = questionInsights.reduce((sum, insight) => sum + insight.struggledCount, 0);
  const struggleRate = totalOutcomes >= MIN_OUTCOMES_FOR_TOPIC_SIGNAL ? totalStruggled / totalOutcomes : null;

  const topicOutcome: AssignmentTopicOutcome = {
    topic: assignment.topic,
    status:
      struggleRate === null
        ? "insufficient_data"
        : struggleRate >= NEEDS_FOLLOW_UP_STRUGGLE_RATE
          ? "still_weak"
          : struggleRate <= EFFECTIVE_STRUGGLE_RATE
            ? "resolved"
            : "improving",
    struggleRate,
  };

  let effectiveness: AssignmentEffectiveness;
  if (targetStudentCount < MIN_STUDENTS_FOR_INSIGHT || struggleRate === null) {
    effectiveness = "insufficient_data";
  } else if (struggleRate >= NEEDS_FOLLOW_UP_STRUGGLE_RATE) {
    effectiveness = "needs_follow_up";
  } else if (struggleRate <= EFFECTIVE_STRUGGLE_RATE && (completionRate ?? 0) >= EFFECTIVE_COMPLETION_RATE) {
    effectiveness = "effective";
  } else {
    effectiveness = "mixed";
  }

  return {
    targetStudentCount,
    completedStudentCount,
    attemptedStudentCount,
    completionRate,
    questionInsights,
    topicOutcome,
    effectiveness,
  };
}
