# Phase 81 — Verified Semantic Cohorts + Small-Group Studio

## Repository Sync

Local HEAD and `origin/phase17-moderation-infrastructure-20260806-195814` were both
`7d28d85cae1a55565641d3c51d8b0b067104e6a0`, ahead/behind `0 0`, worktree clean. Nothing was
pulled because nothing was behind. No `PHASE81*` document and no Phase 81 commit existed on any
branch.

## Collaborator Safety

`git fetch origin` ran before implementation, immediately before commit and immediately before
push. The canonical remote stayed at the starting HEAD throughout. No merge, no rebase, no reset,
no force. `main` was never checked out and never merged.

## Starting Head

`7d28d85` — Phase 80, Verified Shared Semantic Vocabulary.

## Prior Architecture Audit

The handoff's provisional findings were re-checked against source and all held:

- Semantic evidence lives on `users/{uid}/studyEvents/{eventId}`, written only by
  `recordStudyOutcome`, immutable from every client (`allow write: if false`).
- Identity is `(namespaceKind, namespaceId, semanticId)` — `("author", ownerId, conceptKey)` or
  `("class", classId, definitionId)`. The kind discriminator prevents id-space collision.
- Teacher class history is read per student through
  `getRecentClassLearningEvents(studentUid, classId)`. There is no one-shot cross-student query.
- Phase 27/73 already establish bounded, concurrency-capped per-student fan-out on this exact
  screen (`mapWithConcurrency`, `STUDENT_FETCH_CONCURRENCY = 8`).

Two findings the audit had not recorded, and both shortened the phase considerably:

- `firestore.rules` already grants the teacher branch for `studyEvents` filtered by
  `sourceClassId`, and the composite index is already declared. **No rules or index change was
  needed.**
- Phase 43's `resolveTopicInterventionTargets(candidates, subject, topic)` already answers "who is
  independently targetable in this exact topic", and `ClassPerformanceScreen` already holds its
  input. The action-ready intersection is therefore the canonical function called with cohort
  scope — not a reimplementation of it.

## Critical Scope Correction

The audit's suggestion that same-author private conceptKeys could be grouped inside one class was
**not adopted**. Class cohorts consume `namespaceKind === "class"` and nothing else — not when one
teacher authored every question, not when the keys match exactly, not when the labels match, not
when subject and topic match. Phase 80 created explicit shared definitions precisely so that
cross-person grouping rests on something a person deliberately declared. Reaching back for private
keys to increase volume would re-invent, one layer up, the label matching Phase 80 refused.

The cost is accepted: the surface stays empty until a class actually uses shared definitions.

## Phase 80 Foundation

Shared identity `("class", classId, definitionId)`, scope derived from the question's own
`classId`. Private identity `("author", ownerId, conceptKey)`. The label is an author-written
string snapshotted onto the event, non-null only for shared identities.

## Product Mission

Answer one question a per-student view structurally cannot: **where are several students
independently showing the same shared authored selection pattern?** Then, separately, say which of
them Phase 43 independently considers targetable — and only then offer a draft.

## Why Semantic Cohort Is Not Intervention Evidence

A cohort says several people met the same authored meaning more than once. It says nothing about
whether anyone needs a teacher to act. Those are different claims from different evidence, and the
product states them as two separate sentences, in that order, with the second marked "ayrıca".

Nothing in this phase writes to, reads into, or alters Phase 42's classifier, Phase 43's
eligibility, Phase 44's effectiveness, Phase 47's post-intervention action, adaptive ranking or
review scheduling.

## Why Private Semantics Are Excluded

See Critical Scope Correction. Private evidence remains fully valid for Phase 78 individual
memory, Phase 79 individual recovery and Student Performance — it is excluded from **class
cohorts** only.

## Existing Class Event Architecture

One bounded query per student, filtered by `sourceClassId`, ordered by `occurredAt`, limited by
`TEACHER_TIMELINE_QUERY_LIMIT` (20). Subject and topic are joined from the shared
`studyMetadataCache`, already warm from `useClassPerformance` on the same screen.

## Bounded Fan-Out Decision

A `collectionGroup('studyEvents')` query would replace N reads with one. It would also be this
repository's first cross-student `studyEvents` surface, needing a rule that permits reading events
the caller does not own across every user document, plus a new composite index. The per-student
path already has a proven rule, a declared index and long precedent. **The tidier cost table was
not worth the new security boundary**, and the fan-out is reported as what it is rather than
described as a single query.

## Query Bounds / Concurrency

Per-student limit 20 · concurrency cap 8 · no per-event read · no per-cohort query · no
per-definition query · no listener · no polling · zero writes.

## Shared-Only Cohort Contract

`participates()` requires `namespaceKind === "class"`, `namespaceId === classId` (redundant today,
kept so cross-class contamination stays impossible if that coupling is ever changed elsewhere), and
a non-empty authored label.

## Individual Qualification Before Aggregation

Each student is run through the canonical `buildVerifiedChoicePatterns` **alone**, with
`maxPatterns: Infinity` so the student surface's display cap of 4 can never decide class
membership. Only patterns that already cleared Phase 78's `MIN_OCCURRENCES = 2` **and**
`MIN_DISTINCT_QUESTIONS = 2` are eligible to be grouped. There is no second classifier and no
re-stated threshold.

## Class Qualification Threshold

`MIN_COHORT_STUDENTS = 2` distinct independently-qualifying students, for the same class
namespace, definition, subject and topic.

## Distinct Student Requirement

One qualifying student is not a cohort; that story is already told, better and individually, on
that student's own screen.

## Distinct Question Union

Set union across members. A: q1,q2 and B: q2,q3 is **3**, not 4.

## Cohort Domain Model

`src/features/teacher/services/classSemanticCohorts.ts` — pure, no React, no Firestore, no clock.
Emits identity, authored label, subject, topic, members with their own unaggregated counts,
`qualifyingStudentCount`, `activeRepeatedStudentIds`, `recoverySignalStudentIds`,
`distinctQuestionCount`, `lastSeenAt`, `actionReadyStudentIds`. No score anywhere.

## Cohort Ordering / Bounds

Qualifying student breadth desc → latest evidence desc → distinct question breadth desc → identity.
Capped at `MAX_VISIBLE_SEMANTIC_COHORTS = 4`. Deterministic under input permutation.

Complexity: O(S · E · P) for the per-student classifier Phase 78 already runs, plus O(M) grouping
and O(C log C) ordering. No pass is quadratic in class size.

## Recovery Representation

A member showing Phase 79 recovery evidence **stays** in the cohort — history is not rewritten.
Active and recovering are exposed as two factual subsets. Reselection withdraws the signal by
Phase 79's own window rule. There is no resolved, fixed or mastered state anywhere.

## Canonical Phase 43 Intersection

`resolveTopicInterventionTargets` is called with the cohort's exact subject and topic. No
subject-only match, no topic-only match. A student with no persistent-struggle topics — which is
how `stable`, `one_off_struggle`, `recovering` and `insufficient_data` all arrive — is not
action-ready. Unknown is never converted to zero. Evidence grade behaviour is untouched.

## Action-Ready Subset

Cohort membership ∩ Phase 43 targetability, in the same topic. Frequently empty, and an empty
result is a normal outcome rather than a gap to fill.

## Small-Group Feasibility Audit

The existing composer already accepts `initialTargetStudentIds` (comma-joined), `initialSubject`,
`initialTopic`, `initialGradeLevel` and `isIntervention`; `prepare()` previews without writing and
`publish()` is a separate explicit action that records
`interventionOf: { subject, topic }`. Multi-recipient targeting has existed since Phase 31 and is
already used by Phase 43's own hotspot CTA.

## Branch A / Branch B

**Branch A.** Nothing had to be built: the draft is the existing composer opened with cohort scope
and the action-ready recipient list. No parallel assignment backend, no new route, no new service.

## Small-Group Draft Contract

Offered only at ≥ 2 action-ready students. Initial recipients are exactly
`actionReadyStudentIds` — cohort members who are not targetable are deliberately left out. Subject
and topic are the cohort's exactly. **`gradeLevel` is omitted, not guessed**: the cohort's
supporting questions come from `studyEvents` while this screen's metadata was resolved from
`studyItems`, and a grade derived from a partial set could be confidently wrong, which silently
changes question selection. Opening writes nothing; cancelling writes nothing; publishing is an
explicit teacher action.

## interventionOf Safety

Preserved as the canonical `{ subject, topic }`. It is never replaced by a definition id, a
conceptKey or a semantic label. The semantic label appears only as teacher-facing context on the
cohort card and never enters the assignment.

## Teacher Information Architecture

A new section, "Ortak Öğrenme Örüntüleri", on Class Performance, below the Action Center and the
Concept Heatmap. No new dashboard and no new route.

## Relationship to Action Center

The Action Center answers "what needs attention now". Unchanged.

## Relationship to Heatmap

The heatmap answers "how are concept states distributed". Unchanged.

## Signature Teacher Visual

Restrained convergence: a column of student markers, a rail that gathers them, one node carrying
the authored label. Convergence is the whole claim, so it is the whole picture. No edges between
students — nothing in the evidence says students are related to each other, only that each
independently met the same meaning. Five markers then a `+N` overflow. Active and recovering are
separated by border style (solid ring vs dashed ring) and by words, never by colour alone. No red
wall; the product's own blue flow language throughout.

## Cohort Detail

Tap expands an in-card member list: name, status, that member's own counts, and the Phase 43 fact
when present. Tapping a member opens the existing Student Performance screen. No duplicate
analytics screen. No raw uid, classId, definitionId, namespaceId or conceptKey is rendered or
spoken.

## Thin / Empty States

Three distinct sentences for three genuinely different situations: no shared evidence at all; one
student qualifying alone; several qualifying but never on the same meaning.

## Privacy / Authorization

No rules change. The teacher read is the pre-existing `sourceClassId`-filtered branch. Students see
nothing new. Internal ids never reach the screen or the accessibility tree.

## Backend / Query Cost

N bounded per-student queries (N = student members), 20 events each, concurrency 8; question
metadata through the shared warm cache. Zero new collections, zero new indexes, zero listeners,
zero polling, zero writes, zero cohort persistence.

## Runtime QA

Firebase emulators only, proven attached before any credential: Auth 127.0.0.1:9099 and Firestore
127.0.0.1:8080 both reachable, production Auth and production Firestore never contacted, the only
non-local host `www.gstatic.com`. Functions were rebuilt before the emulators started.

A temporary emulator-only scenario (two QA classes, ten QA students, three shared definitions, 22
questions) drove **the real `recordStudyOutcome` callable** for every outcome — no studyEvent,
counter or classifier result was ever written directly. Everything was removed afterwards;
residue 0, canonical fixtures intact.

## Same-Label Isolation

Two definitions with the identical visible label "İşaret aktarımı" produced **two separate cohorts
with different memberships**, rendered as two distinct cards. Not merged.

## Private Semantic Isolation

Two students each repeated the same private `author:demo-teacher-1:sign_transfer_error` across two
distinct questions. **No class cohort formed.** Both students' individual Phase 78 patterns remained
fully visible on their own screens, with the generic wording and no focus label.

## Cross-Class Isolation

A second class carried a definition with the **same id string and the same label**. Each class
showed its own cohort with its own students; neither merged.

## Recovery QA

One qualifying member declined the meaning on two later distinct questions. The recovery subset
changed, the member stayed in the cohort, the counts stayed exact, and no resolved wording
appeared. The signal also survived that student later becoming Phase 43 persistent through
unrelated questions — proving the two dimensions are independent.

## Action Eligibility QA

With every student at `one_off_struggle`, action-ready was 0 and no CTA appeared. One student made
persistent through a **semantics-free** question produced exactly one action-ready and still no
CTA — matching the canonical hotspot's own "1 öğrenci için ödev oluşturulabilir". A second produced
two and the CTA appeared, on that cohort only; the decoy cohort, with one, kept none.

## Small-Group Draft QA

Opening the draft produced 0 writes and the URL
`?subject=Matematik&topic=Denklemler&studentIds=qa81-a,qa81-b&intervention=1` — no `gradeLevel`.
The composer showed "Öğrenci seç" with exactly those two selected and the non-eligible cohort
member unselected. Cancelling produced 0 writes. Preparing a preview produced 0 writes. Publishing
wrote one assignment with the exact recipients and `interventionOf: { subject, topic }` preserved.
A realistic double-tap produced no duplicate.

## Responsive

375 light, 375 dark, desktop and 250px (375 at 150%) all render without horizontal overflow. A
six-member cohort shows five markers plus `+1`. A 60-character Turkish label renders in full at
375 and truncates with an ellipsis at 250px, with the complete text still in the accessible label.

## Accessibility

Spoken order: shared focus → subject/topic → student breadth → question breadth → recovery →
action-readiness → expand affordance. Expansion is carried both as `aria-expanded` and in words,
because react-native-web drops `accessibilityState.expanded` on a Pressable. Markers carry full
names. Active vs recovering and action-ready are never colour-only. Zero internal ids across every
label on the screen.

## Learning-System Regression

Phases 42–80 are absent from the diff. The Student Feed, Learning Atlas, Hint Ladder, Action
Center, Concept Heatmap, review scheduler and adaptive ranking have zero diff. `firestore.rules`,
`firestore.indexes.json`, `functions/`, `.env`, `app.json`, `package.json` and the lockfiles are
untouched.

## iOS Decision

No new native dependency, package, config, permission or API; no native-only behaviour; no
confirmed native-only defect. NATIVE IOS: NOT REQUIRED THIS PHASE.

## Automated Validation

typecheck PASS · lint PASS · unit 171 suites / 3243 tests · rules 5 suites / 400 tests · functions
build PASS · verify PASS · expo-doctor 17/18 (known pre-existing dependency drift) ·
`git diff --check` PASS.

## Source Integrity

No binary, no NUL, valid UTF-8, LF-only across every touched and new file. No raw colours in the
new UI. No debug instrumentation. Every temporary QA script removed.

## Known Limitations

- Class evidence is a **bounded per-student fan-out**, not one query.
- The window is the 20 most recent class events per student; older evidence is out of view.
- Shared definitions require deliberate authoring, so this surface is empty until a class uses them.
- Private semantic evidence is intentionally excluded from class cohorts.
- No global or cross-class semantic taxonomy.
- Semantic recovery is a signal, never resolution.
- A semantic cohort alone is never intervention eligibility.
- A class still has exactly one teacher (`createClass` is teacher-only, `joinClassByCode`
  student-only), so the cross-author case remains teacher ↔ student, as in Phase 80.
- The composer's publish guard is React-state-based: a *same-synchronous-tick* programmatic double
  click can still produce two assignments. This is pre-existing Phase 30/31 behaviour, unreachable
  by a real double-tap (verified), and untouched by this phase.
- At 250px the longest permitted label truncates visually; the full text stays in the accessible
  label.

## Phase 82 Readiness

Class semantic intelligence is product-ready. Evidence-gated small-group drafting is safe because
its gate is Phase 43's own answer, not this feature's. Semantic cohorts must never automatically
alter the Action Center and must never automatically create interventions.

## Product Assessment

The evidence chain now runs from one authored distractor to one student's repetition, to that
student's recovery, to a shared vocabulary, to a class-level cohort — with every link still
refusing to say more than the records support.
