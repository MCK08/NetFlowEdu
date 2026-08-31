# Phase 61 — Chronology-Aware Adaptive Intelligence

## Starting Baseline

`cfb258b` — Phase 60 Longitudinal Teacher Intelligence. Worktree clean, sync
0/0, main untouched.

## Product Goal

Phase 59 made the app remember the order outcomes happened in. Phase 61 lets
that memory decide **only** between practice candidates every existing rule has
already declared equivalent. It is a tie-break, not a recommendation engine.

## Existing Adaptive Ladder

Mapped from source before designing anything. `buildTieredPlan` assigns tiers
first (due tracked separately; then **struggled > weak_topic > goal_fill**), and
`adaptiveComparator` orders *within* a tier:

1. `masteryRankOf` — topic mastery band
2. `recencyRankOf` — topic/item recency
3. **Phase 45** — `-struggledCount`, only when both sides are trustworthy
4. `compareByReviewOrder` — `nextReviewAt`, then `questionId` (stable fallback)

## Safe Insertion Point

Chronology is inserted **between keys 3 and 4** — nowhere else.

Its position *is* the safety property. Mastery, recency and Phase 45's
cumulative evidence have each already returned 0 by the time it runs, so it can
only choose between genuinely tied questions. It cannot cross a tier, because
`buildTieredPlan` claimed tiers long before the comparator executed.

## Phase 41 Relationship

Untouched. The completeness rule is inherited, not reinterpreted: an item whose
counters are incomplete has a `null` struggle rank and keeps falling through
exactly as before.

## Phase 42 Relationship

Untouched, and no new state was created. Phase 61 adds a *ranking support
signal*, never a classifier verdict.

## Phase 45 Relationship

**Strictly subordinate.** A question struggled 8 times still outranks one
struggled 3 times regardless of how either recent sequence ends. Locked by a
test that deliberately gives the cumulatively-heavier question the *calmer*
recent run.

## Phase 46 Relationship

Untouched. Reinforcement selection was not modified; Phase 61 changes only the
adaptive plan comparator.

## Phase 59 Chronology Reuse

`resolveTrailShape` is reused rather than reimplemented. It already encodes two
rules this must not restate:

- the minimum-evidence bar — a lone outcome is not a journey
- `again` is a request to see the card again, **not** a report of difficulty

Writing a second shape reader would have created a competing definition free to
drift from the Learning Trail the student is shown. The read reuses Phase 59's
existing bounded query (`useLearningTrail`, limit 40) — no second event service.

## Chronology Signal Model

Ordinal, not a score. Lower sorts first, matching the existing "lower is more
urgent" convention:

`repeated_struggle (0) → recovery (1) → mixed (2) → steady (3)`

Recovery ranks above mixed deliberately: a sequence that struggled then solved
still carries real struggle evidence worth reinforcing, while a mixed sequence
supports no reading at all.

There is deliberately **no** half-life, decay coefficient or forgetting curve —
those need a separately validated model. This phase reads sequence shape only.

Window: the last 4 events per question (`MAX_TRAIL_EVENTS`), so what ranked a
question is exactly what the student would see in its trail.

## Comparable Evidence Rule

`compareChronology` returns 0 unless **both** candidates have a readable
sequence.

This matters more than it looks. The event log begins at Phase 59, so at
rollout most questions have none. Ranking a candidate ahead merely for *having*
events would systematically favour whatever was studied after the upgrade — an
artefact of the rollout date, not evidence about learning.

## Legacy Honesty

A legacy item's unknown lifetime history is never "repaired" by partial
chronology. Verified both by unit test and at runtime on Student D, whose
Study Hub renders normally with zero events and keeps its honest counts.

## Ranking Tie-Break

Proven by test:

| Case | Result |
|---|---|
| True tie, one side repeated struggle | chronology decides |
| Stronger cumulative vs worse recent run | **cumulative wins** |
| Legacy vs trustworthy | existing path, unchanged |
| Only one side has chronology | stable fallback |
| Both sides same signal | stable fallback |
| No chronology at all | byte-identical to Phase 60 |
| Across tiers | never crosses |

## Session Stability

`useLearningTrail` resolves once per mount and is never refetched mid-session —
no listener, no polling. The events array is therefore stable while a student
works, so a new outcome influences the **next** composition rather than
reordering the session they are currently in.

## Explainability

The tempting rule — "explain when the top question has a rough recent run" — is
a lie: a question chosen purely by cumulative evidence usually *also* has one,
so it would credit the timeline for decisions it had no part in.

The plan is therefore computed **twice**: once with chronology and once
without. The explanation appears only when the leading question actually
differs. Both plans are pure and bounded, so the counterfactual costs nothing
measurable.

Copy is observational and non-causal:

> "Son kayıtlı çalışmalarında bu konuda zorlanma tekrar ettiği için öne alındı."

Confirmed at runtime that Student A shows **no** line — their questions differ
in cumulative history, so Phase 45 decided and the timeline correctly takes no
credit.

## Query Architecture

| Surface | Phase 61 reads |
|---|---|
| App launch | 0 |
| Student Feed | 0 |
| Teacher surfaces | 0 |
| Study Hub | 1 bounded |
| Adaptive session | 1 bounded |
| Learning Story | 1 (pre-existing Phase 59) |

Events are passed *into* `useLearningInsights` rather than fetched inside it,
so Learning Story — which already loads them — does not read the same query
twice, and no surface that only wants insights pays for chronology.

## Performance / Cost

Profiles are indexed **once** per event set into a `Map`, not filtered inside
the comparator (which runs O(n log n) times). No new write, listener, polling,
index, rule, collection or dependency.

## Localhost Runtime Acceptance

Emulators + web, seeded fixtures (A×3, B×3, C×2, D×0):

- Student A Study Hub and adaptive session — PASS, no false explanation
- Student D (zero events) — PASS, legacy counts honest, study unblocked
- Immersive feed, Daily Flow, Learning Story — PASS

## Exactly-Once Regression

Untouched by design — Phase 61 changes no write path. `recordStudyOutcome`,
`learningEvent` and the `operationId` guard are byte-identical, and the full
suite covering them is green.

## Student D Gate

PASS. Zero chronology, unknown lifetime history, no fabricated zeros, and the
adaptive path behaves exactly as it did in Phase 60.

## Teacher Regression

No teacher file references chronology or the tie-break — verified by grep.
Phase 60's timeline, Phase 42's state and Phase 47's action are untouched, and
their tests are green.

## Accessibility

The explanation is a single caption line using existing typography and theme
tokens, not an interactive control, so no new touch target or label was
introduced.

## iOS Decision

**SKIPPED BY DESIGN.** Phase 61 changed no native dependency, configuration,
permission, safe-area logic, gesture, storage or platform API. It is pure
TypeScript ranking logic, an existing bounded Firestore hook, and one line of
shared React Native text. Everything was provable on localhost.

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | 145 suites / 2444 tests (+35) |
| rules | 5 suites / 365 tests (unchanged) |
| functions build | PASS |
| verify | PASS |
| expo-doctor | 17/18 (known drift) |
| `git diff --check` | PASS |

## Known Limitations

- Chronology only applies where **both** candidates have ≥2 recent events, so
  its influence grows as the event log fills — by design, to avoid rollout bias.
- Sequence shape only; no spaced-repetition or decay model.
- Question-level only. Reinforcement (Phase 46) selection was deliberately not
  modified.
- The demo fixtures contain no natural exact tie, so the tie-break is proven by
  unit test rather than screenshot — the personas were left undistorted.

## Final Product Assessment

The app now uses verified memory to make a better choice between otherwise
equal options, and says so only when it is true. The design work was mostly
restraint: one comparator key, in one position, with a counterfactual guarding
the one sentence it is allowed to say.
