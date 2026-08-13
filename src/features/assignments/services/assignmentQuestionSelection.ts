import { Question } from "@/types/question";

// Deterministic question selection for a new assignment. `pool` is assumed
// to already be scoped to the target class's own 'class'-visibility
// questions (getClassQuestionsPage already guarantees this — see
// useAssignmentQuestionPool.ts) — this function does not re-check
// visibility/classId itself, only ranks and picks WITHIN that pool.
//
// Subject is a HARD filter, not a scored criterion: an assignment is
// explicitly about one subject (the teacher chose it), so a question from
// a different subject is never eligible at all — unlike the daily
// practice plan's goal_fill tier, which deliberately widens to "anything
// active" once better matches run out, an assignment must never silently
// substitute unrelated content for what the teacher asked for.
export interface QuestionSelectionCriteria {
  subject: string;
  topic: string;
  gradeLevel: string;
}

// Higher = better match. -1 = ineligible (wrong subject).
function matchScore(question: Question, criteria: QuestionSelectionCriteria): number {
  if (question.subject !== criteria.subject) return -1;
  let score = 0;
  if (question.topic === criteria.topic) score += 2;
  if (question.gradeLevel === criteria.gradeLevel) score += 1;
  return score;
}

// Returns up to `targetCount` question ids, best-matching first. Returns
// FEWER than requested (never padded, never invented) if the pool doesn't
// have enough eligible questions — the caller is responsible for telling
// the teacher when that happened (see assignmentCreation.ts's
// validateAssignmentDraft, which checks the ACTUAL selected count, not the
// originally requested one).
export function selectAssignmentQuestions(
  pool: readonly Question[],
  criteria: QuestionSelectionCriteria,
  targetCount: number,
): string[] {
  // First-occurrence-wins dedupe by id — defensive against a caller
  // accidentally passing an already-merged/overlapping page.
  const dedupedById = new Map<string, Question>();
  for (const question of pool) {
    if (!dedupedById.has(question.id)) dedupedById.set(question.id, question);
  }

  const eligible = [...dedupedById.values()]
    .map((question) => ({ question, score: matchScore(question, criteria) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      // Deterministic tiebreak within the same score: newest first, id as
      // the final, always-unique tiebreak — same reasoning
      // dailyPracticePlan.ts's compareByReviewOrder documents.
      if (a.question.createdAt !== b.question.createdAt) return b.question.createdAt - a.question.createdAt;
      return a.question.id.localeCompare(b.question.id);
    });

  const safeTargetCount = Number.isFinite(targetCount) && targetCount > 0 ? Math.floor(targetCount) : 0;
  return eligible.slice(0, safeTargetCount).map((entry) => entry.question.id);
}
