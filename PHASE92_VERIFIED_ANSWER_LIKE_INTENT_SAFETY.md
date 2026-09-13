# Phase 92 — Verified Answer-Like Intent Safety + Idempotent Engagement Retries

## Repository Sync

Local HEAD was `0be3d7a` (Phase 91) and the canonical remote
`origin/phase17-moderation-infrastructure-20260806-195814` was at the same commit: ahead/behind
`0 0`, worktree clean — classification A, already current. No fast-forward was required.

## Actual Starting Head

`0be3d7a594d5d7c759e515892f8b988c6c022259` — Phase 91, Server-Enforced Question Engagement Integrity
+ Comment / Like Referential Safety. No `PHASE92*` document and no Phase 92 commit existed on any
branch.

## Collaborator Safety

`git fetch origin` ran before implementation, immediately before commit and immediately before push.
The canonical remote stayed at `0be3d7a` throughout. `main` was never checked out, merged or pushed.
No force push, no history rewrite.

## Phase 91 Foundation

Phase 91 made question likes idempotent by having the callable accept the state the caller wants to
end in, and named `toggleAnswerLike` as carrying the identical defect — "the strongest safe next
capability."

## Confirmed Remaining Defect

Reproduced against the live pre-fix compiled callable before a line was changed. Four consequences,
not one:

| Scenario | Result |
|---|---|
| A likes, then retries the same LIKE intent | `liked=true` → **`liked=false`**, count 1 → **0** |
| Two devices, same user, both meaning LIKE | `true` / `false` — **ended NOT liked**, count 0 |
| A unlikes, then retries the same UNLIKE intent | `liked=false` → **`liked=true`** |
| The answer owner's like notification | created by the first call, **deleted by the retry** |

The notification consequence was not in the brief and was found by measuring rather than assuming.
Under the old contract a user whose network dropped a response would, by tapping again, silently
withdraw the notification the answer's author had already received.

## Product Mission

An answer like should mean "I want this answer liked", not "invert whatever the server happens to
hold when this retry arrives."

## Existing Answer-Like Architecture

Audited, and deliberately **not** assumed to be a copy of the question path:

- **Callable**: `toggleAnswerLike` (Admin SDK, `us-central1`), single transaction.
- **Access**: derived from the answer's **parent question** — the answer is read, then its question,
  then class membership. An answer on a class question is likeable only by that class.
- **Extra read**: the create branch additionally reads the answer owner's account role
  (`resolveAnswerEventRecipient`), which the question path has no equivalent of.
- **Identity**: `answerLikes/{answerId}_{userId}` via the shared `buildLikeId`.
- **Counter**: `answers/{answerId}.likeCount`, updated inside the same transaction, floored at 0.
- **Notification**: `answer_liked`, created on like and deleted on unlike.
- **Raw client writes**: `answerLikes` is `allow write: if false`; the answer's `likeCount` is not
  client-writable.

## Answer-Like Write Matrix

| Path | Writer | Direct client | Exists | Readable | Idempotent (before) | (after) |
|---|---|---|---|---|---|---|
| like / unlike | `toggleAnswerLike` (Admin) | **DENIED** | yes (`404`) | yes, via parent question (`403`) | **NO** | **YES** |
| `answers.likeCount` | same transaction | **DENIED** | — | — | — | floored at 0 |
| `answerLikes` doc | same transaction | **DENIED** | — | — | deterministic id | unchanged |

## Deterministic Like Identity

Already correct and **preserved unchanged**. One user and one answer can only ever produce one
document, proven by three consecutive likes leaving exactly one.

## Counter Architecture

Unchanged: written inside the callable's own transaction alongside the like document, so the count
and the documents cannot diverge, and the decrement floors at zero rather than using a bare
`increment(-1)`.

## Notification Architecture

Unchanged in structure. What changed is that a no-op now returns **before** the owner-role read and
before any notification planning, so a retried intent neither creates a duplicate notification nor
deletes the existing one.

## Before-Fix Retry Proof

See Confirmed Remaining Defect. The probe was run against the compiled `lib/` in the emulator, and
the compiled output was checked to contain **no** desired-state branch at that point.

## Desired-State Contract

`toggleAnswerLike` now accepts an optional `liked`:

- `liked: true` — ensure the like exists
- `liked: false` — ensure it does not
- omitted — legacy toggle

A desired state that already holds returns that state without writing. It is deliberately **not** an
error: the first call succeeded, so failing the retry would be a lie the client would have to undo.

## Backward Compatibility

The field is optional and the toggle branch is intact, so a client build shipped before this phase
behaves exactly as it did. The current client always sends the desired state. Legacy mode is retained
for compatibility only and is **not** retry-safe — no claim is made otherwise.

## Client Intent

`useLike` already computed `desiredLiked` for Phase 91; `likeService.toggleLike` was dropping it on
the answer branch. It now forwards it for both target types, and `toggleAnswerLike`'s wrapper carries
it through. Three lines of behaviour, no UI change.

## Server State Machine

| Current | Desired | Action |
|---|---|---|
| false | true | create like, +1 counter, notify |
| true | true | **no-op** — no write, no notification |
| true | false | delete like, −1 counter (floored), remove notification |
| false | false | **no-op** — no write |

## Atomic Transaction Contract

One Firestore transaction: every read (answer, parent question, membership, like, and — only on an
actual create — the owner's role) precedes any write. The desired-state comparison happens inside
that transaction, so the decision and the mutation cannot be separated.

## Same-Intent Retry

`liked=true` twice → liked, count 1, one document, one notification. `liked=false` twice → not liked,
count 0, no document. Proven at runtime and in the emulator matrix.

## Two-Device Like

Two concurrent calls, same user, both `liked=true`: both returned `true`, one like document, count 1.
Before the fix the same pair returned `true` / `false` and ended **not liked**.

## Two-Device Unlike

Two concurrent `liked=false`: both settle on not liked, count 0, no document, no negative count.

## Contradictory Intent Honesty

If two devices send genuinely *different* desired states at the same moment, the last committed
transaction wins. That is ordering, not a guarantee, and no deterministic preference is claimed.
Phase 92 protects **same-intent retries**, which is the network-failure case users actually hit; it
does not and cannot adjudicate between two contradictory simultaneous intents.

## Missing Answer

`404 NOT_FOUND` for both desired states, with zero like documents, zero counter change and zero
notifications. An answer not linked to a question at all is refused with `failed-precondition`, and
an answer whose parent question has been removed is refused with `permission-denied`.

## Unreadable Answer

A user who is not a member of the parent question's class is refused with `permission-denied` and
writes nothing. Access semantics were reused, not reinvented.

## Raw Security

- raw `answerLikes` create — **403**
- raw `answers.likeCount` write — **403**
- raw question create / update / delete — **403 / 403 / 403** (Phases 89 / 88 / 90 preserved)
- raw `questionLikes` create and delete — **403** (Phase 91 preserved)

## Counter Exactness

0 → A likes 1 → A retries ×2 still 1 → B likes 2 → A unlikes 1 → A retries unlike still 1 → B unlikes
0. Documents track the count at every step.

## Counter Floor

A deliberately corrupted count (0 while a like exists) clamps at 0 on unlike rather than going
negative. No repair system was added.

## Notification Exactness

First like → one notification for the answer owner. Retried like → **still one** (before the fix the
retry deleted it). Unlike → removed, as before. Self-like suppression is handled by
`resolveAnswerEventRecipient` and is untouched.

## Question-Like Regression

Phase 91's question-like behaviour is unchanged and its full test suite passes. No shared code was
refactored — the two callables remain separate, as Part 31 requires.

## Comment Regression

Untouched. No comment callable, rule, counter or moderation path was modified, and Phase 91's comment
tests pass.

## Historical Learning Evidence Regression

Engagement writes no learning record. `studyEvents`, `studyItems`, the Phase 42 classifier, Phase
78/79 signals and the Phase 83/84 evidence surfaces are all untouched by this change, and the full
suite passes unchanged.

## Zero-Write No-Op States

Unauthenticated, missing answer, unreadable answer, answer with no parent question, duplicate
`liked=true` and duplicate `liked=false` all produce **zero** state-changing writes and zero
notifications. Transaction reads still occur on a no-op — reads are not writes, and the report does
not conflate them.

## Query / Cost

- **State-changing like**: 1 callable, 1 transaction (answer + question + membership + like reads,
  plus the owner-role read on create), 1 like write, 1 counter write, 1 notification write.
- **Desired-state no-op**: 1 callable, the same reads minus the owner-role read, and **0 like
  writes, 0 counter writes, 0 notification writes**.
- No new collection, no new index, no new listener, no polling.

## Functions Build

Functions source changed, so the build ran before runtime QA. The compiled
`lib/social/toggleAnswerLike.js` was checked for the desired-state branch — **0 occurrences before
the fix, 3 after** — and the emulator reported the callable initialised from that compiled output, so
the QA exercised the new code rather than a stale build.

## Runtime QA

The same probe was run twice against the real callable over HTTP: once before the change
(reproducing all four defect consequences) and once after (all four corrected). Authorization,
existence and raw-write behaviour were identical in both runs, confirming the fix changed only what
it was meant to change.

## Rule Regression

**`firestore.rules`: zero diff.** The engagement rules were already correct, and Part 38's
expectation held.

## UI Decision

**UI changed: NO.** The like button, its layout, its copy and its states are untouched; only the
payload the existing hook already computed now reaches the answer callable.

## Accessibility

**N/A — no interface change.** The accessible name, pressed/selected state, count text and keyboard
activation of the like button are untouched, and no new error path or message was introduced.

## iOS Decision

- New native dependency: **NO**
- Native configuration change: **NO**
- Native-only API: **NO**
- Native-only behaviour: **NO**
- Confirmed native defect: **NO**

**NATIVE IOS: NOT REQUIRED THIS PHASE.**

## Automated Validation

- `npx tsc --noEmit` (root and functions) — clean
- `npx eslint . --ext .ts,.tsx` — clean
- `npx jest` — **3540 passed, 179 suites**
- `npm run test:rules` — **523 passed, 9 suites**
- `npm run verify` — pass
- Functions build — pass
- Functions lint — **4 errors, all pre-existing, zero new**
- `git diff --check` — clean
- `npx expo-doctor` — 17/18
- Runtime QA — before/after probe, all four defect consequences corrected

## Source Integrity

Byte-accurate sweep of all four changed files: no NUL, no CR or CRLF, no BOM, no stray control
characters, final newline present, UTF-8. No instrumentation, no `.only`/`.skip`. The temporary probe
was deleted; `git status` shows only the five intended files.

## Known Limitations

- **Legacy callers that omit `liked` still toggle.** Retained deliberately so a client build shipped
  before this phase keeps working. Legacy mode is not retry-safe and is not described as such.
- **Desired-state protection covers the canonical client and callable path.** Raw writes are denied,
  so there is no second path to protect — but the guarantee is about the callable, not about any
  conceivable future writer.
- **Contradictory simultaneous intents remain order-dependent** by definition. See Contradictory
  Intent Honesty.
- **No engagement history.** A like is a current state, not a log; nothing records that it was
  toggled.
- No new reactions, no dislikes, no ranking changes, no analytics, no AI.
- **Comment delete remains Phase 91's direct author-only contract**, and the `commentCount` triggers
  remain at-least-once — both unchanged and previously documented.
- **No orphan cleanup**, and Phase 90's absent question-removal product and Storage-orphan behaviour
  are unchanged.
- Historical learning evidence is unaffected; one teacher per class unchanged.
- **`functions` lint reports 4 `no-irregular-whitespace` errors** in
  `functions/src/moderation/textNormalization.ts`, from commit `2fdb5b5` — literal zero-width
  characters inside the moderation stripper's regex classes, load-bearing. Untouched. Zero new.
- **`expo-doctor` reports 3 Expo patch-version drifts.** Pre-existing, unrelated, not in this
  changeset.
- **Pre-existing technical debt, untouched:** `src/features/teacher/services/studentPerformance.ts`
  still contains one raw NUL byte.

## Phase 93 Readiness

Both like surfaces now carry intent rather than a flip instruction, both are server-owned, both have
deterministic identity, exact counters and idempotent notifications, and neither can touch a learning
record. The engagement surface has no remaining known retry defect. The clearest next candidates are
elsewhere: comment deletion is still a direct client write, and the `commentCount` triggers remain
at-least-once by platform design.

## Product Assessment

This was a narrow phase and is reported as one. The value was not in the three lines of code but in
running the old contract first: it confirmed the two consequences the brief predicted and surfaced a
third it did not — that a retried like silently withdrew the notification the answer's author had
already been given. A like now means what the person meant by it, however many times the network
decides to deliver it.
