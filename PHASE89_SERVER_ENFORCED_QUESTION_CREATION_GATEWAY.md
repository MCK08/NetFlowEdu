# Phase 89 — Server-Enforced Question Creation Gateway + Canonical Authoring Integrity

## Repository Sync

Local HEAD was `45a6b56` (Phase 88) and the canonical remote
`origin/phase17-moderation-infrastructure-20260806-195814` was at the same commit: ahead/behind
`0 0`, worktree clean — classification A, already current. No fast-forward was required.

## Actual Starting Head

`45a6b56502eb13a9590d1d9e18a9b002c8a01191` — Phase 88, Server-Enforced Question Revision Gateway +
Authoritative Optimistic Concurrency. No `PHASE89*` document and no Phase 89 commit existed on any
branch.

## Collaborator Safety

`git fetch origin` ran before implementation, immediately before commit and immediately before push.
The canonical remote stayed at `45a6b56` throughout. `main` was never checked out, merged or pushed.
No force push, no history rewrite.

## Phase 88 Foundation

Phase 88 made question REVISION server-authoritative and denied every client update. It deliberately
left creation alone and said so. Phase 89 is that half.

## Product Mission

One server-authoritative gateway for question creation, so every question that enters Firestore is a
coherent question: its correct answer is among its options, its shared meanings exist and may be used
where they are used, its image belongs to the person who took it, and its identity fields were
decided by the server.

## Existing Create Paths

The audit found exactly **one** client write, `addDoc` at `src/services/questions/questions.ts:80`,
reached by four composers — all image-first, all funnelling through `uploadService`:

| # | Path | Screen | Visibility | posterRole | Metadata | Shared definitions |
|---|---|---|---|---|---|---|
| 1 | `useClassUpload` | TeacherClassDetail | class | teacher | **none** (`""`, no choices) | no |
| 2 | `useTeacherQuestionComposer` | ClassPerformance | class | teacher | full | yes |
| 3 | `useStudentQuestionUpload` | StudentClassDetail | class | student | full | yes |
| 4 | `useUpload` | FeedScreen | private/public | student | full | n/a (no class) |

Path 1 is the one that shaped the design: a one-tap capture with no metadata form at all, creating an
image-only question with empty subject, topic and grade. It has worked that way since Phase 21.
Requiring a taxonomy value on the server would have silently deleted it.

Seed and QA tooling uses the Admin SDK and bypasses rules, so it is unaffected.

## Question Create Rule Audit

The live rule was **probed with real teacher, student and outsider tokens**, not read and guessed at.
Twenty-one attempted creates, and the result reframed the phase honestly.

## Trusted vs Untrusted Fields

**Already safe before Phase 89 — rules enforced all of it, and Phase 89 claims no credit for it:**

- `ownerId` forged to another user — DENIED
- a student claiming `posterRole: "teacher"` — DENIED (checked against their own membership record)
- `likeCount` / `answerCount` / `commentCount` non-zero — DENIED
- an outsider creating into a class — DENIED

**Forgeable, proven by the same probe — 14 accepted writes:**

- `createdAt` set to the year 2099
- `correctChoice` naming an option the question does not have
- a one-option "multiple choice"
- no `correctChoice` at all
- a 1000-character hint (the rule bounds the list's length, never an entry's)
- arbitrary extra fields
- an `imageUrl` pointing at an external host
- a semantic mapping to a **non-existent** definition
- a mapping to an **archived** definition
- a mapping to **another class's** definition
- a mapping to a **wrong-scope** definition
- a `semanticLabel` that flatly contradicts the definition it names
- feedback attached to the **correct answer**

Rules cannot fix any of that: it needs three fields compared against each other and a
`semanticDefinitions` document read. The rule's own comment on `choiceFeedbackWithinBounds` said so,
and was honest.

## Teacher Create Contract

The class's own teacher, identified by `teacherId` on the class document — never by a role claim they
might hold for a different class. `posterRole` is derived as `teacher` from that comparison.

## Student Create Contract

Preserved, and deliberately: a genuine student member of the class may author. Membership is read
from `classes/{classId}/members/{uid}` and the role must be `student`. `posterRole` is derived, so
`teacher` is unreachable by payload. `organizationId` is taken from the CLASS, because a student
never has an organisation claim of their own — the same reasoning the old rule used.

## Outsider Denial

Neither the class's teacher nor a member ⇒ `permission-denied`, nothing written.

## Server-Derived Metadata

`ownerId`, `posterRole`, `visibility`, `classId`, `organizationId`, `createdAt` (a server timestamp),
all three counters, and **every `semanticLabel`**. None is read from the payload. There is no object
spread from the caller anywhere in the handler.

## Callable Architecture

`createQuestion` in `functions/src/questions/createQuestion.ts`, exported through
`functions/src/questions/index.ts` and `functions/src/index.ts`. Its contract is
`applyQuestionCreate(db, callerUid, claims, data)` — exported separately from the `onCall` wrapper and
taking `db` as a parameter, the pattern `markAllNotificationsReadForUid` established and Phase 88
reused, so the tests drive the shipped code against a real emulator.

The pure half lives in `functions/src/questions/questionCreate.ts`, which **imports** the Phase 88
authoring contract rather than duplicating it. There is one authoring sanitiser on the server, not
two.

## Server Validation

Scope, image ownership, question text, choices, correct answer, feedback, hints and every shared
definition — all decided before anything is written, inside one transaction whose reads all precede
its single write.

## Choice Validation

Reuses the canonical `sanitizeQuestionAuthoringState`. Two to five options, each non-blank, with the
correct answer among them.

An important distinction the code makes on purpose: **no options at all** is legal (the one-tap
image-only question), but **options that sanitise away to nothing** is not. The repo's sanitiser
returns null for both fields when fewer than two options survive; storing that as an image-only
question would silently lose the author's intent, so the two cases are told apart and the second is
refused.

## Correct Answer Safety

A question with options but nothing marked correct is refused. A correct answer naming an absent
option is refused. Phase 77's sanitiser runs server-side, so feedback and a semantic mapping attached
to whatever becomes the correct answer are stripped rather than stored.

## Feedback Sanitization

Phase 77's contract, unchanged and now authoritative: bounded text, entries for absent options
dropped, entries on the correct answer dropped, a shared reference winning over a private key.

## Hint Sanitization

Phase 72's contract, unchanged and now authoritative: at most three, each trimmed and truncated,
blanks dropped so the ladder stays contiguous.

## Semantic Definition Validation

Every referenced definition must exist, belong to this class, match this question's subject AND topic,
and be active. At most one per choice label, so at most five reads — bounded by construction.

## Archived Definition Contract

Refused outright. This differs from Phase 88's revision gateway on purpose: a revision may carry a
mapping that was already on the question and is grandfathered in, but **every mapping on a new
question is new**, so there is nothing to grandfather.

## Duplicate Label Identity

Two definitions may share a visible label. Creating with each stores each one's own id, and the
stored label is read from the definition — so two questions can display the same words while pointing
at two distinct meanings. Identity never collapses to a label, and there is no label-based merge.

## Image Upload Contract

Unchanged, and deliberately: the client still uploads to Storage first, because `storage.rules`
already pin the uploader's uid into the object path and refuse anything else. The callable extracts
the object path from the download URL and requires it to match `questions/class/{org}/{classId}/{uid}/…`
or `questions/{public|private}/{uid}/…` for this caller and this surface. Only the **path** is checked,
never the host — the emulator serves `127.0.0.1:9199` and production serves
`firebasestorage.googleapis.com`, and the path is the part that carries the security meaning.

The stored `imageUrl` remains the download URL, because every reader renders that field directly.

## Firestore Rule Hardening

`allow create: if false;` on `questions/{questionId}`. `read`, `delete` and Phase 88's
`allow update: if false` are untouched. `hintsWithinBounds` and `choiceFeedbackWithinBounds` are now
dead — kept, with a note saying so, because their comments are the clearest record of what rules can
and cannot check about authored content.

## Raw Create Bypass Closure

Proven at runtime. The same raw REST create that succeeded 15 times during this phase's own audit now
returns `403 PERMISSION_DENIED` for the class's teacher, for a student member, and for an outsider,
with no document created.

## Client Create Service Migration

`createQuestion` in `src/services/questions/questions.ts` performs no Firestore write and could not.
Verified by grep: no `addDoc`, `setDoc`, `updateDoc`, `runTransaction` or `deleteDoc` remains in that
file, and no client write to `questions/` remains anywhere in `src/` or `app/`.

`CreateQuestionInput` keeps `ownerId`, `posterRole` and `organizationId` on its surface — they are
simply no longer sent. Removing them would have churned four call sites to delete values the server
now ignores anyway.

Both composer paths now **return what the server stored** rather than an optimistic reconstruction,
because the server owns `createdAt`, `posterRole`, `organizationId` and every `semanticLabel`, and a
locally rebuilt object could disagree with the document the moment it was written.

## Idempotency Audit

Create is additive, so unlike revision a retry can genuinely duplicate. The client submit lock
(Phase 75) prevents a double tap; nothing prevented a duplicated call.

The gateway now takes an `operationId` — one explicit submission attempt — and derives the document
id from `sha256(uid + ":" + operationId)`. The transaction reads that id first; if the document
exists, the call returns it and reports `created: false`.

This needed **no new collection, no new Question field, no index and no cleanup job**: the key lives
in the document id, and the absence check is a read the transaction was making anyway. Deriving it
from the authenticated uid as well as the submission id means two users sending the same id land on
two different documents, so one can never collide with, resume, or observe another's create.

The key is never derived from question content. Two intentionally identical questions submitted twice
are two questions.

## Double-Submit Safety

Proven at runtime and in the emulator matrix: a retried submission returns the same question and
writes once; two genuinely simultaneous identical submissions still produce one question; the same
content under a new submission id produces a second, intentional question.

**The honest limit:** the client generates the id per submission call, so a user who sees a failure
and submits again gets a new id and a second question. That is the correct behaviour here rather than
a gap to paper over — the flow is image-first, so a user retry re-uploads a new image, and reusing
the old id would return the first question and silently discard the image they just took. What
remains genuinely unprotected is the narrow case where the server succeeded but the response was lost
AND the user retries; that produces a duplicate, and no claim is made otherwise.

## Revision Regression

A callable-created question was revised through Phase 88's gateway (success), then a stale revision
on it was refused with `failed-precondition` and `reason: "revision-conflict"`, and a raw PATCH of it
was still refused with 403. Creation did not disturb revision.

## Semantic Evidence Regression

A student answered a callable-created question's mapped wrong choice through `recordStudyOutcome`. The
server-written `studyEvent` carries the shared definition's identity, and the question's counters
stayed at the canonical zeros the gateway wrote — `answerCount` is maintained by `onAnswerCreate` on
the ANSWERS collection, and a study outcome is practice, not a published answer.

## Coverage / Studio Regression

The created documents carry the same field shape as before (identical keys, stricter values), so
Phase 82 coverage and Phase 85 studio read them unchanged. No migration, no backfill.

## Query Cost

Per successful create: 1 callable invocation; 1 transaction read for the idempotency check; 1 class
read; 1 membership read only when the caller is not the class's teacher; at most 5 definition reads,
bounded by the number of choice labels; 1 document write; 1 client read-back. No listeners, no
polling, no new index, no new collection. No N+1 beyond the bounded definition reads.

## Functions Build

Mandatory and performed before runtime QA. The Functions emulator serves compiled `lib/`, so
`tsc --noEmit` is not enough. After the build the emulator reported
`functions[us-central1-createQuestion]: http function initialized` — the compiled artifact, not the
source.

## Runtime QA

**47 of 47 checks passed**, driving the real callables over HTTP with real ID tokens against real
rules, with real Storage objects uploaded at the paths `storage.rules` require, and temporary
fixtures removed afterwards with an existence check.

## Security QA

Raw create denied for teacher, student and outsider. Callable create denied for an outsider and for
an unauthenticated caller. A forged `ownerId`, `posterRole`, `visibility`, `organizationId`,
`createdAt` (year 2099), three counters and an arbitrary extra field were all ignored — the stored
document carried the server's values. A fabricated `semanticLabel` was replaced with the definition's
real one.

## Zero-Write Failure Proofs

Every refusal wrote nothing: unauthenticated, outsider, one-option, correct answer not among options,
no correct answer, out-of-taxonomy subject, topic from another subject, external image, archived
definition, non-existent definition, wrong-scope definition, malformed submission id, and every raw
client create. Only a valid callable create writes, and it writes exactly one document.

## Responsive

Phase 89's only visual delta is five error strings in an existing error container; no composer was
redesigned. The longest (`invalid-question`, 102 characters) was measured in the app's own font stack
at the app's error style (12px / 500 / 16px line-height) against the real container widths this
layout produces: 2 lines at a 375 viewport, 3 lines at 250 (≈150% zoom), no horizontal overflow at
either. The method was calibrated against Phase 88's error string, which measured exactly the 2 and 3
lines that phase confirmed visually on screen.

**What was NOT done, and why:** the error state was not screenshotted in a live composer. Both create
composers are image-first and open a native image picker, which cannot be driven in the browser
preview, and the teacher composer's entry point is additionally gated behind class evidence. The
strings are rendered by the same container Phase 88 verified visually at all four viewports.

## Accessibility

The error copy names what to check in plain Turkish and never exposes a raw Functions code. No
internal id — not a definition id, not the submission id — reaches the UI. Each server refusal keeps
its own sentence, so an author who is not in the class, an author whose question is not yet valid,
and an author whose connection dropped are not told the same thing.

## Learning-System Regression

Phases 42–47, 59, 61–88 unchanged: 3540 unit tests across 179 suites and 490 integration tests across
7 suites all pass. Phase 89 changes how a question is created, not what the learning system does with
it.

## iOS Decision

- New native dependency: **NO**
- Native configuration change: **NO**
- Native-only API: **NO**
- Native-only behaviour: **NO**
- Confirmed native defect: **NO**

**NATIVE IOS: NOT REQUIRED THIS PHASE.** Moving a create from the client SDK to a callable is
transport, and the image picker — the one native surface involved — was deliberately left untouched.

## Automated Validation

- `npx tsc --noEmit` (root) — clean
- `cd functions && npx tsc --noEmit` — clean
- `npx eslint . --ext .ts,.tsx` — clean
- `npx jest` — **3540 passed, 179 suites**
- `npm run test:rules` — **490 passed, 7 suites**
- `npm run verify` — pass
- `cd functions && npm run build` — pass
- Functions lint — **4 errors, all pre-existing, zero new** (see Known Limitations)
- `git diff --check` — clean
- `npx expo-doctor` — 17/18

## Source Integrity

Byte-accurate sweep of all twelve changed files: no NUL, no CR or CRLF, no BOM, no stray control
characters, final newline present, UTF-8 throughout. No `console.*` beyond the pre-existing
`__DEV__`-guarded upload logging, no `debugger`, no TODO/FIXME, no `@ts-ignore`, no `.only`/`.skip`.
Every QA script, fixture and launch config created during this phase was deleted; `git status` shows
only the twelve intended files.

## Known Limitations

- **Question DELETE is unchanged and still a client write.** Out of scope by instruction, and stated
  rather than implied: an owner can still delete their own question directly.
- **Create idempotency covers a retried call, not a user re-submitting after a visible failure.** See
  Double-Submit Safety for why that is the correct behaviour in an image-first flow, and for the one
  case that remains genuinely unprotected.
- **Orphan Storage uploads remain possible.** The image is uploaded before the callable runs, so a
  refused create leaves the object behind. No cleanup job was invented for it. The blast radius is
  bounded — the path is owner-scoped and the object is unreferenced.
- **The taxonomy and the authoring contract are mirrors, not shared modules.** `functions/` cannot
  import `src/` (Phase 88 verified the rootDir constraint). Drift is prevented by
  `questionCreateContract.test.ts`, which compares both sides, not by the type system.
- **`functions` lint reports 4 `no-irregular-whitespace` errors** in
  `functions/src/moderation/textNormalization.ts`, from commit `2fdb5b5`. Those are literal
  zero-width characters inside the moderation stripper's regex classes — load-bearing. Untouched, and
  outside `npm run verify`. **Zero new findings from Phase 89 files.**
- **`expo-doctor` reports 3 Expo patch-version drifts** (`expo`, `expo-constants`,
  `expo-file-system`). Pre-existing, unrelated, not in this changeset.
- **Many "denies …" create tests in the rules suite now pass for a broader reason than their names
  give** — a client create is denied before any content check is reached. A block comment says so at
  the point it matters. The bounds they described moved to the callable and are proven there.
- No AI question generation, no version history, no bulk create, no import, no cross-class cloning.
- Semantic remapping remains future-facing; historical evidence remains immutable.
- Server creation adds one callable network hop and one read-back.
- A teacher still cannot revise a student-authored question.
- One teacher per class, unchanged.
- **Pre-existing technical debt, untouched:** `src/features/teacher/services/studentPerformance.ts`
  still contains one raw NUL byte. Phase 89 did not edit that file.

## Phase 90 Readiness

Question create and question revision are both server-authoritative, and a client can do neither
directly. The remaining client write right on this collection is **delete** — the same shape of gap,
one verb over, and now the obvious next one.

## Product Assessment

A question can no longer be assembled by a client and handed to the database finished. The server
decides who the author is, when it was made, what it may point at, and whether it is a coherent
question at all — and the phase proves it by running the exact writes that used to succeed and
showing them refused.
