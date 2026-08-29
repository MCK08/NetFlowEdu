# Phase 53 — Daily Flow

## Product Goal

Turn intelligence the app already computes into one simple daily answer:

- Student — **Bugünkü Akışın**: "what should I do next today?"
- Teacher — **Bugün Sınıfında**: "what deserves my attention today?"

Daily Flow is an orientation layer above the feed. It is not a dashboard, not
a chatbot, not gamification, and not a new backend.

## Student Daily Flow

A compact section at the top of the Student Feed, above the channel bar, with
at most three rows.

Priority ladder (mirrors Phase 39's own order, so the Study Hub's single
"next action" and this list can never contradict each other):

1. an assignment that is genuinely still open
2. reviews that are actually due right now
3. a topic with real, trustworthy repeated-struggle evidence
4. ordinary practice, when there is real practice material

## Teacher Daily Flow

The same compact treatment at the top of the Teacher Feed.

1. a student whose evidence says they need attention now
2. a second such student (two struggling students are two separate concerns)
3. a class-wide topic hotspot (one concern about many students)

### Why Phase 47's improved / no_change / worsened is not a row here

This is the one place Phase 53's suggested ladder could not be implemented as
written, and the reason is architectural rather than a shortcut.

Those verdicts come from `buildInterventionEffectiveness`, which needs — per
student — that student's most recent intervention assignment plus their own
submission document (`useInterventionEffectiveness`: two reads each).
Producing them for a class of N students on every teacher feed open is exactly
the per-student fan-out §22 forbids and Phase 50 deliberately avoided. There
is no aggregated source for them today.

So Daily Flow surfaces the signals that **are** already aggregated
(`studentAttention`'s category + reason, and the class topic hotspots), and
the effectiveness verdict plus its Phase 47 next action stay where they are
already computed for a single student: **Student Performance**, which every
row here links into in one tap. Phase 47's semantics are consumed unchanged,
never re-derived, and nothing is fabricated to fill the ladder.

Verified live: tapping *Öğrenci F* opens Student Performance showing
`⚠️ Geriledi` · `güçlü kanıt` · *"Durum geriledi — bu öğrenciyi öncelikle
incelemeniz önerilir."* — Phase 47's worsened→escalate path intact.

## Priority Model

Both composers assign an integer `priority` from the documented ladder and use
a stable sort. There is no score, no weighting, and no randomness. Equal
priorities keep insertion order, so repeated calls with identical input return
an identical list.

## Evidence Honesty

- **Phase 41 completeness rule reused exactly.** A topic only produces a
  reinforcement row when `struggledAttemptCount` is non-null and > 0. Null
  stays unknown and never becomes zero, so a legacy/insufficient-history
  account (Student D) shows no fabricated struggle row.
- **No fabricated urgency.** Past-due assignments are deliberately *excluded*
  rather than surfaced as an alarm: the student cannot change that outcome, so
  a row would be manufactured pressure. No "due soon" / "today" / "late"
  wording anywhere — `dueAt` is optional in the schema.
- **No fabricated time estimates.** There is no duration model in the product,
  so no row shows minutes. Enforced by a test.
- **No classifier jargon.** `persistent_struggle`, `struggledCount`, mastery
  bands and confidence buckets never reach copy. Enforced by a test.
- **No causal claims** on the teacher side. Reason strings are
  `studentAttention.ts`'s own fixed, observational sentences, used verbatim.

## Deduplication

- **Student (§47):** the generic practice row is suppressed entirely when a
  reinforcement row exists — both would open practice off the same weak-topic
  evidence. The stronger, more specific action wins. Only one assignment row
  ever appears, even when several are open.
- **Teacher (§48):** exactly one row per student, carrying that student's one
  reason — never a separate "struggling" row and "needs intervention" row for
  a single concern.

## Routing

Every target is a route that existed before Phase 53. No new route, no new
screen, no placeholder.

| Target | Destination |
|---|---|
| `assignment` | `/(student)/assignment/[assignmentId]` |
| `review_session` | `/(student)/study/review` |
| `adaptive_session` | `/(student)/study/adaptive` |
| `question` | `/(student)/question/[questionId]` |
| `student_performance` | `/(teacher)/class/[classId]/student/[studentId]` |
| `assignment_composer` | `/(teacher)/class/[classId]/assignment/create` |

A hotspot's `gradeLevel` is passed through only when it is real; a null grade
is omitted, never defaulted (Phase 43's rule).

## Empty / First-Run States

Student with history: *"Şimdilik öncelikli bir adım yok. Keşfet'ten yeni
sorularla devam edebilirsin."*
Student with no history: *"Keşfet'ten bir soru çözerek başlayabilirsin."*
Teacher with a class: *"Şu anda acil bir öğrenci sinyali görünmüyor."*
Teacher with no class: *"Bir sınıf oluşturduğunda öğrenci sinyalleri burada
görünecek."*

No alert is manufactured to avoid an empty state.

## Offline UX

The known Phase 51/52 limitation is fixed. `OfflineBanner` was a full-width
bar pinned to `top: 0`, covering screen titles, the feed's brand lockup and
back buttons whenever offline.

It is now a compact centered pill anchored to the **bottom**, clear of the tab
bar and inside the safe area. Being at the bottom means it structurally cannot
overlap a title. It stays absolutely positioned, so connectivity changes cause
no layout jump. The connectivity source is untouched and the state is never
faked.

Verified live by failing only the connectivity probe: pill appears at the
bottom with the header fully readable, correct in Light and Dark, and clears
cleanly on reconnect.

## Accessibility

- Each row announces one combined label: title, reason, and action purpose —
  not three unrelated fragments.
- Rows are `minHeight: 56` with generous padding; no icon-only targets.
- State is carried by icon **and** colour, never colour alone. Attention rows
  keep the semantic danger tone rather than being recoloured to brand blue.
- Title and reason use `numberOfLines` with wrapping and no fixed heights, so
  enlarged text wraps rather than clipping.

## Theme / Brand

All new UI uses `themedStyles` + semantic tokens with `useThemeSubscription`.
Phase 52's brand system is untouched: no new colours, no gradients, no glow,
no hero block. A sweep of every touched file for raw hex / `rgb()` / `rgba()` /
`"white"` / `"black"` returned zero matches, and no new file uses a
module-scope `StyleSheet.create` that could freeze the first theme (§54).

## Native iOS

**NOT RUN.** There is no `ios/` project in the working tree, and Phase 53
changed **zero** native dependencies. §56 explicitly says not to regenerate the
native project when native dependency changes are not needed, so a full
`expo prebuild` + native build was not performed. Every native item is
reported UNVERIFIED rather than inferred from the web result.

## Web

Verified against the emulator with deterministic demo fixtures, Auth confirmed
bound to `localhost:9099` before login.

- Student: Daily Flow renders, reinforcement row routes to the question and
  back preserving channel + filter state; Daily Flow persists across all four
  channels without duplicating.
- Teacher: account switch lands on the teacher feed with the teacher Daily
  Flow and teacher-only channels; student signal routes to Student
  Performance; hotspot routes to the assignment composer (opened and backed
  out — nothing published, per §46).
- Desktop centered column and small-iPhone (375×667) both verified; no
  clipping, no horizontal overflow, feed content still visible below Daily
  Flow.

## Performance

- **New Firestore reads:** one — `useStudentAssignments` on the student feed.
  Justified: an open assignment is the top of Phase 39's own ladder and there
  is no other source of assignment state on that screen. It is the same
  bounded read the Study Hub already performs (one query + one submission doc
  per assignment targeting this student), never per-class or per-question.
- The student learning half (weak topics, due count, history) costs **zero**
  new reads — it comes out of `useFeedPersonalizationSignals`' existing single
  fetch, whose other outputs were previously discarded.
- The teacher side adds **no new query**: it reuses the same single per-class
  `useClassPerformance` aggregate, now loaded on feed open rather than on
  channel open. Still one class, no fan-out.
- **New listeners:** none. **New polling/timers:** none. Daily Flow refreshes
  on the focus trigger the feed already used.
- **New N+1:** none, by explicit design (see the Phase 47 note above).

## Security / Backend

No new collections, schema fields, Cloud Functions, indexes, or security
rules. Daily Flow reads only sources the role was already authorized to read.
Rules suite unchanged at baseline.

## Automated Validation

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | 138 suites / 2315 tests (was 136 / 2277) |
| `npm run test:rules` | 5 suites / 350 tests (unchanged) |
| `npm run verify` | green |
| `npx expo-doctor` | 17/18 (known pre-existing patch drift) |
| `git diff --check` | clean |

## Runtime Validation

| Fixture | Result |
|---|---|
| Student A (repeated struggle) | reinforcement row *"Denklemler konusunu güçlendir"*, attention tone, routes to the question |
| Student A assignments | all completed → correctly no assignment row |
| Student A due | 0 due → correctly no review row |
| Teacher F (worsened) | signal row → Student Performance showing `⚠️ Geriledi` + escalate |
| Teacher E (no_change) | signal row → Student Performance |
| Strong / insufficient-data students | correctly absent from Daily Flow |
| Class hotspot | *"4 öğrencide zorlanma görülüyor."* → composer |

## Additional Polish Fixes

1. **Offline banner overlap** (§37) — moved from a full-width top bar to a
   bottom-anchored compact pill.
2. **`useFeedPersonalizationSignals` never resolved Phase 41 counters** — it
   built `LearningInsightItem`s without `outcomeHistory`, so every
   `TopicInsight.struggledAttemptCount` derived from the feed was a *false*
   null. A student with eight real recorded struggles was indistinguishable
   from a legacy account with none. Fixed by resolving `outcomeHistory` from
   fields the same fetch already returned (zero new reads). Found while
   verifying Daily Flow against the demo fixtures.

## Known Limitations

- **Native iOS not verified this pass** (no `ios/` project; no native
  dependency change to justify regenerating one).
- **Large-text / Dynamic Type not runtime-verified.** A meaningful Dynamic
  Type test needs the native environment above. The layout is structurally
  wrap-tolerant (`minHeight`, `numberOfLines`, no fixed text heights) but that
  is inspection, not a runtime result.
- **Teacher Daily Flow is scoped to the teacher's first class**, inherited
  from Phase 50's deliberate no-fan-out architecture.
- **Phase 47 verdicts are one tap away, not inline** — see the architectural
  note above.
- Demo fixture question images still point at an unresolvable placeholder, so
  cards show the themed "Görsel yüklenemedi" fallback. Fixture limitation,
  documented in `DEMO_CHECKLIST.md`.

## Final Result

Both home surfaces now open with a short, evidence-backed answer to the
question their user actually has, built entirely from intelligence the product
already computed, with one justified new read, no new backend, no fabricated
evidence, and the content-first feed preserved.
