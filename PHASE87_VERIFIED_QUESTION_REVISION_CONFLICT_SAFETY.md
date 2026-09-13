# Phase 87 — Verified Question Revision Conflict Safety + Optimistic Concurrency

## Repository Sync

Local HEAD was `9bd2430` (Phase 85) and the canonical remote had advanced to `17b97ce` (Phase 86,
authored by another developer): ahead/behind `0 1`, worktree clean — **classification B, behind
only**.

## GitHub Fast-Forward

`git pull --ff-only origin phase17-moderation-infrastructure-20260806-195814`. No merge, no rebase,
no reset. After the pull: HEAD == canonical remote, sync `0 0`, worktree clean.

## Actual Starting Head

`17b97cefe4c7619d9c26f5f6ea23cc7c50031471` — Phase 86, Verified Owner-Only Question Revision +
Future-Safe Semantic Remapping. No `PHASE87*` document and no Phase 87 commit existed on any branch.

## Collaborator Safety

`git fetch origin` ran before implementation, immediately before commit and immediately before
push. The canonical remote stayed at `17b97ce` throughout. `main` was never checked out or merged.

## Phase 86 Foundation

`updateQuestion` in `src/services/questions/questions.ts` is the only question update path: a
`getDoc`, an ownership comparison, then `updateDoc` of exactly five allowlisted fields
(`description`, `choices`, `correctChoice`, `choiceFeedback`, `hints`). `QuestionRevisionScreen` +
`useQuestionRevision` drive it, with `useSubmitLock` against double submit.

## Previous Last-Write-Wins Limitation

Audited in source and confirmed, not assumed: **no `updatedAt`, no version field, no precondition
of any kind.** Phase 86's own comment said so. Two devices editing the same question were
last-write-wins on those five fields, and the second save silently discarded the first.

## Product Mission

Remove the silent lost update — without turning question authoring into a version-control system.

## Conflict Threat Model

A loads Q. B loads Q. A saves. B, still holding the pre-A state, saves something unrelated and
overwrites A's work. Any authoring field can carry the loss: text, a choice, the correct answer, a
note, a semantic mapping, a hint.

## Mutable Authoring Projection

`projectQuestionAuthoringState(question)` returns exactly the five fields `updateQuestion` writes.
It is deliberately implemented as `sanitizeQuestionRevision(createQuestionRevisionDraft(question))`
— the same path a real edit takes — so two questions that would persist identically project
identically, and a legacy document projects to what saving it would actually store.

## Excluded Non-Authoring Fields

`ownerId`, `classId`, `visibility`, `posterRole`, `subject`, `topic`, `gradeLevel`, `imageUrl`,
`createdAt`, `id`, and the three engagement counters `answerCount` / `likeCount` / `commentCount`.
None is editable here, so none may look like a competing edit.

## Revision Fingerprint

`questionAuthoringRevision(question)` — a **product concurrency token**, never persisted, never
migrated, never rendered, never spoken, and carrying no cryptographic claim. A test asserts it
contains no uid, class id, organisation or question id.

## Deterministic Canonicalization

`canonicalizeQuestionAuthoringState` emits every object with **sorted keys** and preserves array
order (hint order is meaningful). Firestore promises nothing about key order, so a naive
`JSON.stringify` could report a conflict between two byte-identical questions.

## Transaction Contract

`runTransaction`: `transaction.get` → existence → ownership → re-derive the fingerprint from the
document **as it is now** → compare → sanitise → `transaction.update` of the same five keys.
Read-compare-then-separate-write would leave a window between the comparison and the write; the
transaction closes it. `expectedRevision` is optional, so every pre-existing caller is unchanged.

## Owner Verification

Unchanged and checked **before** the fingerprint. A matching token grants nothing.

## Security Boundary

**firestore.rules: zero diff.** Optimistic concurrency is a product-path protection, not an
authorization mechanism, and the report below states plainly where it does not reach.

## Counter Non-Conflict

Proven at runtime: with the editor open, `answerCount` was incremented through the Admin SDK — the
same path the trusted Cloud Functions use, as the rules themselves document — then the teacher
edited the question text and saved. **No conflict; the save succeeded and the latest counter (2)
survived.**

## Definition Rename Non-Conflict

Definition Y was renamed twice from outside, once while the editor sat open. The question's stored
`semanticDefinitionId` never moved, the fingerprint never moved, and the subsequent save
succeeded. The picker showed the **current** label, resolved by id.

## Text Conflict

A changed the question text and saved; B, stale, edited only the feedback and was refused.

## Choice Conflict

Covered by the fingerprint (C4: option text changed, option removed) and by the same transaction
path as every other authoring field.

## Correct Answer Conflict

Supported and proven. A changed the correct answer to C and saved. B, still believing A was
correct, edited a hint and was refused — `correctChoice` stayed **C**, and B's stale correct-answer
and mapping assumptions were never restored.

## Feedback Conflict

The headline runtime case: B's stale feedback edit was refused and never persisted.

## Semantic Mapping Conflict

A remapped choice B from definition X to definition Y and saved. B, stale on X, edited only the
feedback text and was refused. **Current mapping remained Y; stale X was never restored.**

## Hint Conflict

Proven inside the correct-answer case: B's stale hint was not persisted.

## Conflict Error

`QuestionUpdateErrorCode` gains `"revision-conflict"` — its own product state, never collapsed into
permission, network, validation or unknown.

## Conflict UX

A contained notice built from the same tokens as the existing trust note: a branch icon, the title
"Bu soru başka bir oturumda güncellendi", the body "Değişikliklerinin daha yeni içeriğin üzerine
yazılmasını önledik. Buradaki taslağın duruyor; devam etmek için güncel sürümü yükle." and a
"Güncel sürümü yükle" action. No red page, no status code, no transaction or fingerprint language.

## Draft Preservation

The draft is untouched on conflict — verified at runtime that both the stale text and the typed
stale feedback were still in the fields. `updateDraft` deliberately does **not** clear the conflict:
typing more does not make a draft less stale.

## Reload Latest Contract

Re-reads the question, rebuilds the draft, refreshes the fingerprint, re-resolves definition labels
and clears the conflict. Proven **0 writes**.

## No Auto Merge

None. Authoring fields interact — the correct answer decides which notes may exist, and a note
carries a semantic mapping — so stitching two drafts together could produce a state neither author
wrote. Whole-authoring-state conflict is the conservative, intentional choice.

## No Force Overwrite

No "Yine de kaydet", no overwrite. Save stays blocked until the teacher loads the current version
and decides again.

## Historical Evidence Safety

Across every conflict and every successful save: `studyEvents` and `semanticDefinitions` were
byte-identical. Phase 78, 79, 83 and 84 are untouched by anything in this phase.

## Semantic Remap Conflict Proof

Before: B → X. A remapped to Y and saved. B's stale save was refused with **0 writes**, and the
current mapping stayed Y.

## Future Server-Derived Event Proof

With Y current, student `qa87-s1` answered the revised question through the real
`recordStudyOutcome` callable. The **server-written** identity was
`class:qa87-class:qa87-def-y` — the stale X was not emitted. Phase 86's future-facing guarantee is
intact.

## Authorization Regression

Runtime, unchanged: teacher revises own ALLOWED / student's question **DENIED (403)**; student
revises own ALLOWED / teacher's **DENIED (403)**; outsider DENIED. A hand-typed edit route for a
student-authored question rendered **zero editable fields** and no Save.

## Query Cost

Editor open: 1 question read + 1 bounded definitions query. Successful save: 1 transaction read +
1 transaction update, plus the one canonical post-save re-read Phase 86 already performed.
Conflict: 1 transaction read, **0 writes**. Reload: 1 question read, 0 writes. Listeners 0, polling
0, new indexes 0, new collections 0, no N+1.

## Runtime QA

Firebase emulators only, proven attached before any credential: Auth 127.0.0.1:9099 and Firestore
127.0.0.1:8080 reachable, production Auth and Firestore never contacted, only non-local host
`www.gstatic.com`. No Functions or rules changes, so no rebuild was required. Temporary fixtures
removed afterwards: residue 0, canonical fixtures intact.

## Two-Session Proof

Two genuinely independent browser tabs, same teacher account, same question, both loaded from the
same starting state. Every conflict case above was driven through the real UI, not through a mock.

## Zero-Write Conflict Proof

Opening the editor, typing into two fields and cancelling left questions, definitions and
studyEvents byte-identical. Every stale save attempt likewise wrote nothing.

## Responsive

375 Light and 375 Dark: conflict notice renders cleanly with no horizontal overflow and Save
visibly dimmed. At 250px (375 at 150%) **the conflict notice itself fits** (right edge 221 of 250,
including the 44px reload target); the page does overflow to 269px there, and the offenders are
Phase 86's own choice inputs and semantic chips — pre-existing, not introduced here, and reported
rather than papered over.

## Accessibility

The conflict is a `polite` live region whose accessible label carries the full explanation plus
"Kaydetme şimdilik kapalı."; the reload action is labelled "Güncel sürümü yükle" with a hint that
the draft will be replaced; Save reports `aria-disabled="true"`. Meaning is carried by icon and
text, never colour. No fingerprint, question id, uid or Firestore path is exposed anywhere.

## Learning-System Regression

Phases 42–85 are absent from the diff. `firestore.rules`, `firestore.indexes.json`, `functions/`,
`.env`, `app.json`, `package.json`, the lockfiles, `src/features/study/`, `src/features/feed/`,
`src/features/learningStory/`, `src/features/teacher/services/` and `app/` all have zero diff.
Phase 86 is unchanged except the intentional concurrency-safe update path.

## iOS Decision

No new native dependency, config, permission, API or behaviour; no confirmed native defect.
NATIVE IOS: NOT REQUIRED THIS PHASE.

## Automated Validation

typecheck PASS · lint PASS · unit 177 suites / 3447 tests · rules 5 suites / 428 tests · functions
build PASS · verify PASS · expo-doctor 17/18 (known pre-existing drift) · `git diff --check` PASS.

## Source Integrity

No binary, no NUL, no CRLF, no BOM, valid UTF-8 across every touched file — swept explicitly, as
Phase 84's own NUL incident taught. The composite key added here uses no separator at all. No raw
colours in the touched UI. No instrumentation: read counts and write counts were measured through
the browser's performance entries and Admin-SDK snapshots. Every temporary QA script removed.

## Known Limitations

- **No persisted question version history.** Nothing was added to the schema, nothing migrated,
  nothing backfilled. This is optimistic concurrency, not version control.
- Conflict detection applies to the **canonical `updateQuestion` path**. An authorized owner writing
  directly through raw Firestore APIs bypasses it entirely — demonstrated during this phase's own
  authorization QA, where a direct REST PATCH by the owner succeeded with no revision check. The
  protection is a product guarantee, not a security boundary, and rules were not widened to make it
  one.
- No auto merge and no force overwrite; a stale draft must be reloaded before saving.
- No rollback, no undo of a saved version.
- Question deletion is still absent.
- Historical learning evidence remains immutable; semantic remapping remains future-facing.
- Bounded semantic evidence history is unchanged.
- A teacher still cannot edit a student-authored question.
- Phase 86's image, scope and grade read-only limitations remain.
- The revision editor overflows below ~270px (Phase 86 inputs and chips); Phase 87's own notice
  fits.
- One teacher per class, unchanged.
- **Pre-existing technical debt, untouched:** `src/features/teacher/services/studentPerformance.ts`
  still contains one raw NUL byte. Phase 87 did not edit that file.

## Phase 88 Readiness

Silent lost-update protection is in place on the product path, atomically, with the owner check
unchanged and no rules widened. The strongest safe next capability is making the direct-write gap
explicit — either by moving question revision behind a callable so the transaction is
server-enforced, or by accepting the product-path scope and documenting it in-product.

## Product Assessment

An author can no longer quietly destroy another session's work, and the product says so in plain
language rather than a status code. Everything it refuses to do — merging, forcing, versioning,
rewriting history — it refuses on purpose.
