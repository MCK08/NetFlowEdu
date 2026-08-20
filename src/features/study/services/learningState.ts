import { StudyOutcome, StudyStatus } from "../domain/studyTypes";
import { OutcomeHistory } from "./outcomeCounters";

// Phase 42 — what ONE question's recorded history says about the student's
// grip on it. Pure and Firebase/React-free, and shaped exactly like its two
// sibling classifiers (topicMastery.ts's MasteryBand, recencySignal.ts's
// RecencySignal): a small closed union produced by an ordered set of
// structural checks, never a score or a tunable percentage.
//
// WHY THIS EXISTS
//
// Phase 41 started recording cumulative per-outcome counters, but nothing
// read the struggle EVENTS. A teacher looking at a student who had failed
// the same question eight times in a row saw only "low success rate, 1 weak
// question" — indistinguishable from a student who failed four different
// questions once each. Those need different responses, so the difference
// has to be visible.
//
// WHAT COUNTS AS A STRUGGLE HERE
//
// `struggledCount` only — deliberately NOT struggled + again. "Tekrar Et"
// (again) is the student asking to see a card again in ten minutes; the
// scheduler itself treats it differently from "Zorlandım" (a one-day
// setback, see reviewScheduler.ts). It is also the convention Phase 41's
// TopicInsight.struggledAttemptCount and the student-facing "N kez
// zorlandın" copy already use, so classifying on the same field keeps one
// meaning of "zorlanma" across both sides of the product instead of a
// second, teacher-only one.

export type LearningState =
  // Reported difficulty on this question more than once and has not since
  // shown it is resolved.
  | "persistent_struggle"
  // A real struggle history, but the most recent outcome was a solve and
  // that success is currently standing.
  | "recovering"
  // Enough recorded success, with no unresolved struggle pattern.
  | "stable"
  // Exactly one struggled outcome ever — a slip, not a pattern.
  | "one_off_struggle"
  // Cannot say: the item predates the cumulative counters, or there is too
  // little recorded evidence to make any claim at all.
  | "insufficient_data";

// How many recorded outcomes before a POSITIVE claim ("stable") is
// trustworthy. Same bar assignmentOutcomeInsights.ts already uses for
// MIN_OUTCOMES_FOR_TOPIC_SIGNAL and the review scheduler uses for
// MASTERY_MIN_SUCCESSFUL_REVIEWS — "one success out of one attempt" is the
// thin sample the teacher dashboard used to render as a confident 100%.
export const MIN_OUTCOMES_FOR_CONFIDENT_STATE = 3;

// "Repeated" starts at two. Taken verbatim from the reasoning
// assignmentFollowUp.ts already documents for its own
// MIN_OUTCOMES_FOR_STRUGGLE_SIGNAL: a single struggled outcome is not
// "repeated". Deliberately NOT a ratio — on a single question, failing it
// twice is a pattern regardless of how many times it was also solved,
// which is why the recovery check below (not a threshold) is what
// separates "still stuck" from "got past it".
export const REPEATED_STRUGGLE_MIN_EVENTS = 2;

export interface LearningStateInput {
  // null for a pre-Phase-41 item — see outcomeCounters.ts's completeness
  // rule. Never substitute zeros: absent history is not a history of zero
  // struggles.
  history: OutcomeHistory | null;
  lastOutcome: StudyOutcome;
  // The SERVER's own mastery verdict (reviewScheduler.ts). Deferred to
  // rather than re-derived, exactly as topicMastery.ts defers to it.
  status: StudyStatus;
  // Scheduler streak state: > 0 means at least one solve is currently
  // standing (an "again" resets it to zero, a "struggled" decrements it).
  // Used ONLY as the boolean "is a success currently standing" — never
  // summed or read as a success count.
  successfulReviews: number;
}

// Ordered checks, first match wins — the same shape buildTopicMastery uses,
// so there is exactly one path to every state and the result is trivially
// traceable from the inputs.
export function buildLearningState(input: LearningStateInput): LearningState {
  const history = input.history;

  // 1 — nothing trustworthy to reason from. A legacy item lands here and
  // must never be classified as struggling or recovering on the strength of
  // counters it does not have.
  if (!history || history.knownOutcomeCount === 0) return "insufficient_data";

  // 2 — the server says this question is mastered. That verdict already
  // requires a standing run of successes over a long interval, so it
  // outranks any older struggle history.
  if (input.status === "mastered") return "stable";

  // 3 — never struggled. Still needs enough recorded outcomes before
  // calling it stable, otherwise "solved it once" reads as a track record.
  if (history.struggledCount === 0) {
    return history.knownOutcomeCount >= MIN_OUTCOMES_FOR_CONFIDENT_STATE
      ? "stable"
      : "insufficient_data";
  }

  // 4 — a single struggle is a slip, whatever else is true.
  if (history.struggledCount < REPEATED_STRUGGLE_MIN_EVENTS) return "one_off_struggle";

  // 5 — repeated struggle, but the student has since solved it and that
  // solve is still standing. Real evidence of climbing back out, not a
  // guess: both conditions come straight off the item.
  if (input.lastOutcome === "solved" && input.successfulReviews > 0) return "recovering";

  // 6 — repeated struggle with no standing recovery.
  return "persistent_struggle";
}
