# Phase 93 — Server-Enforced Comment Lifecycle + Authoritative Comment Deletion

## Repository Sync

Local HEAD was `22abed4` (Phase 92) and the canonical remote
`origin/phase17-moderation-infrastructure-20260806-195814` was at the same commit: ahead/behind
`0 0`, worktree clean — classification A, already current. No fast-forward was required.

## Actual Starting Head

`22abed4294e8f582073e0ffb0ecf89c6aa509559` — Phase 92, Verified Answer-Like Intent Safety +
Idempotent Engagement Retries. No `PHASE93*` document and no Phase 93 commit existed on any branch.

## Collaborator Safety

`git fetch origin` ran before implementation, immediately before commit and immediately before push.
The canonical remote stayed at `22abed4` throughout. `main` was never checked out, merged or pushed.
No force push, no history rewrite.

## Phase 92 Foundation

By the end of Phase 92 the question lifecycle and both like surfaces were server-authoritative.
Comment CREATE had been server-only since Phase 17. Comment DELETE was the last direct client
mutation in this area.

## Product Mission

Make one lifecycle answer to one authority — without widening who may remove a comment, and without
rebuilding the parts that were already right.

## Existing Comment Lifecycle

- **Create**: `submitQuestionCommentForModeration` (Admin SDK) is the only writer. It derives
  `authorId` from the caller, writes `createdAt` itself, checks the question exists and is readable,
  publishes only after the moderation decision, and is idempotent through a deterministic
  `uid_operationId` submission id. Rate-limited to one submission per user per 5 seconds.
- **Read**: client, gated by the rule on the parent question existing AND being readable.
- **Update**: denied.
- **Delete**: a real product feature — the trash affordance on one's own comment in `CommentItem`,
  wired through `CommentList` → `QuestionDetailScreen` → `useQuestionComments.remove` — implemented
  as a direct client `deleteDoc`.
- **commentCount**: `onQuestionCommentCreate` / `onQuestionCommentDelete`, each transactional, the
  decrement floored at 0.
- **Notifications**: prepared inside the create trigger's transaction.

## Write Matrix

| Path | Writer | Direct client (before) | (after) | Idempotent |
|---|---|---|---|---|
| create | moderation callable | **DENIED** | DENIED | **yes** (`uid_operationId`) |
| read | client | allowed | allowed | n/a |
| update | — | DENIED | DENIED | — |
| **delete** | client `deleteDoc` | **ALLOWED (author)** | **DENIED** | now yes |
| `commentCount` | triggers | DENIED | DENIED | floored at 0 |

## Create Contract

Preserved exactly. Not rebuilt, not touched — Part 18's instruction and the right call: it was
already the strongest part of this area.

## Delete Contract

`deleteQuestionComment` — a callable taking `{ commentId }` and nothing else. It reads the stored
comment, requires `ownerId === caller`, and deletes. A comment that is already gone returns
`{ deleted: false }` rather than throwing, which is what makes a retry after a lost response safe:
the user asked for it gone and it is gone, so failing the second call would be a lie the client would
have to explain.

## Moderation Contract

Untouched. `moderationSubmissions` are separate documents holding the decision, the text, the reason
and `publishedEntityId`; they survive the comment's deletion by design, and a test pins that. No
moderation state is written, bypassed or erased, and no classifier or AI was added.

## Status / Soft-Delete Audit

`CommentStatus` includes `"deleted"` and `toComment` maps it defensively, but **nothing writes it** —
published comments are written `status: "active"` and nothing transitions them. Phase 91 noted this;
Phase 93 re-confirmed it and deliberately did **not** build a soft-delete lifecycle on the strength of
a vestigial read field. The product hard-deletes, so the gateway hard-deletes.

## Current Direct-Delete Proof

Measured against the pre-change build, with real tokens:

| Actor | Raw REST DELETE |
|---|---|
| outsider | 403 |
| another student | 403 |
| **question's own owner (teacher)** | 403 |
| **the comment's author** | **200 — the remaining client mutation** |

So the right was already correctly narrow. What was wrong was *where it was enforced*.

## Authorization Matrix

| Actor | Before (rule) | After (callable) |
|---|---|---|
| comment author | allowed | **allowed** |
| another student | denied | denied |
| question's owner | denied | denied |
| class teacher | denied | denied |
| outsider | denied | denied |
| unauthenticated | denied | denied |

**Rights widened: NO.** The callable's authorization is copied from the rule it replaces. Owning a
question does not make someone the moderator of the conversation under it, and teaching the class
does not either.

## Server Delete Gateway

`functions/src/social/deleteQuestionComment.ts`, exported through `social/index.ts` and
`functions/src/index.ts`. Its contract is `applyDeleteQuestionComment(db, callerUid, data)` —
exported separately from the `onCall` wrapper and taking `db` as a parameter, the pattern every
server gateway in this repo uses, so the tests drive the shipped code.

It lives in `social/` rather than `moderation/` because an author removing their own comment is not a
moderation decision; it sits next to the counters that react to it.

## Firestore Rule Hardening

`allow delete: if false` on `questionComments`. Create, update and read are unchanged. The full
client write surface for a comment is now: nothing.

## Delete Idempotency

Proven: a second and third delete of the same comment return `{ deleted: false }` with no error and
no further effect; the counter does not decrement again. Two concurrent deletes by the author remove
exactly one document. A comment that never existed returns the same quiet result.

## Create Idempotency Regression

Re-proven after the change: the same `operationId` submitted twice leaves one comment document and
one increment.

**A correction worth recording:** an earlier run of the probe reported create idempotency as failing.
It was not. `submitQuestionCommentForModeration` rate-limits one submission per user per 5 seconds,
and the probe had fired several in quick succession, so the first call was throttled rather than
published. The probe now waits past the window and prints the returned status, so a throttle can
never be mistaken for a defect again.

## commentCount Architecture

`onQuestionCommentCreate` increments inside a transaction that also prepares the notification;
`onQuestionCommentDelete` decrements inside a transaction that floors at 0 rather than using a bare
`increment(-1)`. Both skip a question document that no longer exists.

**The gateway deliberately does not touch the counter.** Admin SDK writes fire Firestore triggers
like any other, so `onQuestionCommentDelete` runs on the callable's delete exactly as it ran on the
client's. Decrementing in the callable as well would double-count. The counter keeps exactly one
side-effect owner — which is the whole reason not to move it.

## Trigger Delivery Semantics

Cloud Functions triggers are delivered at-least-once, so a retried delivery could in principle apply
a counter change twice. This is **documented in the code itself** (`onAnswerCreate`, mirrored by
`commentCounters`) with three stated reasons for accepting it: retries are rare, the count is
informational only — nothing security- or scoring-sensitive reads it — and it can be recomputed from
the collection if it ever drifts.

No drift was measured. This is a deliberate, reasoned engineering decision, not a discovered defect.

## Counter Branch Decision

**BRANCH A — KEEP TRIGGERS.**

Part 22 permits migrating counter ownership only if a real drift risk is confirmed, and Part 23
forbids chasing exactly-once for aesthetics. No drift was observed, the rationale in the code is
sound, and moving the side effect into the callable while the trigger still fires would have
introduced the exact double-count the current design avoids. Nothing was migrated.

## Counter Exactness

Runtime-proven: create +1 once, retry with the same `operationId` unchanged, canonical delete −1
once, delete retry unchanged (2 → 1 → 1). No negative value at any point.

## Counter Floor

Unchanged and still present: the decrement transaction floors at 0.

## Notification Semantics

Unchanged, and deliberately not extended. The create trigger prepares the notification; nothing
removes it when a comment is deleted, and Phase 93 did not invent that cleanup. A notification whose
comment is gone degrades to the same missing-content handling the app already has.

One behaviour worth recording because it looks like a bug and is not: the probe showed **zero**
notifications for the question's owner. `resolveQuestionEventRecipient` suppresses notifications for
**teacher-owned questions** by design, and the fixture's question was teacher-owned. Correct, not a
defect.

## Missing Question Behavior

Create already refuses a missing question with `404`. Delete deliberately does **not** require the
question to exist — see below.

## Orphan Comment Behavior

Phase 90 measured that a server-side question removal would orphan its comments. The rule being
replaced did not check the question either, and requiring it would strand an author with a comment
they could never remove. So the gateway authorizes on comment ownership alone, and a test pins that
an orphaned comment is still deletable by its author. Orphans remain unreadable by rule, and no
cleanup job was added.

## Raw Delete Bypass Closure

The author's raw REST DELETE that returned **200** before this phase now returns **403**, with the
comment intact. Every other actor was and remains 403. The canonical callable then removes it
successfully.

## Runtime QA

The same probe ran before and after. Before: author raw delete 200, callable not deployed. After:
author raw delete 403 with the comment intact, callable delete 200 with the count 2 → 1, retry 200
with `deleted=false` and the count unchanged, every non-author actor `PERMISSION_DENIED`,
unauthenticated `UNAUTHENTICATED`, create idempotency intact, moderation submissions retained.

## Security QA

17 emulator tests plus the runtime probe. The comment's full client write surface is now empty:
create denied, update denied, delete denied, read unchanged.

## Question-Like Regression

Phase 91 unchanged and passing.

## Answer-Like Regression

Phase 92 unchanged and passing.

## Historical Learning Evidence Regression

Comments are engagement metadata. `studyEvents`, `studyItems`, semantic definitions, the Phase 42
classifier, Phase 78/79 signals and the Phase 83/84 surfaces are untouched, and the full suite passes
unchanged.

## Zero-Write Failure States

Unauthenticated, another student, the question's owner, a teacher, an outsider, a malformed comment
id, and every raw client delete: all refused with the comment intact and the counter unmoved. A retry
against an already-deleted comment writes nothing.

## Query / Cost

Per delete: 1 callable invocation, 1 transaction with 1 read and 1 delete, then the existing trigger
doing 1 read and 1 counter write. A retry against a missing comment costs 1 read and **zero** writes.
No new index, no new collection, no listener, no polling, no fanout.

## Functions Build

Functions source changed, so the build ran before runtime QA, and the emulator reported
`deleteQuestionComment` initialised from compiled `lib/` — the QA exercised the new code, not a stale
build.

## UI Decision

**No visual change.** The trash affordance on one's own comment is untouched in appearance,
placement and behaviour; only the transport beneath it changed. The one copy change is the text
inside the existing `Alert.alert` on failure, which now names the reason instead of saying "try
again" for every case.

## Accessibility

Unchanged. The delete control keeps its `accessibilityRole="button"` and its
`accessibilityLabel="Yorumu sil"`; no icon-only control was introduced and no reading order moved. The
changed failure text lives in a system alert, which has no app-controlled layout to regress — so
there is no responsive surface to check, and none is claimed.

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
- `npm run test:rules` — **541 passed, 10 suites**
- `npm run verify` — pass
- Functions build — pass
- Functions lint — **4 errors, all pre-existing, zero new**
- `git diff --check` — clean
- `npx expo-doctor` — 17/18
- Runtime QA — before/after probe, the direct-delete bypass closed

## Source Integrity

Byte-accurate sweep of all nine changed files: no NUL, no CR or CRLF, no BOM, no stray control
characters, final newline present, UTF-8. No instrumentation, no `.only`/`.skip`. The temporary probe
was deleted; `git status` shows only the ten intended files. Verified by grep that no client write
primitive remains in `comments.ts`.

## Known Limitations

- **`commentCount` remains trigger-based and at-least-once.** Kept deliberately (Branch A); the
  caveat is documented in the code with its reasoning, no drift was measured, and no exactly-once
  machinery was added. It is not claimed to be exactly-once.
- **A comment's create notification is not removed when the comment is deleted.** Pre-existing
  behaviour, unchanged; the notification degrades to the app's existing missing-content handling.
- **`status: "deleted"` remains vestigial** — read defensively, written by nothing. No soft-delete
  lifecycle was invented on the strength of it.
- **Delete retry reports `{ deleted: false }` rather than an error** for a comment that is already
  gone. That is the contract, and it is deliberately indistinguishable from "never existed" so it
  leaks nothing.
- **Moderation submissions outlive their comments**, retaining text and decision. That is an audit
  record, not a leak of deleted content to other users — `moderationSubmissions` reads are
  author-only.
- **Orphaned comments after a future trusted question removal remain**, unreadable by rule; no
  cleanup job was added.
- No comment editing, threading, replies, mentions, reactions or history was added; no teacher
  moderation power was created.
- Question removal as a product feature is still absent (Phase 90); the Storage-orphan behaviour it
  documented is unchanged.
- Likes remain Phase 91/92 desired-state safe; learning evidence is unaffected.
- **`functions` lint reports 4 `no-irregular-whitespace` errors** in
  `functions/src/moderation/textNormalization.ts`, from commit `2fdb5b5` — literal zero-width
  characters inside the moderation stripper's regex classes, load-bearing. Untouched. Zero new.
- **`expo-doctor` reports 3 Expo patch-version drifts.** Pre-existing, unrelated, not in this
  changeset.
- **Pre-existing technical debt, untouched:** `src/features/teacher/services/studentPerformance.ts`
  still contains one raw NUL byte.

## Phase 94 Readiness

Comment create and delete are both server-authoritative, both idempotent, and the client can no
longer write a comment document by any verb. Questions, question likes and answer likes were already
closed. The remaining engagement-adjacent client write is `savedQuestions`, a personal bookmark with
no shared state — which is why it has never needed a gateway, and why the more interesting next
subject is probably `answers` themselves, whose own lifecycle has not had this treatment.

## Product Assessment

The valuable part of this phase was refusing to do two of the three things it could have done. The
counter triggers looked like an obvious target and were left alone, because their at-least-once
caveat is a documented decision with reasons rather than an accident. The `status: "deleted"` field
looked like an invitation to build soft deletion and was left alone, because nothing writes it. What
remained was the actual asymmetry: one lifecycle with its create on the server and its delete in the
client. Both ends now answer to the same authority, and the author can still delete their own comment
— which was never in question, and is the thing a user would have noticed if it had been.
