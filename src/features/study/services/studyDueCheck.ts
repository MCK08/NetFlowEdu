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

// True if at least one item's nextReviewAt has already passed `now`.
// Boundary is inclusive (nextReviewAt === now counts as due), matching
// dailyPracticePlan.ts's own `item.nextReviewAt <= now` tier-1 predicate —
// this must never disagree with that rule about what "due" means, only
// re-evaluate it against a fresher clock reading.
export function isAnythingDueNow(items: readonly DueCheckItem[], now: number): boolean {
  for (const item of items) {
    if (typeof item.nextReviewAt !== "number" || !Number.isFinite(item.nextReviewAt)) continue;
    if (item.nextReviewAt <= now) return true;
  }
  return false;
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
