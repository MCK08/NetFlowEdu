# Phase 90 — Server-Enforced Question Lifecycle Closure + Evidence-Safe Removal

## Repository Sync

Local HEAD was `b822da8` (Phase 89) and the canonical remote
`origin/phase17-moderation-infrastructure-20260806-195814` was at the same commit: ahead/behind
`0 0`, worktree clean — classification A, already current. No fast-forward was required.

## Actual Starting Head

`b822da82140203cdfcae570c805494b050abca0b` — Phase 89, Server-Enforced Question Creation Gateway +
Canonical Authoring Integrity. No `PHASE90*` document and no Phase 90 commit existed on any branch.

## Collaborator Safety

`git fetch origin` ran before implementation, immediately before commit and immediately before push.
The canonical remote stayed at `b822da8` throughout. `main` was never checked out, merged or pushed.
No force push, no history rewrite.

## Phase 89 Foundation

Phase 88 made revision server-authoritative; Phase 89 made creation server-authoritative. Both
explicitly left DELETE as a client right and said so. Phase 90 is that last verb.

## Product Mission

Close the lifecycle asymmetry — and find out first what removing a question actually means in this
product, rather than assuming a delete verb needs a delete gateway.

## Current Delete Contract

The rule granted deletion to the owner, to an org admin, to a class's own teacher, and — for
private/public questions — to **any teacher at all**.

Proven at runtime, with real tokens, before anything changed:

| Actor | Target | Result |
|---|---|---|
| teacher owner | own question | **200 ALLOWED** |
| student owner | own question | **200 ALLOWED** |
| **class teacher** | **a student's question** | **200 ALLOWED** |
| student | a teacher's question | 403 denied |

And the decisive finding: **no product path uses it.** An exhaustive search found no delete button on
any question surface, no client service, no Cloud Function, no admin or moderation path, and no
ROADMAP intent. The only destructive affordances in the product are comment deletion and class-member
removal. Deletion was a rules capability with no way to reach it — the same shape as the Phase 9.1
student-edit capability Phase 88 retired.

It was also the single place a class teacher could destroy a student's authored work, which every
ownership decision from Phase 86 onward refuses.

## Question Reference Matrix

Built by hard-deleting a real question that carried every kind of reference the product can produce,
and measuring what happened — not by reading types.

| Resource | Reference | On hard delete | Survives | Cleanup needed |
|---|---|---|---|---|
| `studyEvents` | `questionId` | **byte-identical** | YES | no |
| `studyItems` | doc id | **unchanged** | YES | no |
| `savedQuestions` | denormalized **snapshot** | **survives intact** | YES | no |
| `semanticDefinitions` | referenced by the question | untouched | YES | no |
| `assignments.questionIds` | id array | **dangling id** | — | not automatic |
| `questionComments` | `questionId` | **orphaned** | — | not automatic |
| `questionLikes` | `questionId` | **orphaned** | — | not automatic |
| Storage image | path in `imageUrl` | **orphaned** | — | not automatic |
| `recordStudyOutcome` | reads the question | clean `404 NOT_FOUND` | — | no |
| `updateQuestionRevision` | reads the question | clean `404`, never recreates | — | no |

## StudyEvents Impact

None. Byte-identical before and after, including `updateTime`. Historical learning evidence is
historical fact and hard deletion does not touch it.

## StudyItems Impact

None. Unchanged in count and in `updateTime`. Nothing was deleted to make cleanup look tidy.

## Assignment Impact

`assignments` store `questionIds: string[]` — ids, not snapshots — so a deleted question leaves a
dangling id. It does **not** break the assignment: `toFrozenSessionQuestions` and
`toAdaptiveSessionQuestions` skip an id that no longer resolves, "never crashes and never renders a
blank card", and the completion contract "counts it as unavailable rather than done". That is a
documented Phase 28/68 design decision, not an accident.

## Submission Impact

`questionOutcomes` are frozen per submission and keyed by question id. They are historical records
and are unaffected by the source question's existence.

## SavedQuestions Impact

None. `saveQuestion` writes a denormalized snapshot of the question at save time — documented in
`savedQuestions.ts` as deliberate — so a bookmark keeps rendering after the source is gone.

## Comment / Like Impact

`questionComments` and `questionLikes` are **top-level** collections keyed by `questionId`. Firestore
does not cascade, and nothing else does either, so both orphan. Proven: 1 comment and 1 like left
behind by a single delete.

## Notification Impact

Notifications reference `questionId` and are historical records. Unchanged by this phase.

## Semantic Coverage Impact

Phase 82 coverage reflects currently-authored questions, and a deleted question would simply leave
it. Phase 83/84 historical evidence is separate and stays. Current coverage is not historical
evidence, and neither was rewritten.

## Evidence / Timeline Impact

Phase 84 timeline resolves question metadata through `resolveQuestionMetadata`, which caches `null`
for a question that is gone — "permission-denied and not-found both mean gone", per Phase 22's own
comment. The semantic event itself is never dropped.

## Image / Storage Impact

The image is uploaded to an owner-scoped Storage path before the question exists (Phase 89 left that
client-side deliberately). Deleting the question orphans the object; proven. No cleanup job was
invented for it.

## recordStudyOutcome Race

Proven: after the question is gone, `recordStudyOutcome` returns `404 NOT_FOUND`. A clean documented
refusal, not a crash and not a silent write — but it does mean an outcome recorded against a
just-deleted question is lost.

## Revision Race

Proven: after the question is gone, `updateQuestionRevision` returns `404 NOT_FOUND` and **does not
recreate the document**. A stale editor cannot resurrect a removed question.

## Hard Delete Safety Assessment

**Evidence-safe: YES.** studyEvents, studyItems, savedQuestions and semanticDefinitions all survive
intact, and both server gateways refuse a missing question cleanly. The study system was built to
treat a missing question as "gone" (Phases 22/28/68).

**Referentially tidy: NO.** Orphaned comments, likes and Storage objects, plus a dangling assignment
id. None of that is something a rule can fix.

## Retirement Safety Assessment

**Needed: NO.** Branch B exists to protect historical integrity, and the audit proved hard deletion
does not threaten it. A `retiredAt`/`status` field would mean auditing and changing every query that
lists questions, plus indexes and legacy-document semantics — a large blast radius to protect a
capability that has no product path at all. The brief's own instruction applies: block or choose the
smaller contract rather than improvise a schema.

## Branch Decision

**Branch A — server-enforced removal**, in its minimal honest form: the client's delete right is
closed, and removal remains possible only server-side (Admin SDK / trusted tooling).

**No delete callable was built, and that is deliberate.** A gateway exists to serve a product path;
there is none here — no button, no service, no Function, no ROADMAP entry. Building a callable with
no caller would be dead code, and building a UI to justify it is exactly what Part 37 rules out:
"Security architecture can be COMPLETE without adding a new button." When the product does want
removal, it gets a gateway then — with its UI, the way Phase 89 built creation, and with the orphan
questions above answered rather than inherited.

**Branch B rejected** because the integrity threat it exists to prevent was measured and found
absent.

## Authorization Contract

Unchanged where it matters and narrowed where it contradicted itself: no client may delete a
question, so a class teacher can no longer destroy a student's authored work. Teacher ownership was
not widened anywhere. Admin SDK paths are unaffected.

## Callable Architecture

None added. See Branch Decision.

## Firestore Rule Hardening

```
allow create: if false;   // Phase 89
allow update: if false;   // Phase 88
allow delete: if false;   // Phase 90
allow read:   unchanged
```

`isOrgAdmin` is now orphaned — its only call site was this delete rule. It is kept with a note,
because the role still exists (`adminSetUserRole`) and a future org-admin capability would reach for
this exact helper.

## Raw Delete Bypass Closure

Proven at runtime. Every delete that returned **200** in this phase's own audit now returns **403
PERMISSION_DENIED**, with the question intact:

- teacher owner deleting their own question
- student owner deleting their own question
- **class teacher deleting a student's question**
- outsider
- unauthenticated

## Idempotency

Not applicable: no lifecycle mutation was added. Phase 89's create idempotency was regression-tested
and is intact.

## Historical Evidence Preservation

`studyEvents` and `studyItems` byte-identical across the whole QA run, `semanticDefinitions`
untouched. Nothing was backfilled, migrated or rewritten.

## Assignment Runtime QA

An assignment referencing the question by id was created and the hard-delete blast radius measured
against it. The dangling id is documented above; the session resolvers skip unresolvable ids by
design. No assignment document was modified by this phase.

## SavedQuestion Runtime QA

The bookmark survived a hard delete of its source intact, and after this phase a student can still
write and remove a bookmark (`200` on both) — confirming the rule change did not spill into
neighbouring collections.

## Timeline Runtime QA

Semantic evidence was generated through the real `recordStudyOutcome` path and remained byte-identical
across the phase. No event was dropped.

## Storage Runtime QA

The image object outlives a deleted question. Documented as an orphan, not silently cleaned.

## Create Regression

Phase 89's gateway still creates, still refuses raw creates with 403, and its idempotency is intact:
the same submission yields one question, a new submission yields a second intentional one.

## Revision Regression

Phase 88's gateway still revises, still refuses raw updates with 403, and the stale-revision conflict
still fires with `reason: "revision-conflict"`.

## Query Cost

Zero change. No callable, no new read, no new write, no new index, no new collection, no listener, no
polling, and no cleanup fanout — in particular nothing that would scan every user's `savedQuestions`.

## Security QA

20 of 20 runtime checks passed. The full client write surface on `questions/{questionId}` is now:
create denied, update denied, delete denied, read unchanged.

## Zero-Write Failure States

Every refused delete wrote nothing: the question count was unchanged and the target document's
`updateTime` was identical after five separate refused attempts.

## Responsive

**N/A — no UI changed this phase.** There is no question delete surface to lay out, and none was
invented.

## Accessibility

**N/A — no UI changed this phase.** No destructive control was added, so there is no confirmation
flow, focus order or announcement to verify.

## Learning-System Regression

Phases 42–47, 59, 61–89 unchanged: 3540 unit tests across 179 suites and 492 integration tests across
7 suites all pass. No classifier, scheduler or adaptive logic was touched.

## Functions Build

`npm run verify` ran the Functions build (PASS). **No Functions source changed this phase** — the
only changed files are `firestore.rules` and its test suite — so no new callable needed compiling or
initialising.

## iOS Decision

- New native dependency: **NO**
- Native configuration change: **NO**
- Native-only API: **NO**
- Native-only behaviour: **NO**
- Confirmed native defect: **NO**

**NATIVE IOS: NOT REQUIRED THIS PHASE.** A Firestore rule change has no native surface.

## Automated Validation

- `npx tsc --noEmit` — clean
- `npx eslint . --ext .ts,.tsx` — clean
- `npx jest` — **3540 passed, 179 suites**
- `npm run test:rules` — **492 passed, 7 suites**
- `npm run verify` — pass
- Functions build — pass
- Functions lint — **4 errors, all pre-existing, zero new**
- `git diff --check` — clean
- `npx expo-doctor` — 17/18

## Source Integrity

Byte-accurate sweep of both changed files: no NUL, no CR or CRLF, no BOM, no stray control
characters, final newline present, UTF-8. No instrumentation, no `.only`/`.skip`. Both temporary QA
scripts were deleted; `git status` shows only the three intended files.

## Known Limitations

- **Question removal is no longer available to any client.** It was never reachable in the product,
  but the capability is genuinely gone from the client surface. Admin SDK and Cloud Functions can
  still remove a question.
- **No delete callable and no delete UI were built.** Deliberate: there is no product removal path to
  serve, and inventing one is out of scope. This is stated plainly rather than implied.
- **If removal is added later it must answer the orphans this phase measured** — `questionComments`,
  `questionLikes`, the Storage image, and a dangling id in `assignments.questionIds`. A rule cannot
  fix any of them; a gateway must.
- **An outcome recorded against a just-deleted question is lost** (`recordStudyOutcome` returns
  `404`). Pre-existing behaviour, unchanged, now documented.
- `isOrgAdmin` is an orphaned rule helper, kept with a note rather than removed.
- **Several "denies …" delete tests now pass for a broader reason than their names give** — a client
  delete is refused before any owner check is reached. A block comment says so where it matters.
- No retirement schema, no restore, no trash, no version history, no AI, no bulk delete, no teacher
  moderation override.
- Historical evidence remains immutable; semantic remapping remains future-facing.
- Bounded semantic evidence history unchanged; one teacher per class unchanged.
- **`functions` lint reports 4 `no-irregular-whitespace` errors** in
  `functions/src/moderation/textNormalization.ts`, from commit `2fdb5b5` — literal zero-width
  characters inside the moderation stripper's regex classes, load-bearing. Untouched. Zero new.
- **`expo-doctor` reports 3 Expo patch-version drifts.** Pre-existing, unrelated, not in this
  changeset.
- **Pre-existing technical debt, untouched:** `src/features/teacher/services/studentPerformance.ts`
  still contains one raw NUL byte.

## Phase 91 Readiness

The question lifecycle is closed: create, update and delete are all denied to clients, and the two
verbs the product actually uses run through server gateways. The remaining client write rights near
questions are `savedQuestions` (a personal bookmark with no shared state), `questionComments` and
`questionLikes` — and the last two are exactly the collections that would orphan if removal were ever
added, which makes them the natural next subject.

## Product Assessment

The phase that looked like "add a delete gateway" turned out, on evidence, to be "prove what deletion
costs and stop granting a right nothing uses." A class teacher can no longer destroy a student's
work, a question's existence is decided entirely on the server, and the orphan problem that a real
removal feature will have to solve is measured and written down instead of discovered later.
