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

// A group key that cannot accidentally merge two different topics: subject and
// topic are joined with a separator that neither field is expected to contain,
// and both are trimmed so " Denklemler" and "Denklemler" are one group rather
// than two.
function topicKeyOf(entry: ResolvedQueueEntry, index: number): string {
  const question = entry.question;
  const subject = question?.subject?.trim() ?? "";
  const topic = question?.topic?.trim() ?? "";
  // An entry whose question was deleted, or whose access was revoked, has no
  // topic to group by. It becomes its own group rather than joining a shared
  // "unknown" bucket — lumping unrelated questions together would create
  // exactly the false adjacency this module exists to avoid. The index keeps
  // those singleton keys unique and deterministic.
  if (!subject || !topic) return `__ungrouped__:${index}`;
  return `${subject}|${topic}`;
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
): ResolvedQueueEntry[] {
  if (entries.length <= 2) {
    // Nothing to balance: one item has no neighbour, and two items either
    // already alternate or are the only members of their topic. Returning the
    // canonical order untouched keeps the common short-session case provably
    // identical to before this phase.
    return dedupe(entries);
  }

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
  const queues = [...groups.values()];
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
