# Phase 91 — Server-Enforced Question Engagement Integrity + Comment/Like Referential Safety

## Repository Sync

Local HEAD was `698e9a2` (Phase 90) and the canonical remote
`origin/phase17-moderation-infrastructure-20260806-195814` was at the same commit: ahead/behind
`0 0`, worktree clean — classification A, already current. No fast-forward was required.

## Actual Starting Head

`698e9a2235af5acdea1b9c70f04a598eadfe1ce7` — Phase 90, Server-Enforced Question Lifecycle Closure +
Evidence-Safe Removal. No `PHASE91*` document and no Phase 91 commit existed on any branch.

## Collaborator Safety

`git fetch origin` ran before implementation, immediately before commit and immediately before push.
The canonical remote stayed at `698e9a2` throughout. `main` was never checked out, merged or pushed.
No force push, no history rewrite.

## Phase 90 Foundation

Phase 90 closed the question lifecycle to clients and, in measuring what deletion would cost, named
`questionComments` and `questionLikes` as the two resources that would orphan. This phase is about
those two — not as orphans, but as live interactive resources.

## Product Mission

Find out whether engagement state can drift from its source, and fix what actually can.

## Engagement Write Matrix

Built by reading every path and then exercising each one against the emulator.

| Operation | Writer | Direct client write | Question exists | Caller may read it | Idempotent |
|---|---|---|---|---|---|
| comment create | `submitQuestionCommentForModeration` (Admin SDK) | **DENIED** (`create: if false`) | yes (`404`) | yes (`403`) | **yes** — deterministic `uid_operationId` submission id |
| comment read | client | allowed | **yes, in the rule** | **yes, in the rule** | n/a |
| comment update | — | **DENIED** | — | — | — |
| comment delete | client `deleteDoc` | **allowed, author only** | n/a | n/a | delete is naturally idempotent |
| like / unlike | `toggleQuestionLike` (Admin SDK) | **DENIED** (`write: if false`) | yes (`404`) | yes (`403`) | **NO — a toggle inverted on retry** |
| `likeCount` | the like callable's transaction | denied | — | — | floored at 0 |
| `commentCount` | `onQuestionCommentCreate` / `Delete` triggers | denied | — | — | floored at 0 |

## Comment Create Contract

Already server-authoritative since Phase 17 and unchanged here: the only writer is the moderation
callable, which derives `authorId` from the caller, writes `createdAt` itself, checks the question
exists and that the caller may read it, and publishes only after the text passes the moderation
decision. `allow create: if false` is what makes that gate unbypassable, and a raw forged create
returns 403.

## Comment Delete Contract

Author-only, and left that way deliberately. Runtime-proven: another student **403**, the
**question's own owner 403**, the author **200**. Teacher moderation rights were not widened — the
same boundary Phases 86–90 hold for the question itself now has rules tests pinning it for the
conversation under it.

## Like Identity Contract

`questionLikes/{questionId}_{userId}` — deterministic, so one user and one question can only ever
produce one document. Proven: two concurrent calls for the same user leave exactly one like document
and a count of 1.

## Like Toggle / Desired-State Contract

**This is the one thing Phase 91 changed.**

The callable was a pure toggle, so its result depended on how many times it was called rather than on
what the user meant. Measured before changing anything:

- a client that retried after a lost response **un-liked what it had just liked** (`liked=true` then
  `liked=false`, count 2 → 1)
- two devices tapping "like" for the same user returned `true` then `false`

The deterministic id prevented duplicate documents and counter drift. It could not prevent inversion,
because inversion is what a toggle is.

`toggleQuestionLike` now accepts an optional `liked` — the state the caller wants to end in. When the
desired state already holds the call is a no-op that returns that state, so the same request sent
twice gives the same answer. Omitting the field keeps the original toggle behaviour, so a client
build that predates this keeps working. `useLike` now sends what the tap meant, and because its
failure path restores the previous state, a user who taps again after an error re-sends the same
desired state rather than a second flip.

## Question Existence Validation

Already enforced and re-proven: a like against a missing question returns `404 NOT_FOUND`, a comment
returns `404`, and neither writes anything.

## Question Readability Validation

Already enforced by the same `canReadQuestion` helper the rules mirror. An outsider is refused with
`403` on both paths, and the comment read rule additionally requires the question to exist.

## Comment Authorization

Create: any authenticated user who can read the question, through the moderation gate. Delete: the
comment's author, and nobody else — not another student, not the question's owner, not a teacher.

## Moderation Preservation

Untouched. No classifier changed, no AI added, no moderation state bypassed or duplicated. The
comment path still runs through `submitQuestionCommentForModeration` exactly as Phase 17 built it.

## Counter Architecture

`likeCount` is written inside the like callable's own transaction, alongside the like document.
`commentCount` is written by `onQuestionCommentCreate` / `onQuestionCommentDelete`, each
transactional. Clients cannot write any of them — Phase 88's `allow update: if false` on questions
covers all three counters, re-proven here with a raw `PATCH` returning 403.

## Counter Integrity

Runtime-proven sequence: 0 → A likes 1 → **A retries, still 1** → B likes 2 → A unlikes 1 → **A
retries the unlike, still 1** → B unlikes 0. Comment counter: publish +1 exactly once, retry with the
same operationId leaves it unchanged, author delete −1 exactly once, and no refused call moved it.

## Counter Underflow Safety

Both decrements floor at zero rather than using a bare `increment(-1)`, with the reason documented in
`commentCounters.ts`. Proven: an unlike against a never-liked question leaves 0, and a deliberately
corrupted count that disagrees with reality clamps at 0 instead of going negative.

## Retry / Idempotency

- **Likes**: idempotent as of this phase, via desired state.
- **Comments**: already idempotent, via a deterministic `uid_operationId` submission id — the same
  pattern Phase 89 used for question creation. Re-proven: the same operationId retried leaves one
  comment and one increment.
- **Comment delete**: naturally idempotent.

## Notification Side Effects

Unchanged, and deliberately not re-routed: the like callable creates and deletes the
`question_liked` notification inside its own transaction, and the comment counter trigger prepares
the `question_commented` notification inside its. Phase 91 added no second side-effect owner, so
there is no path by which one action can now notify twice. A desired-state no-op returns before the
write phase, so a retry sends no additional notification.

## Missing-Question Behavior

New engagement cannot attach to a question that is gone — `404` on both paths, zero writes. The
counter triggers also return early when the question document does not exist, so an orphan comment's
deletion cannot fail loudly.

## Orphan Behavior

Phase 90 measured that a server-side removal would orphan comments and likes. Phase 91 adds **no
cleanup fanout**, and does not need to: the comment read rule requires the question to exist, so an
orphaned comment is unreadable rather than leaked — now pinned by a rules test. Like documents are
readable only by their own owner and are not queried globally.

## Architecture Decision

**Outcome A from Part 12 — the existing architecture was already referentially safe, and only one
confirmed gap needed fixing.**

Comment creation, comment reads, likes and all three counters were already server-authoritative with
existence and readability checks; the raw write paths were already denied. Migrating any of that
behind a new gateway would have been change for symmetry, which Part 12 explicitly rules out.

The single measured defect was like retry inversion, and that is what this phase fixes — in the
callable that already existed, with one optional field, no new callable and no new collection.

## Server Gateway(s)

None added. `toggleQuestionLike` gained a `liked` parameter.

## Firestore Rule Changes

**None.** The rules were already correct on every point this phase examined. What changed in the
rules test suite is coverage, not policy: three assertions Phase 91 relies on were not pinned
anywhere — the question owner cannot delete a comment on their own question, a teacher cannot delete
a student's comment, and a comment whose question is gone is unreadable.

## Raw Bypass Proof

- raw like create — **403**
- raw like delete of the caller's OWN like — **403**
- raw comment create (forged `ownerId`) — **403**
- raw comment delete by a non-author — **403**
- raw comment delete by the question's owner — **403**
- raw `likeCount` write — **403**
- raw question create / update / delete — **403 / 403 / 403** (Phases 89 / 88 / 90 preserved)

## Comment Runtime QA

Student A published a comment through the moderation gate: `authorId` server-derived, `createdAt`
server-written, `commentCount` 0 → 1. The same operationId retried left one comment and one
increment. Blank text, a missing question, an unreadable question and an unauthenticated call were
all refused, and none moved the counter. The author deleted their own comment; the counter went
1 → 0.

## Like Runtime QA

The full L-matrix through the real callable — see Counter Integrity. Every step matched the intended
state, including both retries.

## Two-Device Like QA

Two concurrent calls, same user, both meaning "like": both returned `liked=true`, leaving one like
document and a count of 1. Before this phase the same pair returned `true` then `false`.

## Question Lifecycle Regression

Raw create, update and delete all still 403. The Phase 88 revision callable and the Phase 89 create
callable both still work. No engagement change reopened a question write.

## Historical Learning Evidence Regression

`studyEvents` and `studyItems` byte-identical (ids and `updateTime`) across a full run of likes,
unlikes, retries, comment publication and comment deletion. Engagement is metadata; it touches no
learning record.

## Query Cost

Per like/unlike: 1 callable invocation, 1 transaction reading the question and the like document
(plus 1 membership read for class questions), 1 like write, 1 counter write, and 1 notification write
— **and a desired-state no-op reads the same documents but writes nothing**. Per comment: 1 callable,
the moderation submission's reads, 1 comment write, then 1 trigger doing 1 read and 1 counter write.
No listeners beyond the existing comment subscription, no polling, no new index, no new collection,
no fanout.

## Security QA

39 of 39 runtime checks passed. Client write rights on question engagement: comment delete (author
only) and nothing else — comment creation, likes, unlikes and all three counters are server-only.

## Zero-Write Failure States

Blank comment, unauthenticated comment, comment on a missing question, comment on an unreadable
question, unauthorized comment delete, outsider like, like on a missing question, unauthenticated
like, and every raw bypass: all refused with zero writes and zero counter movement. A duplicate
desired-state call writes nothing and changes nothing.

## Responsive

**N/A — no visual change.** `useLike` changed only what it sends to the server; no layout, no copy,
no new state and no new error path. The like button renders exactly as before.

## Accessibility

**N/A — no interface change.** The like button's accessible name, selected state and count semantics
are untouched, and no new error message was introduced.

## Learning-System Regression

Phases 42–47, 59, 61–90 unchanged: 3540 unit tests across 179 suites and 507 integration tests across
8 suites all pass. No classifier, scheduler or adaptive logic was touched.

## Functions Build

Functions source changed, so the build ran before runtime QA. The emulator loaded
`toggleQuestionLike` from compiled `lib/`, and the compiled output was checked to contain the
desired-state branch — the QA exercised the new code, not a stale build.

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
- `npm run test:rules` — **507 passed, 8 suites**
- `npm run verify` — pass
- Functions build — pass
- Functions lint — **4 errors, all pre-existing, zero new**
- `git diff --check` — clean
- `npx expo-doctor` — 17/18

## Source Integrity

Byte-accurate sweep of all six changed files: no NUL, no CR or CRLF, no BOM, no stray control
characters, final newline present, UTF-8. No instrumentation, no `.only`/`.skip`. Both temporary QA
scripts were deleted; `git status` shows only the seven intended files.

## Known Limitations

- **Answer likes still use the plain toggle.** `toggleAnswerLike` has the identical shape and
  therefore the identical retry-inversion gap. It was outside this phase's subject and is left
  unchanged — stated rather than quietly half-fixed, and the obvious first candidate for next time.
- **Comment deletion remains a direct client write.** It is author-only, rules-enforced, and the
  counter trigger handles it correctly, so no gateway was added for it.
- **Counter triggers are at-least-once.** `commentCount` is maintained by Firestore event triggers,
  whose delivery is at-least-once; a duplicate delivery could double-count. This is pre-existing,
  documented in `commentCounters.ts` and SECURITY.md, and acceptable for the same stated reason — an
  informational display count, not a security or scoring value. No exactly-once claim is made. The
  like counter is not affected: it is written inside the callable's own transaction.
- **The like fix is client-cooperative.** The server honours a desired state but still toggles when
  the field is absent, so an older client build keeps the old behaviour until it updates. That is
  deliberate backward compatibility, not an oversight.
- **No question removal feature exists** (Phase 90), so orphaned engagement can only arise from
  trusted Admin/server removal. No cleanup job was added, and the Phase 90 Storage-image orphan
  remains a separate, unchanged matter.
- A `status: "deleted"` value is read defensively by the comment mapper but written by nothing — a
  vestigial field, left alone as out of scope.
- No reactions beyond like, no comment threads, no mentions, no engagement analytics, no AI.
- Historical evidence remains immutable; one teacher per class unchanged.
- **`functions` lint reports 4 `no-irregular-whitespace` errors** in
  `functions/src/moderation/textNormalization.ts`, from commit `2fdb5b5` — literal zero-width
  characters inside the moderation stripper's regex classes, load-bearing. Untouched. Zero new.
- **`expo-doctor` reports 3 Expo patch-version drifts.** Pre-existing, unrelated, not in this
  changeset.
- **Pre-existing technical debt, untouched:** `src/features/teacher/services/studentPerformance.ts`
  still contains one raw NUL byte.

## Phase 92 Readiness

Question engagement is coherent: likes are idempotent and server-owned, comments are moderated and
idempotent, counters cannot be client-written and cannot go negative, and nothing here can touch a
learning record. The clearest next candidate is `toggleAnswerLike`, which carries the same defect
this phase fixed for questions.

## Product Assessment

Most of what this phase looked for was already right — Phase 17 and the original like design had
done the hard parts, and saying so is more useful than rebuilding them. The one thing that was
genuinely wrong was subtle: a like that meant "like" could end up meaning "not liked", because the
server was told to flip rather than told what the user wanted. It is now told what the user wanted.
