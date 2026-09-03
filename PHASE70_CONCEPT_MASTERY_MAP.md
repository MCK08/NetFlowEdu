# Phase 70 — Concept Mastery Map

## Repository Sync

Repo present at `/Users/mertcankurt/NetFlowEdu`, remote confirmed
`git@github.com:MCK08/NetFlowEdu.git`. Local HEAD was `874b08f` (Phase 67) and
strictly behind by 2; fast-forwarded with `git pull --ff-only` to `64258a5`.
Post-sync: **0 0**, worktree clean, `64258a5` an ancestor of HEAD.

Phase-number check: latest doc on disk was `PHASE69_MULTI_MODE_SESSION_CONTINUITY.md`
and no `PHASE70_*` existed. This is genuinely Phase 70.

## Starting Baseline

`64258a5` — Phase 69 Multi-Mode Session Continuity.

## Product Goal

Make NetFlowEdu's existing learning intelligence **visible**: where evidence is
trustworthy, where struggle repeats, where recovery is happening, where evidence
is thin, and where review has come due — without a single invented number.

## Existing Evidence Architecture

Nothing new was measured. Every input already existed:

| Source | Role |
|---|---|
| Phase 41 `resolveOutcomeHistory` | Trustworthy counters, or `null` — never zero |
| Phase 42 `buildLearningState` | The ONLY classifier of one question's history |
| `reviewScheduler` → `nextReviewAt` | The only authority on review timing |
| `LearningInsightItem` | subject, topic, status, lastOutcome, successfulReviews |

## Data Source

`useLearningInsights().items` — the bounded `getAllStudyItems` (cap 500) plus
the shared question-metadata cache, already mounted by the Study Hub. The map is
a **pure in-memory derivation** of that array.

No per-topic query, no per-concept read, no `studyEvents` scan, no listener.

## Firestore Read Cost

| Surface | Incremental reads |
|---|---|
| App startup | **0** |
| Student Feed | **0** |
| Study Hub (entry card) | **0** — derived from items the Hub already holds |
| Concept Map open | **0 incremental** — the screen mounts the same existing hook |
| Per concept | **0** |
| Per subject | **0** |
| New writes / listeners / polling / indexes / functions / rules | **0** |

N+1: **none**. Aggregation is one pass over items into a Map, then two sorts —
`O(n)` plus `O(k log k)` on concepts.

## Concept Identity

`subject + topic`, keyed `` `${subject}|${topic}` `` — the exact convention
Phase 62's `buildReviewReadyTopics` already uses.

Normalisation is `trim()` only. No fuzzy matching, no semantic similarity, no
question-text parsing: "Denklemler" and "Birinci Dereceden Denklemler" stay
distinct, because canonical metadata says they are distinct. A question missing
either field is **omitted**, never bucketed under an invented "unknown" heading —
grouping unrelated questions together would fabricate a relationship.

## Aggregation Policy

Ordered checks, most conservative first, so risk is never averaged away:

| Presentation | Condition | Student sees |
|---|---|---|
| needs_attention | any `persistent_struggle` | "Tekrar eden zorlanma" |
| recovering | any `recovering` | "Toparlanıyor" |
| watch | any `one_off_struggle` | "Tek zorlanma görüldü" |
| steady | `stable × 2 > questionCount` | "İstikrarlı" |
| needs_evidence | otherwise (default) | "Daha fazla kanıt gerekiyor" |

Two rules do the real work:

- **One unresolved struggle stays visible.** It is checked first, so nine stable
  questions cannot dilute it. Asserted directly.
- **"Steady" requires a majority.** 1 stable + 4 unknown is `needs_evidence`, and
  an exact half is too. Calling that concept learned would be the same overclaim
  Phase 42 refuses to make about a single question.

These are presentation categories derived from Phase 42, not a second
classifier, and none of their names ever reaches the screen.

## Phase 42 Relationship

`buildLearningState` is **called, never redefined**. No competing state, no
`conceptLearningStateV2`, no threshold of this module's own.

## Evidence Coverage

Coverage is stated as counts and never as a rate:

> "5 sorudan 1 tanesinde yeterli öğrenme kanıtı var."

There is no `masteryScore`, `masteryPercent`, `strengthScore`, `confidenceScore`,
`retentionScore`, percentage, or 0–100 anywhere in the phase. Asserted by test
that no rendered copy matches `%`.

## Legacy / Partial Evidence Honesty

Phase 41's completeness rule is deferred to, not re-derived. A `null` history
counts toward `unknownEvidenceCount` and classifies as `insufficient_data`; it
can never read as "no struggles" and can never strengthen a concept.

Verified at runtime with Student D (6 attempts, no counters): the map says
**"Daha fazla kanıt gerekiyor · Henüz yeterli öğrenme kanıtı yok."** — not 0
struggles, not stable, not 100%. The summary chips are correctly absent rather
than showing a hollow "0 konuda öğrenme kanıtı".

## Review Readiness

`item.status !== "mastered" && item.nextReviewAt <= now`. That is the scheduler's
own verdict — no second scheduler, no day threshold, no client-side
"if lastReviewed > X". Boundary asserted exactly at `now` and `now + 1`.

Shown as one line, only when something is genuinely due: "Tekrar zamanı geldi."

## Information Architecture

Three levels, as specified:

1. **Orientation** — "Öğrenme Haritam", one subtitle, and a compact row of
   factual chips ("5 konuda öğrenme kanıtı", "1 konuda tekrar eden zorlanma",
   "2 konuda tekrar zamanı"). Only non-zero facts render. No hero, no gauge, no
   overall score.
2. **Subject regions** — a short cyan brand bar, the subject name, and its
   concept count.
3. **Concepts** — topic, state, ONE supporting fact, and the review line when
   it applies. Never a dump of raw counters.

## Professional Design Direction

**Flow, not a card wall.** Concepts inside a subject sit on a single connected
rail: a node marker per concept, a thin connector between them. That is the
argument of the screen — a subject is a region the student moves through, and a
stack of identical bordered boxes would say nothing about how the parts relate.
The connector is purely decorative and the screen is complete without it.

**Brand without a poster.** The logo is never pasted into the page. Its language
appears as a small cyan region bar, controlled blue/cyan accents, clean geometry
and generous spacing. No large N graphics, no gradient on every card — no
gradients at all, in fact; restraint read better than decoration here.

**Colour is never the message.** Every state carries an icon *and* a text label;
the accent only reinforces the words. Attention is a small dot and a short
phrase, not a red banner with a warning triangle — a student who keeps
struggling needs to see it, not be alarmed by it. `needs_evidence` is neutral
rather than greyed into irrelevance.

Raw-colour audit on all three new UI files: **zero** hex, `rgb(`, `"white"` or
`"black"` — every colour is a semantic theme token, so both themes follow
automatically.

## Study Hub Integration

One restrained row placed directly beside "İlerleme Hikâyem", matching that
card's existing visual language rather than inventing a second one. The two
belong together: the story says how learning has changed, the map says where the
evidence stands. Both sit above the work sections so neither competes with the
next-action card.

Its subtitle is a real reason to tap ("1 konu · 1 konuda tekrar eden zorlanma")
and falls back to a plain description when there is nothing to count — it never
shows a hollow "0 konu".

Nothing else in the Hub was redesigned, removed or re-ordered.

## Concept Map UX

Its own route, `/(student)/study/mastery-map`, rather than another Hub section.

Concept rows are **not** interactive and there is no per-concept CTA. There is no
concept-targeted study session to route to, so "Denklemleri Çalış" would be a
button that could not keep its promise. One canonical action closes the screen:
"Çalışmaya Devam Et" → the existing adaptive session, the same destination
Learning Story and the Hub's next-action card already use.

No detail sheet was added: the row already carries topic, state and one fact,
and a modal would have been more surface without more truth.

## Empty / Loading / Error States

- **Empty** — "Çalıştıkça öğrenme haritan burada oluşacak" / "NetFlowEdu, çözüm
  ve tekrarlarından gerçek öğrenme kanıtları oluşturur." with the canonical
  study CTA. Never "No data".
- **Loading** — two existing `LoadingSkeleton` blocks, no full-screen spinner and
  no new dependency.
- **Error** — a distinct `accessibilityRole="alert"` banner titled "Harita şu an
  yüklenemedi". Deliberately worded so a backend failure can never be mistaken
  for "not enough evidence yet": one is our problem, the other is a statement
  about the student.

## Accessibility

Each concept is one accessible element read in the required order — **topic →
state → supporting fact → review note** — verified live:

```
"Kuvvet. Toparlanıyor. Zorlandıktan sonra çözüm kanıtı var."
"Optik. İstikrarlı. 2 soruda istikrarlı çözüm kanıtı var. Tekrar zamanı geldi."
```

The decorative rail is `accessibilityElementsHidden` +
`importantForAccessibility="no-hide-descendants"`, so connectors never clutter
screen-reader output. Colour-only meaning: **none**. The Hub entry is a real
`Pressable` with `accessibilityRole="button"`, a full label, and `minTouchTarget`.

## Light / Dark

Verified at 375px in both themes. All colour flows from semantic tokens, so the
dark palette's deep navy surfaces and lighter state accents apply automatically;
state labels stay legible against both grounds.

## Responsive

375px (primary target), 1280px desktop, and 150% zoom all verified: no
horizontal overflow, no clipping, no fixed-height nodes. On desktop the content
is capped at 680px and centred — the extra width buys breathing room, not extra
analytics. At 150% the rail connector grows with the row because it is anchored
`top`/`bottom` rather than given a fixed height.

## Runtime Personas

Read from actual current emulator evidence, not historical numbers:

| Persona | Fixture evidence | Map result |
|---|---|---|
| A | 2 items, both struggled ≥2, no standing solve | **Tekrar eden zorlanma** · "2 soruda zorlanma tekrar etti." ✓ |
| B | worst item has struggledCount **1** | **Tek zorlanma görüldü** — see below |
| C | 1 item, 5 solves, 0 struggles | **İstikrarlı** · "Bir soruda istikrarlı çözüm kanıtı var." ✓ |
| D | 6 attempts, **no counters** | **Daha fazla kanıt gerekiyor** · "Henüz yeterli öğrenme kanıtı yok." ✓ |

**Student B fixture is unsuitable for concept-level recovery, and this is
reported rather than worked around.** Phase 42 `recovering` requires
`struggledCount >= 2` *and* a standing solve; B's fixture has exactly one
struggle, which is correctly `one_off_struggle`. B is "recovering" in the Phase
44B intervention-effectiveness sense, which is a different question. The
recovering path was instead demonstrated with temporary emulator-only data
(below) and is covered by unit tests.

To exercise the flow rail, multiple subjects and all five states, temporary
emulator-only items were added and then removed. That run rendered:

```
5 konuda öğrenme kanıtı · 1 konuda tekrar eden zorlanma · 2 konuda tekrar zamanı

Fizik      2 konu
  Kuvvet     Toparlanıyor        Zorlandıktan sonra çözüm kanıtı var.
  Optik      İstikrarlı          2 soruda istikrarlı çözüm kanıtı var.
                                 Tekrar zamanı geldi.
Kimya      1 konu
  Asitler    Daha fazla kanıt…   5 sorudan 1 tanesinde yeterli öğrenme kanıtı var.
Matematik  2 konu
  Geometri   Tekrar eden zorlanma  Bir soruda zorlanma tekrar etti.
                                   Tekrar zamanı geldi.
  Denklemler Tek zorlanma görüldü  Bir soruda zorlanma görüldü.
```

The Kimya row is the mandatory honesty case live: **1 stable + 4 legacy did not
become "İstikrarlı"**. Ordering also held — Geometri (attention) leads
Denklemler (one-off), and subjects are alphabetical.

Empty state verified with a temporary emulator-only user holding zero study
items. All temporary data — 10 items, 10 questions, and the temporary auth user
and profile — was removed with an existence check: **0 leftovers, 0 stray items,
auth user gone, `demo-student-b` back to its canonical 3 items**.

## Query Audit

See *Firestore Read Cost*. No new collection, field, function, rule, index,
write, listener, polling, persisted mastery or analytics record was created.

## Regression

Phases 42, 45, 46, 59, 61, 62, 63, 64, 65, 66, 67, 68, 69, Daily Flow, Learning
Story, Student Feed and every teacher surface are **untouched by diff** — the
change set adds files and makes one additive insertion into the Study Hub. Full
suite green. No teacher heatmap, no prerequisite graph, no XP/badges/streaks: the
phase is the student concept map only.

## iOS Decision

| Gate | Answer |
|---|---|
| New native dependency / package | NO |
| New native configuration | NO |
| New native permission | NO |
| New platform-specific API | NO |
| New native-only storage | NO |
| New native-only navigation behaviour | NO |
| New gesture / native animation | NO |
| Safe-area or native layout unverifiable on Web | NO |
| Confirmed native-only bug | NO |

**NATIVE IOS: NOT REQUIRED THIS PHASE.** Phase 70 is implemented with existing
shared React Native / TypeScript / theme / Expo Router infrastructure and has no
native-specific behavioural change.

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | 155 suites / 2754 tests (+1 suite / +48) |
| rules | 5 suites / 365 tests (unchanged) |
| functions build | PASS |
| verify | PASS |
| expo-doctor | 17/18 (known pre-existing drift) |
| `git diff --check` | PASS |

## Source Integrity

All nine touched files: **0 NUL bytes**, valid UTF-8, LF-only, no conflict
markers, and `git diff --numstat` reports real line counts rather than binary
markers. No `console.*`, `debugger`, TODO markers or temporary QA UI.

Note: `.expo/types/router.d.ts` is a gitignored build artifact; it regenerates
when the dev server runs and is what made typecheck briefly reject the new route
before the server started.

## Known Limitations

- **Concept identity is exactly the canonical `subject|topic` pair.** A curriculum
  that spells the same idea two ways will show two concepts. Merging them would
  require fuzzy matching, which is explicitly out of scope and would fabricate
  relationships the metadata does not assert.
- **Questions with no subject or topic are invisible on the map.** They still
  count everywhere else in the product; there is simply no honest place to put
  them here.
- **No concept-targeted CTA**, because no concept-targeted session exists. The
  single canonical action is the existing adaptive session.
- **No detail view.** The row carries everything the evidence supports; a sheet
  would add surface without adding truth.
- **Student B's fixture cannot demonstrate concept-level recovery** (see *Runtime
  Personas*); that state was verified with temporary data and unit tests.
- `getAllStudyItems` is capped at 500 items, so a student beyond that cap would
  see a map built from the first 500. That cap is pre-existing, not introduced
  here.

## Final Product Assessment

The intelligence was already in the codebase; what was missing was a place for a
student to *see* it. The discipline this phase required was almost entirely
subtractive — refusing a percentage, refusing a second classifier, refusing a
second scheduler, refusing to let four unknowns round up to "learned".

What makes it read as a map rather than a stats page is that the conservative
rules are visible in the output: a concept with one lingering struggle says so
even when everything around it is solid, and a concept with one solve among four
unknowns admits it does not know yet.
