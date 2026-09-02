# Phase 67 — Resumable Session Continuity

## Repository Sync

Repo present at `/Users/mertcankurt/NetFlowEdu`, remote confirmed
`git@github.com:MCK08/NetFlowEdu.git`. `git fetch origin` then sync check
against `origin/phase17-moderation-infrastructure-20260806-195814`: **0 0**,
worktree clean, `41f44a9` an ancestor of HEAD. Nothing to fast-forward.

## Starting Baseline

`41f44a9` — Phase 66 Verified Session Reflection.

## Phase 66 Limitation

The session receipt lived in React state and nowhere else. `loadFirstPage`
ran on every mount and called `setReceipts([])`, so a browser refresh, a
process restart or a route remount **destroyed the evidence** — the remount
that should have resumed the session wiped it. The closure summary then
under-reported outcomes the server had already accepted and scheduled.

That same reset also fired on the retry path, where a failed page load was
treated as a new session.

## Product Goal

Survive ordinary interruption — refresh, backgrounding, process restart,
remount, brief connection loss — without guessing anything.

## Session Identity

**A session identifies itself.** A local `sessionInstanceId` is created once
when a session genuinely begins and carried unchanged across rerenders,
refreshes and remounts.

Membership is never inferred from timestamps, `studyEvents` proximity, question
ordering, `lastReviewedAt`, navigation timing, "same day" or "same twenty
minutes". A receipt belongs to this session because this session recorded it.
Persistence writes exactly what was already true in memory — it does not create
new claims.

The id reuses the existing `createOperationId()` generator (no new dependency).
It is not a Firestore document, not an analytics session, not a security token
and not a learning-event identity; no server object references it, so a
collision could not affect server integrity.

## Persistence Architecture

Three pieces, deliberately split the way `themeStorage` / `parseThemePreference`
already are:

- `activeStudySession.ts` — **pure**: envelope type, total parser, and
  `resolveSessionStart`. No Firebase, no AsyncStorage, no React.
- `activeStudySessionStorage.ts` — a thin AsyncStorage wrapper whose every
  function swallows its own failure.
- `useReviewSession.ts` — hydrate on mount, persist after a confirmed outcome,
  clear on completion.

The repo's jest environment is plain node with no React renderer, so the
lifecycle lives in the pure module and is tested by calling it in exactly the
order the hook calls it — the approach that caught a real bug in Phase 64.

## Stored Data

`version`, `sessionInstanceId`, `userId`, `mode`, `startedAt`, and the receipt
array (`operationId`, `questionId`, `subject`, `topic`, `outcome`).

`subject`/`topic` are persisted deliberately: the reflection needs them after a
restart, and by then the answered item has left the due query, so they cannot be
recovered from session data. They are short learning metadata the session
already held in memory — not content.

## Data Not Stored

No question text, images or answer choices. No teacher content, private
messages or intervention text. No student name or email. No credentials, tokens
or Firebase config. No queue snapshot and no Firestore cursor. Asserted by test
against the serialized payload's exact key set.

## Storage Key / Version

`netflowedu.study.active-session.v1` — themeStorage's Phase 49 convention,
namespaced and version-stable. One key, never a scattered set.

`version: 1` is stamped and checked. An unknown version **fails closed**: a
newer build's shape is never reinterpreted by an older one.

## Hydration

On mount, `resolveSessionStart` resumes only on an explicit match of **every**
scope that could make two sessions different things — same `userId`, same
`mode`, same schema version, not technically stale. Never merely "a receipt
exists".

Hydration **merges** rather than assigns: `start.receipts.reduce(appendSessionReceipt, prev)`.
Storage normally resolves long before the first answer, but if an outcome landed
while the read was in flight, overwriting would drop it. Folding preserves
confirmed order and lets `operationId` settle any overlap, so the result is
correct whichever finishes first.

Local storage is untrusted input. The parser is total: invalid JSON, a JSON
array, a primitive, a wrong version, a missing id, an unknown mode, a
non-numeric `startedAt` or a non-array receipt list all return `null`. A single
malformed receipt is dropped without taking the genuine ones with it.

## User Isolation

`userId` is in the envelope and validated before any hydration. Student A's
session can never hydrate into Student B — proven by unit test and confirmed at
runtime with a planted foreign envelope.

A non-matching record is **left in place, not deleted**. Deleting it would
destroy the real session of whoever it belongs to merely because someone else
opened Study on the same device; leaving it inaccessible is the "user-scoped
records stay unreadable" option, and storage stays bounded because there is
exactly one key that the next confirmed outcome overwrites.

Firebase auth persistence and theme persistence are untouched, and neither key
is reused.

## Confirmed Outcome Flow

```
recordStudyOutcome resolves
  → append receipt (operationId dedupe)
  → persist envelope (fire and forget)
```

Nothing is persisted before the server accepted the outcome: a failed write
throws before the append. The persist is not awaited — the card advance must not
wait on local storage.

## Local / Server Atomicity Limitation

A Firestore write and an AsyncStorage write **cannot** be one atomic
transaction, and this phase does not pretend otherwise.

If the server succeeds and the process dies before the local write lands, that
receipt is lost and the summary under-counts by one. Phase 67 substantially
narrows the loss window — from "every refresh loses everything" to "a crash in
the milliseconds between two writes loses one" — it does not invent distributed
atomicity. Under-counting remains the safe failure; the alternative would be
inventing session membership.

## Duplicate Protection

`operationId` is the single dedupe key, applied identically in memory, at
hydration and when parsing corrupted storage — one rule, not three look-alikes.
A success callback replayed after a refresh collapses to one receipt. Proven at
runtime by reloading three times mid-session with the count unchanged.

Phase 59's server exactly-once path is untouched: `recordStudyOutcome`, the
operation-id lifecycle and every server transaction are unchanged by diff.

## Review Session Resume

Receipt continuity is **not** queue continuity. The server query stays canonical
for what is due now, and an answered item correctly leaves the due set — observed
at runtime as the session header going from `1 / 3` to `1 / 2` across a refresh
while the receipt survived.

Phase 63/64 pagination is untouched: no cursor is persisted or reconstructed,
and `interleaveReviewEntries`, `trailingTopicKey` and `mergeResolvedPages` are
unchanged by diff.

## Completion Lifecycle

On completion the **stored record** is removed while the in-memory receipts
stay, so the completion screen still renders the summary it just earned. This is
what stops a finished session reopening as active and stops its reflection
reappearing at the start of the next one.

Refreshing while sitting *on* the completion screen therefore loses the summary.
That is a deliberate trade: a mount cannot distinguish "refresh on the completion
screen" from "start a new session", so persisting completed sessions would risk
the far worse failure of showing the same reflection forever.

## New Session Reset

A new session starts only when no compatible record exists — which, after the
completion cleanup above, is exactly the next entry into Review. It mints a new
`sessionInstanceId` and begins with zero receipts. Verified at runtime: after
completing a 3-outcome session, the next session reported only its own single
outcome with no trace of the previous one.

## Adaptive Session Reassessment

**Still excluded**, re-verified at this HEAD rather than assumed.

`useAdaptiveStudySession` sets `questions` from `plan.planItems` and re-derives
it whenever the plan changes; it is **never reduced by answering**. So
`isAdaptiveDone` (`questions.length === 0`) remains an empty-plan state, not a
completion state, and Phase 65 did not change this.

Against the §58 gate: finite plan — **no** (the question set is re-derived, not
fixed); canonical per-item completion tracked — **no** (nothing records which
planned entries were answered); unambiguous boundary — **no**; UX naturally
expects completion — **no** (no completion is reached by working through the
deck). Introducing `completedPlannedQuestionIds` would mean inventing a
completion contract the architecture does not yet support.

## Assignment Reassessment

**Still excluded.** Assignment outcomes are recorded inside
`StudySessionAdaptiveCard` via `onOutcomeRecorded` → `recordProgress`, not
through `useReviewSession`, and the `operationId` lives in that card's own state
hook. There is a real completion boundary, so this is a legitimate future
extension — but capturing a receipt there means threading operation identity out
of a component shared with adaptive mode. That is a separate piece of work, and
duplicating the receipt logic to avoid it would be the wrong move.

## Immersive Feed Decision

Unchanged and untouched. The Feed is open-ended and has no closure semantics; no
session identity or persistence was added to it.

## Offline / Failure Behavior

Local-storage failure and Firestore failure are independent. A failed
AsyncStorage write returns `false` and is ignored: the outcome is already safe on
the server, the in-memory receipt is intact, and study continues. A failed
outcome throws before any receipt exists, so nothing is appended or persisted.
Study is never blocked by local persistence.

If local state is missing or corrupt, it is **not** reconstructed from
`studyEvents`. Phase 66's honesty rule stands.

## Local Storage Cost

| Operation | Count |
|---|---|
| Reads | 1 per session mount |
| Writes | 1 per confirmed outcome |
| Deletes | 1 per completed session |
| Maximum active records | 1 |
| Lifetime growth | none — one key, no history, no archive |

Receipts are infrequent (one per answered question), so no debounce or
coalescing infrastructure was built for them.

## Backend Cost

New Firestore reads **0**, writes **0**, listeners **0**, polling **0**,
indexes **0**, collections **0**, fields **0**, Cloud Functions **0**, security
rules **0**, dependencies **0**. No N+1: hydrated receipts carry their own
metadata and trigger no lookup.

## Localhost Runtime Acceptance

Firebase emulators + Expo Web at 375px. Canonical fixtures are future-scheduled,
so three temporary emulator-only due items were seeded and removed afterwards.

The mandatory scenario, end to end:

| Step | Result |
|---|---|
| Session start | 3 cards, nothing persisted yet |
| Outcome 1 (`p67-a1` struggled) | server `attemptCount` 1→2, rescheduled +1 day, 1 `studyEvent`; envelope written with 1 receipt |
| Refresh ×3 | session id and `startedAt` unchanged, receipt still 1, queue correctly re-queried to `1 / 2` |
| Outcome 2 (`p67-a2` solved) | 2 receipts — the pre-refresh one plus the new one |
| Outcome 3 (`p67-b1` solved) | completion screen |
| Final reflection | **"3 soru üzerinde çalıştın · Çözdüm 2 · Zorlandım 1"** |
| Server | exactly 3 `studyEvents`, one per question, despite 3 reloads |
| Completion cleanup | stored record `null` while the summary still rendered |

The reflection's topic moment — `Denklemler: Zorlandım → Çözdüm`, "Bu çalışmada
zorlanmanın ardından çözüm görüldü." — **spans the refresh boundary**. Under
Phase 66 that first outcome would have been lost and the moment never stated.

Probes:

- **Corrupt payload** (`{this is not json at all`): no crash, session started
  normally.
- **Foreign envelope** (`userId: demo-student-b`, 2 receipts): never hydrated —
  a new id was minted, the resulting envelope belonged to `demo-student-a` with
  exactly 1 receipt, and no foreign field leaked. The foreign record was left in
  place until overwritten, as designed.
- **New session after completion**: fresh session, its own single outcome, zero
  leakage.

Persisted record inspected directly: exactly the six declared envelope fields and
five declared receipt fields — no question body, no answers, no credentials, no
tokens, no teacher content.

Temporary data removed with an existence check: 0 leftovers, 0 temporary
`studyEvents`. The emulator export directory this run created was deleted, so the
worktree holds only the phase's own files.

## Theme / Accessibility

No new UI. The Phase 66 reflection card is unchanged and its theme/accessibility
acceptance carries forward; it was re-observed rendering correctly in light
theme at 375px during this phase's runtime run. No resume indicator, modal,
wizard or history picker was added — a resumed session simply continues, which
is the outcome that needs no explanation.

## iOS Decision

| Gate | Answer |
|---|---|
| New native dependency | NO — AsyncStorage is already installed and native-proven |
| New native configuration | NO |
| New native permission | NO |
| Platform-specific persistence | NO — one abstraction, no `.native`/`.web` split |
| Native-only lifecycle API | NO |
| Native-only navigation change | NO |
| Native layout/gesture change | NO |

**NATIVE IOS: NOT REQUIRED THIS PHASE.**

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | 150 suites / 2612 tests (+1 suite / +44) |
| rules | 5 suites / 365 tests (unchanged) |
| functions build | PASS |
| verify | PASS |
| expo-doctor | 17/18 (known pre-existing drift) |
| `git diff --check` | PASS |

## Source Integrity

All five touched files: **0 NUL bytes**, valid UTF-8, LF-only, no conflict
markers, and `git diff --numstat` reports real line counts rather than binary
markers. No debug instrumentation, temporary QA UI or `console.*` was added.

## Known Limitations

- **Not crash-atomic.** A process death between the server write and the local
  write loses one receipt. Narrowed, not eliminated — see the atomicity section.
- **Refreshing on the completion screen loses the summary**, because a mount
  cannot tell that case apart from starting a new session.
- **One time-based value exists**: a 12-hour technical staleness bound
  (`ACTIVE_SESSION_MAX_AGE_MS`). It never groups outcomes and is not session
  truth — membership is already fixed by construction before it is consulted. It
  only decides whether an abandoned envelope is still plausibly the sitting in
  progress. Without it, receipts from a session abandoned days ago would surface
  inside a later session's "Bu çalışmada" summary, which is exactly the
  dishonesty Phase 66 exists to prevent. Expiring too eagerly only ever
  under-counts, which is the safe direction. A session legitimately spanning more
  than 12 hours would start fresh.
- **Review sessions only** — adaptive and assignment remain excluded, for the
  reasons proven above.
- The hook itself is not rendered in tests (no React renderer in this repo), so
  lifecycle coverage models the hook's call order rather than mounting it.
- Canonical fixtures cannot exercise this (nothing due), so runtime used
  temporary, fully-removed emulator data.

## Final Product Assessment

The honesty rule that shaped Phase 66 is what made this phase tractable: because
the receipt was already an explicit record rather than an inference, making it
durable meant writing down something that was already true, not deciding
anything new. Nothing here reconstructs, groups or guesses.

The failure Phase 66 named is closed. A student who refreshes mid-session now
finishes with a summary that matches what the server actually accepted — proven
at runtime with a recovery moment that spans the refresh boundary.
