# Phase 88 — Server-Enforced Question Revision Gateway + Authoritative Optimistic Concurrency

## Repository Sync

Local HEAD was `08a6e45` (Phase 87) and the canonical remote
`origin/phase17-moderation-infrastructure-20260806-195814` was at the same commit: ahead/behind
`0 0`, worktree clean — already current, nothing to fast-forward.

## Actual Starting Head

`08a6e4554b69c0eb3cc3673423269ec13c0980ac` — Phase 87, Verified Question Revision Conflict Safety +
Optimistic Concurrency. No `PHASE88*` document and no Phase 88 commit existed on any branch.

## Collaborator Safety

`git fetch origin` ran before implementation, immediately before commit and immediately before push.
The canonical remote stayed at `08a6e45` throughout. `main` was never checked out, merged or pushed.
No force push, no history rewrite.

## The Gap Phase 87 Proved

Phase 87 put an optimistic conflict check inside a **client** transaction. It protected the product
path and nothing else. Phase 87's own authorization QA demonstrated the hole rather than assuming
it: a direct Firestore REST `PATCH` carrying the owner's own ID token succeeded, with no revision
check, no sanitisation and no semantic validation. Phase 87 documented this honestly as a product
guarantee rather than a security boundary. Phase 88 is the half that closes it.

## Product Mission

One server-authoritative gateway for question revision. Ownership, staleness, sanitisation and
semantic-scope validation all decided on the server, inside one Firestore transaction, with client
updates to question documents denied outright by rules.

## Architecture Audit — The Shared-Module Question

The contract had to exist on the server. `functions/` is a separate TypeScript project with
`rootDir: "src"`, so it cannot import `src/features/...`.

This was **verified, not assumed.** A probe module under `shared/` produced
`error TS6059: File '.../shared/questionRevision/probe.ts' is not under 'rootDir'`. Setting
`rootDir: ".."` did compile, but relocated the compiled entrypoint from `lib/index.js` to
`lib/functions/src/index.js`, breaking the `main` field and the deploy artifact path — a change that
cannot be validated from a local emulator. The probe was fully reverted (tsconfig restored from
backup, both probe files removed, `git status` confirmed clean).

## Mirror Decision

The repository already has a documented answer for this exact boundary: a deliberate mirror, the one
`functions/src/study/semanticChoiceEvidence.ts` uses for `normalizeConceptKey`, and
`src/utils/onboardingStatus.ts` before it. Phase 88 follows that precedent rather than inventing a
build-layout change.

A mirror is only as safe as the test that holds it in place. That test is
`tests/unit/questionRevisionEquivalence.test.ts`.

## Server Contract Module

`functions/src/questions/questionRevision.ts` — pure, Node-safe by construction: no React, no Expo,
no firebase-admin, no client Firebase, no platform persistence. It mirrors the choice labels, the
five size caps, `sanitizeHints`, `normalizeConceptKey`, `sanitizeChoiceFeedback`,
`sanitizeQuestionAuthoringState`, `projectQuestionAuthoringState`,
`canonicalizeQuestionAuthoringState`, `questionAuthoringRevision` and
`hasQuestionRevisionConflict`, and adds `referencedDefinitionIds` / `newlyReferencedDefinitionIds`.

## The Callable

`functions/src/questions/updateQuestionRevision.ts`, exported through
`functions/src/questions/index.ts` and `functions/src/index.ts`. It checks, in order:

1. authenticated at all
2. the payload is shaped like a revision
3. the question exists
4. the caller **is the owner** — not the class teacher, not a member
5. the caller's draft is not stale
6. any **newly** referenced shared definition is real, in this class, in this question's
   subject/topic scope, and not archived

Ownership and staleness are separate questions, answered separately: a matching fingerprint grants
nothing, and being the owner does not make a stale draft safe.

## Testable Handler

`applyQuestionRevision(db, callerUid, data)` is exported separately from its `onCall` wrapper, taking
`db` as a parameter — the pattern `markAllNotificationsReadForUid` already established in this
repository. The guarantees here depend on real Firestore transaction semantics, so the test that
proves them drives this same shipped code against a real emulator rather than a fake. A passing test
there is a passing production path.

## Exactly Five Fields

The transaction writes `description`, `choices`, `correctChoice`, `choiceFeedback`, `hints` and
nothing else. The caller's object is never spread anywhere in the function, so a forged `ownerId`,
`classId`, `visibility`, `posterRole`, `subject`, `topic`, `gradeLevel`, `imageUrl`,
`organizationId`, `createdAt` or counter is not so much rejected as never read.

## Bounded Reads

At most one shared definition per choice label, so at most five definition reads per call, capped by
`MAX_DEFINITION_READS`. Every read happens before the write, as a Firestore transaction requires.
There is no unbounded fan-out.

## Archived Definitions

Only **new** references are held to the "must be active" bar. A mapping already on the question stays
valid even if its definition has since been archived — archiving retires a definition from new
selection, it does not invalidate the questions already pointing at it.

## Firestore Rules

```
allow update: if false;
```

Unconditional, so it holds for **every field of every client update** to `questions/{questionId}`, by
any client path — SDK, REST, or a patched client. This is the narrowest rule that closes the gap,
not the bluntest: a write-path audit run before touching rules found exactly two client writes to
question documents — the `addDoc` create, and the revision that Phase 88 moved server-side. The three
counters were never client-writable.

## What The Rule Does Not Say

`allow read`, `allow create` and `allow delete` are untouched. An owner may still create and delete
questions from the client. An owner may still revise — through the callable, which runs on the Admin
SDK and is unaffected by this line. What no client may do any more is reach the document directly and
skip what the callable enforces.

## Client Rerouted

`updateQuestion` in `src/services/questions/questions.ts` is now a callable wrapper that performs **no
question write**. Verified by grep: no `updateDoc`, no `transaction.update`, no `runTransaction`
remains in that file; the only write left is the `addDoc` create. A missing `expectedRevision` is
refused client-side rather than sent, because a revision without one cannot be safe.

## Error Mapping

`QuestionUpdateErrorCode` gained `invalid-revision` and `unavailable`. A stale draft is discriminated
on `details.reason === "revision-conflict"` — a marker sent in `details` so the human-readable message
stays free to change — not on the status code or the prose.

## Message Separation

`useQuestionRevision` keeps a distinct sentence per server refusal. Collapsing them would leave a
teacher retrying a save that can never succeed.

## Equivalence Test

`tests/unit/questionRevisionEquivalence.test.ts` — 55 tests. It runs **both** implementations over 23
question cases and asserts byte-identical fingerprints and identical sanitised state, plus hostile
payloads, constant equality, `normalizeConceptKey` equality, canonicalization under key reordering,
and the bounding of `newlyReferencedDefinitionIds`. If either side is edited alone, this fails.

## Callable Test Matrix

`tests/integration/updateQuestionRevision.emulator.test.ts` — 25 tests against the real Firestore
emulator, driving the shipped handler. Unauthenticated denied; owner with a matching revision
accepted; owner with a stale revision refused; non-owner teacher, class teacher on a student's
question, and an outsider all denied; missing question not-found; a replayed call with the old
revision conflicts rather than applying twice; a refreshed revision accepted; a moved counter is not
a conflict and survives; malformed payloads refused; forged fields never written; a note on the new
correct answer stripped; blank and absent-option notes dropped; hints capped; semantic remap
accepted; an already-present archived mapping left alone; a new archived, out-of-scope, or
non-existent mapping refused; a stale call writes nothing; a success writes exactly one document;
studyEvents and semanticDefinitions never touched.

## Refusals Pinned To Their Guard

Every refusal asserts the message, not only the code. Three separate guards refuse with
`invalid-argument`; a test asserting only the code would pass while two of them were missing
entirely. The conflict test additionally asserts `details.reason`, because that marker — not the code
— is what the client maps on, and nothing else held it in place.

## Rules Tests Rewritten

`tests/integration/firestore.rules.test.ts` now proves denial where it previously proved permission:
a teacher's direct update of their own class question is denied, a student's is denied, and a
table-driven block covers feedback, semantic remap, choices + correct answer, hints and question
text. Create, read and delete are asserted untouched.

## One Pre-Existing Test Flipped

Phase 9.1's `"lets a student edit their own class question's subject/description"` failed under the
new rule. It was investigated rather than assumed: it documented a **rules capability with no product
path** — the Phase 86 editor renders subject, topic and grade read-only, and the write-path audit
found no other client update. It was flipped with an explicit rationale comment rather than deleted.

## Emulator Gate

Proven before any credential was created. Auth `127.0.0.1:9099` LOCAL, Firestore `127.0.0.1:8080`
LOCAL, Functions `127.0.0.1:5001` LOCAL, all confirmed against the emulator hub. Production Auth NOT
TARGETED, production Firestore NOT TARGETED, both via explicit host overrides. The harness refuses to
run on any non-local host.

## Functions Build

Mandatory and performed. The Functions emulator executes compiled `lib/`, so `tsc --noEmit` is not
enough. `npm run build` produced `lib/questions/updateQuestionRevision.js`, and the emulator
initialized `updateQuestionRevision` as a real HTTP function — the compiled artifact, not the source.

## Runtime QA

29 of 29 checks passed, driving the real callable over HTTP with real ID tokens against real rules,
using temporary fixtures removed afterwards with an existence check.

## Raw Owner Bypass — The Headline

The exact `PATCH` that **succeeded** in Phase 84/85 QA now returns `403 PERMISSION_DENIED`, and the
document's `updateTime` is unchanged. Repeated across `description`, `correctChoice`, `hints`,
`ownerId`, `answerCount` and `visibility` — every one denied. A student owner's direct PATCH is denied
too.

## Two-Session Proof

Two sessions loaded the same revision. Session A was accepted. Session B was refused by the **server**
with `FAILED_PRECONDITION`, `details.reason = "revision-conflict"`, A's text still in place. B
succeeded after reloading — the conflict is recoverable, not terminal.

## Authorization Proof

The class teacher cannot revise a student's question. The student owner can revise their own. Another
classmate cannot. An unauthenticated call is refused.

## Evidence Safety Proof

A real wrong answer was recorded through `recordStudyOutcome`, then the question was remapped from
definition A to definition B. The historical `studyEvent` was byte-for-byte untouched (identical
`updateTime`), the answer counter survived, and neither definition document was written. A **new**
answer after the remap was recorded against the new meaning — the revision is future-facing, exactly
as intended.

## Hostile Payload Proof

A payload carrying a forged `ownerId`, `classId`, `visibility`, `posterRole`, `subject`, `topic`,
`gradeLevel`, `imageUrl`, `organizationId`, `createdAt` and all three counters was accepted for its
five legal fields and left every forged field intact on the document.

## Zero-Write Proof

A stale call, a sub-two-option payload and a new mapping to a non-existent definition each left
`updateTime` unchanged. A refusal writes nothing.

## Untouched Paths Proof

Creating a question from the client still returns 200. A classmate can still read the question.

## A Harness Defect Found And Fixed

The first runtime run reported client question creation denied. Rather than assume the rule change
caused it, the emulator's own rule-evaluation log was read: `false for 'create' @ L278` — the
**untouched** create rule, not `allow update` at L341. The cause was the harness: the real
`onUserCreate` Auth trigger fires on `createUser` and overwrites custom claims with
`{role: "student"}`, clobbering the Admin-SDK claims set moments earlier. The fixture "teacher" was
never claimed a teacher. The harness now waits for the trigger, then sets the role, then asserts the
role **in the minted token**; create then returned 200. The rules were innocent.

## Responsive

375 Dark, 375 Light, ~250px (≈150% zoom at 375) and 1024 desktop. The new message stays inside the
viewport at every width — 16→359 of 375, 16→234 of 250 wrapping to three lines, one line on desktop.
The document body never overflows horizontally at any tested width, and desktop shows zero
overflowing elements.

## Accessibility

Contrast measured against the actually-painted background: **10.13:1** in Dark, **4.83:1** in Light.
Both pass WCAG AA for normal text; Dark also passes AAA.

## Pre-Existing Overflow — Unchanged

Below ~270px the Phase 86 notice banner (needs 269px) and the Phase 86 choice rows (need 253px)
overflow their containers. This is the overflow Phase 87 already documented. Phase 88 adds **nothing**
to that set — its own message fits at every width tested.

## The New Message Is Reachable

`invalid-revision` was not proven by a synthetic call. It was reached through a genuine product race:
a teacher selected a shared label, another teacher archived it before the save landed, and the server
refused. Client-side validation pre-empts the simpler invalid states, so this message is the fallback
for exactly the races and patched clients the server now exists to catch.

## iOS Decision

Not run. Phase 88's only visual delta is two strings in an existing error notice, verified across four
viewports on web. No native module, no navigation, no layout primitive changed.

## Automated Validation

- `npx tsc --noEmit` (root) — clean
- `cd functions && npx tsc --noEmit` — clean
- `npx eslint . --ext .ts,.tsx` — clean
- `npx jest` — **3502 passed, 178 suites**
- `npm run test:rules` — **457 passed, 6 suites**
- `npm run verify` — pass
- `cd functions && npm run build` — pass
- `git diff --check` — clean
- `npx expo-doctor` — 17/18

## Source Integrity

Byte-accurate sweep of all ten changed files: no NUL, no CR or CRLF, no BOM, no stray control
characters, final newline present, UTF-8 throughout. No `console.*`, no `debugger`, no TODO/FIXME, no
`@ts-ignore`, no `eslint-disable`, no raw hex colours in product code, no `.only`/`.skip` left in
tests.

## Known Limitations

- **`expo-doctor` reports 3 Expo patch-version drifts** (`expo`, `expo-constants`,
  `expo-file-system`). Pre-existing, unrelated to this phase, not in this changeset.
- **`functions` lint reports 4 `no-irregular-whitespace` errors** in
  `functions/src/moderation/textNormalization.ts`, from commit `2fdb5b5`. Those are literal
  zero-width characters inside the moderation stripper's regex classes — load-bearing. Untouched, and
  outside `npm run verify`.
- The server contract is a **mirror**, not a shared module. Drift is prevented by a test, not by the
  type system.
- **No persisted question version history.** Nothing added to the schema, nothing migrated. This is
  optimistic concurrency, not version control.
- No auto merge, no force overwrite, no rollback, no undo of a saved version.
- Question deletion is still absent from the product, and still permitted by rules.
- A teacher still cannot edit a student-authored question.
- Phase 86's image, scope and grade read-only limitations remain.
- The revision editor overflows below ~270px (Phase 86 inputs and chips); Phase 88's own message fits.
- One teacher per class, unchanged.
- **Pre-existing technical debt, untouched:** `src/features/teacher/services/studentPerformance.ts`
  still contains one raw NUL byte. Phase 88 did not edit that file.

## Phase 89 Readiness

Question revision is now server-authoritative end to end, and the direct-write gap Phase 87
documented is closed and proven closed. The remaining asymmetry is that question **deletion** is still
a client write with no server gateway — the same shape of gap, one collection over.

## Product Assessment

The rule that protects a teacher's work is no longer a courtesy the client extends to itself. It is
enforced where a client cannot reach, and the phase proves it by running the exact attack that used
to succeed and showing it refused.
