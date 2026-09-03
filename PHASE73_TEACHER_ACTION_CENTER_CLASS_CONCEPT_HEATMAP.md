# Phase 73 — Teacher Action Center + Class Concept Heatmap

## Repository Sync

Repo present at `/Users/mertcankurt/NetFlowEdu`, remote confirmed
`git@github.com:MCK08/NetFlowEdu.git`. HEAD was already `72f39c6`, sync **0 0**,
worktree clean, `72f39c6` an ancestor of HEAD. Nothing to fast-forward.

Latest doc on disk was `PHASE72_VERIFIED_PROGRESSIVE_HINT_LADDER.md`; no
`PHASE73_*` existed.

## Starting Baseline

`72f39c6` — Phase 72 Verified Progressive Hint Ladder.

## Product Goal

Turn distributed teacher intelligence into a decision workspace: what to look at
today, and where the class's difficulty concentrates.

## Existing Teacher Intelligence Audit

The audit found more prior art than expected, and it changed the shape of the
phase.

| Capability | Where it already lived |
|---|---|
| Topic hotspots + attention students | `classTopicInsights.ts`, `studentAttention.ts` |
| A capped "what can I do now" list | **`teacherActionSummary.ts`** — already on Class Performance |
| Intervention targeting | `teacherIntervention.ts` (Phase 43) |
| Intervention effectiveness | `interventionEffectiveness.ts` (Phase 44) |
| Post-intervention action | `postInterventionAction.ts` (Phase 47) |
| Class-scoped chronology | `learningEventService.ts` (Phase 60) |

**The real gap:** Phase 47's verdicts rendered **only** on
`StudentPerformanceScreen`. A teacher had to open each student in turn to find
out that one of them had regressed after an intervention. The class surface
showed hotspots and attention students and nothing about follow-ups at all.

So this phase brings Phase 47 up to the class level and adds the concept view —
it does not rebuild what already worked.

## Phase 43 Relationship

Untouched. Hotspot targeting still comes from `buildClassTopicHotspots` and
`teacherIntervention.ts`; the persistent-struggle definition was not broadened.
The `create_question` action still opens the composer pre-filled with the
topic's own resolved grade.

## Phase 44 Relationship

`selectMostRecentIntervention` → `toInterventionEvidence` →
`buildInterventionEffectiveness` are called, never reimplemented.

**One design correction during implementation:** the first version pre-filtered
assignments to explicit `interventionOf` markers before handing them to
`selectMostRecentIntervention`. That would have silently disabled Phase 44's
legacy fallback at class level while leaving it active on the student's own
screen — two different answers to the same question. The hook now passes the
whole recent-assignment window and lets Phase 44's own "explicit first, legacy
second" rule decide.

Wording stays observational: the evidence note says how much was reviewed after
the intervention, never that the intervention caused anything.

## Phase 47 Relationship

`resolvePostInterventionAction` is the only classifier of an intervention
outcome. improved → monitor, low confidence → monitor, worsened with real
confidence → escalate, no_change with real confidence → follow_up. No
`TeacherActionV2`, no second semantics.

**Monitor is deliberately not an action here.** Its own copy says "şu an için
yeni bir takip ödevi önerilmiyor" and "şimdilik yeni bir aksiyon önerilmiyor";
listing it under "what should I do today" would contradict the verdict it
carries. It remains fully visible on the student's own screen, where it answers
a different question.

## Phase 60 Relationship

Untouched and not needed: the class concept view is built from study items, not
from `studyEvents`. No per-student event query was added, and the Phase 60
class-scoped query and its index are unchanged.

## Class Performance Data Source

`useClassPerformance` already loaded everything required — the roster, each
student's class-sourced study items (bounded concurrency), and the shared
question metadata — and then discarded the per-student items after building
aggregate snapshots.

The heatmap needs Phase 42 verdicts **per question**, which the aggregates no
longer carry. So the hook now **retains the rows it already fetched**. That is
the whole trick: zero additional reads, and the only alternative would have been
a second query per student.

## Query Cost

| Surface | Incremental reads |
|---|---|
| Class list | **0** |
| Class Detail existing (roster + N student items + metadata) | unchanged |
| Action Center — assignments | **0** (`useClassAssignments` already loaded them) |
| Action Center — submissions | **≤ number of assignments actually referenced**, capped by `MAX_INSPECTED_ASSIGNMENTS` (8) |
| Heatmap | **0** — derived from retained evidence |
| Per student | **0** |
| Per topic | **0** |
| New writes / listeners / polling / indexes / collections / Functions / rules | **0** |

The submissions read is not a fan-out: submissions live under the **assignment**,
so one `getAssignmentSubmissions` returns every targeted student's submission at
once, and several students on the same intervention share a single read. The
count therefore scales with a class's recent assignment history and **never with
class size**. Phase 44's selector runs *before* fetching, so only assignments
actually referenced are read.

N+1: **none**. Aggregation is one pass over students × their items plus one
sort — `O(n log n)` over data already in memory.

## Teacher Action Model

`buildTeacherActionCenter` merges two already-canonical lists rather than
inventing a third ranking:

- Phase 47 outcomes → `escalate`, `follow_up`
- `buildTeacherActionSummary` → `prepare_intervention`, `review_student`

One action per student, capped at **5**.

## Action Ordering

Fixed precedence: escalate → follow_up → prepare_intervention → review_student.
Within a kind, the source list's own order survives because the sort is stable
and no second ranking is applied.

There is no `priorityScore`, no urgency percentage and no risk figure anywhere.

## Action Copy

Every reason is the source service's own fixed copy, carried through unchanged.
Labels are teacher language — "Öncelikli inceleme", "Takip gerekli", "Müdahale
öneriliyor", "İzle" — and no raw enum reaches the screen.

The empty state is "Şu anda öne çıkan bir öğretmen aksiyonu yok." — deliberately
not "the class is fine": students with no trustworthy evidence are invisible to
every signal behind the list.

## Concept Identity

`subject + topic`, keyed `` `${subject}|${topic}` `` with `trim()` only — the
same conservative identity Phase 62/70/71 already use. No second normalization
system, no fuzzy matching. An item whose question metadata will not resolve is
omitted rather than bucketed.

## Class Concept Aggregation

Two conservative reductions, both ordered checks:

**Per student, per topic:** any `persistent_struggle` wins; else any
`recovering`; else steady needs standing success on more than half the questions
they have met there; else insufficient.

**Per topic, across students:** any stuck student wins; else any recovering
student; else steady needs a majority of steady students; else insufficient.

## Evidence Honesty

No class mastery percentage, no student score, no risk figure, no engagement
metric — only counts of people: "3 öğrencide tekrar eden zorlanma", "1 öğrencide
istikrarlı kanıt", "2 öğrencide yeterli kanıt yok". Absences are omitted, so a
teacher never reads "0 öğrencide toparlanma".

Two students stuck behind eight steady ones stay visible — asserted directly.
A topic with one steady student and four with no usable evidence reads as
needing evidence, never as steady.

No student is labelled weak, failing or at risk anywhere.

## Legacy / Partial Evidence

Phase 41's completeness rule is deferred to, not re-derived: a null history
classifies as `insufficient_data` and can never read as "never struggled". A
legacy student therefore appears under "Daha fazla kanıt gerekiyor" and can
never make a topic look solid.

## Heatmap Information Architecture

**Not a traffic-light grid.** "Heatmap" describes the information, not the
visual. A red/amber/green matrix would turn topics into judgements, force a
teacher to decode colour, and would not survive 375px. This is a row per topic:
subject, topic, state in words, the counts behind it — and the students grouped
by standing on tap.

Detail is disclosed rather than dumped, so the scan surface stays scannable.

## Class Detail Integration

Both sections sit at the top of Class Performance, action before analytics,
because a teacher opens a class to decide something.

The Action Center **supersedes** the Phase 27 "Şimdi Yapılabilecekler" block
that stood there: it renders those same hotspot and student actions plus Phase
47's follow-ups and escalations. Keeping both would have shown the same hotspot
twice. Everything below — class health, topic hotspots, priority students,
assignments — is untouched.

No dedicated route was added. At the current concept scale a separate screen
would only relocate the same rows; inline with expand-on-tap is the better
information architecture for a teacher scanning one class.

## Professional Teacher Design

Scan-oriented, not immersive: compact rows with a coloured left marker, kind
label, name, reason, evidence note and one action. Density is the point — the
student surfaces are the immersive ones.

**No red wall.** Only an escalation carries the danger accent, and only on a
3px marker and a caption. Follow-ups are brand blue, intervention candidates
navy, monitoring neutral. Colour reinforces; the label and reason carry the
meaning.

Raw-colour audit on both new components: **zero** hex, `rgb(`, `"white"` or
`"black"` — every colour is a semantic token, so both themes follow.

## Accessibility

Each action row and each topic row is one accessible element with a full spoken
label in reading order; the topic row also reports its expanded state. Student
rows in the drill-down name the student and their standing. All interactive
rows meet `minTouchTarget`. Colour-only meaning: none.

## Runtime Personas

Read from actual current emulator evidence, then verified in the UI.

**Action Center** rendered exactly:

```
Öncelikli inceleme   Öğrenci F   Durum geriledi — …   Müdahaleden sonra 3 soru tekrar edildi.
Takip gerekli        Öğrenci E   Durum değişmedi — …  Müdahaleden sonra 3 soru tekrar edildi.
Müdahale öneriliyor  Matematik · Denklemler           4 öğrencide zorlanma
İzle                 Öğrenci A   Aynı soruda 8 kez zorlandı
```

F (worsened) escalates, E (no_change) follows up, and **B — the improved
persona — correctly does not appear**, because Phase 47 returns monitor.

**Heatmap** rendered `Matematik · Denklemler` → "Tekrar eden zorlanma" with
"3 öğrencide tekrar eden zorlanma · 1 öğrencide istikrarlı kanıt · 2 öğrencide
yeterli kanıt yok", and the drill-down grouped:

| Standing | Students | Matches fixture |
|---|---|---|
| Tekrar eden zorlanma | A, E, F | A st=8/2, E st=4/3, F st=4/3/3 ✓ |
| İstikrarlı | C | st=0 over 5 outcomes ✓ |
| Daha fazla kanıt gerekiyor | B, D | B one-off + thin, D legacy counters ✓ |

**Student D is the critical case and it passed:** legacy counters read as "Daha
fazla kanıt gerekiyor", never as stable, 0 struggles or healthy.

## Intervention Safety

Runtime QA was **read-only**. No intervention was composed, no assignment
created, no study item or event written, no temporary auth user made. Verified
afterwards: 7 assignments, all canonical `demo-*` fixtures, no stray documents.

(The seed script's own log line says "seeded 6 assignments" while listing
A×3 + C×1 + B/E/F×3 = 7. The log text undercounts its own output; the fixture
set is correct and was not touched.)

The Action Center only ever **suggests**. `Müdahale Hazırla` opens the existing
composer pre-filled; nothing creates an assignment on its own, and
`Assignment.interventionOf` is still set only by the real Phase 43 flows.

## Regression

Phases 42, 43, 44, 45, 46, 47, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70,
71 and 72 are **untouched by diff** — no learning-logic, scheduler, intervention
or student-feature file appears in the change set. The Teacher Feed was observed
rendering its Phase 43 signals correctly during QA. No teacher hint analytics
were added; Phase 72 still does not persist hint usage.

Student surfaces (Concept Map, Pattern Memory, Hint Ladder, Feed) were **not
re-driven in the browser this phase** — they have zero diff and are covered by
the full suite. Stated rather than claimed.

## iOS Decision

| Gate | Answer |
|---|---|
| New native dependency / package | NO |
| New native configuration | NO |
| New native permission | NO |
| Native-only API | NO |
| Native-specific layout Web cannot validate | NO |
| Confirmed native-only issue | NO |

**NATIVE IOS: NOT REQUIRED THIS PHASE.** Shared React Native / TypeScript /
theme components and existing Firestore hooks.

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | 159 suites / 2882 tests (+2 suites / +53) |
| rules | 5 suites / 370 tests (unchanged) |
| functions build | PASS |
| verify | PASS |
| expo-doctor | 17/18 (known pre-existing drift) |
| `git diff --check` | PASS |

## Source Integrity

All nine touched files: **0 NUL bytes**, valid UTF-8, LF-only, no conflict
markers. No `console.*`, `debugger`, TODO markers or temporary QA code.

## Known Limitations

- **The assignment window is capped at 8.** A student whose newest relevant
  assignment is older keeps their verdict on their own screen but does not
  surface in the class action list. The cap is what keeps reads independent of
  class size.
- **The per-student study-item fan-out is unchanged and pre-existing.** Class
  Performance still costs one query per student; this phase adds nothing to it
  but does not remove it either.
- **No dedicated heatmap route.** At larger concept counts a separate screen may
  become the better IA; inline expansion was the right call at current scale.
- **Monitor outcomes are absent from the class list** by design — visible on the
  student's own screen.
- **The heatmap covers class-sourced items only**, matching what Class
  Performance already loads. A student's private or public study of the same
  topic is not counted.
- Student surfaces were verified by diff scope and the full suite rather than
  re-driven in the browser.

## Final Product Assessment

The audit was again the decisive work: the class surface already had an action
list, and the honest contribution was not another dashboard but moving Phase
47's verdicts from six separate student screens onto the one screen a teacher
actually opens.

The judgement that mattered most was refusing the traffic-light grid the word
"heatmap" invites. A teacher scanning a class does not need to decode colour;
they need to read that three students are stuck, one is steady, two have not
produced enough evidence to say — and then tap to see who.
