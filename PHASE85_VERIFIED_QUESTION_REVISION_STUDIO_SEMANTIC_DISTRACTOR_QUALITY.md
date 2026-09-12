# Phase 85 — Verified Question Revision Studio + Semantic Distractor Quality Loop

## Repository Sync

Local HEAD and `origin/phase17-moderation-infrastructure-20260806-195814` were both
`10d2527275c0450b1c7c7bc561ba76bccc05b5b1`, ahead/behind `0 0`, worktree clean —
classification **A, local == remote**. Nothing was pulled because nothing was behind.

## Actual Starting Head

`10d2527` — Phase 84, Verified Semantic Evidence Timeline + Longitudinal Definition History.
No `PHASE85*` document and no Phase 85 commit existed on any branch.

## Collaborator Safety

`git fetch origin` ran before implementation, immediately before commit and immediately before
push. The canonical remote stayed at `10d2527` throughout. `main` was never checked out, never
merged.

## Phase 84 Foundation

Phase 83's `useClassSemanticEvidence` loads the class's bounded semantic evidence once per route;
Phase 82's `useClassSemanticVocabulary` loads the class question inventory. Phase 84 added the
chronology and exported the canonical predicates `eventSelectsScopedIdentity` and
`scopedIdentityForDefinition`. Phase 85 joins those two already-loaded datasets and reads nothing
new.

## Product Mission

Answer the question an author asks about their own material: **which of my questions carry this
shared meaning, on which wrong option, with what feedback attached, and what do the records show
around that exact question?**

## Historical Evidence vs Current Question

A `studyEvent` is historical evidence. A `Question` document is current authoring state. They are
not the same object and must never be reconciled: revising a question changes what FUTURE attempts
record and changes nothing about what already happened. Proven at runtime — see below.

## Question Ownership Audit

`allow update: if isOwner(resource.data.ownerId)` and nothing else. A class contains questions
authored by the teacher **and** by student members (Phase 9.1), so owning the classroom is not
owning its authors' work.

## Authorization Matrix

Verified both in the rules suite (17 new tests) and live against the emulator:

| actor | action | result |
|---|---|---|
| teacher | revise own question | ALLOWED |
| teacher | read student's question | ALLOWED |
| **teacher** | **revise student's question** | **DENIED (403)** |
| student author | revise own question | ALLOWED |
| student author | revise teacher's question | DENIED (403) |
| other class student | revise a classmate's question | DENIED (403) |
| outsider | read / revise | DENIED (403) |
| owner | change `ownerId` / `classId` / `visibility` / `posterRole` / counters | DENIED |

**No permission was widened.** Rules diff: zero.

## Question Update Architecture

Audited and **absent**. `src/services/questions/questions.ts` exports `createQuestion`,
`getQuestionById` and three paged readers — there is no `updateQuestion`. There is no edit route,
no edit screen, and no update hook anywhere in `src/` or `app/`. The composer
(`useTeacherQuestionComposer` → `uploadService`) is an **image-first create flow**: it begins at
the native image picker and ends at `createQuestion`, with no path to load an existing question.

## Branch A / Branch B

**BRANCH B.** The rules permit an owner update; the product has no safe path to perform one.
Shipping a general question-update backend plus a full editor (prompt, choices, correct answer,
feedback, semantic picker, hints, image lifecycle) is a feature in its own right, and Part 28
explicitly forbids rushing it. Phase 85 therefore ships the **Semantic Question Evidence Studio**:
the question side made fully legible, with the structural limit stated plainly rather than hidden
behind a disabled button.

## Editable Fields

None, through the product. The rules would allow an owner to change `description`, `choices`,
`correctChoice`, `choiceFeedback`, `hints`, `subject`, `topic` and `imageUrl` — documented here so
a future phase starts from fact rather than assumption.

## Immutable Fields

`ownerId`, `classId`, `visibility`, `posterRole`, `answerCount`, `likeCount`, `commentCount` —
pinned by the update rule and covered by new tests.

## ChoiceLabel Identity

The association is `choiceFeedback[label].semanticDefinitionId`, keyed by the same `ChoiceLabel`
`choices` and `correctChoice` already use. Never the option's text. The studio reads and displays
that mapping exactly as stored.

## Correct-Answer Safety

Phase 77's sanitiser already drops feedback on the correct choice and on absent labels. Unchanged
and unforked. Not exercised end-to-end because no product edit path exists to change a correct
answer — reported, not claimed.

## Removed-Choice Safety

Same: `sanitizeChoiceFeedback` / `parseChoiceFeedbackFromUnknown` remain the only implementation,
untouched.

## Feedback Sanitization

Untouched. The studio renders what the canonical parser produced and drops nothing of its own; a
malformed entry simply never carries a `semanticDefinitionId` and therefore never appears.

## Shared Semantic Mapping

Association is by opaque definition id only. Two definitions sharing a visible label produce two
separate question lists — proven at runtime.

## Definition Scope Validation

Unchanged: Phase 80 pins a definition's `subject`/`topic` at creation, and the Phase 81/83/84
scoped identity includes them. Because no product path can change a question's scope, no new
validation was added; the risk is documented for whoever builds revision.

## Archived Definition Behavior

Unchanged (Phase 82): an archived definition keeps its questions, its coverage and its history,
and is withheld from new selection only.

## Semantic Remapping

Permitted by the rules, not reachable through the product. Exercised through the authorized owner
write path to prove the read model: remapping one option from definition A to definition B moved
the question between the two lists **and migrated no evidence whatsoever**.

## Historical Evidence Preservation

The core contract, proven with real writes: two permitted revisions changed exactly two question
documents; `studyEvents` count and write-times were byte-identical afterwards, semantic
definitions were untouched, and every recorded identity stayed as it was.

## Question Evidence Domain Model

`semanticQuestionEvidence.ts` — pure, no React, no Firestore, no clock. One pass over the loaded
question inventory, plus one pass per student over the loaded bounded window.

## Observed vs Verified Student Evidence

Two counts, never merged. `observedSelectorCount` is everyone whose records show a selection on
that question, including a single one. `verifiedPatternStudentCount` is the strictly smaller set
Phase 78 counts, and a student is only counted on the questions their own qualifying pattern is
built from. The copy states both in one sentence and keeps them apart.

## Question Ordering

Verified breadth → recency → observed breadth → stable text/id fallback. Deliberately not a
quality ranking: the top row has the most records around it, which is a fact about the records.

## Query Reuse

**Phase 85-specific reads: 0.** Measured from a warm route: searching, switching definitions
A → B → A → B and expanding every question row produced zero additional Firestore calls.

## Vocabulary Studio Integration

Ortak Etiketler → selected definition → evidence summary → timeline → **"Bu etiketi kullanan
sorular"**, collapsed by default. No new route, no new dashboard.

## Question Studio Visual

A question strip: prompt, the mapped option named by label, the factual evidence line. Expanded, a
filled label badge beside the option's real text, the author's own feedback in the author's own
words, the timeline relationship and the ownership fact. Accent and shape carry the mapping;
nothing is red and nothing is scored.

## Read-Only Other-Author State

Reported as the ownership fact it is — "Bu soruyu sınıftaki başka bir yazar oluşturdu; yalnızca
inceleyebilirsin." — never as a permission error and never as a disabled button.

## Revision UX

Not shipped (Branch B). The section states once, at the bottom, that question editing does not
exist yet and that previous learning records are unaffected regardless.

## Cancel / Save Contract

N/A — there is nothing to save. Every interaction in this phase is read-derived.

## Submit-Lock Safety

N/A — no submission exists. Phase 75's `useSubmitLock` is untouched.

## Runtime QA

Firebase emulators only, proven attached before any credential: Auth 127.0.0.1:9099 and Firestore
127.0.0.1:8080 both reachable, production Auth and Firestore never contacted, only non-local host
`www.gstatic.com`. No Functions and no rules changes, so no rebuild was required. A temporary
scenario (2 classes, 3 students, 3 definitions, 7 questions) was removed afterwards: residue 0,
canonical fixtures intact.

## Historical Evidence QA

Snapshot → two authorized revisions → snapshot. Questions changed: exactly the two revised.
`studyEvents`: 0 rewrites, 6 → 6, identities unchanged. Definitions: 0 rewrites. The revised
question's semantic mapping: unchanged.

## Permission QA

The full matrix above, run live. The teacher being **denied** on the student's question is the
result that matters, and it is exactly what the UI tells the teacher.

## Semantic Remap QA

Before: definition A used by 4 questions, evidence on 3. After remapping one question A → B:
A shows **coverage 3 / evidence 3** — its historical evidence and its two verified students fully
intact — while B shows **coverage 2 / "Öğrenme kanıtı: henüz yok"** and an empty timeline. No
evidence migrated in either direction.

## Zero-Write Inspection

Opening the studio, selecting a definition, expanding the question section, expanding every
question row, searching and switching definitions left questions, definitions and studyEvents all
byte-identical.

## Backend Cost

Definition queries 0 new · question inventory queries 0 new · semantic event fan-out 0 new ·
**Phase 85-specific reads 0** · per-question evidence queries 0 · per-question semantic queries 0 ·
question-switch reads 0 · listeners 0 · polling 0 · writes 0 · indexes 0 · collections 0 · nested
N+1 none.

## Security

Zero rules diff. Ownership boundary reported, never widened. No uid, questionId, definitionId,
eventId or Firestore path is rendered or spoken.

## Responsive

375 Light, 375 Dark and 250px (375 at 150%) all render with no element exceeding the viewport,
including a question with two mapped options, long Turkish prompts and long feedback.

## Accessibility

Row reading order: prompt → mapped option → evidence → timeline relationship → ownership →
expansion state. Expansion carries both `aria-expanded` and the state in words. The mapped option
is a label badge plus text, never colour. Zero id leakage across every label and the full visible
text.

## Learning-System Regression

Phases 42–84 are absent from the diff. `firestore.rules`, `firestore.indexes.json`, `functions/`,
`.env`, `app.json`, `package.json`, the lockfiles, `src/features/study/`, `src/features/feed/`,
`src/features/learningStory/`, `src/features/questions/`, `src/services/` and `app/` all have zero
diff.

## iOS Decision

No new native dependency, package, config, permission or API; no native-only behaviour; no
confirmed native-only defect. NATIVE IOS: NOT REQUIRED THIS PHASE.

## Automated Validation

typecheck PASS · lint PASS · unit 175 suites / 3389 tests · rules 5 suites / 428 tests · functions
build PASS · verify PASS · expo-doctor 17/18 (known pre-existing drift) · `git diff --check` PASS.

## Source Integrity

No binary, no NUL, valid UTF-8, LF-only across every touched and new file — swept explicitly after
Phase 84's own NUL incident. No raw colours in the new UI. No instrumentation: the read count was
measured through the browser's own performance entries. Every temporary QA script removed.

## Known Limitations

- **Question revision is not available in the product.** No update service, route or editor
  exists; the composer is create-only. This is stated in the UI, not hidden.
- Semantic history is bounded at 20 class events per student, so every count describes the loaded
  window.
- A current question document is **not** a stored historical version — the app persists no question
  version history, and none was fabricated.
- Historical `studyEvents` are immutable; a mapping change would affect future attempts only.
- Private author semantics are excluded from the shared studio.
- **A teacher cannot revise a student-authored question**, and that boundary was not widened.
- No question quality score, no automatic repair, no AI.
- Archived definitions remain historically meaningful; duplicate labels remain separate.
- No global or cross-class taxonomy. One teacher per class, unchanged.
- **Pre-existing technical debt, untouched:** `src/features/teacher/services/studentPerformance.ts`
  still contains one raw NUL byte. Phase 85 did not edit that file.

## Phase 86 Readiness

The question side is product-ready as an inspection surface. Revision is structurally blocked until
someone builds `updateQuestion` plus an editor, and this phase has already established exactly what
that must respect: owner-only updates, five immutable fields, label-keyed mappings, Phase 77's
sanitiser, and a hard prohibition on touching history.

## Product Assessment

The evidence chain now closes the loop back to the material: from one authored distractor, through
a student's repetition, a shared vocabulary, a class cohort, a definition's trail and its
chronology — to the specific question and the specific wrong option the author wrote. And it stops
there, where the author's judgement begins.
