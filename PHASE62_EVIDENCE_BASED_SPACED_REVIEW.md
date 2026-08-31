# Phase 62 — Evidence-Based Spaced Review

## Starting Baseline

`bbcdb5a` — Phase 61 Chronology-Aware Adaptive Intelligence. Worktree clean,
sync 0/0, main untouched.

## Product Goal

Answer "which previously learned topic is becoming worth revisiting now?"

## The Finding That Shaped This Phase

**NetFlowEdu already had evidence-based spaced review.** Inspecting the source
before designing anything turned up a complete, shipped implementation:

- `functions/src/study/reviewScheduler.ts` — a real spaced-repetition engine:
  `again` → 10 minutes, `struggled` → 1 day, first solve → 2 days, then
  interval doubling to a 60-day ceiling, with a mastery gate (≥3 successful
  reviews **and** ≥14-day interval). Server-authoritative, pure, unit-tested.
- `dailyPracticePlan` derives `dueItems` / `dueCount` from its `nextReviewAt`.
- `studentNextAction` has a `due_review` kind, ranked below imminent assignments.
- Study Hub already surfaces it as the headline action — "Tekrar zamanı gelen
  sorular · N soru tekrar için hazır · Tekrara Başla" — plus "Önce Tekrar Et"
  in the plan, a `dueCount` stat, and per-subject due counts.

The brief's §95 scenario is **already satisfied today**: a question solved just
now receives a long doubled interval and is not due; a recovering topic gets a
1–2 day interval and is already due.

`studyTypes.ts` also carries an explicit repo rule:

> The scheduling ALGORITHM lives in exactly one place — reviewScheduler.ts —
> and the client never recomputes it. Phase 16 originally shipped a second copy
> … it was removed: the server response is the single source of truth.

A client-side readiness model with its own day thresholds (§9's "2 / 4 / 7
days") would be precisely that second implementation, and it would contradict
the scheduler in ordinary use — a stable question with a 32-day interval is
genuinely not due no matter how many days have elapsed.

So this phase did **not** build a competing timing model.

## What Was Actually Missing

The scheduler decides *what* is due; the Hub only ever expressed it as a
**number**. The student never learned *which* topics were waiting or *why now*.
That is the gap this phase fills, using the scheduler's verdict as the input.

## Review Readiness Model

`buildReviewReadyTopics({ items, chronologyByQuestionId, now })` — pure,
injected clock, no Firebase.

Eligibility, in order:

1. not `mastered` (the scheduler's own mastery gate already retired it)
2. resolvable subject/topic
3. **`nextReviewAt <= now`** — the authority, never recomputed
4. Phase 42 state ∈ { recovering, one_off_struggle, stable }

## Time Semantics

There is **no new threshold**. The threshold is the scheduler's own interval,
already derived from how that item's outcomes actually went. This is the
strongest available answer to "don't choose thresholds casually": none were
chosen.

`now` is injected so tests are deterministic.

## Phase 42 Relationship

Unchanged and authoritative. `buildLearningState` is called, never redefined.

## Phase 45 / 46 Relationship

Untouched. This adds no comparator key and no ranking change — it is a separate
Hub section, not an input to practice selection. Persistent struggle is
explicitly excluded so Phase 46 keeps that case.

## Phase 61 Relationship

Untouched. Chronology is recorded as `evidenceBasis` for explainability only;
it does not gate or reorder readiness, so the same signal is never
double-counted.

## Eligibility

Handled entirely by existing rules — the scheduler's `nextReviewAt` and mastery
state, plus Phase 42. No content is created, duplicated or resurrected.

## Threshold Policy

Deliberately none of this module's own. See *Time Semantics*.

## Legacy Honesty

An item whose counters are incomplete classifies as `insufficient_data` and
produces no readiness claim at all. Student D therefore never receives a
confident review schedule — proven by unit test and observed at runtime.

## Study Hub UX

"Tekrar Zamanı", below the next action and the plan: those decide what to do
now, this only names what has become worth revisiting. At most 3 topics, one
row per topic (never three cards for three questions in one topic), brand blue
rather than danger — these are topics going *well* enough to revisit. Renders
nothing when nothing is due; no "all caught up" card.

## Daily Flow Relationship

**Unchanged, deliberately.** Daily Flow already routes through the canonical
next action, which already includes `due_review`. Adding a second review entry
would have duplicated it at a different priority.

## Session Stability

No ranking input changed, so no session can reorder. The section is derived
from the same in-memory items the Hub already refreshes on focus/outcome.

## Query Architecture

Zero new reads. `items` and chronology are already loaded by Study Hub.

| Surface | Phase 62 reads |
|---|---|
| App launch | 0 |
| Student Feed | 0 |
| Study Hub | 0 (derived in memory) |
| Adaptive session | 0 |
| Per candidate | 0 |

No new collection, field, function, rule, index, write, listener, polling or
dependency.

## Error / Offline Fallback

Chronology only annotates `evidenceBasis`; if it is missing, readiness still
resolves from `nextReviewAt` + Phase 42 + counters. Study is never blocked.

## Localhost Runtime Acceptance

Emulators + seeded fixtures. Every fixture is deliberately future-scheduled
(`NOW + 1/4/8 days`), so nothing is due and the section correctly renders
nothing.

To exercise the positive path without distorting a canonical persona, one
**temporary emulator-only** study item was made due, verified, and then
restored to its seeded value (confirmed: Hub back to "Zorlandığın konu",
section absent, no repo artefacts).

That run produced the phase's most useful evidence: with an item due, the
existing system surfaced it as the headline — "Tekrar zamanı gelen sorular ·
1 soru tekrar için hazır" and "Önce Tekrar Et" — and the new section correctly
**stood down** via its dedup rule instead of restating it.

## Student A/B/C/D Matrix

| Student | Result |
|---|---|
| A | nothing due → no section; after temp due item, dedup suppressed correctly |
| B | recovering, future-scheduled → no section (scheduler has not released it) |
| C | stable/legacy → no section |
| D | insufficient/legacy → no claim, existing counts honest |

## Accessibility

Real `Pressable` with `accessibilityRole="button"` and a full label; the reason
is readable text, not a decorative clock icon.

## iOS Decision

**NOT REQUIRED THIS PHASE.** No native dependency, config, permission,
safe-area, gesture, storage or platform API changed — one pure service, one
shared RN component, existing routes.

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | 146 suites / 2463 tests (+19) |
| rules | 5 suites / 365 tests (unchanged) |
| functions build | PASS |
| verify | PASS |
| expo-doctor | 17/18 (known drift) |
| `git diff --check` | PASS |

## Known Limitations

- **The contribution is narrower than the brief envisioned**, because the core
  deliverable already existed. This names due topics; it does not decide timing.
- The section is suppressed whenever `due_review` is the headline action, so it
  appears only when something else outranks it (typically an imminent
  assignment). That is correct de-duplication, but it means the section is not
  shown in the most common due-review case.
- Seeded fixtures are all future-scheduled, so the positive UI path was verified
  via a temporary, reverted emulator record rather than a canonical persona.
- No forgetting curve, retention score or decay model — none exists to build on,
  and inventing one was out of scope.

## Final Product Assessment

The honest outcome of this phase was mostly a *finding*: the product already
had trustworthy spaced review, and the valuable work was refusing to duplicate
it. What shipped is the missing half — naming which topics the scheduler has
released, and why now — with zero new timing logic, zero backend and zero reads.
