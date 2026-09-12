# Phase 83 — Verified Semantic Evidence Trail + Definition Insight Studio

## Repository Sync

Repository present locally on `phase17-moderation-infrastructure-20260806-195814`,
worktree clean. `git fetch` found nothing newer than the verified baseline; no
pull was needed. No `PHASE83*.md` existed locally or remotely.

## Collaborator Safety

Fetched before implementation, immediately before commit and immediately before
push. The canonical remote stayed at the starting head throughout; no merge,
rebase, reset or force operation was performed.

## Starting Head

**`f515fd8`** — *feat: add semantic vocabulary and coverage studio* (Phase 82).

## Phase 80 Foundation

Shared identity is `(namespaceKind: "class", namespaceId: classId, semanticId:
definitionId)`; the id is opaque, the label is display metadata, and subject/topic
are the learning scope. Nothing in this phase groups by label, description,
conceptKey or string similarity.

## Phase 81 Foundation

`buildClassSemanticCohorts` qualifies each student alone through Phase 78/79's
`buildVerifiedChoicePatterns`, keeps only class-scoped patterns, groups them by
the scoped pattern id, drops groups under `MIN_COHORT_STUDENTS` (2), caps the
display at 4, and intersects with Phase 43. The data loading is a bounded
per-student `studyEvents` fan-out in `useClassSemanticCohorts`.

## Phase 82 Foundation

`useClassSemanticVocabulary` loads definitions (one query) and a bounded question
inventory (up to `MAX_INVENTORY_PAGES` = 10 pages × 30). `buildClassSemanticVocabulary`
computes per-definition **authored coverage** by `semanticDefinitionId`, resolves
the current label by id, warns on duplicate labels, and never merges.

## Product Mission

Given one shared definition: how many class questions deliberately use it, which
students independently satisfy the Phase 78 contract for it, which of them carry
a Phase 79 recovery signal, which distinct questions support that, how recent the
bounded evidence is, and whether it reaches the Phase 81 cohort threshold —
**explained, never scored, and never turned into an intervention.**

## Coverage vs Evidence vs Cohort vs Intervention

Four dimensions kept apart architecturally and visually:

| Dimension | Source | Where it shows |
|---|---|---|
| Question coverage | Phase 82 `SemanticDefinitionCoverage.questionCount` | "Kullanım: N soru" |
| Verified student evidence | Phase 78 per-student verdict via the shared stage | "N öğrencide … doğrulandı" |
| Class cohort | `verifiedStudentCount >= MIN_COHORT_STUDENTS` | "Sınıf örüntüsü eşiği karşılandı." / "Tek öğrenci; sınıf örüntüsü değil." |
| Intervention eligibility | Phase 42/43 — **not read by this phase** | not shown; Phase 81 owns it |

## Shared-Only Evidence Contract

`participates()` — the same predicate Phase 81 uses — admits only
`namespaceKind === "class"` patterns for the current class with an authored
label. Author-scoped keys never enter a definition trail, even from the same
teacher with identical text. Runtime-proven with a private-key decoy.

## Canonical Identity

Lookup is `evidenceForDefinition(index, {id, subject, topic})`: the opaque id plus
the definition's own declared scope. Two definitions with identical labels are two
entries. The same id string in another class never reaches the index, because
events were filtered by `sourceClassId` before the shared stage saw them.

## Canonical Phase 78 Qualification

Not reimplemented. `groupSharedSemanticEvidence` calls `buildVerifiedChoicePatterns`
with `maxPatterns: Infinity`; the ≥2 occurrences / ≥2 distinct questions threshold
lives in exactly one place. AP3/AP4 assert one selection and same-question
repetition never qualify.

## Canonical Phase 79 Recovery

`hasRecoverySignal` is `pattern.recovery !== null`, carried, never re-derived. A
recovering student stays in the evidence with the flag; reselection withdraws the
flag through Phase 79's own rule (AP9, runtime-proven). There is no "resolved".

## Phase 81 Cohort Compatibility

**One truth, not two.** The grouping loop inside `buildClassSemanticCohorts` was
extracted unchanged into `groupSharedSemanticEvidence` (in the same file). Phase 81
now calls it and applies its threshold, Phase 43 intersection, ordering and cap on
top; Phase 83 calls it and applies nothing. All 54 Phase 81 tests pass unchanged,
and a compatibility suite asserts, for every definition in both models: below two
students → no cohort; at two or more → a cohort with the same members, the same
question union, the same recovery subset and the same `lastSeenAt`.

An initial extraction keyed groups by definition id alone and **failed two Phase
81 tests** ("does NOT merge the same definition across different topics /
subjects"). The extraction was corrected to key by the scoped pattern id, exactly
as Phase 81 always had; the failing tests are what caught it.

## Definition Evidence Domain Model

`semanticDefinitionEvidence.ts` — pure, no React, no Firestore, no navigation.

```
buildSemanticDefinitionEvidenceIndex({classId, students}) → {
  byDefinitionId: Map<definitionId, SemanticDefinitionEvidence[]>  // one per scope
  qualifyingStudentCount, examinedStudentCount
}
evidenceForDefinition(index, definition) → SemanticDefinitionEvidence
emptyDefinitionEvidence(definition)      → the honest zero
```

Per definition: `students[]`, `verifiedStudentCount`, `activeRepeatedStudentIds`,
`recoverySignalStudentIds`, `supportingQuestionIds` (sorted), `distinctSupportingQuestionCount`,
`selectedOccurrenceCount`, `latestEvidenceAt`, `classCohortQualified`, `snapshotLabel`.
No score of any kind exists in the type.

## Student Evidence Model

`occurrenceCount`, `distinctQuestionCount`, `latestSelectionAt`, `hasRecoverySignal`,
`supportingQuestionIds`, `displayName`, and an internal `studentUid` used only as
a navigation key. Ordering: still-repeating first, then most recent, then
breadth, then `localeCompare(name, "tr")`, then uid — factual grouping and
recency, no weighting.

## Distinct Supporting Question Union

A set across qualifying members. A on {Q1,Q2} + B on {Q2,Q3} = 3, not 4 (AP7,
runtime-proven: "3 farklı soruda doğrulandı" against 5 authored questions).

## Evidence Loading Architecture

`useClassSemanticEvidence` is the load half of Phase 81's hook, lifted out
verbatim so both routes share one fan-out implementation; `useClassSemanticCohorts`
now composes it and Class Performance is unchanged. `useClassStudentRoster` reads
`classes/{classId}/members` once through the existing `getClassMembers`, filtered to
students and de-duplicated by `dedupeMembersByUid` — itself lifted out of
`useClassPerformance` into `classRoster.ts` rather than copied.

## Bounded Per-Student Fan-Out

Stated plainly: **N bounded queries**, one `getRecentClassLearningEvents` per
student, each `limit(TEACHER_TIMELINE_QUERY_LIMIT = 20)` and filtered by
`sourceClassId` (which is what makes the read provable under the existing rule),
run through `mapWithConcurrency` at **8**. Ceiling: N × 20 event documents per
route. Nothing is read per definition, per evidence row, per pattern or per
question. A collection-group query would replace N with 1 at the cost of this
repository's first cross-student `studyEvents` rule and its first
`COLLECTION_GROUP` index — Phase 81's reasoning for not doing that stands.

## Lazy Load / Cache Decision

The vocabulary studio paints exactly as Phase 82 shipped it: definitions and
coverage first, **no roster and no event read**. Both fire once, when the first
definition is selected. From then on the evidence index lives in memory for the
route; switching definitions, expanding the student list, renaming, archiving and
unarchiving are lookups, not reads. Runtime-proven with instrumentation (removed
before commit): first selection = 1 members query + N event queries; every later
definition switch = **0**.

## Bounded Window Honesty

Every count sits under one sentence rendered before any number:
*"Her öğrencinin bu sınıftaki son öğrenme kayıtlarına dayanır; daha eski kayıtlar bu
özete dahil değildir."* The window is the last 20 class events per student. No
copy says lifetime, all-time or complete, and a test asserts the note contains
"son öğrenme kayıtları" and no totalising word.

## Vocabulary Studio Integration

Inside `SemanticDefinitionDetail`, after the authored usage and before the
management actions. No second product area; the hierarchy is label → scope →
active/archived → usage → **Doğrulanmış öğrenme kanıtı** → students → actions.

## Coverage vs Evidence Presentation

One line, two named numbers: *"Kullanım: 5 soru · Öğrenme kanıtı: 3 soru"*, with
"Öğrenme kanıtı: henüz yok" when nothing supports a pattern. Runtime-proven at 5
authored / 3 supporting, and at 0 authored / 2 supporting (cross-class control,
where questions were never authored but events referenced the id).

## Student Evidence List

Rows show name, "Tekrar eden örüntü" or "Toparlanma sinyali", "N farklı soru",
relative recency, and "İncele". First 5 are shown; "Tümünü göster (N daha)" /
"Daha az göster" folds the rest with no query (runtime-proven at 6).

## Student Drilldown

Navigates to the existing `/(teacher)/class/[classId]/student/[studentId]` route
with the display name. No new screen. Runtime-proven: Ada's own Phase 78 section
read "Odak: İşaret aktarımı · 2 farklı soru · 2 kayıt", agreeing with the trail.

## Class Cohort Drilldown

"Sınıf örüntüsünde incele" appears only when `classCohortQualified`, and opens the
existing Class Performance route where Phase 81's cohort section lives. No cohort
deep-link exists; none was invented.

## Rename Safety

Evidence is keyed by id; the current label is resolved by id at render. Runtime:
rename changed the visible label in list and detail, cleared the duplicate-label
warning, and left evidence, coverage, cohort and recovery byte-identical with **0**
new reads. Data layer after rename: 11 events still carried the old snapshot
label, question snapshots unchanged, definition id unchanged.

## Archive Safety

Runtime: archiving moved the definition to "Arşivlenenler (1)", showed Phase 82's
archived explanation, and preserved coverage (5), evidence (2 students, 3→4
questions), cohort status and the class link. Unarchiving restored "Aktif" with
the same id and the same trail. Nothing implied resolution.

## Duplicate-Label Isolation

Two definitions labelled "İşaret aktarımı" carried entirely separate trails at
runtime (A: Ada + Berk; B: Can only). AP10 asserts it.

## Cross-Class Isolation

A second class with the same definition id string and label showed only its own
events (Ada's two class-2 selections; Berk absent). AP12 asserts it; the event
query's `sourceClassId` filter is the structural reason.

## Private Semantic Isolation

Defne's two author-namespace selections whose key text matched the label
contributed nothing (AP11, runtime).

## Missing Definition Fallback

`evidenceForDefinition` returns the honest empty value for an id the vocabulary
does not resolve, never a same-label neighbour. The stored `snapshotLabel` is
carried for display fallback. Orphan identities are not surfaced as vocabulary
entries — the index is only ever consulted for definitions the vocabulary lists.

## Empty / One Student / Cohort States

- **Zero**: "Henüz tekrar eden doğrulanmış bir öğrenci örüntüsü yok." with "N
  öğrencinin kayıtları incelendi." — absence is not proof of understanding.
- **One**: "1 öğrencide tekrar eden seçim örüntüsü doğrulandı." + "Tek öğrenci;
  sınıf örüntüsü değil." — never called a cohort.
- **Two+**: "N öğrencide ortak doğrulanmış seçim örüntüsü." + "Sınıf örüntüsü
  eşiği karşılandı." — no CTA beyond the existing surfaces.

## Teacher Information Architecture

Identity and context above evidence; evidence above actions; actions unchanged
from Phase 82. The section is presentational — the screen owns the index and hands
down the evidence for the selected definition.

## Signature Evidence Thread Visual

A single vertical rail with ringed icon nodes: coverage, students, supporting
questions, recovery, cohort status, then indented student rows whose marker ring is
filled for a repeating pattern and open/dashed for a recovery signal (shape, not
hue). No graph, gauge, pie, gradient or red. Tokens only: `primary`, `primaryMuted`,
`surfaceMuted`, `border`, `divider`, text tokens.

## Privacy

No uid, definition id, namespace id, event id, Firestore path or operation id is
rendered or spoken. No wrong-choice text, no raw events. Rows carry name, state,
breadth and recency.

## Security

**Zero rules diff.** The teacher reads their own class's members, definitions,
questions and class-sourced student events through rules that already grant
exactly that; a student's read paths are untouched and gain no class-wide access;
outsiders remain denied. No new client write authority exists. Rules tests: 5
suites / 411, unchanged.

## Query Cost

| | |
|---|---|
| Class student count (QA) | 5, then 11 in the dense run |
| Student-event queries | N (one per student), first selection only |
| Per-student bound | 20 |
| Concurrency | 8 |
| Max theoretical event load | N × 20 |
| Definition queries | 1 (Phase 82, unchanged) |
| Question inventory queries | ≤ 10 pages (Phase 82, unchanged) |
| Roster queries | 1, lazy |
| Per-definition event queries | **0** |
| Definition-switch refetch | **0** |
| Per-evidence-row queries | **0** |
| Question metadata reads | one batched `resolveQuestionMetadata` over the union, shared cache |
| Writes / listeners / polling / indexes / collections | **0 / 0 / 0 / 0 / 0** |
| Bounded per-student fan-out | **YES** |
| Nested N+1 | **NONE** |

## Runtime QA

Emulators proven local before any credential (the emulator-only
`/emulator/v1/…/config` endpoint answered; zero requests to `googleapis`; the
Phase 51 fail-closed guard stayed silent). Teacher signed in on the emulator. A
separate temporary class was seeded — canonical A–F personas untouched — with
five students, three definitions (A; B with A's label; C unused by learners), a
cross-class control, and server-faithful events.

| | Result |
|---|---|
| Student A (A on q1, q2) | qualifies, active |
| Student B (A on q2, q3 + two declines) | qualifies, recovery signal |
| Student C (A once; B on q6, q7) | absent from A; sole member of B |
| Student D (private key ×2) | absent |
| Student E (nothing) | absent |
| Definition A | 2 students · 3 supporting questions · cohort **YES** · coverage 5 |
| Definition B | 1 student · not a cohort |
| Definition C | zero state, "5 öğrencinin kayıtları incelendi." |

## Recovery QA

Berk showed "Toparlanma sinyali" with the recovery line present; after a seeded
reselection and reload he showed "Tekrar eden örüntü · 3 farklı soru", the
recovery line was gone, breadth grew to 4, and no stale badge remained.

## Reselection QA

As above — Phase 79's withdrawal rule, unchanged, observed end to end.

## Rename QA

Label changed everywhere it should; identity, membership, union, recovery,
coverage and cohort unchanged; zero event or question rewrites; zero re-reads.

## Archive QA

Trail, coverage and cohort preserved under "Arşivlendi"; unarchive restored the
same identity and trail.

## Zero-Write Inspection

Definition documents' `updatedAt` for B and C were byte-identical before and after
opening the manager, selecting, switching, expanding the list, searching and
drilling into a student. Only A changed, and only through the three explicit
Phase 82 mutations performed on purpose (rename, archive, unarchive).

## Responsive

375 light and dark: narrow master/detail with the pushed detail, thread intact, no
horizontal overflow. Desktop: Phase 82's master/detail composition retained, no
stretched cards. 150%-equivalent (250px): every thread fact readable, no overflow;
student names now wrap rather than truncating (one-line fix made after seeing
"Berk …"). Dense: 6 students fold behind "Tümünü göster (1 daha)". Long label:
the renamed "İşaret geçişi (yeniden adlandırıldı)" wrapped cleanly. Archived:
verified.

## Accessibility

Section title is a header; the window note precedes every number; each thread
row is one accessible node with its sentence; the rail and markers are decorative
(`no-hide-descendants`); student rows announce "Ad. Durum. N farklı soru. Zaman.
Öğrenciyi incele." with no uid; the fold control carries `expanded`; recovery and
cohort state are text plus shape, never colour alone.

## Learning-System Regression

Phases 42–47, 59, 61–76 untouched. Phase 77–80 services untouched. Phase 81:
`buildClassSemanticCohorts` output unchanged (54 tests), its hook's public
contract unchanged. Phase 82: manager, coverage, rename, archive, unarchive,
duplicate warning, search and filters unchanged except the intentional evidence
section. Student Feed and Learning Atlas: zero diff.

## iOS Decision

Native dependency **NO** · package **NO** · config **NO** · permission **NO** ·
native-only API **NO** · native-only behaviour **NO** · confirmed native defect
**NO**. **NATIVE IOS: NOT REQUIRED THIS PHASE.**

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | **173 suites / 3319 tests** (was 172 / 3282) |
| rules | 5 suites / 411 (unchanged) |
| functions build | PASS (no Functions source changed) |
| verify | PASS |
| expo-doctor | 17/18 — pre-existing dependency drift |
| `git diff --check` | clean |

One transient typecheck error at the start was stale expo-router generated types
for the Phase 82 route; it regenerated when the dev server started.

## Source Integrity

Touched files: 0 NUL, 0 CR, UTF-8. The historical single NUL byte in
`studentPerformance.ts` is present at HEAD and **untouched** — the file was not
edited. No raw colours or debug output in new UI. The temporary console
instrumentation used to count queries during QA, the temporary fixture script,
and all emulator data were removed and existence-checked. `routing.ts` untouched.

## Known Limitations

- Evidence is the last 20 class events per student; older history is outside the
  summary, and the copy says so.
- Class-level evidence is a bounded per-student fan-out, not one query.
- Shared definitions only appear in trails when authors deliberately select them.
- Absence of a verified pattern is not proof of understanding.
- Recovery is not resolution, and withdraws on reselection.
- Private semantics are excluded by design.
- No global or cross-class vocabulary.
- Question coverage and evidence breadth are different numbers and are shown as such.
- Historical event and question label snapshots keep the wording current when
  written; the student's own Phase 78 view shows that snapshot, the definition
  trail shows the current label — identity agrees by id.
- Archived definitions remain historically meaningful.
- One teacher per class; no co-teacher model.
- The historical raw NUL in `studentPerformance.ts` remains, unrelated.

## Phase 84 Readiness

The definition-centric index is a pure, deterministic view over the same shared
stage Phase 81 reads, rename-safe and archive-safe, with coverage and evidence kept
apart. It cannot change Phase 42, the Action Center, or create an intervention or a
group. The strongest safe next capability is a teacher-facing longitudinal view of
one definition's evidence over time — still bounded, still read-derived.

## Product Assessment

Recorded in the phase report.
