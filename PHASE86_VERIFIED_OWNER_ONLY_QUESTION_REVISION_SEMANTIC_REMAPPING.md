# Phase 86 — Verified Owner-Only Question Revision + Future-Safe Semantic Remapping

## Repository Sync

Local HEAD and `origin/phase17-moderation-infrastructure-20260806-195814` were both
`9bd2430`, ahead/behind `0 0`, worktree clean — classification **A, local == remote**. Nothing was
pulled because nothing was behind. No `PHASE86*` document and no Phase 86 commit existed anywhere.

## Actual Starting Head

`9bd2430` — Phase 85, Verified Question Revision Studio + Semantic Distractor Quality Loop
(Branch B: the inspection studio without an editor). Phase 85 audited and recorded the structural
blocker this phase removes: no `updateQuestion`, no edit route, no editor screen.

## Collaborator Safety

`git fetch origin` ran before implementation, after runtime QA, immediately before commit and
immediately before push. The canonical remote stayed at `9bd2430` throughout. `main` was never
checked out, never merged, never pushed.

## Phase 85 Foundation

Phase 85's `buildSemanticQuestionEvidence` computes `authorability: "own" | "other_author"` from the
question's `ownerId` against the signed-in uid, and `SemanticQuestionStudioSection` reported
ownership factually with a note that revision did not exist. Phase 86 builds the missing revision
path and replaces that note with a live, owner-only control — nothing else about Phase 85's
evidence model changed.

## Product Mission

Let the author of a question revise its **current** authoring state — text, options, correct
answer, per-option feedback, shared semantic mapping, hints — from the semantic studio, with the
one promise that matters stated up front and kept by construction: **previous learning records do
not change; the revision applies to new answers only.**

## Existing Question Update Architecture Audit

`src/services/questions/questions.ts` exported `createQuestion`, `getQuestionById` and paged
readers only. No `updateQuestion`, no edit route under `app/`, no editor in `src/features`. The
composer (`useTeacherQuestionComposer` → `uploadService`) is image-first create-only. Confirmed by
grep before a line was written.

## Question Ownership Audit

`firestore.rules` `questions` update: `isOwner(resource.data.ownerId)` and nothing else, with
hints/choiceFeedback bounds and `ownerId`/`visibility`/`classId`/`posterRole`/`answerCount`/
`likeCount`/`commentCount` pinned to their stored values. It does **not** pin `subject`, `topic`,
`gradeLevel`, `imageUrl` or `createdAt` — so the service's allowlist is what keeps those read-only.

## Authorization Matrix

| actor | action | result | proven |
|---|---|---|---|
| teacher | revise own T1 / T2 | ALLOWED | live save ×3 |
| teacher | open editor for student-authored S1 (direct URL) | `unauthorized` state, zero fields rendered | live |
| teacher | direct update on S1 (REST with teacher token) | **403** | live |
| teacher | read / update private decoy (student-owned) | **403 / 403** | live |
| student | direct update on teacher's T1 (REST with student token) | **403** | live |
| owner | change ownerId/visibility/classId/posterRole/counters | DENIED | Phase 85 rules suite (unchanged, 428 pass) |

**No permission was widened. Rules diff: zero.**

## Canonical updateQuestion

`updateQuestion(questionId, payload)` in `src/services/questions/questions.ts`:
one ownership read (`getDoc`) → `QuestionUpdateError("not-found" | "not-owner" | "unauthenticated")`
→ `sanitizeQuestionRevision` → `buildQuestionUpdatePatch` → one `updateDoc` with exactly five
literal keys → one re-read returned as `Question`. It imports nothing from studyEvents,
studyItems or semanticDefinitions and cannot express a write to them.

## Update Allowlist

`QUESTION_UPDATE_ALLOWLIST = ["description", "choices", "correctChoice", "choiceFeedback", "hints"]`
lives in the pure module `questionRevision.ts` beside the sanitiser, and the unit suite asserts
(S4–S9) that no draft, however constructed, yields a key outside it. `QuestionRevisionDraft` has no
field for `ownerId`, `classId`, `visibility`, `posterRole`, `subject`, `topic`, `gradeLevel`,
`imageUrl`, `createdAt` or any counter — the type cannot carry them.

## Immutable Fields

Runtime-verified across every save: `ownerId`, `visibility`, `classId`, `posterRole`,
`organizationId`, `subject`, `topic`, `gradeLevel`, `imageUrl`, `createdAt`, `likeCount`,
`commentCount`, `answerCount`, `id` — identical before and after, and the document's key set was
identical to an untouched sibling's.

## Read-Only Metadata Decision

Subject, topic and grade are shown ("Ders, konu ve seviye bu ekranda değiştirilemez.") and not
editable: subject/topic are part of every shared definition's identity (Phase 80/81), so moving a
question's scope would silently re-scope its semantic mappings. The image is shown, not editable —
the create flow owns image handling. Explicitly out of scope; not a limitation of the rules.

## Revision Model

`src/features/questions/services/questionRevision.ts` — pure, deterministic, no Firebase:
`createQuestionRevisionDraft`, `validateQuestionRevision`, `sanitizeQuestionRevision`,
`isRevisionDirty` (compared on the sanitised payload), `feedbackEligibleLabels`, `hintDraftBoxes`,
`isSemanticMappingChanged`, `buildQuestionUpdatePatch`, the trust copy.

## Choice / Correct Answer / Feedback Sanitization

One sanitiser, not two: `buildChoicesPayload` settles the options (blanks dropped, <2 → no options)
and validates the correct answer against them; `sanitizeChoiceFeedback` drops a note on an absent
option, on the correct option, or with blank text; `sanitizeHints` bounds the ladder. The editor
renders a note field only for `feedbackEligibleLabels` (present ∧ not correct), so the form cannot
show a field the sanitiser would discard.

Live: making C the correct answer on T2 dropped C's note **and** its shared mapping; D's note was
retained; the remap trust note appeared before saving.

## Shared Semantic Mapping

Select-only from the class vocabulary through the canonical `SemanticDefinitionPicker` (scoped by
the question's subject/topic). A shared reference wins over a legacy private `conceptKey`; choosing
a definition retires the private key; a legacy private key with no shared reference is preserved,
never offered as new input (P15).

## Future-Safe Semantic Remapping — The Proof

Fixture: definitions A and B with the **same label** in the same scope; T1 mapped A→A on option A.

1. Student C answered T1 with A through the real UI → `recordStudyOutcome` wrote
   `semanticChoice = class:demo-class-1:p86-def-a@A` (server-derived; client sent only
   `selectedChoice: "A"`).
2. Teacher remapped T1's option A from A to B in the editor (remap trust note shown), saved: one
   write, `choiceFeedback.A.semanticDefinitionId = "p86-def-b"`.
3. Student D answered the revised T1 with A → server-written event
   `semanticChoice.conceptKey = "p86-def-b"`, `semanticOpportunities → p86-def-b`, label snapshot
   from the current question. **Nothing client-authored.**
4. Student C's two historical events remained **byte-identical** (`p86-def-a`).
5. Coverage moved A: 3 → 1 (S1 only), B: 0 → 1; B's timeline showed the new evidence; A's history
   stayed.

## Historical Evidence Immutability

Every `studyEvent` referencing the fixture was hashed (full JSON) before the first save and after
each of three saves, a rename, an archive, an unarchive, and every cancel: identical at every step.
`studyEvents` remain `allow write: if false`; nothing in Phase 86 targets them.

## Archived Definition Behaviour

With B archived (Phase 82 flow) while it was T1's current mapping: the editor showed
"İşaret hatası (arşivlenmiş), seçili" on A and did **not** offer B for option D. An unrelated save
(third hint) preserved the archived mapping id unchanged.

## Rename Behaviour

Renaming B to "İşaret hatası (yeni)" did not touch T1 (document hash identical; stored
`semanticLabel` snapshot unchanged). The editor resolved the current label from the definition, so
the two same-label definitions became distinguishable to the author.

## Duplicate Label Behaviour

Two definitions with identical labels remain two identities: the picker showed both chips with
the selected one marked; coverage and evidence moved by **id**, never by label.

## Route

`app/(teacher)/class/[classId]/question/[questionId]/edit.tsx` → `QuestionRevisionScreen`.
The route carries no authority: the hook compares `ownerId` to the uid before any field renders,
the service repeats the check, the rules refuse the write regardless. Typed routes regenerated
(`.expo/types/router.d.ts`, gitignored).

## Revision Screen

`src/features/teacher/screens/QuestionRevisionScreen.tsx` — header, trust note first, read-only
scope line, image preview, description (300), A–E label-keyed options with a radio-style
correct-answer toggle, per-eligible-option feedback + picker, three hint boxes, remap trust note
when the mapping changes, validation / save error line, Kaydet / Vazgeç. States: loading, missing
(with retry on load error), unauthorized, ready, saving, saved (→ back). No internal ids rendered
(checked). Theme tokens only.

## Hook

`useQuestionRevision` — two reads on open (question + class vocabulary), local draft, `isDirty`,
`validationError`, `mappingChanged`, `save()` behind `useSubmitLock`, Turkish error mapping for
`QuestionUpdateError` codes.

## Cancel / Save Contract

No autosave, no debounce, no write on keystroke. Cancel with a dirty draft: zero writes (proven
twice, including with an invalid draft). Save: exactly one `updateDoc` (proven by per-document
`updateTime` and full-JSON hashes: only the saved question changed on each save).

## Studio Integration

`SemanticQuestionStudioSection` gained `onEditQuestion?`; a row with `authorability === "own"`
shows "Soruyu düzenle"; an other-author row keeps its explanation and gets **no control** (2 CTAs
for 3 rows, live). The stale "Soru düzenleme bu sürümde henüz yok…" note is replaced by
`REVISION_TRUST_NOTE`. Threaded through `SemanticDefinitionDetail` → `SemanticVocabularyScreen`.

## Return Refresh

`SemanticVocabularyScreen` remembers the opened question id and, on focus, re-reads **that one
document** (`useClassSemanticVocabulary.reloadQuestion`) — coverage, the Phase 85 rows and the
detail's usage list update from it. Cost: one read per return, no inventory re-walk, no skeleton.

## Zero-Write Inspection

Method: a scratchpad Admin-SDK reader printed every fixture question and every referencing
studyEvent as full JSON; snapshots were diffed at each step. Open editor: identical. Cancel:
identical. Invalid-draft cancel: identical. Tamper probes (403s): identical.

## Backend Cost

Open editor: 2 reads. Save: 1 read + 1 write + 1 re-read. Return to studio: 1 read. No new
listener, no new index, no new collection, no Cloud Function change.

## Security

Emulator attachment proven before any credential (local `/emulator/v1/…/config` answered, zero
`googleapis` resource entries; sign-in traffic went to `127.0.0.1:9099` only). No Admin SDK in the
app. No secrets touched; `.env` unmodified. Emulator-only synthetic credentials.

## Responsive

375×812 light and dark: no horizontal overflow, form readable. 1280×800: form capped at
`contentWidth.readable` (680). 853×533 (≈150 % zoom): no overflow. Viewport reset afterwards.

## Accessibility

24 interactive elements, all labelled, none under 44×44 (toggle set to `minTouchTarget`).
`role="header"` on the title, `radio` toggles carry explicit `aria-checked` / `aria-disabled`
(react-native-web drops `accessibilityState.checked` on a Pressable — same gap Phase 85 met with
`expanded`). Trust notes are single accessible nodes. Error line is a polite live region.

## Learning-System Regression

Student answer flow unchanged: revised feedback text and hints reached Student D through the
existing detail screen; `recordStudyOutcome` untouched (`functions/src` diff: none).

## Concurrency

`Question` has no `updatedAt` or version field, so two authors' saves are last-write-wins on the
five mutable fields. No false optimistic-locking claim is made; a single author per question is
the product's actual shape (owner-only).

## Automated Validation

typecheck PASS · lint PASS · unit **176 suites / 3421 tests** (+1 suite, +32 tests) · rules
5 suites / 428 tests (emulators:exec, run with the QA emulators stopped) · functions build PASS ·
`npm run verify` exit 0 · expo-doctor 17/18 (known pre-existing dependency drift) ·
`git diff --check` PASS.

## Source Integrity

Every touched and new file: NUL=0, CRLF=0, no BOM, UTF-8. No raw colours in the new UI. No
temporary instrumentation (grep `QA86`/`console.log` in new files: none). QA scripts lived only in
the session scratchpad and were never in the repo. Historical `routing.ts` CRLF artifact and the
raw NUL in `studentPerformance.ts` untouched.

## Runtime QA Cleanup

Temp definitions A/B, T1, T2, S1, private decoy deleted and existence-checked (`false` ×6); the
QA-generated studyEvents/studyItems for those questions deleted (0 remaining); dev server and all
emulators stopped (no listeners on 8080/9099/5001/9199/8081/4000).

## Known Limitations

- Last-write-wins on concurrent saves (no `updatedAt`), stated above.
- The image is view-only in the editor; changing it stays with the create flow.
- The picker shows same-label definitions as visually identical chips until one is renamed —
  Phase 80's canonical picker, reused as-is.
- Web deep links to `/profile` resolve to the first route group on a cold load (pre-existing;
  group-qualified URLs work). Not touched.
- Feed cards nest a `<button>` inside a `<button>` on web (pre-existing console warning). Not touched.
- No version history exists and none was fabricated. No delete, no AI rewriting.

## Product Assessment

The loop Phase 85 opened now closes at the author's desk: see which of your questions carry a
meaning, open the one you wrote, fix the wording, move the mapping — and know, because it is
proven rather than promised, that nothing a learner already did was rewritten.
