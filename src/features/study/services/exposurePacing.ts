// Phase 65 — spacing repeated exposure to the same concept, without ever
// touching learning priority.
//
// THE UNCOVERED SEAM THIS EXISTS FOR
//
// Phase 63/64 solved this for the REVIEW queue, where every entry on a page
// is a peer (see reviewSessionComposition.ts's own note on why reordering
// there is safe). The adaptive plan is different: its order carries real
// priority, which is exactly why Phase 63 deliberately left it alone.
//
// But the adaptive comparator's two STRONGEST keys — mastery and recency —
// are TOPIC-level signals (dailyPracticePlan.ts says so itself: "both are
// TOPIC-level signals; two questions in the same topic always share them").
// So every question in one topic necessarily ties on both, and when Phase
// 45's struggle counts and Phase 61's chronology also tie or are
// incomparable, the last word is `compareByReviewOrder` — nextReviewAt, then
// questionId ALPHABETICALLY. Alphabetical order has no relationship to
// concept diversity, so a tier can legitimately come out as A1 A2 A3 B1.
//
// That is a real gap, and it is the only one this module addresses.
//
// THE SAFETY PROPERTY, AND WHY IT IS STRUCTURAL RATHER THAN A PROMISE
//
// This never re-ranks anything. It sorts nothing. It takes an ALREADY-SORTED
// list plus the canonical ranking's own verdict on which candidates are
// interchangeable, and reorders only inside maximal runs of such peers.
//
// One subtlety matters enough to state here, because getting it wrong is
// silent in both directions. That verdict is NOT the sorting comparator
// itself: a sort comparator must impose a TOTAL order, so the caller's ends
// in an alphabetical questionId tie-break and never returns 0 for two
// distinct questions. Used as the oracle it would make every run a singleton
// and this whole module a no-op. What the caller passes instead is the
// comparator's REAL-PRIORITY half — every meaningful key, minus that
// arbitrary alphabetical tail. So the licence to reorder is precisely
// "nothing but coincidence of spelling separated these two".
//
// Two items in different runs can never swap, because a run boundary IS a
// non-zero comparator result. So:
//
//   · Phase 46 reinforcement can never be demoted for variety — a stronger
//     struggle history produces a non-zero delta, which is a run boundary.
//   · Phase 61 chronology can never be overridden — same reason.
//   · Phase 45 mastery/recency/struggle can never be overridden — same.
//   · Tier membership is untouched; tiers are decided before any of this.
//
// The guarantee therefore does not depend on this file being careful. It
// depends on the comparator, which is the canonical authority already.
//
// NO SCORES
//
// There is no fatigue score, no attention model, no exposure penalty and no
// tunable weight. The only decision is categorical: "is this candidate's
// concept the same as the one just placed, and is another concept available
// at equal priority?"

/** Reorders `items` so the same exposure key is not repeated back-to-back,
 *  but ONLY within runs the canonical comparator considers equivalent.
 *
 *  Deterministic by construction: runs are detected in the input's own order,
 *  groups keep the order in which their first member appeared, members keep
 *  their order inside their group, and the result is a plain round-robin over
 *  those queues. The same input always produces the same output — no
 *  randomness, no unstable sort, no clock.
 *
 *  Returns a new array; `items` is never mutated. */
export function paceEquivalentExposure<T>(params: {
  // MUST already be sorted by `isEquivalent`'s comparator. Passing an
  // unsorted list is not unsafe — runs are simply detected between adjacent
  // pairs — but it would not be meaningful.
  items: readonly T[];
  // The concept identity two items share when they should not sit adjacent.
  // Returning null means "no resolvable concept", and such an item is treated
  // as its own unique concept rather than joining a shared unknown bucket:
  // lumping unrelated questions together would manufacture exactly the false
  // adjacency this exists to avoid. Mirrors reviewSessionComposition.ts's
  // `__ungrouped__` rule so the two surfaces agree on what "same topic" means.
  keyOf: (item: T) => string | null;
  // True when the canonical ranking considers these two interchangeable —
  // the real-priority half of the comparator that produced `items`' order,
  // NOT that comparator itself (see the note above). This is the ONLY licence
  // this function has to move anything.
  isEquivalent: (a: T, b: T) => boolean;
  // The concept the caller has already placed immediately before this list,
  // when there is one. Used so a run does not OPEN by repeating what the
  // student just saw — the same page-boundary idea Phase 64 introduced for
  // review pages, applied here across tier boundaries.
  previousKey?: string | null;
}): T[] {
  const { items, keyOf, isEquivalent } = params;
  if (items.length <= 1) return [...items];

  const result: T[] = [];
  let carriedKey = params.previousKey ?? null;

  let runStart = 0;
  for (let i = 1; i <= items.length; i += 1) {
    const atEnd = i === items.length;
    // A run ends the moment the comparator distinguishes two adjacent items.
    // Comparing against the run's FIRST member (not the previous one) keeps
    // equivalence transitive in the way the comparator intends: a run is a
    // set of mutual peers, not a chain of pairwise-similar neighbours.
    const stillEquivalent =
      !atEnd && isEquivalent(items[runStart] as T, items[i] as T);
    if (stillEquivalent) continue;

    const run = items.slice(runStart, i);
    const paced = paceRun(run, keyOf, carriedKey);
    result.push(...paced);

    const last = paced[paced.length - 1];
    if (last !== undefined) carriedKey = keyOf(last);
    runStart = i;
  }

  return result;
}

// Round-robin over the concepts present in ONE equivalence run.
function paceRun<T>(
  run: readonly T[],
  keyOf: (item: T) => string | null,
  previousKey: string | null,
): T[] {
  if (run.length <= 1) return [...run];

  const groups = new Map<string, T[]>();
  run.forEach((item, index) => {
    // The index keeps unresolvable-concept items unique and deterministic.
    const key = keyOf(item) ?? `__ungrouped__:${index}`;
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  });

  // Map preserves insertion order, so this is first-appearance order — which
  // keeps the run's canonical FIRST item first in the common case.
  const keys = [...groups.keys()];

  // Nothing to interleave: one concept, so the canonical order stands exactly
  // as it was. No filler is invented to manufacture spacing.
  if (keys.length === 1) return [...run];

  // The boundary rule: if this run would OPEN on the concept just placed, and
  // an alternative exists, that concept's group moves to the BACK of the
  // rotation. Delayed, never dropped — no candidate is starved.
  if (previousKey) {
    const clash = keys.indexOf(previousKey);
    if (clash !== -1) keys.push(...keys.splice(clash, 1));
  }

  const queues = keys.map((key) => [...(groups.get(key) as T[])]);
  const result: T[] = [];
  while (result.length < run.length) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next !== undefined) result.push(next);
    }
  }
  return result;
}
