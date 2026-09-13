# Phase 94 — Server-Enforced Answer Lifecycle + Referential Integrity

## Repository Sync

Local HEAD was `f613749` (Phase 93) and the canonical remote
`origin/phase17-moderation-infrastructure-20260806-195814` was at the same commit: ahead/behind
`0 0`, worktree clean — classification A, already current. No fast-forward was required.

## Actual Starting Head

`f613749f8319518cc62b012c9138b539e6f9357a` — Phase 93, Server-Enforced Comment Lifecycle +
Authoritative Comment Deletion. No `PHASE94*` document and no Phase 94 commit existed on any branch.

## Collaborator Safety

`git fetch origin` ran before implementation, immediately before commit and immediately before push.
The canonical remote stayed at `f613749` throughout. `main` was never checked out, merged or pushed.
No force push, no history rewrite.

## Phase 93 Foundation

Questions, question likes, answer likes and comments were all server-authoritative by the end of
Phase 93. Answers themselves had not had this treatment.

## Product Mission

Find out what a client can actually do to an Answer document, and close only what the evidence shows
is both unsafe and unused.

## Existing Answer Lifecycle

Audited rather than assumed to mirror questions or comments — and it does not.

- **Create**: server-only since Phase 17B. An answer is an IMAGE with no text field, so
  `submitAnswerForModeration` publishes it only after Vision SafeSearch clears the picture and its
  OCR text clears the Turkish deterministic layer. `allow create: if false` makes that unbypassable.
- **Read**: client, gated on the parent question existing AND being readable.
- **Update**: allowed to the answer's owner, freezing `ownerId`, `questionId`, `method`, `imageUrl`
  and `createdAt`.
- **Delete**: allowed to the answer's owner, refused to everyone else including the question's owner.
- **Likes**: `toggleAnswerLike` (Admin SDK), desired-state and retry-safe since Phase 92.
- **`likeCount`**: written by that callable's transaction.
- **`questions.answerCount`**: incremented by `onAnswerCreate`. **There is no delete trigger.**

## Answer Write Matrix

| Verb | Writer | Direct client (before) | Product path | Decision |
|---|---|---|---|---|
| create | `submitAnswerForModeration` | **DENIED** | yes — composer → callable | untouched |
| read | client | allowed | yes | untouched |
| **update** | — | **ALLOWED to owner** | **none** | **DENIED** |
| **delete** | — | **ALLOWED to owner** | **none** | **DENIED** |
| like | `toggleAnswerLike` | DENIED | yes | untouched |
| `likeCount` | like callable | *see below* | — | now server-only in fact |
| `answerCount` | `onAnswerCreate` | DENIED | — | untouched |

## Answer Create Contract

Unchanged and untouched. It was already the strongest part of this surface, and Part 12's instruction
not to migrate what is already right applies.

## Answer Update Contract

**There is no answer edit feature.** The client answer service (`src/services/questions/answers.ts`)
exposes a subscription and nothing else — its own comment records that create was removed in Phase
17B — and `AnswerCard`'s only affordances are zooming the image and opening a profile. No edit
screen, hook or service exists anywhere in `src/features/answers`.

So the update rule was a capability with no caller. That would have been reason enough to leave it
alone, except for what it actually permitted.

## Answer Delete Contract

**There is no answer delete feature either** — no affordance, no client service. The rule allowed the
answer's owner and correctly refused everyone else; Phase 94 re-proved both halves before changing
anything.

## Answer Ownership

Unchanged. The answer's author owns it. The question's owner does not, and neither does the class
teacher — both were refused before this phase and are refused after. **No right was widened.**

## Parent Question Authorization

Unchanged. Reads require the parent question to exist and be readable; `toggleAnswerLike` walks
answer → parent question → membership, as Phase 92 documented.

## Answer Content Schema

`questionId`, `ownerId`, `imageUrl`, `method` (`photo` | `drawing`), `likeCount`, `createdAt`. No
field was added, removed or migrated.

## Existing Raw Mutation Proof

Measured against the pre-change build with real tokens, before a line was edited:

| Attempt | Actor | Result |
|---|---|---|
| raw create | answer author, teacher | 403 / 403 |
| update `likeCount` | outsider, other student, question owner | 403 / 403 / 403 |
| **update `likeCount` 0 → 9999** | **the answer's own author** | **200 — and it was stored** |
| **add an arbitrary field** | **the answer's own author** | **200 — and it was stored** |
| update `ownerId`/`imageUrl`/`questionId`/`method` | the author | 403 (the freeze list held) |
| delete | outsider, other student, question owner | 403 / 403 / 403 |
| **delete** | **the answer's own author** | **200** |

**The defect:** the update rule's comment claimed "likeCount is maintained only by toggleAnswerLike
… nothing else may ever change". The freeze list was real and held for all five fields it names — but
it never named `likeCount`, and a rule cannot enforce a field it does not name. An answer's author
could set their own like count to any number, and add fields the schema never defined.

That quietly undid Phase 92, which had just made answer likes deterministic, transactional and
floored at zero. A counter is not protected if its subject can write it directly.

## Create Idempotency

Unchanged. Answer publication runs through the moderation submission path, which uses the same
deterministic `uid_operationId` submission id as comments. Not re-engineered here.

## Update Safety

No concurrency model was added, because there is no edit feature to make concurrent. Part 17's
instruction not to turn this into answer optimistic concurrency was followed.

## Delete Idempotency

Not applicable — no delete gateway was built, because there is no caller for one. See Architecture
Decision.

## Answer Like Relationship

Phase 92's contract is intact and was re-proven after the rule change: `liked=true` then a retry both
return `true` with `likeCount` 1; `liked=false` then a retry both return `false` with `likeCount` 0.

This also proves the rule change did not reach the callable: `toggleAnswerLike` runs on the Admin
SDK, which bypasses `allow update: if false`, and remains the only writer of `likeCount` — now in
fact as well as in intent.

## answerCount Architecture

`questions.answerCount` is incremented by `onAnswerCreate`, transactionally, with the same
at-least-once delivery caveat documented in that file with three stated reasons. **There is no
`onAnswerDelete`.** Deleting an answer does not decrement it.

## Counter Branch Decision

**COUNTER A — KEEP EXISTING TRIGGERS.** No drift defect was found in the create path, nothing was
migrated, and no second side-effect owner was introduced. The counter keeps exactly one writer.

The missing decrement is recorded as a finding rather than fixed, because there is nothing to
decrement for: answer deletion is not a product feature, and Phase 94 did not create one.

## Counter Exactness

Unchanged by this phase, and re-checked during QA: the like counter moved only through the Phase 92
callable, and the answer counter only through `onAnswerCreate`.

## Notification Contract

Untouched. `onAnswerCreate` notifies the question's owner; `toggleAnswerLike` creates and removes the
`answer_liked` notification symmetrically, with self-notification suppression via
`resolveAnswerEventRecipient`. No notification path was added, removed or duplicated.

## Moderation Contract

Untouched. Answer publication still runs through Vision SafeSearch and the OCR text layer, and
moderation submissions are separate documents. No moderation state is written or erased, no
classifier changed, no AI added.

## Missing Parent Question

Answer creation already refuses a question that is gone, through the moderation callable's own
checks. Reads of an orphaned answer are refused by the rule, which requires the parent question to
exist.

## Orphan Answer Behavior

Phase 90 measured that a future trusted question removal would orphan dependent resources. An
orphaned answer becomes unreadable by rule and is no longer client-mutable at all. **No cleanup job
was added**, and none is implied.

One consequence is recorded honestly: because the delete capability is now closed, an orphaned answer
cannot be removed by its author either. That is not a regression — there was never an affordance to
do it — but if a removal feature is ever built, it will need to handle both the orphan case and the
missing counter decrement.

## Architecture Decision

**Part 12 outcome E/F — two verbs had no product path and are denied rather than gatewayed.**

- **Create**: already server-authoritative. Untouched.
- **Update**: denied. Not for symmetry — because it demonstrably permitted an author to forge their
  own `likeCount` and add arbitrary fields, and nothing used it.
- **Delete**: denied. No affordance, no service, and using it would have left `answerCount`
  permanently overstated since there is no delete trigger.

**No callable was built.** There is no caller for one, and Part 28 rules out creating a delete feature
to match CRUD symmetry. When the product wants answer removal, it gets a gateway then — with its UI
and with an answer to the counter — the way Phase 93 built comment deletion.

## Server Gateway(s)

None added.

## Firestore Rule Changes

`answers/{answerId}`: `allow update: if false` and `allow delete: if false`. Create was already
`false`; read is unchanged. The full client write surface for an answer is now empty.

Nothing else in the ruleset was touched.

## Raw Bypass Closure

| Attempt | Before | After |
|---|---|---|
| author forges own `likeCount` | **200, stored 0 → 9999** | **403, stays 0** |
| author adds an arbitrary field | **200, stored** | **403, absent** |
| author deletes their own answer | **200** | **403, answer intact** |
| every other actor, every verb | 403 | 403 |
| `toggleAnswerLike` | works | **works** |

## Runtime QA

The same probe ran before and after against the real emulator with real ID tokens. All three
previously-permitted mutations are now refused, every previously-refused actor stays refused, and the
Phase 92 like sequence is unchanged.

## Security QA

385 rules tests pass, including seven new ones covering a surface that previously had **no update or
delete coverage at all** — part of how the `likeCount` gap survived.

## Answer-Like Regression

Phase 92 intact, re-proven at runtime after the rule change.

## Comment Regression

Phase 93 untouched and passing.

## Question Lifecycle Regression

Phases 88–90 untouched and passing.

## Historical Learning Evidence Regression

No learning record is written by anything in this phase. `studyEvents` and `studyItems` were checked
during QA and are unaffected; the full suite passes unchanged.

## Zero-Write Failure States

Every refused mutation — author update, author delete, non-owner update, non-owner delete, outsider,
question owner, raw create — leaves the answer document byte-identical and writes nothing. No counter
moved.

## Query / Cost

**Zero change.** No callable was added, no read, no write, no index, no collection, no listener, no
polling, no fanout. The only diff is two rule lines and their tests.

## Functions Build

**Functions source did not change this phase** — `git status` on `functions/src` is empty — so no new
callable needed compiling. `npm run verify` still ran the Functions build (PASS) as part of
validation.

## UI Decision

**UI changed: NO.** Nothing in the product called the capabilities that were closed, so there is
nothing to restyle, re-copy or re-wire. The answer composer, card and like button are untouched.

## Accessibility

**N/A — no interface change.** No control, label, state or error message was added or altered.

## iOS Decision

- New native dependency: **NO**
- Native configuration change: **NO**
- Native-only API: **NO**
- Native-only behaviour: **NO**
- Confirmed native defect: **NO**

**NATIVE IOS: NOT REQUIRED THIS PHASE.** A Firestore rule change has no native surface.

## Automated Validation

- `npx tsc --noEmit` (root and functions) — clean
- `npx eslint . --ext .ts,.tsx` — clean
- `npx jest` — **3540 passed, 179 suites**
- `npm run test:rules` — **548 passed, 10 suites**
- `npm run verify` — pass
- Functions build — pass
- Functions lint — **4 errors, all pre-existing, zero new**
- `git diff --check` — clean
- `npx expo-doctor` — 17/18
- Runtime QA — before/after probe, all three permitted mutations closed

## Source Integrity

Byte-accurate sweep of both changed files: no NUL, no CR or CRLF, no BOM, no stray control
characters, final newline present, UTF-8. No instrumentation, no `.only`/`.skip`. The temporary probe
was deleted; `functions/scripts/` holds only the repository's own seed script.

## Known Limitations

- **Answer editing and deletion do not exist as product features**, and this phase did not create
  them. Both verbs are now denied to clients; Admin SDK paths are unaffected.
- **An orphaned answer cannot be removed by its author.** There was never an affordance to do so, so
  this is not a regression — but a future removal feature must handle it.
- **`questions.answerCount` has no decrement path.** `onAnswerCreate` increments; nothing decrements.
  Recorded as a finding rather than fixed, because there is no deletion to decrement for. Any future
  answer-removal gateway must solve this or the count will overstate reality.
- **`answerCount` and `commentCount` remain at-least-once**, per their documented rationale. Not
  claimed to be exactly-once.
- **Orphaned `answerLikes` after a hypothetical future answer removal** would persist; no cleanup job
  exists and none was added.
- Answer creation idempotency is whatever the moderation submission path provides; it was not
  re-engineered or re-measured here beyond confirming the path is unchanged.
- Phase 92 answer likes and Phase 93 comments remain as they were; question removal as a product
  feature is still absent (Phase 90).
- No answer version history, no edit UI, no threads, no reactions, no AI, no analytics.
- Learning evidence is unaffected; one teacher per class unchanged.
- **`functions` lint reports 4 `no-irregular-whitespace` errors** in
  `functions/src/moderation/textNormalization.ts`, from commit `2fdb5b5` — literal zero-width
  characters inside the moderation stripper's regex classes, load-bearing. Untouched. Zero new.
- **`expo-doctor` reports 3 Expo patch-version drifts.** Pre-existing, unrelated, not in this
  changeset.
- **Pre-existing technical debt, untouched:** `src/features/teacher/services/studentPerformance.ts`
  still contains one raw NUL byte.

## Phase 95 Readiness

Questions, answers, comments and both like surfaces are now closed to direct client writes; every
verb that a user can actually perform runs through a server gateway, and every verb that had no
product path is denied. The engagement and authoring surfaces have no known remaining client
mutation.

The clearest next subject is the counter asymmetry this phase surfaced rather than fixed:
`answerCount` can only ever grow. That matters the moment answer removal becomes a feature, and it is
worth deciding deliberately rather than discovering later.

## Product Assessment

The brief expected a lifecycle migration. The audit found something better worth doing: a rule whose
comment asserted a guarantee the rule itself did not implement. Five fields were frozen and held; the
sixth — the one Phase 92 had just spent a whole phase making trustworthy — was never named, so an
answer's author could set their own like count to 9999 and it would stick. That was closed, along
with two unused capabilities, and nothing was built that nobody would call.
