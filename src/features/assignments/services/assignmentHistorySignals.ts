import { Assignment, AssignmentSubmission } from "../domain/assignmentTypes";
import { TargetedQuestionSignal } from "./smartAssignmentSelection";

// Phase 31 — feeds PAST assignment outcomes back into smartAssignmentSelection
// WITHOUT changing that file at all: it produces the exact same
// TargetedQuestionSignal shape buildTargetedQuestionSignals already
// produces from live studyItems (see smartAssignmentSelection.ts), so the
// caller (useCreateAssignment.ts) can simply merge the two maps before
// calling selectSmartAssignmentQuestions — no new scheduler, no second
// selection engine, no signature change.

// Bounded, same reasoning as assignmentQuestionPool.ts's own page ceiling —
// a small, real, most-recent slice, never "this class's entire assignment
// history".
export const MAX_HISTORY_ASSIGNMENTS = 5;

// Same-class, same-topic, real (non-draft) assignments, most recent first,
// excluding the one currently being drafted (it has no history of its
// own yet). getClassAssignments has no composite index on classId+topic —
// filtering here client-side avoids adding one (see Phase 31 audit §8).
export function selectRecentTopicAssignments(
  classAssignments: readonly Assignment[],
  topic: string,
  excludeAssignmentId: string | null,
): Assignment[] {
  return classAssignments
    .filter((assignment) => assignment.topic === topic && assignment.status !== "draft")
    .filter((assignment) => assignment.id !== excludeAssignmentId)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_HISTORY_ASSIGNMENTS);
}

// Aggregates each past assignment's questionOutcomes (frozen at completion
// time — see assignmentTypes.ts) into the same per-question shape as live
// signals. mostRecentReviewedAt uses the submission's own lastCompletedAt
// as the real timestamp of that outcome (accurate — this IS when the
// student actually completed that question, unlike trying to reuse a
// StudyItem timestamp which has no assignment linkage at all — see audit §2).
export function buildHistoricalQuestionSignals(
  historyAssignments: readonly Assignment[],
  submissionsByAssignmentId: ReadonlyMap<string, readonly AssignmentSubmission[]>,
): Map<string, TargetedQuestionSignal> {
  const map = new Map<string, TargetedQuestionSignal>();

  for (const assignment of historyAssignments) {
    const submissions = submissionsByAssignmentId.get(assignment.id) ?? [];
    for (const submission of submissions) {
      for (const [questionId, outcome] of Object.entries(submission.questionOutcomes)) {
        const previous = map.get(questionId) ?? {
          everAttemptedCount: 0,
          struggledCount: 0,
          mostRecentReviewedAt: null,
        };
        const mostRecentReviewedAt =
          submission.lastCompletedAt !== null
            ? Math.max(previous.mostRecentReviewedAt ?? -Infinity, submission.lastCompletedAt)
            : previous.mostRecentReviewedAt;
        map.set(questionId, {
          everAttemptedCount: previous.everAttemptedCount + 1,
          struggledCount: previous.struggledCount + (outcome === "again" || outcome === "struggled" ? 1 : 0),
          mostRecentReviewedAt,
        });
      }
    }
  }

  return map;
}

// Additive merge — a question with both live AND historical signal simply
// sums counts, keeping the most recent timestamp from either source.
// Never mutates either input map.
export function mergeQuestionSignals(
  live: ReadonlyMap<string, TargetedQuestionSignal>,
  historical: ReadonlyMap<string, TargetedQuestionSignal>,
): Map<string, TargetedQuestionSignal> {
  const merged = new Map<string, TargetedQuestionSignal>();
  const questionIds = new Set<string>([...live.keys(), ...historical.keys()]);

  for (const questionId of questionIds) {
    const a = live.get(questionId);
    const b = historical.get(questionId);
    const hasTimestamp = a?.mostRecentReviewedAt != null || b?.mostRecentReviewedAt != null;
    merged.set(questionId, {
      everAttemptedCount: (a?.everAttemptedCount ?? 0) + (b?.everAttemptedCount ?? 0),
      struggledCount: (a?.struggledCount ?? 0) + (b?.struggledCount ?? 0),
      mostRecentReviewedAt: hasTimestamp
        ? Math.max(a?.mostRecentReviewedAt ?? -Infinity, b?.mostRecentReviewedAt ?? -Infinity)
        : null,
    });
  }

  return merged;
}
