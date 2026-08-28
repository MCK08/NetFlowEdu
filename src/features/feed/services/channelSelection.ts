import { Question } from "@/types/question";

import { QuestionSignal } from "./feedRanking";

// Phase 50 — which of the ALREADY-LOADED questions belong to a channel.
//
// Pure and deterministic. Every function here is a filter over questions
// the caller already holds, in exactly the same spirit as feedFilters.ts:
// a channel narrows what is shown, it never fetches (the caller decides
// which source to fetch from) and never invents metadata.

// "Zorlandıklarım" — questions the student has real, recorded struggle
// evidence on.
//
// EVIDENCE RULE (Phase 41/42 semantics, reused verbatim, not reimplemented)
//
// The only inputs are QuestionSignal.lastOutcome (the student's own last
// recorded outcome for that exact question) and isDue. A question with NO
// signal at all is a question the student has never studied — it is
// excluded, never counted as "not struggled": absence of evidence is not
// evidence of mastery, the same "absent is not zero" rule outcomeCounters.ts
// enforces for legacy counters. This is why a Student-D-like account (real
// attempts, no trustworthy counters) shows an honest empty channel here
// instead of a fabricated struggle list.
//
// "again" is deliberately NOT treated as a struggle, matching
// learningState.ts and interventionEffectiveness.ts's own documented rule
// ("again" is a request to see the card again shortly, not a report of
// difficulty). Only "struggled" counts.
export function selectStruggleQuestions(
  questions: readonly Question[],
  signalsByQuestionId: ReadonlyMap<string, QuestionSignal>,
): Question[] {
  return questions.filter((question) => {
    const signal = signalsByQuestionId.get(question.id);
    if (!signal) return false;
    return signal.lastOutcome === "struggled";
  });
}

// NOTE — there is deliberately no client-side "select class questions"
// helper here. "Derslerim"/"Sınıfım" scope their content at the QUERY level
// instead (useClassScopedQuestions → getClassQuestionsPage), because that is
// the one query shape firestore.rules can prove readable for a class member.
// Filtering the public feed down to class questions client-side would both
// miss class content the public feed never fetches and imply an access path
// the rules do not grant.

// "İçeriklerim" — questions this user owns. Exact ownerId match only.
export function selectOwnQuestions(
  questions: readonly Question[],
  uid: string | null | undefined,
): Question[] {
  if (!uid) return [];
  return questions.filter((question) => question.ownerId === uid);
}
