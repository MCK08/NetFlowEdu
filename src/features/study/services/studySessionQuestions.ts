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

// Phase 68 — the same resolution, driven by a FROZEN id list instead of a live
// plan.
//
// An adaptive session commits to its question ids when it starts and must keep
// working through exactly those, so after a refresh the questions are rebuilt
// from the frozen ids rather than from whatever the plan says now (the plan
// shrinks as the daily goal is consumed — see adaptiveSessionCompletion.ts).
//
// Same skip rule as above: an id that no longer resolves is left out rather
// than rendered blank, and the completion contract counts it as unavailable
// rather than done.
export function toFrozenSessionQuestions(
  questionIds: readonly string[],
  questionsById: ReadonlyMap<string, Question | null>,
): Question[] {
  const seen = new Set<string>();
  const result: Question[] = [];
  for (const questionId of questionIds) {
    if (seen.has(questionId)) continue;
    const question = questionsById.get(questionId);
    if (!question) continue;
    seen.add(questionId);
    result.push(question);
  }
  return result;
}
