import type { StudentAssignmentCard } from "@features/assignments/hooks/useStudentAssignments";
import { Question } from "@/types/question";

import { QuestionSignal, tierOf } from "./feedRanking";

// Phase 109 — the last, purely presentational pass over the ranked feed.
//
// buildQuestionFeedRanking decides PRIORITY (due → struggled → assigned →
// weak topic → discovery → developed) and is left exactly as it is. This
// file decides only how that priority is laid out along a vertical pager
// so a student does not meet the same topic five pages in a row, or twenty
// struggle questions before anything else. It never adds a question, never
// drops one, never changes which tier a question belongs to, and is
// deterministic — the same input always yields the same order.

/** Question ids inside the caller's OPEN assignments (status not completed). */
export function assignedQuestionIds(cards: readonly StudentAssignmentCard[]): Set<string> {
  const ids = new Set<string>();
  for (const card of cards) {
    if (card.status === "completed") continue;
    for (const id of card.assignment.questionIds ?? []) ids.add(id);
  }
  return ids;
}

/** The per-question signals with `isAssigned` set from the assignment ids.
 *  A question with no study item at all still gets an entry, so an assigned
 *  question the student never opened can rank as assigned rather than as a
 *  plain discovery item. */
export function withAssignmentSignals(
  signals: ReadonlyMap<string, QuestionSignal>,
  assigned: ReadonlySet<string>,
): Map<string, QuestionSignal> {
  const next = new Map(signals);
  for (const id of assigned) {
    const existing = next.get(id);
    next.set(
      id,
      existing
        ? { ...existing, isAssigned: true }
        : { isDue: false, lastOutcome: null, masteryBand: null, recency: null, isAssigned: true },
    );
  }
  return next;
}

function topicKey(question: Question): string {
  return `${question.subject}|${question.topic}`;
}

/** At most this many consecutive pages on one topic, and at most this many
 *  consecutive pages from the struggle tier, before a different one is
 *  brought forward. Small on purpose: this spreads, it does not shuffle. */
export const MAX_CONSECUTIVE_SAME_TOPIC = 2;
export const MAX_CONSECUTIVE_STRUGGLE = 3;

const NO_SIGNAL: QuestionSignal = { isDue: false, lastOutcome: null, masteryBand: null, recency: null };

/** Spreads an already-ranked list. Walks the list in order; when the next
 *  candidate would extend a run past the limits above, the first later
 *  candidate that breaks the run is pulled forward instead. Ties keep rank
 *  order, duplicates by id are dropped (first occurrence wins). */
export function composeFeedOrder(
  ranked: readonly Question[],
  signals: ReadonlyMap<string, QuestionSignal>,
): Question[] {
  const remaining: Question[] = [];
  const seen = new Set<string>();
  for (const question of ranked) {
    if (seen.has(question.id)) continue;
    seen.add(question.id);
    remaining.push(question);
  }

  const result: Question[] = [];
  let topicRun = 0;
  let struggleRun = 0;
  let lastTopic: string | null = null;

  const isStruggle = (question: Question) => tierOf(signals.get(question.id) ?? NO_SIGNAL) === 1;

  while (remaining.length > 0) {
    let pick = 0;
    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i] as Question;
      const sameTopic = lastTopic !== null && topicKey(candidate) === lastTopic && candidate.topic !== "";
      const extendsTopicRun = sameTopic && topicRun >= MAX_CONSECUTIVE_SAME_TOPIC;
      const extendsStruggleRun = isStruggle(candidate) && struggleRun >= MAX_CONSECUTIVE_STRUGGLE;
      if (!extendsTopicRun && !extendsStruggleRun) {
        pick = i;
        break;
      }
    }
    const [next] = remaining.splice(pick, 1) as [Question];
    const key = topicKey(next);
    topicRun = lastTopic === key && next.topic !== "" ? topicRun + 1 : 1;
    struggleRun = isStruggle(next) ? struggleRun + 1 : 0;
    lastTopic = key;
    result.push(next);
  }
  return result;
}
