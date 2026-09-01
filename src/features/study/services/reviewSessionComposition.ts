import { ResolvedQueueEntry } from "./studyService";

// Phase 63 — arranging an already-due page into a less repetitive order.
//
// WHAT THIS IS ALLOWED TO TOUCH
//
// Only the ORDER of entries the review query has already returned. It never
// decides what is due, never reads `nextReviewAt`, and never adds or removes
// an item: due-ness stays entirely with the server-authoritative scheduler
// (functions/src/study/reviewScheduler.ts) and the query in studyService.ts.
//
// WHY REORDERING HERE IS SAFE
//
// getDueStudyItemsPage orders by `nextReviewAt asc`, and its own comment
// explains why: a single-field range + orderBy on the SAME field is what
// Firestore indexes automatically, so the feature needs no index deployment.
// That ordering is chosen for index economy, not pedagogy — every item in the
// page is already due, and "became due five days ago" does not mean "matters
// more than one that became due two days ago". Phase 62 established and tested
// the same principle: elapsed time is context, not urgency.
//
// So within one page the entries are peers, and reordering them changes no
// priority. That equivalence is exactly the band this may act in.
//
// WHY THE ADAPTIVE SESSION IS DELIBERATELY NOT TOUCHED
//
// The adaptive session's order comes from buildAdaptivePracticePlan, which
// carries real priority: tier, mastery, recency, Phase 45 cumulative struggle
// and Phase 61 chronology. Interleaving there would demote genuinely stronger
// evidence to make a session look varied, which is the one thing this phase
// must not do. This module is only ever applied to the review queue.

// The ONE topic identity used by this module — both for grouping a page and
// for reading the previous page's trailing topic. A second key construction
// would let the two disagree about what "same topic" means.
//
// Subject and topic are joined with a separator neither field is expected to
// contain, and both are trimmed so " Denklemler" and "Denklemler" are one
// group rather than two.
//
// Returns null when the question is unavailable (deleted, or access revoked),
// because such an entry has no topic to reason about at all.
export function resolveTopicKey(entry: ResolvedQueueEntry): string | null {
  const question = entry.question;
  const subject = question?.subject?.trim() ?? "";
  const topic = question?.topic?.trim() ?? "";
  if (!subject || !topic) return null;
  return `${subject}|${topic}`;
}

function topicKeyOf(entry: ResolvedQueueEntry, index: number): string {
  // An entry with no resolvable topic becomes its own group rather than
  // joining a shared "unknown" bucket — lumping unrelated questions together
  // would create exactly the false adjacency this module exists to avoid. The
  // index keeps those singleton keys unique and deterministic.
  return resolveTopicKey(entry) ?? `__ungrouped__:${index}`;
}

/** The topic the session currently ENDS on, or null when there is none.
 *
 *  Phase 64 — derived from the already-merged session rather than stored
 *  anywhere, which is what keeps it correct for free across account switches,
 *  session restarts and re-renders: there is no cached "last topic" that can
 *  outlive the session it describes.
 *
 *  Deriving it from merged state also means the context for page 3 is the tail
 *  of the COMPOSED page 2, not of the raw query page — the composed order is
 *  what the student will actually see. */
export function trailingTopicKey(entries: readonly ResolvedQueueEntry[]): string | null {
  const last = entries[entries.length - 1];
  return last ? resolveTopicKey(last) : null;
}

/** Reorders one page so the same topic is not repeated back-to-back when
 *  another topic is available.
 *
 *  Deterministic by construction: groups keep the order in which their first
 *  member appeared, members keep the query's order inside their group, and
 *  the result is a plain round-robin over those queues. The same input always
 *  produces the same output, and no randomness or unstable sort is involved.
 *
 *  Duplicate questionIds are dropped defensively — the queue's own merge
 *  already dedupes across pages, so this only guards a malformed single page
 *  and never hides a persistence problem, which would show up as a duplicate
 *  across pages instead. */
export function interleaveReviewEntries(
  entries: readonly ResolvedQueueEntry[],
  // Phase 64 — the topic the already-merged session ends on, when there is
  // one. Absent for the first page, which is why first-page composition is
  // unchanged from Phase 63.
  previousTopicKey: string | null = null,
): ResolvedQueueEntry[] {
  if (entries.length <= 1) return dedupe(entries);

  const groups = new Map<string, ResolvedQueueEntry[]>();
  const seen = new Set<string>();

  entries.forEach((entry, index) => {
    const questionId = entry.item.questionId;
    if (seen.has(questionId)) return;
    seen.add(questionId);
    const key = topicKeyOf(entry, index);
    const existing = groups.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  });

  // Map preserves insertion order, so this is first-appearance order — which
  // keeps the page's canonical FIRST entry first. A student who saw "the most
  // overdue question" at the top before this phase still sees it there.
  const queueKeys = [...groups.keys()];

  // Phase 64 — the page-boundary rule, and the ONLY thing this phase adds.
  //
  // If the session already ends on one of this page's topics, that topic's
  // group is moved to the BACK of the round-robin order so the page does not
  // open by repeating what the student just saw. Everything else — group
  // membership, intra-group order, determinism — is untouched, and the group
  // is delayed rather than dropped, so no question is starved.
  //
  // A no-op in exactly the cases where it should be: no previous topic (first
  // page), a previous topic this page does not contain, or a page with only
  // one group and therefore no alternative to offer.
  if (previousTopicKey && queueKeys.length > 1) {
    const clash = queueKeys.indexOf(previousTopicKey);
    if (clash !== -1) {
      queueKeys.push(...queueKeys.splice(clash, 1));
    }
  }

  const queues = queueKeys.map((key) => groups.get(key) as ResolvedQueueEntry[]);
  const result: ResolvedQueueEntry[] = [];

  // Round-robin. A topic with many due items is not starved: once the other
  // topics are exhausted, its remaining entries simply follow in their
  // original relative order.
  let placed = 0;
  const total = seen.size;
  while (placed < total) {
    for (const queue of queues) {
      const next = queue.shift();
      if (!next) continue;
      result.push(next);
      placed += 1;
    }
  }

  return result;
}

function dedupe(entries: readonly ResolvedQueueEntry[]): ResolvedQueueEntry[] {
  const seen = new Set<string>();
  const result: ResolvedQueueEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.item.questionId)) continue;
    seen.add(entry.item.questionId);
    result.push(entry);
  }
  return result;
}
