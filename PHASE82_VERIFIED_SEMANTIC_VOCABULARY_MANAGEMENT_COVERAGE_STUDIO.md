# Phase 82 — Verified Semantic Vocabulary Management + Coverage Studio

## Repository Sync

Local HEAD and `origin/phase17-moderation-infrastructure-20260806-195814` were both
`c6e41f817644cf7399d6324b11c37bc6af2baec8`, ahead/behind `0 0`, worktree clean. Nothing was
pulled. No `PHASE82*` document and no Phase 82 commit existed on any branch.

## Collaborator Safety

`git fetch origin` ran before implementation, immediately before commit and immediately before
push. The canonical remote stayed at the starting HEAD throughout. No merge, rebase, reset or
force. `main` was never checked out and never merged.

## Starting Head

`c6e41f8` — Phase 81, Verified Semantic Cohorts + Small-Group Studio.

## Phase 80 Shared Vocabulary Foundation

`classes/{classId}/semanticDefinitions/{definitionId}`. Identity is the opaque document id and
nothing else. `label` and `description` are display; `classId`, `subject`, `topic`, `createdBy`
and `createdAt` are immutable; `archived` retires a definition from new selection; delete is
denied outright because questions and studyEvents both point at the id forever.

## Phase 81 Cohort Foundation

A cohort is two or more students who each independently cleared Phase 78's repeated-pattern
contract for the same class-scoped definition. Identity is
`("class", classId, definitionId, subject, topic)`.

## Product Mission

The vocabulary is now infrastructure — it shapes authoring, individual evidence and class
cohorts — so a teacher needs to see it whole, find one label, understand where it is used, and
change its wording without wondering what they just broke.

## Semantic Identity vs Label

Renaming changes what a label says, never what it identifies. Two definitions with identical
labels remain two definitions. Coverage, grouping and history all key on the id; the label is
looked up by id and never matched.

## Existing Definition Contract

Audited against source rather than assumed. Editable: `label`, `description`, `archived`.
Immutable: `classId`, `createdBy`, `subject`, `topic`, `createdAt`. Delete: denied. Teacher of
the class manages; student members read only; non-members denied.

## Authorization Audit

**Zero rules diff.** The Phase 80 update rule already permits exactly what this phase needs —
`label is string` (1..60), `description` null or ≤200, `archived is bool`, identity fields pinned
to `resource.data`, `updatedAt == request.time`. Because the rule asks only that `archived` be a
bool, **unarchive was already supported**; it did not have to be invented, only exposed.

## Vocabulary Management Architecture

Route `app/(teacher)/class/[classId]/semantic-vocabulary.tsx`, matching the existing
`performance.tsx` / `learning-story.tsx` convention. Screen:
`SemanticVocabularyScreen`. Data: `useClassSemanticVocabulary`. Search, subject filter, topic
filter, active list, collapsible archived section, detail with edit / archive / unarchive.
**No delete. No merge. No bulk reassignment.**

## Question Inventory Architecture

The existing `getClassQuestionsPage(classId, pageSize, cursor)` — already index-backed, already
the class list's own query. The hook walks it with `QUESTION_PAGE_SIZE = 30` up to
`MAX_INVENTORY_PAGES = 10`, stopping early the moment a page is short.

## Coverage Feasibility

G1 for any realistic class: up to 300 questions are examined and the counts are exact. Past that
bound the surface says so — `boundedInventoryNote` and `coverageUsageLine` switch to "Yüklenen
sorularda…" rather than implying a lifetime total. No new backend was built for a prettier number.

## Coverage Domain Model

`semanticDefinitionCoverage.ts` — pure, no React, no Firestore, no clock. A question contributes
to a definition only when a `choiceFeedback` entry carries that exact `semanticDefinitionId`.
O(Q + D log D); the inner loop is the fixed five choice labels.

## Distinct Question Counting

Per question, referenced ids are collected into a Set before counting. A question mapping one
definition onto three distractors counts **once**. Runtime-proven.

## Private Semantic Exclusion

An entry carrying only a private `conceptKey` yields no id and therefore contributes nothing.
The Phase 77 sanitiser already makes the two mutually exclusive on one entry.

## Cross-Class Isolation

Questions whose `classId` differs are skipped; definitions whose `classId` differs are skipped.
Proven at runtime with a second class holding a definition of the **same id string and label**.

## Rename Contract

One write, to one definition document, of `label` / `description` / `updatedAt`. The id is
untouched. **No question backfill and no event rewrite** — both verified byte-for-byte at runtime
across a rename → archive → unarchive round trip.

## Label Freshness Strategy

Because history is never rewritten, freshness is a READ concern. `buildClassSemanticCohorts` takes
an optional `currentLabels: Map<definitionId, label>`, applied at the very end, after every
grouping, threshold, recovery and action-ready decision is already settled. Class Performance
supplies it from the one bounded vocabulary read it already performs.

## Snapshot Fallback

A definition that cannot be resolved leaves the stored snapshot standing. The lookup is by id, so
a same-looking label belonging to a **different** definition can never be borrowed as a fallback.

## Archive Contract

One write. The document remains. Existing questions keep their references and keep producing
canonical evidence, because the reference is snapshotted on the Question and the server resolves
it from there. Archiving withholds a definition from **new** selection only.

## Unarchive Decision

Supported by the existing rule, so exposed. The same document id returns to selection; no new
document is created and no identity changes. Runtime-verified.

## Duplicate Label Handling

Two active definitions in the same subject and topic whose labels match after trim and Turkish
case folding are both flagged with a calm note. **No merge, no suggested merge, no reference
migration.** The comparison was extracted as `normalizeLabelForComparison` so the composer's
warning and the manager's cannot drift apart.

## Creation Workflow

Routed through Phase 80's own `createSemanticDefinition`. No second creation path, no AI
suggestion, no generated key.

## Picker Integration

`SemanticDefinitionPicker` has **zero diff**. Its archived-exclusion is `selectableDefinitions`,
unchanged. The composer gained nothing; the management entry point lives on the cohort section
instead, so the question composer did not become a dashboard.

## Cohort Integration

`ClassSemanticCohort` gained `definitionId` so a caller can resolve the current label without
splitting the internal identity string. Identity, membership, counts, recovery and action-ready
are untouched.

## Question Drilldown

**There is no teacher question-detail route in this app** — the Phase 15 audit established that
deliberately, and a teacher tapping a question notification is still told so rather than pushed at
the student route. Rather than invent one or rebuild a viewer, the detail pane lists the real
questions already loaded, by their own descriptions. No navigation, no extra read, no answer data.

## Teacher Information Architecture

One entry point: "Etiketleri yönet" on the "Ortak Öğrenme Örüntüleri" section header — where a
teacher first meets these labels as something with consequences.

## Visual Design

Wide (≥900): library left, selected label right, because the task is comparing one entry against
its neighbours. Narrow: the same two views, one at a time. Theme tokens throughout, no raw colour,
no table, no chart, no score, no red.

## Empty States

Four distinct states: no definitions at all (explains what shared labels are for); active list
empty but archived present (explains archiving); search matched nothing (never claims no
definitions exist); a definition used by zero questions ("Henüz bir soruda kullanılmıyor" — a
fact, not a grade).

## Runtime QA

Firebase emulators only, proven attached before any credential: Auth 127.0.0.1:9099 and Firestore
127.0.0.1:8080 both reachable, production Auth and Firestore never contacted, only non-local host
`www.gstatic.com`. No Functions source changed. A temporary emulator-only scenario (2 classes, 3
students, 13 definitions, 7 questions) was removed afterwards: residue 0, canonical fixtures
intact.

Coverage proven: A = **3 questions** (including one question referencing it on two distractors,
counted once), B = **1** despite an identical label, C = **0**, the private-conceptKey decoy
ignored, and the cross-class questions never counted.

## Rename QA

"İşaret aktarımı" → "Negatif işaret aktarımı". Definition id unchanged, `subject`/`topic`/
`createdBy`/`archived` unchanged, other definitions untouched, coverage still 3, **question
documents not rewritten** (snapshots still read the old label), **studyEvents not rewritten**
(identity still `class:qa82-class:qa82-def-a`). The cohort displayed the new label immediately.

## Archive QA

Definition still exists, count unchanged at 5, `archived` false → true, coverage preserved at 3,
question and event documents untouched, and the **Phase 81 cohort survived intact** with the same
two students and three questions. Unarchive returned the same document id to active.

## Permission QA

Runtime, against the emulator: student member — read ALLOWED, rename/archive/delete DENIED (403).
Teacher — delete DENIED. Outsider — read and rename DENIED. Plus 11 new rules tests covering
rename, description clearing, unarchive, student denial, outsider denial, cross-teacher denial,
stale `updatedAt` and `createdAt` immutability.

## Query Cost

1 bounded vocabulary read + ≤10 sequential bounded question pages. Per-definition queries 0,
per-question queries 0, listeners 0, polling 0, new indexes 0, new collections 0, cohort
persistence 0. Writes: 0 on open, 0 on search, 0 on filter, 0 on opening detail; exactly 1 on
rename, 1 on archive, 1 on unarchive.

## Responsive

375 light, 375 dark, desktop master/detail at 1280, and 250px (375 at 150%) all render with no
element exceeding the viewport. 12 definitions across three subjects, a 55-character label, a
~200-character description, an active/archived mix and duplicate labels were all exercised.

## Accessibility

Row reading order: label → scope → usage → status → duplicate note. Search field labelled.
Archived toggle carries its count and expansion state in words as well as `aria-expanded`.
Archive state and the duplicate warning are icon-plus-text, never colour alone. Zero internal ids
across every label on the screen.

## Learning-System Regression

Phases 42–79 are absent from the diff. `SemanticDefinitionPicker`, the Student Feed, Learning
Atlas, Hint Ladder, Action Center, Concept Heatmap, review scheduler and adaptive ranking all have
zero diff. `firestore.rules`, `firestore.indexes.json`, `functions/`, `.env`, `app.json`,
`package.json` and the lockfiles are untouched. Phase 81's cohorts, action-ready intersection and
Small-Group Studio behave identically; its 48 existing tests pass unchanged.

## iOS Decision

No new native dependency, package, config, permission or API; no native-only behaviour; no
confirmed native-only defect. NATIVE IOS: NOT REQUIRED THIS PHASE.

## Automated Validation

typecheck PASS · lint PASS · unit 172 suites / 3282 tests · rules 5 suites / 411 tests · functions
build PASS · verify PASS · expo-doctor 17/18 (known pre-existing drift) · `git diff --check` PASS.

## Source Integrity

No binary, no NUL, valid UTF-8, LF-only across every touched and new file. No raw colours in the
new UI. No debug instrumentation. Every temporary QA script removed.

## Known Limitations

- Shared definitions still require deliberate authoring; nothing is discovered automatically.
- No global or cross-class vocabulary.
- No semantic auto-merge, and none is planned — duplicates are surfaced, never resolved.
- Immutable historical snapshots on questions and events may differ from the current label. That
  is the design: current wording is resolved on read by id, history is left alone.
- Question coverage is bounded at 300 examined questions and says so past that bound.
- The picker's archived-exclusion is unit-verified rather than driven end-to-end: opening the
  composer requires the native image picker, which the web QA harness cannot exercise.
- A class still has exactly one teacher, so "another author" remains a student member.
- **Pre-existing technical debt, untouched:** `src/features/teacher/services/studentPerformance.ts`
  contains one raw NUL byte used as a map-key delimiter (line 317), which makes `grep` and `file`
  treat it as binary. Phase 82 did not edit that file, the NUL did not block any required tooling,
  and fixing it here would have been unrelated scope.

## Phase 83 Readiness

Vocabulary management is product-ready and question coverage is trustworthy. A teacher can rename
without changing identity and archive without erasing evidence, both proven at runtime. Definitions
must never auto-merge, coverage must never alter intervention eligibility, and coverage must never
create assignments.

## Product Assessment

The vocabulary a teacher built is now something they can see, search, understand and safely edit —
and every edit stops exactly where it should: at the words, never at the evidence.
