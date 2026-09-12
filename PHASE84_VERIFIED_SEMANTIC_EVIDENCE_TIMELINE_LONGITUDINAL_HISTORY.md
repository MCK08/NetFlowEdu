# Phase 84 — Verified Semantic Evidence Timeline + Longitudinal Definition History

## Repository Sync

Local HEAD was `f515fd8` (Phase 82) and the canonical remote had advanced to `5eb841a` (Phase 83,
authored by another developer): ahead/behind `0 1`, worktree clean — classification **B, behind
only**. Fast-forwarded with `git pull --ff-only`; no merge, no rebase, no reset. After the pull,
HEAD == canonical remote, sync `0 0`, worktree clean.

## Actual Starting Head

`5eb841acedc169bc44523e00e6fd6d48978e0880` — Phase 83, Verified Semantic Evidence Trail +
Definition Insight. No `PHASE84*` document and no Phase 84 commit existed on any branch.

## Collaborator Safety

`git fetch origin` ran before implementation, immediately before commit and immediately before
push. The canonical remote stayed at `5eb841a` throughout implementation. `main` was never checked
out and never merged.

## Phase 83 Foundation

Phase 83 lifted the class evidence LOAD out of Phase 81 into `useClassSemanticEvidence`: one
bounded `studyEvents` query per student member, `STUDENT_EVENT_BOUND = 20`, concurrency 8, lazy on
first definition selection, then held for the life of the mount. It also introduced
`groupSharedSemanticEvidence` — the shared stage Phase 81's cohorts and Phase 83's definition
evidence are both built from.

## Product Mission

Answer the one question the summary cannot: **how did the verified evidence for this exact shared
definition unfold?** Selections, later genuine opportunities that were passed over, and the points
at which each canonical threshold first became satisfiable inside the loaded window.

## Chronology vs Trend Classification

A chronology is not a trend. selection → selection → decline → decline → selection factually means
the repeated threshold held, a recovery signal later held, and a later reselection withdrew it. It
does **not** mean improving, worsening, learning or forgetting. Phase 47's improved/worsened stays
intervention-specific and was not reused. There is no score, severity, confidence or prediction
anywhere in this phase.

## Canonical Shared Identity

`("class", classId, definitionId)` plus subject and topic — the same four-part scoped identity
Phase 78 groups by and Phase 81/83 refuse to collapse.

## Scoped Identity Safety

`scopedIdentityForDefinition` rebuilds the identity from the definition's **own declared scope**,
exactly as Phase 83's `evidenceForDefinition` matches on it. There is no definitionId-only
grouping: a test asserts that the same definition met in a different topic does not enter this
timeline.

## Private Semantic Exclusion

Only `namespaceKind === "class"` participates. A private author conceptKey is excluded even when
its key string equals the definition id — proven by test and at runtime with a decoy student.

## Existing Evidence Loader

Reused verbatim. Phase 84 added no loader, no roster path and no fan-out.

## Query Reuse

The timeline is derived in memory from `classEvidence.evidence` — the array Phase 83 already
holds. Measured at runtime: selecting A, switching to B, to C and back to A produced **0
additional Firestore reads**.

## Timeline Domain Model

`semanticDefinitionTimeline.ts` — pure, no React, no Firestore, no clock. One pass per student
over that student's already-loaded window, plus one merge sort.

## Timeline Event Types

`selection`, `declined_opportunity`, `repeated_pattern_reached`, `recovery_signal_reached`,
`recovery_signal_withdrawn`. The withdrawal milestone is derived from the same rule Phase 79 gets
by moving its window forward, not from a forked algorithm.

## Phase 78 Threshold Reuse

`MIN_OCCURRENCES` and `MIN_DISTINCT_QUESTIONS` are imported, not restated. Whether a student is
**verified** is read from `buildVerifiedChoicePatterns`, never decided by the walk.

## Phase 79 Recovery Reuse

`MIN_RECOVERY_OPPORTUNITIES` and `MIN_RECOVERY_DISTINCT_QUESTIONS` are imported. Whether recovery
is **current** is read from the canonical pattern's `recovery` field. The walk contributes only the
order and the moment each threshold first held.

Three tiny predicates were exported from `verifiedChoicePatterns.ts` so the chronology asks the
same questions the counter already asks: `eventSelectsScopedIdentity`,
`eventDeclinesScopedIdentity` and `scopedIdentityOfPattern`. `identityOf` now routes through a
single `scopedKey`, so there is one spelling of the grouping key.

## Event Chronology

`occurredAt`, the canonical server clock Phase 59 orders by. Oldest → newest, the direction the
learning trail already reads in.

## Tie Handling

Equal timestamps break by kind rank (a milestone sorts immediately after the event that caused it)
then by a stable internal key. A selection at the same instant as a decline is applied first, so a
decline can never be credited to a window the selection beside it had already reset. Input
permutation and identical timestamps are both covered by tests.

## Bounded History

The loaded per-student window, `STUDENT_EVENT_BOUND = 20`. Stated in the UI before any node:
"Yüklenen son öğrenme kayıtlarına dayanır. Daha eski kayıtlar bu geçmişte yer almaz."

## Left-Truncation Honesty

A milestone means "the first crossing observable in the loaded records", never "the first time
ever". Nothing is reconstructed from events that fell out of the window, and no copy says first,
ever, all-time or lifetime.

## Current State vs Timeline

Phase 83's summary stays authoritative and unchanged; the chronology is a separate, collapsed
disclosure beneath it. Tests assert they agree on verified count, membership, question union and
the current recovery subset.

## Coverage vs Evidence vs Timeline

Three distinct things, visible together at runtime: authored coverage **6 questions**, verified
evidence breadth **3–4 questions**, timeline **15 dated entries**. The existing
"Kullanım: 6 soru · Öğrenme kanıtı: 4 soru" line keeps the first two apart; the timeline is named
and framed as history.

## Definition Studio Integration

Ortak Etiketler → selected definition → "Doğrulanmış öğrenme kanıtı" → **"Kanıt geçmişini gör"**,
collapsed by default. No new route, no new dashboard.

## Timeline Visual

A vertical rail with compact nodes, extending Phase 83's own evidence-thread motif rather than
inventing a second one. No line, area, sparkline, gauge, radar or pie — every one of those implies
a quantity moving in a direction, and no such quantity exists here. Node language: solid =
selection, open ring = passed-over opportunity, filled marker = threshold, dashed = recovery.
Shape and text always together; nothing depends on colour.

## Question Context

The real question description, resolved against the `questionsById` map the route already holds.
No query per node. No raw ids rendered.

## Student Drilldown

Every node opens the existing Student Performance screen. No new student analytics surface and no
writes.

## Same-Label Isolation

Two definitions sharing the label "İşaret aktarımı" kept entirely separate timelines at runtime —
one with 15 entries, the other empty.

## Cross-Class Isolation

A second class holding the **same definition id string** contributed nothing: its questions and
events never entered this class's evidence, which is already filtered by `sourceClassId`.

## Rename Safety

"İşaret aktarımı" → "Negatif işaret aktarımı". Timeline identical entry-for-entry (only the
relative clock advanced), same students, same milestones, same order. Definition id unchanged,
identity fields pinned, **question documents not rewritten**, **studyEvents not rewritten** —
stored snapshots still read the old label, exactly as Phase 82 designed.

## Archive / Unarchive Safety

Archiving preserved the full 16-entry timeline, the evidence summary and the coverage figure, with
no "resolved" implication anywhere. Unarchiving returned the same document id to active with the
timeline unchanged. Across the whole rename → archive → unarchive round trip: no new document, no
question rewrite, no event rewrite.

## Recovery / Reselection QA

Driven through the real `recordStudyOutcome` callable:
two distinct selections → repeated milestone; two distinct qualifying declines → recovery
milestone and current recovery; a later selection → **withdrawal milestone**, current recovery
false, historical milestone retained; one fresh decline → still no recovery (the two
pre-reselection declines correctly did **not** leak into the new window); a second fresh distinct
decline → recovery current again.

## Query Cost

Roster queries 0 new · student-event queries 0 new · per-student bound 20 · concurrency 8 ·
timeline-specific reads after evidence load **0** · definition-switch event reads **0** ·
per-definition event queries **0** · per-node reads **0** · listeners 0 · polling 0 · writes 0 ·
new indexes 0 · new collections 0 · nested N+1 none.

## Zero-Write Proof

Searching, filtering, selecting a definition, opening the timeline, expanding it and switching
between definitions left the database byte-identical.

## Security

**Zero rules diff.** The teacher read is the pre-existing `sourceClassId`-filtered `studyEvents`
branch. Students gain no class-wide surface; the timeline lives only on the teacher vocabulary
route.

## Privacy

No uid, definitionId, eventId, questionId, namespaceId, operationId, Firestore path or raw JSON is
rendered or spoken — verified across every accessibility label and the full visible text.

## Responsive

375 Light, 375 Dark, desktop master/detail at 1280, and 250px (375 at 150%) all render with no
element exceeding the viewport. At 250px five text nodes clamp with an ellipsis and their full
sentences remain in the accessible labels.

## Accessibility

Each node speaks student → event kind → time → fact → question context, in chronological order.
Milestones and recovery are icon-plus-text, never colour. The disclosure carries both
`aria-expanded` and the state in words, because react-native-web drops
`accessibilityState.expanded` on a Pressable.

## Learning-System Regression

Phases 42–83 are absent from the diff apart from the three exported predicates in
`verifiedChoicePatterns.ts`, whose behaviour is unchanged — all 121 existing Phase 78/79/81/83
tests pass untouched. Student Feed, Learning Atlas, Hint Ladder, Action Center, Heatmap, review
scheduler and adaptive ranking all have zero diff. `firestore.rules`, `firestore.indexes.json`,
`functions/`, `.env`, `app.json`, `package.json` and the lockfiles are untouched.

## iOS Decision

No new native dependency, package, config, permission or API; no native-only behaviour; no
confirmed native-only defect. NATIVE IOS: NOT REQUIRED THIS PHASE.

## Automated Validation

typecheck PASS · lint PASS · unit 174 suites / 3358 tests · rules 5 suites / 411 tests · functions
build PASS · verify PASS · expo-doctor 17/18 (known pre-existing drift) · `git diff --check` PASS.

## Source Integrity

No binary, valid UTF-8, LF-only across every touched file. **Two raw NUL bytes were found in the
new timeline module during the integrity scan — written by me as a key delimiter — and replaced
with the `\u0000` escape**, so the file stays text. No raw colours in the new UI. No debug
instrumentation: the definition-switch read count was measured through the browser's own
performance entries rather than by adding code. Every temporary QA script removed.

## Known Limitations

- Semantic history is bounded at the 20 most recent class events per student.
- The timeline is therefore **left-truncated**: a milestone is the first crossing observable in the
  loaded records, not necessarily the student's first ever.
- Class evidence is a bounded per-student fan-out, not one query.
- No claim is made about events outside the loaded window.
- Private author-scoped semantics are excluded from shared-definition timelines.
- Recovery is a signal, never resolution, and may be followed by a reselection that withdraws it.
- Authored coverage is not evidence breadth, and evidence breadth is not timeline length.
- Current labels may differ from the immutable snapshots stored on questions and events.
- Archived definitions keep their full history and meaning.
- A class still has exactly one teacher.
- **Pre-existing technical debt, untouched:** `src/features/teacher/services/studentPerformance.ts`
  still contains one raw NUL byte used as a map-key delimiter. Phase 84 did not edit that file and
  the NUL blocked nothing here, so it was left alone and is reported rather than hidden.

## Phase 85 Readiness

Longitudinal semantic evidence is product-ready and the chronology is trustworthy, because every
threshold decision in it is Phase 78/79's own. A timeline must never alter Phase 42, never change
the Action Center, never create an intervention and never classify improving or worsening.

## Product Assessment

The evidence chain now runs from one authored distractor to a student's repetition, to their
recovery, to a shared vocabulary, to a class cohort, to a definition's own trail — and now to the
order it all happened in, with every link still refusing to say more than the records support.
