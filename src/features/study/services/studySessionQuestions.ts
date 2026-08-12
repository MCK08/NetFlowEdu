import { PracticePlanItem } from "./dailyPracticePlan";
import { Question } from "@/types/question";

// Phase 28 — the ONLY new "session" logic this phase needed. Neither
// function computes priority, mastery, recency, or due-ness itself — that
// stays exactly buildAdaptivePracticePlan's (adaptive) and
// getDueStudyItemsPage/the review scheduler's (mandatory) job. This file
// only turns an already-prioritized list into the deduped Question[] a
// swipeable session screen renders, one question per page.

// Adaptive session: buildAdaptivePracticePlan's own planItems order
// (already tier + mastery/recency ranked — see dailyPracticePlan.ts) turned
// into the Question objects the session screen actually renders. A plan
// item whose question metadata failed to resolve (deleted, access
// revoked between the plan being built and the session opening) is
// skipped, never crashes and never renders a blank card.
export function toAdaptiveSessionQuestions(
  planItems: readonly PracticePlanItem[],
  questionsById: ReadonlyMap<string, Question | null>,
): Question[] {
  const seen = new Set<string>();
  const result: Question[] = [];
  for (const item of planItems) {
    if (seen.has(item.questionId)) continue;
    const question = questionsById.get(item.questionId);
    if (!question) continue;
    seen.add(item.questionId);
    result.push(question);
  }
  return result;
}
