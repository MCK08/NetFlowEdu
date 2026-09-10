# Phase 80 — Verified Shared Semantic Vocabulary

## Repository Sync

Baseline `24850d4` (Phase 79). Remote was identical (`0 0`), worktree clean,
`git merge-base --is-ancestor 24850d4 HEAD` held. Nothing pulled. No `PHASE80*.md` existed.

## Collaborator Safety

`git fetch origin` at the start, immediately before committing, and immediately before pushing. The
canonical remote did not advance; nothing was merged, rebased or forced.

## Starting Baseline

`24850d4`, branch `phase17`, clean.

## Phase 79 Structural Limitation

`conceptKey` was author-scoped, and correctly so: two people typing `sign_transfer_error` have not
agreed on anything. But that meant the product could never group a meaning across authors, and —
less obviously — could only group across ONE author's own questions when they happened to retype
the identical slug.

## Product Mission

Let authors point at the same canonical definition on purpose, and treat only that as shared meaning.

## Existing Author-Scoped Identity

Phase 78/79 identity was `ownerId + conceptKey + subject + topic`, with the namespace stored as a
bare string. Selected evidence carried `{namespaceId, conceptKey, choiceLabel}`; opportunity evidence
carried `{namespaceId, conceptKeys[], selectedChoice}` — one namespace for the whole question.

## Shared-Scope Audit

Candidates: organisation, class, teacher. The audit produced a finding worth stating plainly.

`createClass` requires a teacher caller and writes that caller as the single `role: "teacher"`
member. `joinClassByCode` requires a **student** caller and writes `role: "student"`. There is no
co-teacher path anywhere. **A class has exactly one teacher, so teacher-to-teacher sharing — the
scenario this phase was framed around — cannot occur in this repository.**

What a class *does* contain is multiple **authors**: `firestore.rules` lets the class teacher create
class questions with `posterRole: 'teacher'`, and lets student members create them with
`posterRole: 'student'`. `useStudentQuestionUpload` passes `choiceFeedback` through, so a student's
class question can carry authored semantics with its own `ownerId`. That is a genuine multi-author
scope, and it is server-authoritative, stable and already permissioned.

So the phase proceeds on class scope, delivering two things honestly:

1. **Reliable reuse for one author** — selecting a curated label instead of retyping a slug. This is
   the dominant case in this repository and was previously accidental.
2. **Genuine cross-author merging** — a teacher's question and a student's question in the same class
   pointing at the same definition. Proven at runtime.

Organisation scope was not invented: nothing in the repository justifies a school or district as a
shared curriculum authority, and creating one to make the feature sound bigger would have been the
same overreach as matching on labels.

## Why Global Matching Is Unsafe

Because a label, a slug and a subject/topic pair are all coincidences until someone says otherwise.
Merging on any of them would have the product asserting a shared vocabulary nobody agreed to.

## Canonical Shared Scope

The class. Identity is `("class", classId, definitionId)`.

## Semantic Definition Resource

`classes/{classId}/semanticDefinitions/{definitionId}` — the path *is* the scope, so a cross-class
read cannot be expressed by accident. Fields: `label`, `description`, `subject`, `topic`,
`createdBy`, `createdAt`, `updatedAt`, `archived`, `schemaVersion`.

## Stable Definition Identity

The Firestore document id: opaque, stable, meaningless. Identity is the id and only the id. Two
definitions may carry identical labels and remain different meanings — proven by test and at runtime
with a deliberate same-label decoy.

## Immutable Scope

`classId`, `subject`, `topic`, `createdBy` and `createdAt` are pinned to their stored values on
update. A definition that could be re-scoped would retroactively re-group every historical pattern
that referenced it.

## Archive Model

`archived` retires a definition from **new** selection while every existing reference stays valid.
Hard delete is denied by rules: questions reference definitions by id and events record that id
permanently, so deletion would leave both pointing at nothing.

## Security / Authorization

Read: the class teacher and its members. Create/update: the class teacher only. Delete: nobody.
Students may **select** from the vocabulary — that is what lets their question join a shared meaning
— but never create or retire one, in the UI and in the rules. 25 rules tests cover authorised
create, other-teacher denial, student denial, outsider denial, unauthenticated denial, every bound,
every immutable field, archive, and delete denial.

## ChoiceFeedback Evolution

`ChoiceFeedbackEntry` gains `semanticDefinitionId` and `semanticLabel`, both null on every legacy
entry. Nothing about existing entries changed; Phase 77's 39 tests pass untouched.

## Legacy Compatibility

No migration, no backfill. A missing `namespaceKind` reads as `"author"` — which is exactly what
every Phase 78/79 event was. The opportunity parser reads the new per-item `items` array when
present and falls back to the Phase 79 `namespaceId + conceptKeys[]` shape otherwise, normalising
both into one identity model.

## Shared Reference Contract

One authority per entry, decided in the sanitiser: a shared reference wins and the private
`conceptKey` is dropped, so no entry can ever carry two competing identities.

## Question Copy / Move Safety

Audited, and the concern turns out not to arise. `savedQuestions` is a **bookmark** to the same
document, not a copy — no path creates a duplicate question — and `classId` is immutable on update,
so a question can never change class. A shared reference therefore cannot leave its class.

Even if one somehow did, it would be harmless: scope comes from the **question's** `classId`, never
from the reference. A stale id on a class-B question resolves to `("class", B, id)` and can only
group with other class-B questions. Cross-class contamination is structurally impossible.

## Mixed Namespace Question Problem

Phase 79's opportunity payload assumed one namespace per question. That stopped being true the
moment choice A could carry a private key while choice C carries a shared reference. Solved with
per-item identities: `items: [{namespaceKind, namespaceId, semanticId}]`. New writes use `items`
only — no parallel fields accumulate — and the legacy shape is still read.

## Opportunity Schema Evolution

An optional field under the same version, matching the Phase 78/79 precedent. A v2 envelope was
considered and rejected: evolving the two existing fields in place is a smaller change than
introducing a third format that every future reader would have to understand alongside the other two.

## Selected Semantic Identity

Shared when the picked option carries a reference; author-scoped otherwise. Correct and unmapped
picks still record nothing.

## Opportunity Semantic Identity

Every valid offered meaning, each with its own namespace, deduplicated by full identity and sorted.

## Human-Readable Label Snapshot

Stored on the **question** at authoring time and read from there by the server — so a student's
pattern can show real words with **zero** extra reads on the outcome path. Display only, never
identity, and deliberately a snapshot: a later rename does not rewrite what a student was shown. An
author-scoped identity carries no label, and its pattern keeps the generic Phase 78 wording rather
than having prose invented from a slug.

## Event Compatibility

The parser understands Phase 59 events, Phase 78 selected-only events, Phase 79 selected +
opportunity events, and Phase 80 shared/mixed events. Covered by test.

## Server Verification

The client sends a choice label. There is no request field for a definition id, a namespace, a label
or a correctness claim. Proven at runtime: a call carrying a forged `semanticDefinitionId` and a
fabricated `semanticOpportunities` object produced an event with the server's own derived identity
and nothing of the forgery.

**No definition read is performed at outcome time**, and the reason is architectural rather than
economical: scope comes from the question, so reading the definition could only confirm a label that
is already snapshotted — it could not change which identity is correct.

## Exactly-Once Integrity

Unchanged. Same event, same transaction, same `operationId` guard; the replay branch returns before
any write. A retried operation produced exactly one event with one selected payload and one
opportunity payload.

## Teacher Authoring UX

Inside a class, the shared picker **replaces** the free-text key field rather than sitting beside it
— offering both would let an author fill in two competing identities and have the sanitiser silently
discard one. Chips of the teacher's own words, scoped to the question's subject and topic, with
inline create that inherits that scope. A near-identical active label raises a sentence and nothing
else: no auto-select, no merge, no similarity score.

## Shared Vocabulary Management

Composer-only, deliberately. A dedicated management surface would have been a CRUD screen for a list
that is currently created and read in exactly one place; the archive path exists in the service and
rules and can be surfaced when there is something to manage.

## Student Shared-Label UX

`Odak: İşaret aktarımı` above the existing evidence sentence. "Odak", not "Yanılgın" — the label
names what the *author* said the option represents, which is a statement about the question, not a
diagnosis of the reader.

## Teacher Student-Performance UX

The same component, the same verified facts, the same label. Zero incremental reads.

## Cross-Author Proof

A class definition, a question authored by the teacher and a question authored by a **student**, both
referencing it. Server wrote `class:demo-class-1:qa80-def-shared` for both. The student surface showed
**one** pattern: "Odak: İşaret aktarımı · 2 farklı soru · 2 kayıt".

## Cross-Class Isolation

The same definition id in a second class resolved to a different namespace and did not merge —
verified by test, and structurally guaranteed by scope-from-question.

## Same-Label Isolation

A decoy definition with the byte-identical label `İşaret aktarımı` and a different id did not join
the pattern. Label is not identity.

## Phase 79 Recovery Compatibility

Two later declines of the shared definition — one on a teacher-authored question, one on a
student-authored one — produced a recovery signal. Cross-author recovery works because the identity,
not the author, is what is compared. Re-selection still withdraws it; two declines on one question
still do not qualify.

## Backend / Query Cost

New logical resource: one class subcollection. Teacher/student vocabulary: **one bounded read**
(≤200 docs), and only while the composer is open. Definition create: one write. Archive: one write.
New client reads on any student surface: **0**. New teacher Student-Performance reads: **0**. Extra
server reads per MC outcome: **0** — the question was already read for the access check, and the
label is snapshotted on it. Extra outcome writes: **0**. Listeners 0, polling 0, N+1 none, new
indexes 0.

## Rules

One new match block. `choiceFeedbackWithinBounds` is unchanged and now carries a note explaining why
a cross-class reference needs no rule.

## Runtime QA

Functions built **before** the emulators started, artifact verified to contain the new resolver, and
emulator attachment proven before any credential (flag `true`, fail-closed guard passing, Firestore
to `127.0.0.1:8080`, zero production Firebase). Then: cross-author merge, same-label isolation,
private-key isolation, forged-identity rejection, idempotent retry, cross-author recovery, and
archive-preserves-history.

## Temporary QA Cleanup

Three definitions, seven questions, a temporary class and all QA events removed; verified
programmatically with **0 residue** and the temporary class gone. Scripts removed from the
repository.

## Responsive

375 light, 375 dark, 375 at 150%, and desktop dark (student and teacher) verified with no overflow
and no clipping.

## Accessibility

The focus label is read before the evidence, in the order a sighted reader takes it. The picker
announces each definition, its selected state, and archived state in words. No definition id, class
id, author uid or conceptKey appears in any label — verified at runtime by scanning both rendered
surfaces. State is never carried by colour alone.

## Learning-System Regression

Phases 42–47, 59, 61–79 untouched by the diff. Student Feed zero diff. Learning Atlas zero diff.
Phase 77's 39 tests, Phase 78/79's 55 tests all pass — the latter needed fixture shape updates only,
with no assertion of behaviour changed.

## iOS Decision

New native dependency **NO** · package **NO** · config **NO** · permission **NO** · native-only API
**NO** · native-only behaviour **NO** · confirmed native defect **NO**.

**NATIVE IOS: NOT REQUIRED THIS PHASE.**

## Automated Validation

typecheck PASS · lint PASS · unit 170 suites / 3195 tests (+2 suites / +43) · rules 5 suites / 400
tests (+25) · functions build PASS · verify PASS · expo-doctor 17/18 (known drift) ·
`git diff --check` PASS.

## Source Integrity

No binary source, no NUL bytes, valid UTF-8, LF-only. Zero raw colour literals and zero debug
instrumentation added. `.env`, lockfiles, `app.json`, `package.json`, `routing.ts` and `main`
untouched.

## Known Limitations

- **No teacher-to-teacher sharing exists, because no co-teacher model exists.** The multi-author case
  this delivers is teacher ↔ student within one class. If co-teaching is ever added, this design
  extends to it without change.
- No global or cross-class vocabulary. Sharing stops at the class boundary, deliberately.
- Old private semantic events stay private, and are not migrated.
- Archived definitions remain historically valid, by design.
- Shared meaning still depends on authors deliberately choosing the same definition; nothing
  suggests, scores or auto-merges.
- The label snapshot can go stale if a definition is renamed after an event was recorded. Grouping
  follows the id and stays correct; only wording lags.
- No absolute misconception resolution, and no class-wide semantic analytics.
- **The composer picker is build- and unit-verified rather than driven end-to-end**: opening the
  composer requires the native image picker, which cannot be exercised from the web QA harness. Its
  pure selection, scoping and duplicate-warning logic is covered by 22 tests.

## Phase 81 Readiness

**Cross-author semantic identity — structurally safe.** Identity is an explicit reference inside a
server-authoritative scope, with a kind discriminator preventing id-space collisions, verified end to
end.

**Class-wide semantic aggregation — structurally safe for definitions, but thin.** A class cohort can
now be built on shared ids with no string guessing. What is missing is volume: only questions whose
authors selected a definition contribute, and today that is whatever a teacher has curated. A cohort
view built now would be correct and nearly empty.

**A class cohort without label guessing — yes.** `("class", classId, definitionId)` is exactly the
key such a view needs.

**Automatic intervention from semantics — no.** A shared identity makes grouping trustworthy; it says
nothing about whether a group needs intervening on. Phase 43/44/47 remain deliberately independent.

## Final Product Assessment

Two authors can now mean the same thing, and the product knows it — because they both said so, not
because two strings looked alike. The mechanism is small and boring on purpose: an opaque id, an
explicit scope, and a refusal to infer anything from words.
