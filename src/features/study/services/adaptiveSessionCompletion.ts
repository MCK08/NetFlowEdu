import { SessionOutcomeReceipt } from "./sessionReflection";

// Phase 68 — when an ADAPTIVE study session is genuinely finished.
//
// WHAT WAS ACTUALLY WRONG BEFORE
//
// The screen's completion test was `adaptive.questions.length === 0`, and
// `questions` is derived live from buildAdaptivePracticePlan. Two facts about
// that plan make the test mean something other than it reads:
//
//   1. The plan is capped by `Math.min(remainingGoal, MAX_PLAN_ITEMS)`, and
//      `remainingGoal` is `dailyGoal - reviewedToday` — where `reviewedToday`
//      arrives on a LIVE Firestore listener (useStudyQueue's
//      subscribeToStudySummary). So every confirmed outcome shrinks the plan
//      from the tail WHILE THE STUDENT IS IN IT.
//   2. Answering a question never removes it from the plan; the underlying
//      item list is not refetched mid-session.
//
// Together those mean the old signal fired when the student hit their DAILY
// GOAL, not when they finished the session — and when the goal was further
// away than the plan was long (three items, a goal of ten) it never fired at
// all: the student swiped past the last card into nothing.
//
// So "the list is empty" was never a completion boundary. This module builds a
// real one.
//
// THE CONTRACT
//
// A session commits at its start to a fixed set of question ids (the FROZEN
// plan, see activeStudySession.ts). It is complete when every one of those it
// can still open has exactly one CONFIRMED outcome — confirmed meaning the
// canonical write resolved, which is the same bar Phase 66 set for a receipt.
//
// WHAT CANNOT COMPLETE A SESSION
//
// Reaching the last card. Scrolling to the end. Pressing Back. A pending or
// failed write. None of those is evidence that work happened, and a closure
// summary is a claim about work that happened.

export interface AdaptiveSessionCompletion {
  /** Every openable planned entry has a confirmed outcome. */
  isComplete: boolean;
  /** Planned entries confirmed so far — the numerator of any progress read. */
  confirmedCount: number;
  /** Planned entries that still resolve to an openable question. */
  answerableCount: number;
  /** Everything the session froze at its start, openable or not. */
  plannedCount: number;
  /**
   * Planned entries that no longer resolve — deleted, or access lost between
   * the session starting and the student returning to it.
   *
   * These are excluded from the completion contract rather than counted as
   * done. Marking them complete would credit the student for work they never
   * did; leaving them required would deadlock the session at "2 / 3" with no
   * card left to answer, which is the exact bug Phase 38 fixed for
   * assignments (assignmentSessionCompletion.ts) and the same resolution is
   * used here for the same reason.
   */
  unavailableCount: number;
}

/** Which planned entries have a confirmed outcome.
 *
 *  Membership is by questionId, which is a sufficient identity here and is NOT
 *  assumed to be sufficient in general: the adaptive plan cannot contain one
 *  question twice (buildTieredPlan de-dupes its input, each tier claims what
 *  it takes so tiers cannot overlap, and toAdaptiveSessionQuestions de-dupes
 *  again before rendering), and the frozen list is normalised on top of that.
 *  A plan that could deliberately schedule the same question as two distinct
 *  entries would need a per-entry identity instead — see the phase doc. */
function confirmedPlannedIds(
  plannedQuestionIds: readonly string[],
  receipts: readonly SessionOutcomeReceipt[],
): Set<string> {
  const planned = new Set(plannedQuestionIds);
  const confirmed = new Set<string>();
  for (const receipt of receipts) {
    // A receipt for something this session never planned is ignored for
    // COMPLETION while still counting toward the reflection: answering an
    // extra question is real work, but it is not progress against this
    // session's own contract and must not be able to complete it early.
    if (planned.has(receipt.questionId)) confirmed.add(receipt.questionId);
  }
  return confirmed;
}

export function resolveAdaptiveSessionCompletion(params: {
  /** The session's frozen plan, in its own order. */
  plannedQuestionIds: readonly string[];
  /** Ids that currently resolve to a real, openable question. */
  resolvableQuestionIds: readonly string[];
  /** Confirmed outcomes for this session, in the order they were produced. */
  receipts: readonly SessionOutcomeReceipt[];
}): AdaptiveSessionCompletion {
  const planned = [...new Set(params.plannedQuestionIds)];
  const resolvable = new Set(params.resolvableQuestionIds);
  const answerable = planned.filter((id) => resolvable.has(id));
  const confirmed = confirmedPlannedIds(planned, params.receipts);
  const confirmedCount = answerable.filter((id) => confirmed.has(id)).length;

  return {
    // A session that planned nothing is NOT complete — it never started. That
    // is the separate empty state, which tells the student there is nothing
    // to practise rather than congratulating them for finishing nothing.
    isComplete: answerable.length > 0 && confirmedCount >= answerable.length,
    confirmedCount,
    answerableCount: answerable.length,
    plannedCount: planned.length,
    unavailableCount: planned.length - answerable.length,
  };
}

/** The first planned entry with no confirmed outcome, in the session's own
 *  order — where a resumed session should land.
 *
 *  Returns 0 when everything is done (the completion screen takes over) or
 *  when nothing is planned. */
export function resolveAdaptiveResumeIndex(params: {
  /** The questions actually on screen, in render order. */
  resolvableQuestionIds: readonly string[];
  receipts: readonly SessionOutcomeReceipt[];
}): number {
  const confirmed = new Set(params.receipts.map((receipt) => receipt.questionId));
  const index = params.resolvableQuestionIds.findIndex((id) => !confirmed.has(id));
  return index === -1 ? 0 : index;
}
