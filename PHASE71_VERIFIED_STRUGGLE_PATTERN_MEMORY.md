# Phase 71 — Verified Struggle Pattern Memory

## Repository Sync

Repo present at `/Users/mertcankurt/NetFlowEdu`, remote confirmed
`git@github.com:MCK08/NetFlowEdu.git`. HEAD was already `1309f9b`, sync **0 0**,
worktree clean, `1309f9b` an ancestor of HEAD. Nothing to fast-forward.

Phase-number check: latest doc on disk was `PHASE70_CONCEPT_MASTERY_MAP.md`, no
`PHASE71_*` existed. This is genuinely Phase 71.

## Starting Baseline

`1309f9b` — Phase 70 Concept Mastery Map.

## Product Goal

Move from *"where am I struggling?"* to *"how is the struggle repeating?"* —
using only repetition the records can prove.

## Answer Evidence Audit

Traced the real answer path before designing anything.

| Question | Answer |
|---|---|
| Selected choice known at answer time | **YES**, as React state in `MultipleChoiceAnswer` |
| Selected choice **persisted** | **NO** — it never leaves the component |
| Correct answer stored | **YES** — `Question.correctChoice` |
| Correctness **persisted** | **NO** — `evaluateChoice` maps it to a StudyOutcome and only the outcome is recorded |
| `recordStudyOutcome` payload | `{ questionId, outcome, operationId }` — nothing else |
| `studyEvents` record | `{ id, questionId, outcome, occurredAt, sourceClassId }` |

So the product knows *that* a question went badly, never *which wrong answer*
was chosen.

## Semantic Mistake Taxonomy Audit

Searched `src/` and `functions/src/` for `misconception`, `misconceptionId`,
`mistakeTag`, `mistakeType`, `errorType`, `distractorTag`, `distractorReason`,
`rationale`, `conceptTag`, `skillTag`, `learningObjective`.

**Result: none exist.** The single grep hit was an unrelated comment.

**Branch B — no verified semantic taxonomy.** Sentences like "işaret hatası
yapıyorsun" therefore have no source in this repository. They could only come
from question-text inference or an LLM guess, both of which this phase refuses.
The screen is titled **"Zorlanma Örüntülerim"**, not "Hata Türlerim", because
the records support a statement about *recurrence*, not a diagnosis.

## Why Pattern Memory Is Verified

Every claim resolves to something already stored and already trusted:

- **that** a struggle happened → Phase 41 counters
- **whether it repeated** → the same counters, `struggledCount >= 2`
- **whether it is still unresolved** → Phase 42's verdict
- **in what order** → Phase 59's ordered events

Nothing is inferred, clustered, embedded or classified by a model.

## Phase 41 Relationship

`outcomeHistory` is consumed as-is. A `null` history is **skipped entirely** —
it can neither create a pattern nor contribute to one. Unknown never becomes
"never struggled".

## Phase 42 Relationship

`buildLearningState` is **called, never replaced**. `persistent_struggle` is
what "unresolved" means here and `recovering` is what "recovered" means. No
competing classifier, no new threshold.

## Phase 59 Relationship

`getRecentLearningEvents` (the existing bounded query, limit 40) is reused
unchanged — no second event-loading abstraction. Chronology comes only from
those events; it is never reconstructed from counters, which record how many
times something happened but not when.

## Pattern Definitions

One pattern per topic, ordered checks, unresolved before resolved and broader
before narrower:

| Kind | Condition | Student sees |
|---|---|---|
| `topic_spread` | ≥2 distinct questions with Phase 42 `persistent_struggle` | "Zorlanma birden fazla soruya yayılıyor" |
| `same_question` | one `persistent_struggle` question with `struggledCount >= 2` | "Aynı soruda zorlanma tekrar ediyor" |
| `recovery` | any question with Phase 42 `recovering` | "Tekrar eden zorlanmadan sonra toparlanma" |

Anything else produces **no pattern**. A calm absence is the honest result.

Showing a topic as both "spread" and "one question keeps recurring" would
restate the same evidence twice without adding meaning, so the checks stop at
the first match.

## Same-Question Repetition

Scope is stated as the question: **"Bu soruda 3 zorlanma kaydı var."** The count
is the trustworthy cumulative `struggledCount`, so it is a true total rather
than a window figure.

## Topic-Wide Repetition

Scope is stated as the topic: **"Bu konuda 2 farklı soruda zorlanma tekrar
ediyor."** The count is distinct questions, never attempts.

Question evidence is never restated as topic evidence or the reverse — the
precise mistake this product has corrected before.

## Recovery

Recovery is **Phase 42's verdict**, never "the latest event happened to be a
solve". A question with three struggles whose most recent event is a solve but
which has no standing success is still `same_question`, not recovery — asserted
directly by test and by construction.

The copy stays observational: "Bu soruda 2 zorlanmanın ardından çözüm kaydı
var." It never says the topic is now learned.

## One-Off Honesty

A single struggle satisfies none of the three checks, so it can never be
described as repetition. Three different questions each slipped once still
produce no pattern — that is three slips, not a spread.

## Legacy / Partial Evidence

An item whose counters cannot be trusted is skipped before any classification.
It contributes to no count, no spread and no absence claim.

This is why the absence copy is split in two: a student with unknown history is
told **"Örüntü söylemek için daha fazla öğrenme kaydı gerekiyor"**, not
"nothing is repeating" — the second would be a claim the records cannot support.

## Bounded History Language

Chronology comes from a bounded 40-event window, so it is labelled **"Son
öğrenme kayıtlarında"**. The copy never says "her zaman", "tüm geçmişinde" or
"toplam". Cumulative counter statements carry no window qualifier because they
genuinely are totals.

## Data Source

`useLearningInsights().items` (already loaded, bounded) + `useLearningTrail()`
(Phase 59's existing bounded query), both mounted **only by the pattern
screen**.

## Firestore Cost

| Surface | Incremental reads |
|---|---|
| App startup | **0** |
| Student Feed | **0** |
| Study Hub | **0** (it already loaded events for Phase 61; nothing added) |
| Concept Map | **0** — deliberately not preloaded |
| Pattern screen open | **1 bounded query** (`getRecentLearningEvents`, limit 40) |
| Per pattern | **0** |

New writes **0**, listeners **0**, polling **0**, indexes **0**, collections
**0**, Cloud Functions **0**, security rules **0**. N+1: none. Aggregation is
one pass over items plus one filter per focus question, `O(n + e)`.

## Product Integration

Reached from the **Concept Map**, not Study Hub. The Hub already carries the
next action, review readiness, Learning Story and the Concept Map; a fifth
equal-weight card would have crowded the one decision the Hub exists to drive.
A compact secondary row sits below the map and above its CTA — the deeper
question only becomes meaningful once the map has been read.

Route: `/(student)/study/patterns`.

## Professional Design

Matches the Phase 70 standard rather than regressing to generic cards.

**Echo marks.** Each pattern carries a small stack of marks — the sense of "this
happened more than once" without a graphic pretending to be a measurement.
Capped at four, so a count of nine draws four marks and the true figure stays in
the sentence. Decorative and hidden from screen readers.

**No red wall.** Every row on this screen is about difficulty, so colouring them
all red would be noise. Repetition reads in brand blue, recovery in success
green, and the icon plus title carry the meaning. The only warm colour is inside
the outcome trail, where each chip also carries its own word.

Raw-colour audit on all new and changed UI: **zero** hex, `rgb(`, `"white"` or
`"black"` — every colour is a semantic token, so both themes follow
automatically.

## Accessibility

Each pattern is one accessible element read in the required order — **subject/
topic → pattern → evidence → chronology**:

```
"Matematik, Geometri. Aynı soruda zorlanma tekrar ediyor.
 Bu soruda 3 zorlanma kaydı var.
 Son öğrenme kayıtlarında: 1. Zorlandım, 2. Çözdüm, 3. Zorlandım."
```

Echo marks are `accessibilityElementsHidden` +
`importantForAccessibility="no-hide-descendants"`. Colour-only meaning: none.
The Concept Map entry is a real `Pressable` with a full label and
`minTouchTarget`.

## Runtime Personas

Read from actual current emulator evidence:

| Persona | Fixture evidence | Result |
|---|---|---|
| A | 2 questions, both `persistent_struggle` (st=8, st=2), 3 events | **Zorlanma birden fazla soruya yayılıyor** · "Bu konuda 2 farklı soruda zorlanma tekrar ediyor." ✓ |
| B | one `one_off_struggle`, two stable, 3 events | **No pattern** · "Henüz tekrar eden bir zorlanma örüntüsü görünmüyor" ✓ |
| C | 1 stable question, 2 events | **No pattern**, same absence copy ✓ |
| D | legacy counters, **0 events** | **"Örüntü söylemek için daha fazla öğrenme kaydı gerekiyor"** ✓ |

Student D is the critical case and it passed cleanly: no "0 zorlanma", no "hata
yok", no percentage, and crucially the *thin-history* sentence rather than the
*nothing-repeats* one — with unknown counters and no events, the product
genuinely cannot claim nothing repeats. C and D receiving different sentences is
that distinction working on real data.

**No canonical fixture provides a Phase 42 `recovering` question** (the same
finding Phase 70 reported for Student B). Rather than change a fixture to
manufacture one, temporary emulator-only data was used.

## Temporary QA

Two temporary items plus six temporary `studyEvents` on Student A exercised the
remaining kinds with real chronology:

```
Matematik / Denklemler  Zorlanma birden fazla soruya yayılıyor
                        Bu konuda 2 farklı soruda zorlanma tekrar ediyor.
Matematik / Geometri    Aynı soruda zorlanma tekrar ediyor
                        Bu soruda 3 zorlanma kaydı var.
                        Son öğrenme kayıtlarında  Zorlandım → Çözdüm → Zorlandım
Fizik / Kuvvet          Tekrar eden zorlanmadan sonra toparlanma
                        Bu soruda 2 zorlanmanın ardından çözüm kaydı var.
                        Son öğrenme kayıtlarında  Zorlandım → Zorlandım → Çözdüm
```

Ordering, scope wording and bounded language all held. Removed afterwards with
an existence check: **0 leftovers, 0 stray events, 0 stray items**, Student A
back to its canonical 2 items and 3 events. No temporary auth user was needed.
Theme preference and zoom reset; no browser instrumentation or emulator export
artifact remains.

## Regression

Phases 42, 45, 46, 59, 61, 62, 63, 64, 65, 66, 67, 68, 69 and 70 are **untouched
by diff** — no learning-logic, scheduler, adaptive, session or teacher file
appears in the change set. The Concept Map was re-verified live and still
renders its evidence and summary correctly with the new entry below it, and it
gained **no** event read. The Student Feed is untouched by diff; its screen was
observed mounting and rendering with no overflow.

## iOS Decision

| Gate | Answer |
|---|---|
| New native dependency / package | NO |
| New native configuration | NO |
| New native permission | NO |
| Native-only API | NO |
| Native-only navigation | NO |
| Native-specific gesture / animation | NO |
| Native-only storage | NO |
| Confirmed native-only issue | NO |

**NATIVE IOS: NOT REQUIRED THIS PHASE.** Existing shared React Native /
TypeScript / theme / Expo Router infrastructure, no native-specific change.

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | 156 suites / 2799 tests (+1 suite / +45) |
| rules | 5 suites / 365 tests (unchanged) |
| functions build | PASS |
| verify | PASS |
| expo-doctor | 17/18 (known pre-existing drift) |
| `git diff --check` | PASS |

## Source Integrity

All ten touched files: **0 NUL bytes**, valid UTF-8, LF-only, no conflict
markers, real numeric line counts. No `console.*`, `debugger`, TODO markers or
temporary QA code.

The one occurrence of "işaret hatası" in the codebase is inside a source comment
explaining why the product may not say it — not shipped copy.

## Known Limitations

- **No semantic mistake types**, by design and by evidence: the metadata does
  not exist and the selected choice is not persisted. See below.
- **Patterns are per topic**, one each. A topic with both a spreading struggle
  and one especially stubborn question shows only the spread.
- **Chronology is bounded to 40 events.** A question whose struggles fell
  outside that window still forms a pattern from its counters, but shows no
  trail.
- **Recovery depends on Phase 42's definition** (≥2 struggles, last solved,
  standing success). A gentler recovery is not described as one.
- No canonical fixture produces a `recovering` question, so that path was
  verified with temporary data and unit tests.
- The Feed's Question → Rating → Question cycle was not stepped through with
  synthetic input (the virtualised pager did not advance under it); the Feed is
  untouched by diff and its screen was confirmed to mount and render correctly.

## Future Semantic Mistake Taxonomy

Saying "işaret hatası" safely would require, at minimum:

1. **Authored misconception metadata** on the question — a misconception id per
   distractor choice, written by the question's author, not inferred.
2. **Persisting the selected choice**, which today never leaves the component,
   so a `selectedChoice` would have to reach `recordStudyOutcome` and the event.
3. **Server verification** that the submitted choice is one of that question's
   own options, so a client cannot fabricate a misconception attribution.
4. A **bounded cost and rules review** for the added event field.

Only step 1 makes the label meaningful; steps 2–4 make it trustworthy. None was
built here, because a label the product cannot source is worse than no label.

## Final Product Assessment

The valuable work in this phase was the audit. Once it was clear that no
misconception metadata exists and the selected answer is never stored, the
honest ceiling for Phase 71 became visible — and it turned out to be a genuinely
useful product anyway: repetition, spread and recovery are exactly what a
student cannot see from a single screen of counters.

The design discipline that mattered most was refusing to make the screen red.
Everything on it is about difficulty; painting that in alarm colours would have
turned an evidence surface into a warning dashboard, which is the opposite of
what a student needs when they are told their struggle is repeating.
