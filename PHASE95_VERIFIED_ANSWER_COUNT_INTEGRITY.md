# Phase 95 — Verified Answer Count Integrity + Materialized Counter Truth

## Repository Sync

Local HEAD was `f3bcd7e` (Phase 94) and the canonical remote
`origin/phase17-moderation-infrastructure-20260806-195814` was at the same commit: ahead/behind
`0 0`, worktree clean — classification A, already current. No fast-forward was required.

## Actual Starting Head

`f3bcd7e30247704f5e858dc4e2ee421297ce08c8` — Phase 94, Server-Enforced Answer Lifecycle +
Referential Integrity. No `PHASE95*` document and no Phase 95 commit existed on any branch.

## Collaborator Safety

`git fetch origin` ran before implementation, immediately before commit and immediately before push.
The canonical remote stayed at `f3bcd7e` throughout. `main` was never checked out, merged or pushed.
No force push, no history rewrite.

## Phase 94 Foundation

Phase 94 closed every client write to an answer document and recorded a finding rather than fixing
it: `questions.answerCount` is incremented by `onAnswerCreate` and nothing decrements it. Phase 95
exists to decide whether that is a defect or a limitation.

## Product Mission

Establish what `answerCount` actually is, whether it can diverge from reality under supported
operations, and act only on what the evidence shows.

## answerCount Writers

Exactly two, both server-side, both found by exhaustive search:

| File | Path | Event | Atomic | Client |
|---|---|---|---|---|
| `functions/src/questions/createQuestion.ts` | the create gateway | question creation | in the create transaction | no |
| `functions/src/answers/onAnswerCreate.ts` | `onDocumentCreated("answers/{answerId}")` | an answer document appears | `FieldValue.increment(1)` in a transaction | no |

The first establishes the field at 0; the second is the only thing that moves it afterwards. **No
other writer exists anywhere** — not in Functions, not in scripts, not in the client. A client write
is refused: proven at runtime, and already pinned by an existing rules test.

## answerCount Readers

| Surface | Use | Display only | Decision-making | Learning system |
|---|---|---|---|---|
| `FeedCard` | "N cevap" on a feed card | yes | no | no |
| `ClassFeedCard` | same, in a class feed | yes | no | no |
| `savedQuestions` | denormalized snapshot at save time | yes | no | no |
| `QuestionDetailScreen` | **does not read it** — passes `answers.length` from its own live listener | — | — | — |

**Never queried, never sorted, never indexed, never read by any learning system.** Verified by
searching for `orderBy`/`where` on the field, by grepping `firestore.indexes.json`, and by searching
the entire study, learning-story and teacher feature trees. Part 38's constraint — that this field
must not feed the classifier, scheduler or semantic evidence — is already true and stays true.

The surface where a mismatch would be most visible, the question detail screen, deliberately shows
the live answer list instead. `onAnswerCreate`'s own comment says so.

## Canonical Source of Truth

**The answer documents are the fact; `answerCount` is materialized state.** The invariant is
"increment once per answer document created", not "equals a count computed on read". This is stated
explicitly so nothing later treats the field as stronger truth than its architecture supports.

## Current Answer Create Contract

`submitAnswerForModeration` (Admin SDK). An answer is an image with no text field, so it publishes
only after Vision SafeSearch clears the picture and its OCR text clears the deterministic Turkish
layer. Idempotent through a deterministic `uid_operationId` submission id, and the client-supplied
quarantine path is rebuilt server-side and compared rather than trusted.

## Create Idempotency

Proven at runtime on the real callable: the same `operationId` submitted twice produced **one**
submission document, **zero** answer documents and **no** counter movement.

Separately proven at the trigger level: re-writing the *same* answer document id does not increment
again, because `onAnswerCreate` is `onDocumentCreated` and a second `set` on an existing document is
not a creation.

## onAnswerCreate Trigger

Transactional: it reads the question, prepares the owner notification and increments in one
transaction, and returns early if the question no longer exists.

## Event Delivery Semantics

Cloud Functions triggers are delivered **at-least-once**. `onAnswerCreate` uses
`FieldValue.increment(1)` with **no event-id dedupe**, so a duplicate delivery of the same creation
event would increment twice. Atomic is not the same as idempotent, and this document does not
conflate them.

**What was and was not established:** this is an architectural property read from the code. Phase 95
did **not** reproduce a duplicate delivery, and makes no claim about how often one occurs. Per the
brief's own instruction, a handler replay would demonstrate the same architectural property and would
still not be production event redelivery, so none is presented as such. The caveat is documented in
`onAnswerCreate` itself with three stated reasons for accepting it: retries are rare, the count is
informational only, and it can be recomputed from the answers collection if it ever drifts.

## Trusted Answer Deletion Audit

| Path | Exists |
|---|---|
| product delete UI | **no** (Phase 94; re-confirmed) |
| client delete service | **no** |
| delete callable | **no** — the complete exported function list contains none |
| `onDocumentDeleted` on answers | **no** |
| moderation withdrawal | **no caller** — see below |
| Admin SDK / console | possible, as for any collection |

**The moderation finding:** the state machine declares `approved -> removed` ("published content can
still be withdrawn by a reviewer") and `manual_review -> removed`. But no reviewer callable is
exported — the moderation module exports the two submit gateways and pure helpers only — and
`applyTransition` is called **nowhere outside its own unit test**. The `removed` state is declared
and unreachable.

So no supported operation removes a published answer, which is the precondition that makes an
increment-only counter correct.

## Moderation Removal Audit

Covered above, and it produced a second observation worth recording: with no Vision provider
configured, `decideImageModeration` returns `manual_review` for every image ("no image provider —
every image goes to a human"). Confirmed at runtime: a well-formed submission returned
`status=in_review` with **no** published answer. In such a deployment answers cannot be published at
all through the canonical path — fail-closed by design — and the counter therefore never moves.

## Current User-Visible Risk

Against the brief's five thresholds for calling this a current defect:

1. **A supported product or server answer-removal path exists** — NO, proven.
2. **Canonical create retry can overcount** — NO, proven at runtime.
3. **Trigger retry can demonstrably double count in production** — architectural risk acknowledged,
   **not demonstrated**, and explicitly not claimed.
4. **Existing data can naturally diverge through supported behaviour** — NO, follows from 1 and 2.
5. **The count drives a user-facing decision where a stale value is materially harmful** — NO; it is
   display-only, and the one screen where a mismatch would matter uses the live list.

**Conclusion: not a current user-visible defect. A future-lifecycle limitation.**

## Pre-Change Runtime Baseline

18 of 18 checks passed against the emulator with real tokens. Canonical submission accepted and
recorded but not published; retry idempotent; a quarantine path belonging to someone else refused;
one answer document → count 1; re-writing the same document → still 1; two documents → 2; documents
equal the count; unauthenticated, missing-question and outsider submissions all refused with the
counter unmoved; likes and unlikes leaving `answerCount` untouched; every raw write refused.

## Counter Architecture Decision

**BRANCH D — no behaviour change; test and contract hardening.**

## Branch A / B / C / D Rationale

- **B (move ownership into the create gateway)** rejected: it would replace a working trigger to
  solve a risk that was not demonstrated, and would require removing the existing increment in
  lockstep or double-count. The brief forbids replacing a working trigger without evidence.
- **C (reconciliation / derived count)** rejected: there is no proven drift to reconcile, and
  recomputing on read would trade a theoretical integrity question for a certain read-cost one.
- **A (keep the trigger, add tests)** and **D** are nearly the same here; D is the accurate label
  because **no runtime behaviour changed at all** — no Functions source, no rules, no client. Calling
  it anything else would overstate the work.
- An event-dedup ledger was **not** added. The brief forbids it for a theoretical caveat, and nothing
  measured here justified one.

## Counter Exactness

0 → answer A → 1 → same document re-written → 1 → answer B → 2, with stored documents equal to the
count at every step.

## Retry Exactness

Same `operationId`: one submission, zero extra answers, unchanged count. Same document id re-written:
no second increment.

## Failed Create Safety

Unauthenticated (`UNAUTHENTICATED`), missing question (`PERMISSION_DENIED`), outsider
(`PERMISSION_DENIED`), and a quarantine path belonging to another user (`PERMISSION_DENIED`) — all
refused with zero answer writes and zero counter movement.

## Raw Counter Security

Raw `questions.answerCount` write **403**; raw `answers.likeCount` write **403** (Phase 94); raw
answer create/update/delete **403/403/403**; raw question create/update/delete **403/403/403**.

## Answer-Like Independence

`liked=true`, retry, `liked=false`, retry — `Answer.likeCount` moved correctly and returned to 0, and
`questions.answerCount` was untouched throughout. Phase 92's desired-state contract intact.

## Comment Independence

Untouched; Phase 93's comment lifecycle and its own counter are unaffected by anything here.

## Admin Corruption Experiment

`answerCount` was deliberately set to 99 while two answer documents existed. One further canonical
answer creation took it to **100**, not to 3.

**Interpretation:** the counter is *relative* — it increments from whatever value it finds — and is
**not self-healing**. That is expected of a materialized counter and is not a product defect: a
trusted Admin write is not user behaviour, and no repair system was added on the strength of proving
that an administrator can write a wrong number. It is recorded because it defines the field's
semantics precisely.

## Future Answer-Removal Requirement

**Before any answer-removal feature ships it must define:** the `answerCount` decrement (floored at
0, as `commentCounters` does), what happens to `answerLikes`, what happens to the answer-created
notification, whether moderation records are retained, whether a retried removal can decrement twice,
and what an orphaned answer means. Phase 93 did exactly this work for comments; the same questions
apply.

This is no longer only a sentence in a document. `tests/unit/answerCountContract.test.ts` fails the
moment a removal path appears — a delete callable, an inline answer delete, an `onDocumentDeleted`
trigger on answers, a reachable `removed` transition, or a reopened client write rule — so the
requirement surfaces at the moment someone needs it rather than being remembered.

The guard's detection was itself falsified rather than assumed: four realistic breaking changes (a
delete trigger, a decrement, a delete callable, an inline collection delete) were each checked
against its patterns and all four were caught.

## Historical Learning Evidence Regression

No `studyEvents` or `studyItems` were written by any operation in this phase's QA, and no learning
code reads `answerCount`. Phases 42–47, 59 and 61–94 are untouched.

## Runtime QA

18/18, described above. One methodological note: three earlier runs of the probe reported failures
that were **the probe's fault, not the product's** — an invented quarantine path (the server rebuilds
and compares it, correctly refusing), a missing Storage emulator (the callable reads the quarantined
object), and an upload to a differently-suffixed bucket than the runtime's default. Each was
diagnosed from the actual error before anything was concluded, and the probe was corrected so the
final measurements mean what they say.

## Query / Cost

**Zero change.** No callable, trigger, read, write, index, collection, listener or polling was added
or altered. Per answer creation the cost is exactly what it was: one moderation callable, its
existing reads, one answer write, and one trigger doing one question read plus one counter write.

## Functions Build

**Functions source did not change** — `git status` on `functions/src` is empty. `npm run verify` still
ran the build (PASS) as part of validation.

## UI Decision

**UI changed: NO.** This phase is backend truth and test hardening; no screen, control, copy or
component was touched. Responsive and accessibility are therefore **N/A** — no manufactured
screenshot work.

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
- `npx jest` — **3546 passed, 180 suites** (was 3540 / 179)
- `npm run test:rules` — **548 passed, 10 suites**
- `npm run verify` — pass
- Functions build — pass
- Functions lint — **4 errors, all pre-existing, zero new**
- `git diff --check` — clean
- `npx expo-doctor` — 17/18
- Runtime QA — 18/18

## Source Integrity

The one changed file is a new test: no NUL, no CR or CRLF, no BOM, no stray control characters, final
newline present, UTF-8. No instrumentation, no `.only`/`.skip`. The temporary probe was deleted;
`functions/scripts/` holds only the repository's own seed script.

## Known Limitations

- **`answerCount` is materialized state, not the canonical fact.** The answer documents are. The
  field is a cached count for feed display.
- **Trigger delivery is at-least-once and `onAnswerCreate` has no event-id dedupe**, so a duplicate
  delivery would double-count. This is an architectural property, documented in the code with its
  rationale; it was **not** reproduced here and is **not** claimed to be exactly-once.
- **The counter is relative and not self-healing.** A wrong value stays wrong and subsequent creates
  increment from it. No repair system exists and none was added.
- **No answer-removal feature exists** (Phase 94), and none was created here. The contract such a
  feature must define is written down above and guarded by a test.
- **A trusted Admin or console write can create a mismatch.** That is true of any materialized
  counter and is not user-reachable behaviour.
- **No global repair job, no scheduled reconciliation, no event ledger** — all explicitly declined.
- **In a deployment without a Vision provider, answers cannot be published at all** through the
  canonical path; every image goes to `manual_review`, and no reviewer callable exists to advance it.
  Fail-closed by design, and worth knowing before anyone wonders where the answers went.
- The end-to-end publish → count path could therefore **not** be exercised in this environment; the
  counter was measured against the same answer-document write the publish path performs, which is
  labelled as such rather than described as a full publish test.
- Phase 92 answer likes and Phase 93 comments remain as they were; learning evidence is unaffected.
- **`functions` lint reports 4 `no-irregular-whitespace` errors** in
  `functions/src/moderation/textNormalization.ts`, from commit `2fdb5b5` — literal zero-width
  characters inside the moderation stripper's regex classes, load-bearing. Untouched. Zero new.
- **`expo-doctor` reports 3 Expo patch-version drifts.** Pre-existing, unrelated, not in this
  changeset.
- **Pre-existing technical debt, untouched:** `src/features/teacher/services/studentPerformance.ts`
  still contains one raw NUL byte.

## Phase 96 Readiness

`answerCount` is correct for every operation the product supports, its source of truth is written
down, its client write path is closed, and the precondition it depends on is now enforced by a test
rather than by memory. There is no current drift defect to carry forward.

The honest next subject is the deployment observation above: answers cannot publish without a Vision
provider. That is not a bug, but it means the answer surface is effectively inert in any environment
without one — which is worth confirming deliberately before building anything else on top of answers.

## Product Assessment

This phase's result is that nothing needed changing, and the work was in proving that rather than
assuming it. Every writer and reader was enumerated, the five thresholds for a real defect were tested
one by one, and the one that would have made it real — a supported way to remove an answer — turned
out to be declared in a state machine and reachable from nothing but its own unit test. What shipped
is a test that fails the day that stops being true, because the invariant lives in the absence of a
feature, and absences are exactly what code review forgets to check.
