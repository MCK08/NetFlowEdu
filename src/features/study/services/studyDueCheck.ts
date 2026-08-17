// Pure, tap-time re-check of "is anything actually due right now" — used to
// make the Learning Hub's "Çalışmaya Başla" routing decision trustworthy.
//
// dailyPracticePlan.ts's `plan.dueCount` is computed by useLearningInsights
// via a useMemo keyed on [items, summary...] — its `now` is evaluated at the
// moment that memo last recomputed (items changed, or a review was
// recorded), NOT at the moment the student actually presses the button.
// Between those two moments the Hub can sit idle for minutes, during which
// a review's own nextReviewAt can cross "now" purely from the clock ticking
// forward — nothing the student did. `plan.dueCount` never reflects that:
// it only changes when `items` itself changes. This module re-evaluates
// due-ness against a FRESH `now` at press time, using the exact same
// `items` the Hub already holds in memory — no new Firestore read, no
// second scheduler, no new engine.
export interface DueCheckItem {
  nextReviewAt: number | null | undefined;
}

// The ONE definition of "due" in this module — isAnythingDueNow and
// countDueNow must never be able to disagree with each other, nor with
// dailyPracticePlan.ts's own `item.nextReviewAt <= now` tier-1 predicate.
// Boundary is inclusive (nextReviewAt === now counts as due), matching that
// predicate exactly; this file only re-evaluates the same rule against a
// fresher clock reading.
function isDueNow(item: DueCheckItem, now: number): boolean {
  if (typeof item.nextReviewAt !== "number" || !Number.isFinite(item.nextReviewAt)) return false;
  return item.nextReviewAt <= now;
}

// True if at least one item's nextReviewAt has already passed `now`.
// Short-circuits — the caller only asked whether anything is due, not how
// much, so a long queue costs one comparison here.
export function isAnythingDueNow(items: readonly DueCheckItem[], now: number): boolean {
  for (const item of items) {
    if (isDueNow(item, now)) return true;
  }
  return false;
}

// Phase 39 — how MANY items are due against a fresh clock reading. Same
// inclusive boundary and same clock-freshness rationale as isAnythingDueNow;
// the recommendation surface needs the number, not just the predicate, and
// must not read it from plan.dueCount (a memoized snapshot — see this
// module's own header comment for why that number drifts).
export function countDueNow(items: readonly DueCheckItem[], now: number): number {
  let count = 0;
  for (const item of items) {
    if (isDueNow(item, now)) count += 1;
  }
  return count;
}

export type StudyStartTarget = "mandatory" | "adaptive" | "none";

// The single source of truth for what "Çalışmaya Başla" should open.
// Deliberately ignores any pre-computed dueCount snapshot — the live check
// is authoritative in BOTH directions: it can promote a session to
// "mandatory" the stale plan didn't know was due yet, and it can equally
// demote one to "adaptive" if the stale plan's due items have since been
// reviewed elsewhere (another tab, another device) and are no longer due.
export function resolveStudyStartTarget(params: {
  items: readonly DueCheckItem[];
  now: number;
  hasPlanItems: boolean;
}): StudyStartTarget {
  if (isAnythingDueNow(params.items, params.now)) return "mandatory";
  if (params.hasPlanItems) return "adaptive";
  return "none";
}
