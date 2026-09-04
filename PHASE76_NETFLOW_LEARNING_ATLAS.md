# Phase 76 — NetFlow Learning Atlas

## Repository Sync

Baseline `ec708db` (Phase 75). Remote `origin/phase17-moderation-infrastructure-20260806-195814`
was identical (`0 0`), worktree clean, `git merge-base --is-ancestor ec708db HEAD` held. Nothing
pulled. No `PHASE76*.md` existed.

## Runtime Emulator Safety

`.env` untouched (still `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=false`); Expo launched with the flag
exported at the shell, which `config.ts` reads through bracket access precisely so the shell wins
over the bundled snapshot.

Proven **before any credential was entered**: the live runtime read the flag as `"true"`; the app
rendered at all, which the fail-closed guard in `config.ts` makes proof that Auth bound to the
emulator; and the only auth traffic went to `127.0.0.1:9099`. Enumerating every resource the page
had fetched, the sole non-local host was `www.gstatic.com` (a static SDK asset). Firestore was
confirmed on the first authenticated screen: all Firestore traffic to `127.0.0.1:8080`.

**No production Auth or Firestore endpoint was contacted at any point in Phase 76.**

## Starting Baseline

`ec708db`, branch `phase17`, clean.

## Product Mission

One surface where a student can see how the signals the product already trusts sit together right
now — with what NetFlowEdu is currently pointing at placed inside that landscape, a way to change
perspective, and the real ordered motion behind any concept they open.

## Why Atlas Is Not Concept Map

The Concept Mastery Map answers one question: where does my evidence stand. It has no notion of
what to do now, no way to change perspective, and no chronology — by design, because Phase 70
deliberately stopped there so four surfaces would stay four distinct answers.

The Atlas adds exactly the things Phase 70 refused to bolt on, and composes rather than
duplicates: the **Şimdi** focus (the canonical Daily Flow decision, placed in the landscape),
**evidence lenses** (perspective, not new state), **learning motion** (Phase 59's real ordered
events per concept), and a **spatial composition** instead of a per-subject list. Every concept
verdict, label and supporting sentence on it is Phase 70's, carried in unchanged.

## Verified Evidence Sources

| Meaning | Source |
| --- | --- |
| Concepts, states, labels, facts, review note | Phase 70 `buildConceptMasteryMap` |
| Repeated-struggle patterns | Phase 71 `buildStrugglePatternMemory` |
| Ordered learning motion | Phase 59 `selectTopicTrail` over `studyEvents` |
| Review readiness | Phase 62, via `ConceptNode.dueCount` |
| What to do now | Daily Flow `resolveStudentNextAction` + `nextActionCopy` |

## Phase 70 Reuse

`learningAtlas.ts` calls `buildConceptMasteryMap` and carries the resulting `ConceptNode` on each
Atlas node, plus `conceptStateLabel`, `conceptSupportingFact` and `conceptReviewNote` verbatim. It
re-derives nothing: there is no second aggregation, no second presentation rule, and no place
where the Atlas could disagree with the map about a concept.

## Phase 71 Reuse

`buildStrugglePatternMemory` is called once and its patterns indexed by concept. Phase 71's own
cap on how many patterns it reports is respected rather than widened — a concept without an entry
means "no pattern was surfaced", which the node type says explicitly, not "no difficulty exists".

## Phase 59 Learning Motion

Events come from `useLearningTrail`, the same bounded query Struggle Pattern Memory uses, and are
ordered and capped by `selectTopicTrail` — not by anything in this phase. The limit was not
raised. Events are bucketed by concept in one pass so no concept re-scans the window.

Motion is never synthesised from cumulative counters, which carry no order at all. `again`
survives as `Tekrar Çalıştım` and is never rewritten as struggle. The caption is
`Son öğrenme kayıtlarında` — the window, never a whole history.

## Phase 62 Review Readiness

Due-ness is `ConceptNode.dueCount`, which is `nextReviewAt <= now` plus Phase 62's mastery gate.
This phase contains no threshold, no interval and no calendar bucket. A concept with no due data
is never declared "not ready" — it simply carries no review line.

## Daily Flow Relationship

Daily Flow still decides. The Atlas restates that decision through the same `nextActionCopy` the
Study Hub uses, so the two can never drift into two wordings of one answer, and it attaches the
decision to a concept **only** for the two action kinds that genuinely name a subject and topic
(`continue_assignment`, `struggled_topic`). For a due-review batch, adaptive practice over legacy
questions, a goal top-up or nothing-to-do, the action is shown and the attachment is dropped —
verified at runtime, where a `due_review` focus correctly highlighted no node.

## Atlas Domain Model

`buildLearningAtlas({items, events, nextAction, focusCopy, now})` → `{focus, regions, lensCounts,
totalConcepts, conceptsDue, conceptsNeedingAttention, isEmpty, hasNoRecentMotion}`.

Cost is O(i + e + c log c): one pass over items (inside Phase 70), one pass to bucket events, then
Phase 70's own per-subject sorts. Deterministic — proven by an input-permutation test.

No new classifier: `AtlasLens` is a filter over presentation values that already exist. No new
scheduler. No score, percentage, risk, momentum or confidence field anywhere — asserted by a test
that greps the node's own keys.

## Concept Identity

`subject|topic`, Phase 70's key unchanged. A question whose metadata never resolved has `""` for
both and belongs to no concept, so it is skipped rather than grouped under an invented "unknown"
heading — the same rule Phase 62 and the practice plan already apply.

## Connection Semantics

Grouping and reading order. Nothing else. The spine, the elbows and the stagger are decorative,
hidden from assistive technology, and every row is complete without them.

## Prerequisite Graph Audit

Searched the app and Cloud Functions source for `prerequisite`, `requires`, `dependsOn`,
`parentConcept`, `childConcept`, `conceptGraph`, `skillGraph`, `curriculumNode` and learning
objective dependencies. **No authored curriculum relationship exists anywhere.** `Question`
carries flat `subject`, `topic` and `gradeLevel` labels and nothing relational.

## Why No Fake Curriculum Graph Exists

Because the data to back one does not exist, and a line implying "Denklemler unlocks Fonksiyonlar"
would be the product asserting a pedagogical claim it cannot support. The domain model therefore
exposes **no edge type at all** — tests assert that no node carries a `prerequisite`/`parent`/
`unlocks`-shaped field and that the Atlas carries no `edges`/`links`/`graph` collection, so a
future screen cannot accidentally render one.

## Şimdi Focus

Canonical `resolveStudentNextAction`, restated with the Hub's own copy. Attachment rules above.
The Atlas mounts the assignments hook deliberately: assignments outrank everything else in that
function, and resolving the focus without them would let the Atlas point at a different "now" than
Daily Flow — worse than paying for the query.

## Evidence Lenses

Genel / Zorlanma / Toparlanma / Tekrar, with live counts on each control.

Struggle includes both repeated and one-off, because each node carries Phase 70's own label, so a
one-off reads as "Tek zorlanma görüldü" and can never be mistaken for repetition — excluding it
would hide real evidence, relabelling it would overstate it. Recovery is Phase 42's `recovering`
verdict only: a trail that merely ends on a solve is not recovery, and there is a test for exactly
that. Review is canonical due-ness only. Lenses mutate nothing — asserted by a test that compares
the regions before and after filtering.

## Learning Motion

Up to Phase 59's own `MAX_TRAIL_EVENTS` steps, oldest → newest, shown only inside an opened
concept. Verified at runtime on a concept whose real window read
`Zorlandım → Tekrar Çalıştım → Zorlandım`.

## Review Horizon

A due concept carries a `Tekrar` tag and Phase 70's `Tekrar zamanı geldi.` line, and its action
becomes `Tekrarlarını Aç`. No next-review timestamp is rendered and no calendar bucket was added —
neither was needed to answer the question, and both would have been new presentation surface over
the scheduler.

## Information Architecture

Route `/(student)/study/learning-atlas`. Deep-linkable: it mounts its own hooks and depends on no
warm Study Hub state.

## Study Hub Integration

Option A from the brief. The Atlas takes the slot the Phase 70 concept-map row held, because it
composes that map — two rows a thumb apart, one a strictly larger version of the other, would have
made the student choose between a screen and its own superset. Öğrenme Haritam keeps its route,
its service and its tests, and is one tap away from inside the Atlas via "Konu Haritasını Gör".
Pattern Memory keeps its route and is reached from an opened concept that actually has a pattern.
The now-unreferenced `ConceptMapEntryCard` component was removed rather than left as dead code.

İlerleme Hikâyem stays: it answers how learning has changed over time, which the Atlas does not.

## Concept Selection

Inline progressive disclosure. The detail shows the ordered motion, the canonical review line, one
Phase 71 pattern sentence, and existing-route actions only. It does not reproduce the Concept Map,
Pattern Memory or Learning Story.

## Professional Visual Direction

Not a card list: an unselected concept has no fill, no border and no shadow — it is content
hanging off the flow. A surface appears only when a concept is opened or is the current focus,
which is exactly when the extra weight means something.

## N Geometry

A continuous spine with markers, and connectors whose **reach alternates**, so the column resolves
into two implied verticals joined by angled links — the mark's own geometry used as layout rather
than stamped on as decoration. On a wide viewport the alternation moves to the *side* of a centred
spine, which is what makes the desktop Atlas a two-sided composition.

## Mobile Atlas

375px: spine at the left, alternating elbow reach, region labels riding the spine so the flow runs
unbroken from one subject into the next. Verified light and dark, sparse and dense.

## Desktop Atlas

Above 760px the spine centres and concepts alternate across it, with a real spacer holding each
half so the spine cannot drift as topic names change length. The measure is a deliberate 880 —
wider than `contentWidth.readable` because this is the one screen that uses horizontal room as
meaning rather than as line length, and nowhere near the full monitor.

## Light Mode

Clean neutral ground, hairline spine, soft-blue structure. Not a pastel dashboard.

## Dark Mode

Deep navy ground, elevated navy on the opened concept, controlled brand blue for focus, selection
and lens state only. No glow, no neon.

## Accessibility

Every node announces topic, state, fact, review line, whether it is the current focus, and whether
its detail is open — as one sentence, in reading order. Connectors are hidden on both platforms.
The lens control uses tablist/tab semantics with each option's count in its label. Touch targets
meet the product minimum. Colour is never the message: every state carries an icon and Phase 70's
own text label.

Two real defects were found and fixed during QA: react-native-web silently drops
`accessibilityState.expanded` (verified in the DOM), so the open/closed state now also lives in the
label text and in an explicit `aria-expanded`; and the detail's action buttons were nested inside
the node's own Pressable, which react-native-web renders as a `<button>` inside a `<button>` —
invalid HTML that React reports as a hydration error. The toggle and the detail are now siblings.

## Empty / Loading / Error

Empty Atlas: "Çalıştıkça öğrenme atlasın burada oluşacak" with the product's own explanation and a
canonical CTA — verified at runtime. An empty *lens* says what was looked for
("Şu anda tekrar zamanı gelen bir konu yok."), never praise, and is tested against a list of
overclaim words. A technical failure keeps Phase 75's rule: its own banner, and the empty state is
suppressed while it stands. One concept is enough to render a meaningful Atlas.

## Query Cost

App startup incremental: **0**. Study Hub incremental: **0** (the entry row reads the concept map
the Hub already builds in memory). Atlas open: the same hooks the Study Hub mounts — study items,
the summary listener, assignments — plus Phase 59's one bounded event query. Per concept, per
subject, per node: **0**. New writes 0, listeners 0, polling 0, N+1 none. New collections,
Functions, indexes and rules: **0**.

## Runtime Personas

Student A (canonical): 1 concept, persistent struggle, focus attached to it — the sparse case.
With temporary evidence: 7 concepts across 3 subjects, focus `due_review` correctly attaching no
node, lens counts 7/3/1/2, recovery lens showing only the Phase 42 recovering concept, and a
concept whose real motion read `Zorlandım → Tekrar Çalıştım → Zorlandım`.

Student D was verified by **fixture-exact unit tests** rather than on screen: the emulator session's
auth bootstrap wedged after browser storage was cleared mid-session, and debugging a dev-environment
condition was not worth the phase's remaining budget. The tests reproduce the seed's Student D row
field-for-field (attemptCount 6, counters genuinely absent) and assert the concept appears, reads
"Daha fazla kanıt gerekiyor", reports unknown rather than zero evidence, states no "0", claims no
mastery, sits under no evidence lens, and shows no fabricated motion.

The Study Hub entry row is likewise build-verified (typecheck, lint, full suite) rather than
runtime-verified, for the same reason.

## Temporary QA

Six temporary questions, six study items and seven events, all prefixed `qa76-`, written by a
script kept outside the repository. Cleanup verified programmatically: **0 leftover `qa76`
documents**, canonical fixtures intact (5 questions, Student A's 2 study items and 3 events). No
temporary auth user, assignment or intervention was created. The temporary script is not in the
repository.

## Regression

Phases 42, 45, 46, 59, 61–75 untouched by the diff: no classifier, scheduler, counter, rules,
intervention, session-continuity or hint file appears in it. Student Feed zero diff. Hint Ladder
zero diff. Teacher surfaces zero diff. Full suite green at 163 suites / 3013 tests.

## iOS Decision

New native dependency **NO** · native package **NO** · native config **NO** · native permission
**NO** · native-only API **NO** · new native gesture **NO** · new native animation package **NO** ·
native-only storage **NO** · native-specific navigation **NO** · confirmed native-only defect
**NO**. The Atlas is built from existing React Native primitives, the existing icon set and the
existing theme; `react-native-svg` is installed but was deliberately not used, because a rotated
rule renders the connectors on every platform with no dependency at all.

**NATIVE IOS: NOT REQUIRED THIS PHASE.**

## Automated Validation

typecheck PASS · lint PASS · unit 163 suites / 3013 tests (+1 suite / +54) · rules 5 suites / 370
tests · functions build PASS · verify PASS · expo-doctor 17/18 (known pre-existing drift) ·
`git diff --check` PASS.

## Source Integrity

No binary source, no NUL bytes, valid UTF-8, LF-only. Zero raw colour literals and zero debug
instrumentation in any new file. No temporary QA artefact in the repository. `.env`, lockfiles,
`firestore.rules`, `app.json`, `routing.ts` and `main` untouched.

## Known Limitations

- Student D and the Study Hub entry row are covered by tests and the build rather than by a
  screenshot, for the reason stated above.
- The Atlas pays the Study Hub's read set on open, rather than the brief's preferred "0 or one
  bounded query". The assignments hook is the cost, and it buys the guarantee that the Şimdi focus
  is the same answer Daily Flow gives.
- A concept without a Phase 71 pattern entry may still have repeating difficulty; Phase 71's cap is
  respected rather than widened, and the node type documents that null means "not surfaced".
- Concepts are grouped by subject only. There is no relationship between them because none is
  authored, and the Atlas will stay flat until real curriculum metadata exists.
- The wide layout engages at 760px; between roughly 680 and 760 the Atlas is a single column on a
  slightly wider measure.

## App Store Screenshot Assessment

Yes for the dark mobile Atlas and the desktop two-sided composition. Both were iterated to get
there: the first build was rejected against the brief's own generic-card gate and rebuilt without
card fills, and the first desktop attempt mirrored whole rows and produced two edge spines instead
of one centred one.

## Product Differentiation Assessment

Hard to mistake for another EdTech product: no levels, no unlock path, no XP, no charts, no KPI
tiles, no gauges. What is on screen is a flow with the product's own evidence vocabulary on it,
built from the brand mark's geometry.

## Final Product Assessment

The Atlas is a composition layer that adds no intelligence and removes no honesty. It knows
nothing Phase 70, 71, 59, 62 and Daily Flow did not already know — it is the first place a student
can see all five at once, and the first place the product's own geometry is doing the explaining.
