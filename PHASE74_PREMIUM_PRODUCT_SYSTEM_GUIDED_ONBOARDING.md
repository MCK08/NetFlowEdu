# Phase 74 — Premium Product System + Guided Onboarding

## Repository Sync

Baseline `0244784` (Phase 73 — Teacher Action Center + Class Concept Heatmap). Fetched
`origin/phase17-moderation-infrastructure-20260806-195814`; local and remote were identical
(`0 0`), the worktree was clean, and `git merge-base --is-ancestor 0244784 HEAD` held. Nothing
was pulled because there was nothing to pull. No `PHASE74*.md` existed remotely.

## Starting Baseline

`0244784`, branch `phase17`, clean.

## Product-Wide Visual Audit

The audit's first finding is the one that shaped the whole phase: **NetFlowEdu already has a
design system, and it is a good one.** Phase 12A named the tokens, Phase 49 made the dark
palette actually reachable at runtime (`themedStyles` + the `colors` proxy), and Phase 52
replaced the blues with values sampled from the logo's own pixels. `spacing`, `radius`,
`typography`, `shadows`, `sizes` and `animation` all exist as disciplined scales, and 149 of
the 160 style-bearing components already use `themedStyles`.

So Part C of this phase's brief — "build a visual system" — was largely answered by *verifying*
one, not by authoring a second. Inventing new token families on top would have been the single
biggest way to make the product less coherent, not more.

What the audit did find were three real, measurable incoherences:

**1. `MAX_CONTENT_WIDTH = 680` was copy-pasted into five files**, and a sixth screen
(Teacher Learning Story) used `760` with no shared source. A constant that is duplicated is a
constant that only *some* screens get.

**2. Three of the most important screens had no desktop measure at all.** The Study Hub, Class
Performance and Student Performance ran edge-to-edge on a wide window — while the Concept
Mastery Map, Struggle Pattern Memory and Learning Story that they link to stayed capped at 680.
Navigating out of the student's own home visibly changed the width of the product.

**3. `typography.displayLg` was being used for two different jobs**, so screens overrode it in
place. The same semantic element — the screen title — rendered at **28pt** on the Phase 70–73
surfaces, **26pt** on the Study Hub and Classes, **24pt** on the teacher dashboard, Student
Performance and Notifications, and **22pt** on Class Detail. Four sizes for one role.

Things the audit checked and found already sound, and therefore did not touch: raw-colour usage
(the remaining literals are the deliberately always-dark immersive feed, modal scrims, and
`BrandMark`'s documented `onDark` wordmark), `StyleSheet.create` theme-freezing (the four
remaining uses hold no colours), spacing values, radius proliferation, icon family, and
elevation.

## Surfaces Classified A/B/C/D

**A — already at the Phase 70–73 bar (left alone):** Concept Mastery Map, Struggle Pattern
Memory, Session Reflection, Question Detail / Hint Ladder, Teacher Action Center, Class Concept
Heatmap, Student Feed, Learning Story, auth screens.

**B — functionally good, visually inconsistent (fixed):** Study Hub (uncapped, undersized
title), Class Performance (uncapped), Student Performance (uncapped), Teacher Learning Story
(its own 760 measure).

**C — legacy/generic:** none found among the surfaces this phase prioritised. The older chat,
notifications and public-profile screens carry their own type overrides, but they are outside
the priority list and do not sit on the student or teacher learning paths.

**D — broken:** none.

## Visual System Decisions

Two additions, both promotions of something the codebase was already doing by hand.

## Theme Tokens

`src/theme/layout.ts` — `contentWidth.readable` (680) and `contentWidth.form` (440). Neither is
a new number: `readable` is what the Phase 70–73 screens were built and QA'd at, `form` is
AuthShell's existing width. Two roles rather than one, because prose columns and credential
forms genuinely want different measures.

No colour token was added. The palette already covers surface/border/text/brand/feedback, and
the audit found no role missing.

## Typography

`typography.screenTitle` (28/34) — the role, split out of the size. `displayLg` stays as the
display scale that stat figures build from; `screenTitle` is what a screen's h1 reaches for, so
a screen that feels "displayLg is too big for me" now has something to *use* rather than a
number to tune. 28/34 is not a new value — it is what the Concept Map, Pattern Memory, Learning
Story and every auth screen already render.

Adopted on the Study Hub (26 → 28). Deliberately **not** swept across every screen that
currently overrides: Class Detail and the public profile put a variable-length *name* in that
slot, where enlarging the type is a layout change rather than a token change, and Phase 74's
priority list does not include them.

## Spacing

Unchanged. The existing 4/8/12/16/20/24/32/40 scale covers every new surface; no new step was
needed and none was added.

## Radius

Unchanged. `radius.xl` for the tour card (matching `Card`), `radius.pill` for the step track.

## Shared Primitives

**Added: `StepTrack`** — the segmented progress bar, extracted from `OnboardingProgress` so the
guided tour renders the *same* bar rather than a second one that merely looks similar. Only the
track moved; `OnboardingProgress` keeps its counter and step name, which are specific to the
account-provisioning flow's named steps. `StepTrack` has no domain types at all, which is what
makes it safe for both to share.

**Reused rather than rebuilt:** `BrandLockup`, `PrimaryButton`, `Card` vocabulary,
`SectionHeader`, `themedStyles`, the whole token set.

**Deliberately not abstracted:** ScreenHeader, ProductSurface, StatusPill, EvidenceFact,
EmptyState wrappers, PrimaryAction/SecondaryAction. Each would have been a new abstraction over
surfaces that are already consistent, or over ones whose differences are meaningful (the
teacher status pills and the student concept pills encode different vocabularies and must not be
collapsed). The extraction gate — two or three real surfaces sharing a semantic pattern *and*
the abstraction simplifying — was met by `StepTrack` and by nothing else.

## Student Polish

**Study Hub:** capped to the shared reading measure and given the `screenTitle` role. These are
the two changes that make the Hub read as the same product as the screens it opens.

**Concept Mastery Map, Struggle Pattern Memory:** local constant swapped for the shared token.
Zero visual change — verified at runtime (11 and 7 boxes still measure exactly 680).

**Learning Story:** same swap, zero visual change.

**Session Reflection, Question Detail / Hint Ladder:** untouched. Both are at the bar.

## Teacher Polish

**Class Performance, Student Performance:** capped to the shared measure — header, skeleton and
scroller alike. Phase 73's Action Center and Heatmap are untouched.

**Teacher Learning Story:** 760 → 680, so a teacher moving between the class story and a
student's own story no longer sees the column change width.

**Intervention composer, question authoring:** untouched. Neither reads as legacy, and §36/§37
are explicit that polish is conditional on that.

## Student Feed Decision

**Zero diff.** `FeedScreen.tsx` keeps its own local `MAX_CONTENT_WIDTH` copy. Deduplicating a
constant is not a visual inconsistency, and the phase brief's instruction to prefer no change
outranks tidiness on the one surface whose pager behaviour is the most fragile thing in the app.
The tour is mounted at the root layout specifically so that nothing had to be added to the feed
to introduce the product.

## Auth / First Impression

Audited and found already strong: `AuthShell` gives every signed-out screen one layout, one
`KeyboardAvoidingView`, one `ScrollView`, the brand lockup and a 440 measure. The only change is
that its inline `440` now reads `contentWidth.form`.

No Firebase Auth architecture, routing or form behaviour was touched.

## Student Onboarding

Three cards, in the product's own voice:

1. **Kendi akışında çalış** — assignments, review and free practice share one flow; an
   unfinished session resumes.
2. **Çözümlerin öğrenme kanıtına dönüşür** — every answer and repeat is recorded, and where the
   evidence is not sufficient the product says so rather than guessing.
3. **Zorlandığın yerler geri gelir** — the map and the review suggestions are built from that
   evidence, and a one-off mistake is shown separately from a repeated struggle.

The copy rules are enforced by test: no "garanti", no "yapay zekâ", no "anlar"/"bilir"/"tahmin
eder", no percentages. The tour introduces the vocabulary the rest of the app actually uses
("kanıt", "tekrar eden zorlanma") rather than marketing synonyms the student then never sees.

Skip is available on every step. Completion and skip record the same thing — re-showing the tour
to someone who skipped would make the skip button a lie.

**Backend writes: 0.**

## Teacher Onboarding

1. **Sınıfının öğrenme sinyalleri tek yerde**
2. **Tekrar eden zorlanmayı ayırt et** — including that insufficient evidence is shown as
   insufficient, never counted as success.
3. **Öne çıkan aksiyonlara geç** — naming the Action Center by what it does.

Same skip, same persistence, same zero backend cost.

## Onboarding Persistence

`AsyncStorage` under `netflowedu.onboarding.tour.v1`, following `themeStorage` and
`activeStudySessionStorage` exactly: a pure module (`guidedTour.ts`) holding every decision, a
thin never-throwing wrapper (`guidedTourStorage.ts`) holding the I/O, and a serialised write
queue because the Profile replay row can fire while a completion write is still in flight.

**On the name.** This repo already has an "onboarding": `OnboardingStatus`
(pending/provisioning/complete) is the *server's* account provisioning stage that RouteGuard
blocks on. Every symbol here says `guidedTour` instead, and the storage key is namespaced under
`onboarding.tour`, so the two can never be confused in a grep.

**Why this is not a route.** `decideRouteGuardTarget` is the app's most safety-critical
function — exhaustively tested against a state × screen matrix and a redirect-loop simulator,
and driven by synchronous auth state. Feeding it an asynchronously-loaded local value would
create a window where the answer is genuinely unknown, and every way of filling that window is
bad: route to the tour and a returning user sees it flash, route home and a new user sees home
flash first, or block and every cold start waits on AsyncStorage. So the tour is presented
*over* the routed screen, exactly the way RouteGuard already overlays `AuthBootstrapScreen`
rather than swapping the navigator's children. Routing is untouched, and there is no new
redirect that could loop.

The corresponding "no loop" property is tested at the gate instead: completing closes it, the
re-parsed bytes still close it on the next launch, replay reopens it exactly once, and finishing
closes it again.

## Account / Role Isolation

Completion is keyed by **both** `userId` and audience, so:

- A teacher who also holds a student account has not seen the student tour, and vice versa.
- A second student on a shared device has not seen anything because the first one did.
- Skipping on one account during a session does not consume the next account's introduction —
  the dismissal is folded into the in-memory record through `withGuidedTourCompleted`, which is
  keyed by (account, audience) by construction. A bare "dismissed this run" boolean would have
  had exactly that bug, and is deliberately absent.

The list is bounded to `MAX_REMEMBERED_COMPLETIONS = 8`, most-recent-first, with re-completion
moving an entry to the front rather than appending. Unbounded local history on a shared device
was not an acceptable alternative.

Unreadable storage — malformed JSON, an unknown version, the wrong shape, individual bad
entries — always resolves to "nothing completed", which *shows* the tour. That is the safe
direction: re-showing three cards costs a tap, whereas a parser that treated garbage as "already
done" would silently delete first-use orientation for everyone whose storage hiccuped. An
unreadable record is also never deleted, so a newer client's data survives.

## Accessibility

Each card is one accessible node announcing position, heading and explanation as a single
thought. The skip button carries its own label and a hint naming where to find the tour again.
The step track is decorative and hidden, because the counter beside it already says the same
thing in words.

The overlay is a real modal: `accessibilityViewIsModal` for iOS and `role="dialog"` +
`aria-modal` for web. This was a defect found during runtime QA — the routed screen stays
mounted underneath (it has to, so finishing reveals a live app rather than a cold mount), which
means it also stays in the accessibility tree. Without those props VoiceOver read the feed's
tabs straight through the introduction and a web user could Tab into invisible buttons.
Confirmed applied in the DOM at runtime.

Touch targets: the skip row and the Profile replay row are both 44pt minimum.

## Light / Dark

Every new surface uses semantic tokens only; no raw colour was introduced. Tour verified in both
themes at phone and desktop widths. Study Hub and Class Performance verified in dark.

## Responsive

`contentWidth.form` for the tour (three short paragraphs should not run 680 wide), and
`contentWidth.readable` for the three newly-capped screens.

The cap on a *scrolling* box goes on the element, not the content container. Capping the content
centres it inside the scroller's inner width, which is a few pixels narrower than the screen
because the scrollbar lives there — measured at runtime, the list settled at x=373 while the
header centred at x=380. Capping the element puts both boxes on the same measure (verified: both
at x=380, width 680) and leaves the scrollbar at the column's own edge.

The tour's brand mark and card travel together as one centred group with the actions pinned
below. The first build anchored the lockup to the very top, which left most of a phone screen
empty between the two and read as an unfinished layout rather than a calm one.

## Runtime Acceptance

Firebase emulators (auth/firestore/storage) + Expo Web, `demo-*` fixtures.

- **Fresh student** → student tour at 1/3. Steps advance 1→2→3, the primary action changes to
  "Başla" on the last card, completion closes it and writes
  `{"userId":"demo-student-a","audience":"student"}`.
- **Relaunch** → no repeat.
- **Skip** → dismisses and records the same completion.
- **Profile replay** → row appears under Görünüm, reopens the tour at 1/3 and clears that
  account's completion only.
- **Fresh teacher on the same device** → teacher-specific copy, all three cards confirmed, even
  though a student's completion was already stored. Storage then held both entries, isolated.
- **Sign out → sign in** (both roles) → no repeat.
- **Study Hub** → capped at 680 centred at x=380, title measured at 28px, no overflow.
- **Class Performance / Student Performance** → header and scroller both at x=380 / 680, no
  overflow, Phase 73 content intact.
- **Concept Map (11 boxes), Patterns (7), Learning Story (7)** → still exactly 680 after the
  token swap.
- **375px** light and dark, and **375px at 150%**: tour, Study Hub and Class Performance all pass
  with no clipping, no horizontal overflow and no orphaned icons.

No study evidence, assignment, intervention, class membership or auth user was created by QA.

## Firestore Cost

New collections 0 · new documents 0 · new writes 0 · new reads 0 · new listeners 0 · new
Functions 0 · new indexes 0 · new rules 0 · polling 0 · analytics events 0.

The tour is device-local. Nothing about it reaches the network.

## Regression

Phases 42–47 and 59–73 are untouched by the diff: no service, hook, classifier, scheduler or
rule file appears in it. The full suite is green at 160 suites / 2931 tests. The Student Feed is
zero-diff. `OnboardingProgress` renders the identical bar through `StepTrack` (same segments,
gap, height, radius and colours).

## iOS Decision

New native dependency **NO** · new native package **NO** · native config **NO** · native
permission **NO** · native-only API **NO** · native-only storage **NO** (AsyncStorage already
backs the theme preference and study-session continuity on both platforms) · native-only
navigation **NO** · native-specific animation or gesture **NO** · newly-introduced safe-area
behaviour **NO** (`SafeAreaView` with the same edges the app already uses everywhere) ·
confirmed native-only bug **NO**.

**NATIVE IOS: NOT REQUIRED THIS PHASE.**

## Automated Validation

typecheck PASS · lint PASS · unit 160 suites / 2931 tests · rules 5 suites / 370 tests ·
functions build PASS · verify PASS · expo-doctor 17/18 (known pre-existing drift) ·
`git diff --check` PASS.

## Source Integrity

No binary source, no NUL bytes, valid UTF-8, LF-only. No raw colour literals in any new or
changed style. No debug instrumentation, no temporary QA files, no emulator exports. `.env`,
lockfiles, `firestore.rules`, `app.json` and `main` untouched.

## Intentionally Untouched Surfaces

- **Student Feed** — the pager contract outranks constant deduplication.
- **Concept Mastery Map flow rail, Pattern Memory echo marks, Hint Ladder, Teacher Action
  Center, Class Concept Heatmap** — the shared system should unify these surfaces, not erase
  what makes each recognisable.
- **Session Reflection** — already calm, evidence-based and free of gamification.
- **Intervention composer, question authoring** — neither reads as legacy.
- **Auth screens** beyond the token swap — the first impression is already the product's.
- **Chat, notifications, public profile** — they carry their own type overrides, but they are
  outside the priority list and off the learning path. Sweeping them would have been changed-file
  count, not coherence.

## Known Limitations

- The `screenTitle` role is adopted on the Study Hub only. Class Detail, the public profile,
  Notifications and the teacher dashboard header still override `displayLg` in place. Those slots
  hold variable-length names where the fix is a layout decision rather than a token swap.
- Completion is remembered for the 8 most recent (account, audience) pairs. A device with more
  than eight accounts will re-show the tour to the oldest.
- Completion is device-local, so the same account on a second device sees the tour again. That is
  the deliberate trade for zero backend cost and no rules change.
- The tour is presented over the routed screen rather than as a route, so it is not deep-linkable
  and does not appear in navigation history. Replay is the intended re-entry point.
- The replay row lives in Profile because that is where the app's only existing settings column
  is. There is still no general Help surface, and this phase did not build one.

## Final Product Assessment

The phase's value is not in how many files changed. It is that the three most-used learning
screens now share one measure with the screens they open, one title scale, one progress bar and
one first-use explanation — and that a new user is told what the product does in the product's
own honest vocabulary, in three cards they can skip, without a single byte crossing the network.
