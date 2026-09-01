# Phase 65 — Adaptive Session Pacing + Repeated Exposure Guard

## Starting Baseline

Repository already present locally. Branch
`phase17-moderation-infrastructure-20260806-195814`, worktree clean, `main`
untouched. **Starting HEAD: `6781942`** (Phase 64 — preserve review diversity
across pages), on top of `70900d9` (Phase 63 — balance review session
composition). Phases 63 and 64 were therefore already present and were read
from the repository rather than assumed.

No broad home-directory crawl was performed; no protected macOS folder was
touched.

## Discovery — What Already Existed

| Phase | What it already does | Verdict |
|---|---|---|
| 63/64 | Review queue composition: `interleaveReviewEntries`, `resolveTopicKey`, `trailingTopicKey`, cross-page continuity | **Already solves the review surface.** Not touched, not duplicated. |
| 62 | Server-authoritative spaced review scheduling | Untouched — pacing changes no interval, no due date. |
| 61 | `compareChronology` tie-break | Untouched — remains a stronger key than pacing. |
| 45/46 | Adaptive prioritization + reinforcement | Untouched — remain stronger keys than pacing. |
| 42 | `learningState` classifier | Untouched, still authoritative. |
| 41 | Cumulative outcome counters | Untouched. |

`reviewSessionComposition.ts` states in its own words why it stopped where it
did: *"The adaptive session's order comes from buildAdaptivePracticePlan, which
carries real priority… Interleaving there would demote genuinely stronger
evidence."* That reasoning is correct and is preserved verbatim by this phase —
nothing here demotes stronger evidence.

**So Phase 63/64 already solve most of the requested behavior.** One seam was
genuinely uncovered, described next. No other feature was manufactured.

## The Uncovered Seam

The adaptive comparator's two strongest keys — mastery and recency — are
**topic-level** aggregates. `dailyPracticePlan.ts` says so itself: *"both are
TOPIC-level signals; two questions in the same topic always share them."*

So every question inside one topic necessarily ties on both. When Phase 45's
struggle counts and Phase 61's chronology also tie or are incomparable, the
last word was `compareByReviewOrder` — `nextReviewAt`, then **questionId
alphabetically**. Alphabetical order has no relationship to concept diversity,
so a tier could legitimately come out as `A1 A2 A3 B1` purely because of how the
ids are spelled.

That, and only that, is what this phase addresses.

## Core Principle — Learning Priority First, Exposure Pacing Second

Pacing may reorder candidates **only** when every stronger canonical key is
equal. That is not a promise this code makes; it is a structural property:

- Pacing never sorts anything and never computes a rank.
- It takes an **already-sorted** list plus the canonical ranking's own verdict
  on interchangeability, and reorders only inside maximal runs of mutual peers.
- Two items in different runs can never swap, because a run boundary **is** a
  non-zero priority delta.

Therefore Phase 46 reinforcement cannot be demoted for variety, Phase 61
chronology cannot be overridden, Phase 45 mastery/recency/struggle cannot be
overridden, and tier membership is untouched — tiers are decided before any of
this runs.

## The Equivalence Oracle — The Subtlety That Matters

The oracle is **not** `comparator(a, b) === 0`.

A sort comparator must impose a **total** order, so the adaptive one ends in an
alphabetical `questionId` tie-break and therefore never returns 0 for two
distinct questions. Used as the oracle it would make every run a singleton and
the whole feature a silent no-op — it would pass every safety test while doing
nothing.

`adaptiveComparator` was therefore split in two:

- `adaptivePriorityDelta` — every meaningful key (mastery band, recency bucket,
  Phase 45 struggle, Phase 61 chronology, `nextReviewAt`). Returns 0 only when
  all of them tie.
- `adaptiveComparator` — `adaptivePriorityDelta`, then the alphabetical
  `questionId` fallback.

The total order is **unchanged** from before the split (`nextReviewAt` then
`questionId`, exactly as `compareByReviewOrder` produced). The oracle is
`adaptivePriorityDelta(a, b) === 0`, so the licence to reorder is precisely
*"nothing but coincidence of spelling separated these two."*

This band is narrower than it first looks, and that is a **safety feature**.
Because mastery and recency are topic-level, two topics only tie when their
overall shape genuinely matches. When Algebra sits in a worse mastery band than
Geometry, `A1 A2 A3 B1` is **correct** priority ordering and a run boundary
protects it. A test asserts that case explicitly.

## Algorithm

`src/features/study/services/exposurePacing.ts` — one generic pure function:

```
paceEquivalentExposure({ items, keyOf, isEquivalent, previousKey })
```

1. Walk `items`, cutting a run the moment `isEquivalent` is false. Equivalence
   is measured against the run's **first** member, not the previous one, so a
   run is a set of mutual peers rather than a chain of pairwise-similar
   neighbours.
2. Within a run, group by exposure key, preserving first-appearance order, then
   round-robin the groups. Members keep their canonical order inside a group.
3. If the run would **open** on the concept just placed and an alternative
   exists, that group moves to the back of the rotation — delayed, never
   dropped.
4. Carry the last-placed key into the next run.

Deterministic by construction: no clock, no randomness, no unstable sort. Input
is never mutated.

## Exposure Key

`${subject}|${topic}`, trimmed — mirroring `reviewSessionComposition.ts`'s
`resolveTopicKey` field for field, so the review queue and the adaptive plan can
never disagree about what "the same topic" means.

Deliberately **not** subject-level: a subject is not one concept, and treating
it as one would push a genuinely different topic behind an unrelated one for the
sake of variety.

`null` when either half is missing. Such an item becomes its own unique concept
rather than joining a shared unknown bucket — lumping unrelated legacy questions
together would manufacture exactly the false adjacency this exists to avoid.

## Cross-Tier Continuity

`carriedKey` lives inside a single `buildTieredPlan` call, so tier 3 does not
open by repeating the topic tier 2 ended on. It is **not** module scope: nothing
survives between calls, so it cannot leak across students or sessions.

**Tier 1 (due obligations) is not paced.** A due item is a real obligation, and
reordering it for variety would be the one place pacing could touch scheduling.

## What Was Deliberately NOT Built

- **No fatigue score.** No attention model, no exposure penalty, no tunable
  weight, no decay curve. The only decision is categorical: *is this candidate's
  concept the one just placed, and is another available at equal priority?*
- **No attention prediction.**
- **No change to review scheduling** — no interval, ease factor or due date is
  read or written.
- **No randomization.**
- **No AI.**
- **No backend state** — no field, collection, document, index or rule.
- **No filler invented** to manufacture spacing. A single-concept run is
  returned exactly as it was; required content is never withheld or starved.
- **No no-repeat-ever rule.** `A B A` is already spacing and is left alone.

## Cost

| | Change |
|---|---|
| Firestore reads | **0** |
| Firestore writes | **0** |
| Listeners | **0** |
| Polling | **0** |
| N+1 patterns | **0** |
| New collections / fields | **0** |
| New rules | **0** |
| New indexes | **0** |
| Cloud Functions changed | **none** |

Pure client-side reordering of a list already in memory, inside the existing
`useLearningInsights` memo. `buildDailyPracticePlan` passes no oracle, so its
output is byte-identical to before.

## Automated Tests

| Check | Result |
|---|---|
| typecheck | clean |
| lint | clean |
| unit | **148 suites / 2538 tests** (was 147 / 2506) |
| rules | 5 suites / 365 tests (unchanged) |
| functions build | clean |
| verify | green |
| expo-doctor | 17/18 — same pre-existing dependency drift as Phase 59 |
| `git diff --check` | clean |
| NUL-byte / binary scan | 0 NUL bytes; all four touched files UTF-8 text |

32 new tests: 23 in `tests/unit/exposurePacing.test.ts` (bounds, spacing,
priority-never-crossed, previous-exposure context, missing metadata,
determinism) and 9 in `tests/unit/dailyPracticePlan.test.ts` (canonical order
preserved, Phase 45 stronger evidence stays ahead, no reorder when the
comparator genuinely distinguishes, no interleave across a real mastery/recency
difference, no drops or duplicates, legacy metadata, determinism).

## Runtime QA (localhost)

Firebase emulators + Expo web, Auth confirmed bound to `127.0.0.1:9099` (the
Phase 51 fail-closed guard did not fire, and zero requests reached
`googleapis.com`). Signed in as the seeded Student A.

- Study Hub renders; "Bugünkü Plan" builds; no console errors.
- With the demo baseline (2 study items) the adaptive session opened with 2
  questions and was stable.
- A temporary QA fixture of **6 identically-shaped items across 3 topics** —
  constructed so mastery and recency genuinely tie and all six land in one
  equivalence run — produced a 5-question plan; `/study/adaptive` rendered all
  five, and back-navigation plus re-entry was stable with no errors.
- **Temporary QA data removed.** Verified afterwards: 0 `qa65` questions, 0
  `qa65` study items, emulator back to the demo baseline (5 questions, 2
  Student A study items). The temporary seed script was deleted; `git status`
  shows only the four intended files.

**Honest limitation:** the session screen does not surface a per-question topic
label, so the *order itself* was not read off the screen. Ordering is proven by
the 32 unit tests; the runtime pass proves composition, rendering and stability.

## Native iOS Decision Gate

**NOT REQUIRED.** No native dependency, config, permission, gesture, layout,
navigation or platform API changed. The diff is two pure TypeScript service
files and their tests, reached through an existing hook. Per the LOCALHOST-FIRST
rule, no iOS build was run.

## Regression Safety

`buildDailyPracticePlan` output is byte-identical (no oracle passed). The
adaptive total order is unchanged by the comparator split — `nextReviewAt` then
`questionId`, exactly as before — which the 61 pre-existing
`dailyPracticePlan` tests confirm. Phases 41, 42, 45, 46, 61, 62, 63, 64 and 59
are untouched.

## Known Limitations

- Pacing acts only inside genuine priority ties. When one topic legitimately
  outranks another, clustering remains — by design, and asserted by a test.
- Tier 1 (due) is intentionally unpaced.
- Per-question topic order is not observable in the UI (see Runtime QA).

## Files Changed

| File | Change |
|---|---|
| `src/features/study/services/exposurePacing.ts` | new — the pure pacing primitive |
| `src/features/study/services/dailyPracticePlan.ts` | comparator split into priority + tie-break; `pace` threaded through tiers 2–4 |
| `tests/unit/exposurePacing.test.ts` | new — 23 tests |
| `tests/unit/dailyPracticePlan.test.ts` | +9 tests |
