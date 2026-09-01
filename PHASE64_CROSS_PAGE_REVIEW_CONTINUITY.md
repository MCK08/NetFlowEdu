# Phase 64 — Cross-Page Review Continuity

## Starting Baseline

`70900d9` — Phase 63 Intelligent Review Session Composition. Worktree clean,
sync 0/0, main untouched.

## Phase 63 Architecture

Unchanged and reused:

- server-authoritative `reviewScheduler.ts` → `nextReviewAt`
- due query `where nextReviewAt <= now`, `orderBy nextReviewAt asc`, cursor
  pagination, page size 10
- `interleaveReviewEntries` — deterministic round-robin over per-topic queues
- composition applied to the incoming page, then `mergeResolvedPages`

## Pagination Constraint

The session is a paginated stream, not a single array. The client only ever
holds the pages loaded so far, so composition must happen per page and can
never see the full due set.

## Product Goal

Stop a page from *opening* with the topic the session just ended on.

## The Bug Phase 63 Left Behind

Instrumenting the hook (rather than the pure function) showed that
`loadFirstPage` did `setEntries(resolved)` — **raw query order**. Phase 63 had
wired interleaving into `loadMore` only, so the very first page every student
sees was never balanced; only page two onward was.

Runtime evidence, first page, before the fix:

```
raw       a1 a2 a3 a4 a5 a6 a7 a8 b1 c1
displayed a1 a2 a3 a4 a5 a6 a7 a8 b1 c1   ← unbalanced
```

After:

```
composed  a1 b1 c1 a2 a3 a4 a5 a6 a7 a8
```

The Phase 63 unit tests all passed over this because they exercised the pure
function and the merge pipeline, never which call site the hook used. This is
the "one directly-related bug" §78 permits, and it is now locked by a test that
encodes the exact shape the bug produced.

## Frozen Prefix Rule

**Every entry already in merged session state is frozen.** Only the incoming
page may be reordered. The rule deliberately does not distinguish seen from
unseen, so it stays correct under prefetch, mid-session answers and re-renders
without needing to track visibility.

## Continuation Context

One value: the topic the merged session currently ends on, read via
`trailingTopicKey(prev)` **inside the state updater**, which is the only place
the true merged tail is available — reading it from a captured variable would
race a concurrent update.

Derived, never stored. There is no cached "last topic" that could outlive its
session, so account switches, restarts and re-renders are correct for free.

## Page Composer

`interleaveReviewEntries(entries, previousTopicKey = null)`.

The whole addition is: if the session already ends on one of this page's
topics, that topic's queue moves to the **back** of the round-robin order.
Everything else — grouping, intra-group order, determinism, duplicate defence,
missing-metadata handling — is Phase 63's, untouched.

It is a no-op in exactly the right cases: no previous topic (first page), a
previous topic this page does not contain, or a page with a single group and
therefore nothing to offer instead.

## Boundary Diversity

```
page 1 (composed) … a1        ends on Algebra
page 2 (raw)      a2 a3 b1 c1
page 2 (Phase 63) a2 b1 c1 a3 → boundary a1 → a2
page 2 (Phase 64) b1 c1 a2 a3 → no repeat
```

## Priority Safety

Phase 63 established that entries within a due page are peers: all are due, and
`nextReviewAt asc` is chosen for index economy (a single-field range + orderBy
on the same field needs no deployed index), not pedagogy. Phase 64 changes
nothing about that conclusion and adds no new ordering key.

The adaptive session remains untouched — its order carries real Phase 45/61
priority that diversity must not disturb.

## Determinism

Group order is first appearance, intra-group order is the query's, the rotation
is a single deterministic splice, and the round-robin is a queue drain. Same
frozen prefix + same incoming page ⇒ same output, asserted directly.

## Cursor Safety

`cursorRef.current = page.cursor` — from the **raw** Firestore page, never the
reordered array. Client display order and server pagination remain separate
concerns; conflating them would skip or duplicate documents.

## Duplicate / Skip Safety

`mergeResolvedPages` still dedupes by `questionId`, so a legitimate boundary
overlap (an item re-returned after its `nextReviewAt` was rewritten) is dropped
exactly as before. Asserted across a three-page merge including a deliberate
overlap: no duplicates, nothing missing.

## Session Stability

Only the incoming page is composed, so the merged prefix is byte-for-byte
identical after every subsequent page — asserted against the real merge. New
outcomes therefore affect the next composition, never the running session.

## Query / Cost

Zero new reads, writes, listeners, polling, indexes or dependencies. Context is
one array-tail lookup; rotation is one `indexOf` + `splice` over at most ten
groups. Complexity stays `O(pageSize)`.

## Runtime Cross-Page QA

Emulators + a temporary emulator-only set of 14 due items (Algebra ×10,
Geometri ×2, Kesirler ×2) shaped so page 1 ends on Algebra and page 2 would
otherwise open on it. Temporary hook instrumentation captured the real composed
order, which is how the first-page bug was found and its fix confirmed.

Instrumentation was removed and the temporary data deleted with an existence
check confirming nothing survived; the Hub is back to its canonical state.

**Honest limitation:** page 2's boundary composition was *not* observed at
runtime. The review session is a virtualised pager whose `onEndReached` did not
fire under synthetic scrolling, and advancing ten cards would have written ten
real outcomes. It is instead proven by integration tests that call
`interleaveReviewEntries`, `trailingTopicKey` and `mergeResolvedPages` in
exactly the order the hook now calls them, including the composed-tail rule.

## Phase 59–63 Regression

`reviewScheduler.ts`, the due query, `dailyPracticePlan`, the adaptive session,
Study Hub readiness, the teacher timeline and `studyEvents` are untouched by
diff. Full suite green.

## iOS Decision

**NOT REQUIRED THIS PHASE.** Pure TypeScript composition plus two call sites in
an existing hook. No native dependency, config, permission, storage, gesture,
navigation or platform code, and no visible UI change.

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | 147 suites / 2506 tests (+20) |
| rules | 5 suites / 365 tests (unchanged) |
| functions build | PASS |
| verify | PASS |
| expo-doctor | 17/18 (known drift) |
| `git diff --check` | PASS |

## Source Encoding Sanity

Phase 63 shipped a heredoc-mangled NUL byte that made a `.ts` file read as
binary. Every touched file this phase was explicitly scanned: no NUL bytes,
valid UTF-8, and `git diff --numstat` reports real line counts rather than
binary markers.

## Known Limitations

- **One-step lookback.** Only the immediately previous topic is considered; a
  page can still alternate back to it at position two. That is deliberate —
  §15/§16 ask for the minimum that works, and it does.
- **Diversity remains bounded by the page.** Within a page the round-robin
  still governs; continuity only fixes the seam between pages.
- Page 2's boundary was verified by integration test rather than at runtime,
  for the pager reason above.
- Canonical fixtures cannot exercise any of this (single topic, nothing due),
  so runtime used temporary, fully-removed emulator data.

## Final Product Assessment

The named Phase 63 weakness is closed, and instrumenting the real seam turned
up a larger one: first-page composition had never been wired at all. Both are
fixed, both are locked by tests, and the cost remains zero additional reads.
