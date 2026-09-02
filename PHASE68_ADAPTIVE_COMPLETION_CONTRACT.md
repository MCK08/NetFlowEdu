# Phase 68 — Adaptive Completion Contract + Unified Session Closure

## Repository Sync

Repository already present locally. Branch
`phase17-moderation-infrastructure-20260806-195814`, worktree clean before the
pull. Local HEAD was `3f4b2af` (Phase 65); remote carried two newer commits.
Fast-forwarded — no reset, clean, stash, rebase, merge or force.

- `41f44a9` — Phase 66, Verified Session Reflection
- `874b08f` — Phase 67, Resumable Session Continuity

Sync after pull: `0 0`. `git merge-base --is-ancestor 874b08f HEAD`: true.
`main` never checked out.

## Starting Baseline

**Starting Phase 68 HEAD: `874b08f`.**

## Phase 67 Reuse

Everything reusable was reused rather than re-built:

| Reused | Where |
|---|---|
| `activeStudySession.ts` envelope, parser, staleness bound, user/mode scoping | extended, not replaced |
| `activeStudySessionStorage.ts` (the only AsyncStorage touch) | unchanged |
| `resolveSessionStart` resume rules | extended for the frozen plan |
| `appendSessionReceipt` operationId dedupe | unchanged |
| `buildSessionReflection` (Phase 66) | unchanged — no adaptive reflection engine exists |
| `SessionReflectionCard` | unchanged — no adaptive-specific UI |
| `createOperationId` / `resolveGestureOperation` | unchanged — no second idempotency key |

One storage key, one active session, as before.

## Adaptive Architecture Discovery

Traced end to end: Study Hub → `/study/adaptive` → `StudySessionScreen` →
`useAdaptiveStudySession` → `useLearningInsights` → `buildAdaptivePracticePlan`
→ `toAdaptiveSessionQuestions` → `StudySessionAdaptiveCard` →
`useStudyQuestionState.submit` → `recordStudyOutcome`.

Two facts made the old completion signal mean something other than it read:

1. `buildTieredPlan` caps the plan at `Math.min(remainingGoal, MAX_PLAN_ITEMS)`
   where `remainingGoal = dailyGoal - reviewedToday`, and `reviewedToday`
   arrives on a **live Firestore listener** (`useStudyQueue`'s
   `subscribeToStudySummary`). **Every confirmed outcome shortened the plan
   from the tail while the student was inside it.**
2. Answering never removes a question from the plan, and the underlying item
   list is not refetched mid-session.

So `isAdaptiveDone = questions.length === 0` actually fired when the **daily
goal** was reached — and when the plan was shorter than the goal was far away
(three items, a goal of ten) it **never fired at all**: the student swiped past
the last card into nothing, with no completion screen and no summary.

**Reliable completion existed before: NO.**

## Finite Plan Decision

**Finite: YES**, and provably so — `planItems` is a bounded slice (≤ 5, ≤
`remainingGoal`) of a de-duplicated item list, and each tier claims what it
takes so tiers cannot overlap. Every planned entry can be answered exactly once
through the canonical `recordStudyOutcome` path, and every entry can reach
confirmed.

What was missing was not finiteness but **stability**: the finite set changed
underneath the session. Freezing it is what turns a finite list into a
contract.

## Plan Entry Identity

`questionId`, and the reasoning is recorded rather than assumed: the adaptive
plan cannot contain one question twice (`buildTieredPlan` de-dupes its input,
tiers claim exclusively, `toAdaptiveSessionQuestions` de-dupes again), and the
frozen list is normalised on top of that.

`normalizePlannedQuestionIds` drops malformed entries and duplicates. A
duplicate would demand two confirmed outcomes for one question, which no single
answer can satisfy — the session would be permanently unfinishable, so
normalising is the only achievable reading and also the truthful one.

If the product ever deliberately schedules one question as two distinct
entries, `questionId` stops being sufficient and a per-entry id is required.
Stated here so the assumption is visible rather than buried.

## Frozen Plan Contract

At session start the question ids are frozen. Everything afterwards resolves
against the frozen list, never the live plan. New adaptive intelligence —
Phase 45 ranking, Phase 61 chronology, Phase 65 pacing — still applies in full;
it applies to the **next** session. That is the same stability philosophy
Phase 61 stated for chronology and Phase 65 for pacing.

**Mid-session Phase 45 change affects: NEXT SESSION.** Proven at runtime, not
only in tests — see Runtime QA.

## Confirmed Completion Contract

A session is complete when **every planned entry it can still open has one
confirmed outcome**. Confirmed means the canonical write resolved: the
operationId only exists on success, so a pending or failed write cannot reach
the receipt path at all.

Explicitly **not** completion: reaching the last card, `currentIndex ===
length - 1`, scrolling to the end, pressing Back, or an empty live plan.

- **Failed write** → no operationId → no receipt → entry stays pending.
- **Retry** → the same gesture reuses its operationId → collapses to one
  receipt, exactly as the server collapses it to one review.
- **Unplanned outcome** → counts in the reflection (it is real work) but never
  advances this session's contract.

## Session State Machine

Three states, no more: **idle → active → completed**. `active` is an envelope
with `completedAt: null`; `completed` is the same envelope stamped. There is
at most one of either, in one storage key, so two envelopes can never disagree.

## Persistence

Same key (`netflowedu.study.active-session.v1`), **writes now version 2**,
**reads accept 1 and 2**:

```
version 2
sessionInstanceId, userId, mode: "mandatory" | "adaptive", startedAt
receipts[]                 (operationId, questionId, subject, topic, outcome)
plannedQuestionIds[]       NEW — frozen plan, ids only
completedAt: number | null NEW — the completion stamp
```

The version split earns its keep in both directions. A v1 record reads as
"no frozen plan, not completed", which is exactly what it was, so a session in
progress when this build ships resumes normally. A v2 record is **rejected by a
Phase 67 build**, whose parser pins `version !== 1` — which matters because an
older build must never read a *completed* snapshot as an active session and
fold a finished session's receipts into the next one's summary. Failing closed
costs one resume; reinterpreting would cost the honesty the summary exists for.

No question content is persisted: ids only, plus the short subject/topic the
reflection already needed. Questions are re-resolved after a restart from the
shared metadata cache.

## Refresh Resume

Hydration order is deliberate: **completed snapshot first**, then resume, then
new session. A completed session is never reopened as active.

Verified at runtime: Q1 confirmed → refresh → same `sessionInstanceId`, same
frozen plan, Q1 still confirmed, Q2 pending. Repeated refreshes add no receipt.
A resumed session opens on the first unconfirmed card
(`resolveAdaptiveResumeIndex` via `initialScrollIndex`), not back on answered
work.

## Reflection Reuse

Phase 66's `buildSessionReflection` and `SessionReflectionCard`, unchanged.
**No `adaptiveReflectionV2`, no adaptive-specific semantics, no new copy.** The
adaptive completion screen previously showed "Bugün N soru çözdün" — a figure
from the *daily* summary, describing the day rather than the session just
finished. It now shows the same session-bound reflection the review session
shows.

## Completed Snapshot

One snapshot maximum, in the same key, cleared when the student leaves the
completion screen or when a new session begins. No history list, no archive, no
cloud sync, no new metrics — the reflection is rebuilt from the receipts.

This also fixes **Phase 67's own stated limitation** for review: refreshing on
the completion screen used to lose the summary, because completion *deleted*
the record and nothing could honestly rebuild it afterwards. Stamping instead
of deleting achieves un-resumability without destroying the evidence.

## Review Regression

Review keeps its due query, pagination, Phase 63/64 composition, Phase 66
reflection and Phase 67 resume. The only changes are the completion stamp
replacing the completion delete, and the completion title now keyed on whether
a session actually completed rather than on whether the queue is currently
empty — those came apart the moment the screen became refreshable, and the old
test told a student who had just finished their reviews that none were due.

## Assignment Decision

**Not implemented.** The §34 gate fails on the honesty criterion, not on
plumbing:

| Gate | |
|---|---|
| Real completion boundary | YES (`resolveAssignmentSessionCompletion`) |
| Canonical confirmed per-question outcome | YES |
| Operation identity available | YES — this phase threaded it out |
| No duplicate receipt path | YES |
| **No misleading claim** | **NO** |

An assignment's completion boundary is **assignment-lifetime**, not
session-bound: a student who answered three of four questions yesterday and one
today completes it today. A session-bound reflection would then say "1 sonuç"
directly under "Ödev tamamlandı", systematically under-reporting against the
claim above it. Phase 66's rule is that the summary must not mislead, so the
right answer is to leave it out rather than ship a number that argues with its
own heading.

## Immersive Feed Decision

**Unchanged.** Still open-ended: no closure, no reflection, no session
identity. Regression only.

## Backend Cost

| | Change |
|---|---|
| New Firestore collections | **NONE** |
| New fields | **NONE** |
| New Cloud Functions | **NONE** |
| New rules | **NONE** |
| New indexes | **NONE** |
| Server session id | **NONE** |
| New reads | **0** — the frozen ids resolve through the same shared metadata cache the plan already warmed |
| New writes | **0** — canonical outcomes only, unchanged |
| New listeners | **0** |
| New polling | **0** |
| N+1 | **NONE** |

## Local Storage Cost

One key. Reads: one per session mount (was one). Writes: one per confirmed
outcome (was one), plus **one** at completion (the stamp; Phase 67 wrote a
delete at the same point) and one delete on acknowledge. Every access is
wrapped and swallows its own failure — a device with no writable container
still studies normally, and completion falls back to in-memory state.

## Runtime QA

Firebase emulators + Expo web, Auth confirmed on `127.0.0.1:9099`. Temporary
fixture: 4 same-shaped items across 4 topics for Student A with `dailyGoal: 4`,
chosen so the live plan would visibly shrink.

| Check | Result |
|---|---|
| Session start | header `0 / 4` — a real fraction, from the frozen plan |
| One confirmed outcome | `1 / 4` — **denominator held while the live plan would have shrunk to 3** |
| Persisted envelope | v2, `mode: adaptive`, 4 frozen ids, `completedAt: null`, 1 receipt with the canonical operationId |
| Refresh ×2 | same session, `1 / 4`, receipts still 1, same operationId |
| Resume position | opens on the first unconfirmed card |
| Remaining outcomes | `2 / 4` → `3 / 4` → completion |
| Completion | "Çalışma tamamlandı 🎉 · 4 soru üzerinde çalıştın · Çözdüm 3 · Zorlandım 1 · Denklemler: Çözdüm → Çözdüm" |
| Refresh on completion | **identical summary survived** |
| Acknowledge → re-enter | storage `null`, new session, no leaked reflection |
| Review: outcome → refresh → resume | PASS |
| Review: completion → refresh | summary and title both survived |
| Wrong user (A → B) | B hydrated nothing; A's record left in place |
| Wrong mode | adaptive and review envelopes never adopted each other |

Temporary QA data removed and verified gone (0 `qa68` questions, 0 `qa68` study
items, `dailyGoal` restored to 10); the temporary script was deleted and the
browser's session key cleared.

## Evidence Honesty

Nothing here infers session membership. A receipt belongs to a session because
that session recorded it, and a plan entry is complete because a confirmed
write said so. No timestamp scanning, no studyEvents proximity, no
reconstruction, no fabricated completion, no counting of navigation.

Where the evidence runs out the product says so: a planned question that no
longer resolves is reported as unavailable, never credited as done; a session
that planned nothing shows an empty state rather than a completion; and a
completed session's summary is the receipts themselves, not a derived score.

## iOS Decision

| | |
|---|---|
| New native dependency | NO |
| New native config | NO |
| Native lifecycle API | NO |
| Native-only storage | NO — the existing AsyncStorage, unchanged |
| Native navigation | NO |
| Platform API | NO |

**NATIVE IOS: NOT REQUIRED THIS PHASE.** Pure TypeScript services, existing
hooks, existing navigation and shared RN UI only.

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | **152 suites / 2658 tests** (was 150 / 2612) |
| rules | 5 suites / 365 tests (unchanged) |
| functions build | PASS |
| verify | PASS |
| expo-doctor | 17/18 — same pre-existing dependency drift as Phase 67 |
| `git diff --check` | clean |
| NUL / encoding | 0 NUL bytes, 0 CR, all UTF-8 LF |

46 new tests across two suites plus one adjusted existing suite.

## Known Limitations

- **The frozen plan is local.** Starting the adaptive session on a second
  device starts a second session; there is no cross-device continuity, by
  design (§38 forbids backend session state).
- **One envelope, one session.** Switching from an active adaptive session to a
  review session replaces the stored envelope, so the adaptive session is not
  resumable afterwards. This is the §58 "at most one active session" rule
  applied honestly rather than a second key.
- **A completed snapshot can outlive its screen** if the app is force-closed on
  the completion screen: re-entering that mode within the staleness bound shows
  the same summary again. Bounded by `ACTIVE_SESSION_MAX_AGE_MS` (12h) and by
  user and mode.
- **Assignment reflection remains excluded** — see Assignment Decision.
- **Immersive Feed remains open-ended** — no closure, deliberately.
- Demo fixtures are emulator-only and were removed after QA.

## Final Product Assessment

Recorded in the phase report.
