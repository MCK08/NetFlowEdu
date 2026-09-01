# Phase 63 — Intelligent Review Session Composition

## Starting Baseline

`84d8621` — Phase 62 Evidence-Based Spaced Review. Worktree clean, sync 0/0,
main untouched.

## Existing Review Scheduler

Unchanged and authoritative: `functions/src/study/reviewScheduler.ts` decides
intervals and writes `nextReviewAt`. Nothing in this phase reads, recomputes or
second-guesses it.

## Product Goal

Stop a review session from reading as five questions on the same topic in a
row, without changing which questions are due.

## What Inspection Changed About the Plan

The review session is **not** an in-memory list composed at session start. It
is a server-side cursor-paginated stream:

```
getDueStudyItemsPage(uid, now, DEFAULT_QUEUE_PAGE_SIZE = 10, cursor)
  where nextReviewAt <= now
  orderBy nextReviewAt asc
  startAfter(cursor)
```

Pages are merged into `entries` by `mergeResolvedPages` as the student swipes.
Consequences for the brief's premises:

- There is **no session capacity** — the session pages until exhausted, so
  "10 due, capacity 5" is not this architecture.
- There is **no session composer** to hook into; §6's `composeReviewSession({
  items, maxItems })` boundary does not exist.
- The client never holds the full due set, only the pages loaded so far.

So composition happens per page, at the merge seam.

## Canonical Session Composer

`interleaveReviewEntries(entries)` — pure, deterministic, no Firebase.

Called in `useReviewSession` on the **incoming** page only:

```ts
const balanced = interleaveReviewEntries(resolved);
setEntries((prev) => mergeResolvedPages(prev, balanced));
```

Interleaving the incoming page rather than the merged list is the entire safety
argument: entries the student has already seen — or is sitting on right now —
are never touched.

## Priority Preservation

Within one page every entry is already due, and the only ordering key is
`nextReviewAt asc`. That ordering is chosen for **index economy**, not
pedagogy — `getDueStudyItemsPage`'s own comment explains that a single-field
range + orderBy on the same field is what Firestore indexes automatically, so
the feature needs no index deployment.

Being due five days ago does not make an item matter more than one due two days
ago; Phase 62 established and tested the same principle. Page entries are
therefore peers, and reordering them changes no priority.

**The adaptive session is deliberately untouched.** Its order comes from
`buildAdaptivePracticePlan`, which carries real priority — tier, mastery,
recency, Phase 45 cumulative struggle, Phase 61 chronology. Interleaving there
would demote genuinely stronger evidence to make a session look varied, which
is the one thing this phase must not do.

## Diversity Strategy

Round-robin over per-topic queues:

1. group by `subject + topic`, preserving first-appearance order
2. keep each group's internal order exactly as the query returned it
3. emit one entry per group per round until every entry is placed

`A1 A2 A3 B1 C1` → `A1 B1 C1 A2 A3`. The page's canonical first entry stays
first, so the most-overdue question the student saw at the top is still there.

## Topic Grouping

Keyed on trimmed `subject + topic`, so `" Algebra "` and `"Algebra"` are one
group, while the same topic name under two subjects stays two. An entry whose
question is unavailable (deleted, access revoked) becomes its **own** group
rather than joining a shared "unknown" bucket — pooling unrelated questions
would create exactly the false adjacency this phase exists to remove.

## Determinism

No randomness, no unstable sort. Group order is first appearance, intra-group
order is the query's, and the round-robin is a plain queue drain. Same input,
same output — asserted directly.

## Capacity

None introduced. The page size (10) and the paging behaviour are unchanged, and
`dueCount` is untouched, so the Hub still reports what is actually due.

## Starvation Prevention

A dominant topic is neither crowded out nor starved: it leads the first round,
the other topics get an early slot, and its remaining entries follow in their
original relative order once the others are exhausted. With `A×6, B×1, C×1` the
result opens `A1 B1 C1` and still contains all six A items in order.

## Session Stability

The already-loaded prefix is never re-sorted. A second page is balanced among
itself and appended, so nothing the student has passed can move under them —
asserted in the pipeline test. New outcomes therefore affect the **next**
composition, never the running one.

## Phase 61 Relationship

Untouched. Phase 61 orders the adaptive plan; this only reorders review pages,
which Phase 61 never ranked. No signal is double-counted.

## Phase 62 Relationship

Untouched. The "Tekrar Zamanı" section, the `due_review` headline and its dedup
all behave exactly as before; no readiness threshold was added or changed.

## Query / Cost

Zero new reads, writes, listeners, polling, collections, indexes or
dependencies. Topic metadata comes from `entry.question`, already resolved by
the queue. Reordering is `O(n)` over a page of 10.

## Localhost Runtime Acceptance

Emulators + seeded fixtures. Two facts shaped verification:

- Canonical fixtures are all future-scheduled, so nothing is due.
- All five fixture questions share one subject/topic, so even when due they
  could not demonstrate diversity.

A temporary emulator-only due set was therefore created for Student A
(Denklemler ×3, Üçgenler ×1, Kesirler ×1), the review session was opened and
rendered all five cards correctly, and the data was then deleted with an
existence check confirming nothing survived. The Hub is back to its canonical
state.

The review card does not display subject/topic, so the rendered *order* could
not be read from the DOM. Order is instead proven against the real seam by the
pipeline tests, which exercise `interleaveReviewEntries` + `mergeResolvedPages`
exactly as the hook composes them — including the mid-session property.

## Runtime WOW Case

Input (canonical query order): `A1 A2 A3 B1 C1`
Before: `A1 A2 A3 B1 C1` — three Algebra questions back to back
After: `A1 B1 C1 A2 A3`

## Regression Safety

Review scheduler, `getDueStudyItemsPage`, `dailyPracticePlan`, the adaptive
session and all Phase 59–62 behaviour are untouched by diff.

## iOS Decision

**NOT REQUIRED THIS PHASE.** One pure TypeScript service and one line at an
existing hook's merge point. No native dependency, config, permission, storage,
gesture, navigation or platform code; no visible UI change.

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | 147 suites / 2486 tests (+23) |
| rules | 5 suites / 365 tests (unchanged) |
| functions build | PASS |
| verify | PASS |
| expo-doctor | 17/18 (known drift) |
| `git diff --check` | PASS |

## Known Limitations

- **Diversity is per page, not per session.** With more than 10 due items,
  balancing happens inside each page, so a topic can still repeat across a page
  boundary. Balancing globally would require reordering already-loaded entries,
  which would break mid-session stability — the stronger guarantee.
- The review card shows no topic, so the effect is felt rather than labelled,
  and the rendered order is verified by test rather than by reading the DOM.
- Canonical fixtures cannot exercise this (single topic, none due), so runtime
  verification used temporary, fully-removed emulator data.
- The adaptive session is intentionally excluded; its ordering carries real
  priority that diversity must not disturb.

## Final Product Assessment

A small, contained change at exactly one seam: review pages arrive balanced,
nothing about due-ness, priority or session stability moves, and the cost is
zero additional reads.
