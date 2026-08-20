// Phase 41 — the ONE place that decides what the cumulative per-question
// outcome counters mean. Pure, Firebase/React-free, directly unit-testable.
//
// WHY THIS EXISTS
//
// `successfulReviews` is the review scheduler's own state (see
// functions/src/study/reviewScheduler.ts): "struggled" decrements it and
// "again" resets it to zero, because its job is to decide how long the next
// interval may be. It was nevertheless being read as if it were a
// cumulative count of correct answers, which produced real, wrong,
// teacher-facing numbers — a student who answered solved/solved/solved/again
// stored successfulReviews 0 out of attemptCount 4 and was displayed as a 0%
// success rate, indistinguishable from a student who got everything wrong.
//
// The counters this module reads (solvedCount/struggledCount/againCount) are
// written by recordStudyOutcome's own transaction, are monotonic, and cover
// the CLOSED outcome union exactly once each — so their sum is the true
// number of outcomes recorded, and solvedCount over that sum is the true
// success rate.
//
// THE COMPLETENESS RULE
//
// Documents written before Phase 41 have no counters. Their next outcome
// starts a counter at 1 — which describes only the period since counting
// began, not the item's real history. Reporting that as the item's success
// rate would replace one wrong number with another, so this module refuses:
// counters are trusted ONLY when they account for every recorded attempt.
//
// That check needs no extra stored field. `attemptCount` already increments
// once per outcome, and so does exactly one counter, so:
//
//     solvedCount + struggledCount + againCount <= attemptCount   (always)
//
// with equality if and only if counting covered the item's entire life.
// Anything short of equality means earlier history exists that was never
// counted, and the honest answer is "unknown", never zero.

export interface OutcomeCounterSource {
  attemptCount: number;
  // null when the document predates Phase 41 — deliberately not 0, which
  // would be a claim ("this never happened") rather than an absence.
  solvedCount: number | null;
  struggledCount: number | null;
  againCount: number | null;
}

export interface OutcomeHistory {
  solvedCount: number;
  struggledCount: number;
  againCount: number;
  // The real denominator: every outcome the student actually recorded for
  // this question. Never an attempt count that includes uncounted history.
  knownOutcomeCount: number;
}

function counterValue(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function safeAttemptCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

// Reads one item's counters, or null when they cannot be trusted to
// describe its whole history. Null is a first-class, expected answer for
// every pre-Phase-41 item — callers must render it as "no data", never as 0.
export function resolveOutcomeHistory(item: OutcomeCounterSource): OutcomeHistory | null {
  const solvedCount = counterValue(item.solvedCount);
  const struggledCount = counterValue(item.struggledCount);
  const againCount = counterValue(item.againCount);
  if (solvedCount === null || struggledCount === null || againCount === null) return null;

  const knownOutcomeCount = solvedCount + struggledCount + againCount;
  if (knownOutcomeCount === 0) return null;

  // The completeness rule. A legacy item that has since recorded a few new
  // outcomes lands here — its counters are real but partial, and a partial
  // count presented as a rate would misrepresent the student.
  if (knownOutcomeCount !== safeAttemptCount(item.attemptCount)) return null;

  return { solvedCount, struggledCount, againCount, knownOutcomeCount };
}

// Aggregates several items into one honest success rate, 0-100.
//
// Returns null — never 0 — when no item has trustworthy history, which is
// the correct answer for a student whose items all predate Phase 41 and for
// one who has never studied at all. The existing UI already renders a null
// rate as "henüz veri yok"; this simply widens when that honest state
// applies.
export function buildSuccessRatePercent(
  histories: readonly (OutcomeHistory | null)[],
): number | null {
  let solved = 0;
  let known = 0;
  for (const history of histories) {
    if (!history) continue;
    solved += history.solvedCount;
    known += history.knownOutcomeCount;
  }
  if (known === 0) return null;
  return Math.round(Math.min(1, solved / known) * 100);
}

// Sums one counter across items, skipping every item whose history is not
// trustworthy. Returns null when NO item contributed — so a caller can tell
// "genuinely zero struggles" (0) apart from "we do not know" (null).
export function sumOutcomeCounter(
  histories: readonly (OutcomeHistory | null)[],
  counter: "solvedCount" | "struggledCount" | "againCount",
): number | null {
  let total = 0;
  let contributed = false;
  for (const history of histories) {
    if (!history) continue;
    contributed = true;
    total += history[counter];
  }
  return contributed ? total : null;
}
