# Phase 60 — Longitudinal Teacher Intelligence

## Starting Baseline

`ffef2b4` — Phase 59 Verified Learning Memory. Worktree clean, sync 0/0, main
untouched.

## Phase 59 Architecture Reused

Phase 59 built the teacher read path and never wired it. Phase 60 closes that
gap and adds **nothing** to the backend:

| Piece | Status |
|---|---|
| `users/{uid}/studyEvents` | reused unchanged |
| `getRecentClassLearningEvents(studentUid, classId, max)` | reused — already existed, previously uncalled |
| Rules: teacher read scoped by `sourceClassId` | reused unchanged |
| Index `(sourceClassId ASC, occurredAt DESC)` | reused unchanged |
| Write path (`recordStudyOutcome`) | untouched |

Verified by reading the actual source rather than the Phase 59 report: the
rule resolves `resource.data.sourceClassId` and requires the caller to teach
that class, which is exactly what the query's equality filter makes provable.

New collections: none. New fields: none. New functions: none. New index: none.

## Product Goal

A teacher opening one student should see, in order: what state the student is
in, what actually happened recently, and what to do. Phase 60 supplies the
middle term — chronology — without disturbing the other two.

## Teacher Timeline

Location: **Student Performance → "Son öğrenme akışı"**, placed between the
aggregate counts and the Phase 44/47 intervention block. No new tab, no new
feed channel, no new top-level screen.

Renders per topic: topic name, when it was last recorded, and the shared
`LearningTrail` (`Zorlandım → Zorlandım → Çözdüm`), followed by one
observational sentence for the most recently active topic.

## Query Architecture

One bounded query per opened student:

```
users/{studentId}/studyEvents
  where sourceClassId == classId
  orderBy occurredAt desc
  limit 20
```

**Limit = 20** (`TEACHER_TIMELINE_QUERY_LIMIT`), deliberately half the
student's 40: at most two topics × four steps can ever be displayed, so 20 is
already several times more than the view can use while leaving the topic
grouping something to choose from.

Subject and topic are joined from the shared question-metadata cache Student
Performance already populates — no per-event read, so no N+1 behind the join.

## On-Demand Scope

Proven structurally, which is stronger than a single network capture:

- `getRecentClassLearningEvents` has exactly **one** caller — `useTeacherLearningTimeline`
- `useTeacherLearningTimeline` has exactly **one** mount point — `StudentPerformanceScreen`
- Teacher Feed, `useClassPerformance` and Class Performance reference **no**
  event API at all

Teacher Feed and Class Performance therefore cannot issue a studyEvents query.

## Timeline Interpretation

`buildTeacherLearningTimeline` is pure and reuses Phase 59's
`resolveTrailShape`, `sortEventsChronologically` and minimum-evidence bar
rather than reimplementing them — the two roles cannot disagree about what the
same events mean. Only the sentences differ:

| Shape | Teacher copy |
|---|---|
| recovery | "Son kayıtlı sonuçta çözüm görülüyor." |
| repeated struggle | "Son kayıtlı çalışmalarda zorlanma tekrar ediyor." |
| steady | "Son kayıtlı çalışmalarda çözüm istikrarlı görünüyor." |
| mixed | "Son kayıtlı sonuçlar karışık bir görünüm gösteriyor." |

A single lone event is shown but earns no sentence.

## Evidence Honesty

Observational and third-person throughout. A sequence ending in a solve is
reported as "son kayıtlı sonuçta çözüm görülüyor" — never promoted to "this
student is recovering", which is a claim only Phase 42 may make.

Confirmed live on Student A: the trail ends in a solve while Phase 42 still
reads **TEKRARLAYAN ZORLANMA**. The timeline did not, and cannot, move the
state.

Day labels use **local calendar comparison**, not elapsed milliseconds: an
outcome at 23:50 read at 00:10 is "Dün". No rate, no percentage, no "bu hafta",
no coverage figure.

## Partial Coverage

The chronological record begins at Phase 59, so it is recent evidence of
unknown completeness. The section is framed as "son öğrenme akışı" and its
empty state reads "kronolojik öğrenme akışı yeni çalışmalarla oluşacak" —
never "this student has not studied".

Cumulative and chronological evidence are shown side by side without being
reconciled. Student A displays "Denklemler · 10 kez" (lifetime) beside three
recorded events. Both are true.

## Phase 42 Relationship

Phase 42 remains the authoritative verdict. The timeline adds context and no
classifier. Tests assert the copy never contains a state verdict.

## Phase 47 Relationship

Untouched. Student A still shows "Yeterli kanıt yok — şimdilik yeni bir aksiyon
önerilmiyor"; Student B still shows its "✅ İşe yaradı" Phase 44 result. The
timeline sits beside these and changes neither.

## Authorization

The existing route already carries both `classId` and `studentId`, so no route
change was needed and the authorization scope cannot be lost. Both ids form the
hook's request identity, so a slow response for a previous student cannot paint
over the current one.

## Performance / Cost

| | |
|---|---|
| Teacher Feed studyEvents queries | 0 |
| Class Performance studyEvents queries | 0 |
| Student Performance | 1 bounded query (limit 20) |
| New writes / listeners / polling / N+1 | none |
| New dependency | none |

Refresh is one-shot on open; no listener was added.

## Student Story Coherence

Same events, different voice. Student: "Son çalışmalarda toparlanma
görülüyor." Teacher: "Son kayıtlı sonuçta çözüm görülüyor." Verified live on
the same fixture.

## Responsive Web

375px: no horizontal overflow (`scrollWidth === clientWidth === 375`); the
trail wraps to a second line. Desktop: bounded card layout unchanged.

## Accessibility

Inherited from the shared trail: each step numbered in its own label
("1. Zorlandım"), outcome carried by icon *and* text rather than colour, and
the row wraps instead of trapping the reader in a horizontal scroller. The
timeline is not interactive, so nothing is a fake button.

At 150% zoom the trail reflows to one step per line with nothing clipped.

## Localhost Runtime Acceptance

Emulators + web, seeded fixtures (A×3, B×3, C×2, D×0):

- Teacher login — PASS
- Student A: `Zorlandım → Zorlandım → Çözdüm`, "2 gün önce" — PASS
- Student B: `Zorlandım → Çözdüm → Çözdüm`, "Dün" — different trail, no stale A — PASS
- Student D: honest empty state, existing intelligence intact, no fake counts — PASS
- Back to A: correct trail restored, no stale D — PASS
- Student Learning Story + immersive feed + Daily Flow — PASS

## iOS Decision

**SKIPPED BY DESIGN.** Phase 60 changed no native config, no dependency, no
platform-specific code, no safe-area or gesture handling, no storage and no
navigation semantics — it adds shared React Native presentation on an existing
route, reading through the existing Firestore client layer. Every behaviour was
provable on localhost. Previous native acceptance remains applicable.

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | 143 suites / 2409 tests (+24) |
| rules | 5 suites / 365 tests (unchanged) |
| functions build | PASS |
| verify | PASS |
| expo-doctor | 17/18 (known drift) |
| `git diff --check` | PASS |

## Known Limitations

- The timeline covers only events recorded since Phase 59; a legacy student
  shows the empty state while their cumulative evidence remains fully valid.
- Scoped to the class the teacher opened, by design — a cross-class view would
  be one query per class.
- At most two topics and four steps each are shown; older events are fetched
  for grouping but never displayed.
- Intervention timing is deliberately not aligned to the timeline, so no
  post-intervention chronological claim is made (that would need architecture
  Phase 60 did not add).

## Final Product Assessment

The teacher now sees state, chronology and action together on one screen, with
the chronology adding real ordered evidence and taking no authority from the
classifiers around it.
