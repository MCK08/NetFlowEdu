# Phase 101 — Teacher Action Center Discoverability + Full Class Action List

## Repository Sync

Local HEAD and `origin/phase17-moderation-infrastructure-20260806-195814` were both
`17bc0e8ba3a37d315e0a0f18f32b1e84baabd5ab`, ahead/behind `0 0`, worktree clean — classification
**A**. No fast-forward required.

## Actual Starting Head

`17bc0e8ba3a37d315e0a0f18f32b1e84baabd5ab` — Phase 99. No `PHASE101*` document or Phase 101 commit
existed, and no full-list route, "Tümünü Gör" control or direct Action Center entry existed anywhere
in `src/` or `app/`.

## Collaborator Safety

`git fetch origin` before implementation, before commit and before push. `main` (`7abfd2f`) never
checked out, merged or pushed. No force, rebase or reset.

## Phase 100 Blocker

Phase 100 stopped because the priority surface it specified already existed: the Phase 73 Action
Center plus the Phase 81 cohort section on `class/[classId]/performance`. What it identified instead
was a discoverability problem — the Action Center was reachable only through a button called
"Sınıf Performansı" — and a summary that could never be seen in full. Phase 101 addresses exactly
those two things.

## Existing Phase 73 Architecture

- **Builder:** `buildTeacherActionCenter` (`src/features/teacher/services/teacherActionCenter.ts`),
  pure, fed by Phase 47 outcomes (`useClassInterventionOutcomes`) and Phase 27/43 actions
  (`buildTeacherActionSummary`).
- **Kinds:** `escalate`, `follow_up`, `prepare_intervention`, `review_student`.
- **Ordering:** fixed `KIND_ORDER` precedence, stable sort, source order preserved inside a kind.
  No score.
- **Dedupe:** `seenStudents` — one action per student; `seenTopics` in the summary builder.
- **Monitor:** deliberately excluded (Phase 47's own copy says no new follow-up is recommended).
- **CTAs:** a student row pushes `/(teacher)/class/[classId]/student/[studentId]`; a
  prepare-intervention row opens the in-screen **question composer**, prefilled with subject, topic
  and Phase 43's grade — it is not a route.
- **Read path:** `useClassPerformance` (roster + per-member items), `useClassAssignments` (one
  query), at most `MAX_INSPECTED_ASSIGNMENTS` (8) submission queries, `getClassById` for the
  composer's organizationId.
- **Authorization:** existing class-scoped reads; no rules involved in this phase.

## Existing Phase 81 Boundary

Semantic cohorts and the small-group draft stay on Sınıf Performansı, untouched, and are not
rendered on the new route.

## Product Mission

Make the existing Action Center directly reachable from the class, keep its embedded summary, and
let a teacher see the whole list — with zero new learning intelligence.

## Duplicate-Surface Audit

Searched for a full-list route, "Tümünü Gör", "Öğrenme Öncelikleri", "Öğretmen Aksiyonları" and
any direct Action Center navigation. The only hits were the builder's own cap
(`MAX_ACTION_CENTER_ITEMS`). The gap was open.

## Discoverability Gap

Six class-page buttons; the one leading to the Action Center was labelled "Sınıf Performansı" —
analytics vocabulary for what is actually a "what should I look at today" list.

## Summary Limit Audit

The audit found **two stacked caps**, not one:

1. `buildTeacherActionSummary` sliced hotspot + student actions to `MAX_TEACHER_ACTIONS = 4` — a
   size chosen for the Phase 27 summary block that Phase 73 later replaced;
2. `buildTeacherActionCenter` then sliced the merged list to `MAX_ACTION_CENTER_ITEMS = 5`.

Two consequences. A complete list could not be built by lifting only the second cap — any hotspot
or student past the first four would still be missing. And the embedded summary could leave a
visible slot empty while a qualifying action sat hidden: with no intervention outcomes, two hotspots
and five students, it showed four rows although seven actions existed.

## Architecture Decision

One builder, one cut:

- `buildTeacherActionSummary` and `buildTeacherActionCenter` both return their **complete** lists.
  Their filters, precedence, dedupe and copy are unchanged.
- `summarizeTeacherActionCenter(all)` is the only place anything is capped:
  `{ items: all.slice(0, 5), totalCount, hasMore: totalCount > 5 }`.
- `useClassActionCenter` composes the list once (outcomes → summary actions → builder → summary)
  and is used by **both** screens, so the embedded section and the full route cannot list
  different actions.
- `useClassTopicComposer` + `ClassTopicComposerModals` are the composer wiring, moved verbatim out
  of `ClassPerformanceScreen` so the full route opens the identical composer instead of a copy.
- `actionCenterNavigation.ts` holds the destination helpers both screens call.

No new classifier, score, precedence or dedupe model.

## Naming Decision

**"Bugün Öne Çıkanlar"** — the name the Action Center already has on screen. The brief suggested
"Öğrenme Öncelikleri" or "Öğretmen Aksiyonları"; either would have given one surface two names, so
a teacher tapping "Öğrenme Öncelikleri" on the class page would land under a heading reading
"Bugün Öne Çıkanlar" and reasonably wonder whether these were two lists. The existing name is
already action-shaped ("what stands out today"), matches the canonical empty copy ("Şu anda öne
çıkan bir öğretmen aksiyonu yok."), and avoids risk/problem vocabulary. It now lives in one
constant, `ACTION_CENTER_TITLE`. "Sınıf Performansı" is unchanged.

## Class Entry Point

A new button on the class page, directly above "Sınıf Performansı", in the same restrained
secondary style as its neighbours: `today-outline` icon, label "Bugün Öne Çıkanlar",
`accessibilityHint` stating what it shows. No count, no badge, no colour signal, zero reads on the
class page.

## Embedded Summary

Sınıf Performansı renders `summary.items`. Every row it showed before is still shown, in the same
position, with the same copy and CTA. The one deliberate difference: when the removed Phase 27 cap
had left a slot empty, that slot now holds the next canonical action. A 400-case property test
reproduces the pre-Phase-101 algorithm literally and asserts the old list is always a prefix of the
new summary, and that the changed case was actually exercised.

## View-All Contract

"Tümünü Gör (N)" renders after the rows **only** when `summary.hasMore`. N is `totalCount`, the
complete action count, never a count of problems or students. It is a full-width row with a 44pt
target rather than a caption link in the header, placed where a teacher arrives after scanning the
five rows it continues. Spoken: "Bugün öne çıkan N aksiyonun tümünü gör."

## Full List Route

`app/(teacher)/class/[classId]/actions.tsx` → `TeacherActionCenterScreen`. Header "Bugün Öne
Çıkanlar" with the note "Sınıf Performansı'ndaki öne çıkanların tamamı, aksiyon türüne göre
sıralı." — deliberately not "every student", since the sources are bounded. It renders
`actionCenter.items` through `TeacherActionCenterSection` with `showHeader={false}` and no view-all.
Nothing else: no heatmap, no cohorts, no hotspot or student lists, no monitor section.

## Canonical Builder Reuse

Both screens call `useClassActionCenter`; neither calls a builder directly. Pinned by a structural
test.

## Ordering Preservation

`KIND_ORDER` and the stable sort are untouched. Tested: kind precedence holds across a long list,
the summary equals `all.slice(0, 5)` item-for-item and id-for-id, and the full list for a mixed
fixture matches an exact expected id sequence.

## Deduplication Preservation

`seenStudents` and `seenTopics` untouched; tested with eight students each holding both an
escalation and an attention card — eight rows, not sixteen, even far past the summary cut.

## Monitor Exclusion

Unchanged. Ten improved and ten low-confidence outcomes produce an empty list. The full route
contains no monitor section, and its source is pinned not to mention one.

## CTA Routing

Both screens pass the same row component the same two handlers, built from the same helpers:
`teacherStudentHref(classId, uid, roster)` and `actionCenterComposerContext(item)` →
`useClassTopicComposer().openForTopic`. Tested: the student href equals the exact object Sınıf
Performansı always pushed (an unknown student sends an empty name, not a guess); a
prepare-intervention item prefills subject, topic and grade, with Phase 43's `null` grade preserved;
a student item never opens the composer.

## Zero-Write Contract

Opening the class page, the embedded section, the full route, "Tümünü Gör", scrolling and going
back write nothing. A structural test asserts none of the seven files on the navigation path
contains a Firestore write, callable or upload call. The only write reachable is the existing
question composer's explicit submit, unchanged.

## Read-Cost Contract

- **Class page:** 0 new reads.
- **Sınıf Performansı:** unchanged. The extracted hooks make the reads the screen already made —
  one class-doc get, Phase 73's bounded submission queries — from their new location.
- **Full route:** mounts fresh, so it repeats the same bounded Action Center reads:
  `useClassPerformance` (roster + one items query per member, as on Sınıf Performansı),
  `useClassAssignments` (1), at most 8 submission queries, and 1 class-doc get for the composer. The
  shared vocabulary is read only while the composer is open. It does **not** load semantic cohort
  evidence or anything else Sınıf Performansı loads for its other sections, so it is cheaper than the
  screen it continues.
- No new query type, index, listener, polling or collectionGroup.

## Authorization

Class-scoped by route and by the existing reads the hooks already make; no rules changed, no
cross-class or org-wide aggregation.

## Empty State

The canonical "Şu anda öne çıkan bir öğretmen aksiyonu yok." is unchanged and still rendered by the
section on both surfaces. A class with no students shows the existing "Bu sınıfta henüz öğrenci
yok" wording.

## Mobile UX

Heading, one-line note, vertical list of the existing rows. No tiles, metrics or tables.

## Desktop UX

Header and content capped at `contentWidth.readable` (680) and centred, the convention every
recent teacher screen uses.

## Light / Dark

Every new style is a theme token; no hex or rgb literal was added. The screen and section subscribe
to theme changes; the composer modals component carries no styles of its own.

## 150% Text

Measured with the browser's real text metrics against column widths derived from the style tokens
at a 375px window:

| Text | Column | 100% | 150% |
| --- | --- | --- | --- |
| "Tümünü Gör (6 / 23 / 148)" | 291px | 107–123px, 1 line | 152–175px, 1 line |
| Class-page "Bugün Öne Çıkanlar" | 306px | 141px | 203px, 1 line |
| (existing "Sınıfın İlerleme Hikâyesi") | 306px | 170px | 242px |
| Full-route title | 307px | 259px, 1 line | 385px, **wraps to 2** |
| Full-route note | 307px | 2 lines | 2 lines |
| Outcomes-unavailable notice | 293px | 2 lines | 3 lines |

No new text sets `numberOfLines`, so the lines that exceed their column wrap rather than clip, and
the new class-page label is shorter than a label already shipping beside it. The rows themselves
are the unchanged Phase 73 component, whose 150% layout fix is documented in its source.

**Method, stated plainly:** these are measurements, not screenshots of the signed-in app. The
repository has no established screenshot workflow, and reaching the teacher screens in a browser
means signing in with a password, which was not done.

## Accessibility

Full route: heading `accessibilityRole="header"`; back button labelled; loading announced through a
polite live region; the outcomes notice announced the same way. View-all: button role with a
descriptive spoken label. Class-page entry: button role, label and hint. Rows keep their
canonical combined labels. Status is carried by text labels, never colour alone. No raw ids.

## Runtime QA

The action list is pure and fed by existing hooks, so its behaviour at 0, 1, exactly 5, 6 and many
actions is proven by unit tests over the real Phase 27, 43 and 47 functions rather than by seeding
emulator evidence. No emulator, fixture, credential or production resource was used in this phase.

## Performance

No new data source. No re-fetch on interaction: the list, summary and view-all decision are
`useMemo` derivations of already-loaded state, and view-all is a navigation, not a load.

## Phase 43 Regression

Grade context carried through unchanged, `null` stays `null`; progressing, strong and
insufficient-data students are not promoted. Existing Phase 43 tests pass unmodified.

## Phase 47 Regression

Escalate and follow-up still require real confidence; low-confidence and improved outcomes still
never become actions. Existing Phase 47 tests pass unmodified.

## Phase 73 Regression

Three existing tests changed, all about **where** capping happens: two Action Center "bounded"
tests now assert the same guarantees against `summarizeTeacherActionCenter`, and the Phase 27
"caps at 4" test now asserts the builder returns every action with hotspots first and nothing
reordered. Every other Phase 73 test passes unmodified, and the prefix property test above pins
what the summary may and may not change.

## Phase 81 Regression

Cohort section, action-ready count and small-group CTA untouched; not rendered on the new route.

## Learning Atlas Regression

No change to any Learning Atlas, semantic evidence or timeline file.

## Moderation Regression

No change to Phase 97, 98 or 99 code; no notification change.

## Backend Impact

Functions source, `firestore.rules`, `storage.rules` and `firestore.indexes.json` unchanged. No new
collection, field, listener or notification.

## iOS Decision

New native dependency: NO. Native config: NO. Native-only API: NO. Native-only behaviour: NO.
Confirmed native defect: NO. **NATIVE IOS: NOT REQUIRED THIS PHASE.**

## Automated Validation

typecheck PASS · lint PASS · unit **185 suites / 3646 tests** (from 184 / 3614) · rules
**13 suites / 644** (unchanged) · Functions build PASS · Functions lint 4 pre-existing in
`textNormalization.ts`, 0 new · `npm run verify` PASS · expo-doctor 17/18 (known dependency drift) ·
`git diff --check` clean.

## Source Integrity

All touched files UTF-8 with no NUL, CRLF, BOM or stray control characters. Historical unrelated
NUL in `studentPerformance.ts` untouched. No QA scratch, screenshots, fixtures or instrumentation.
`.env` untouched.

## Known Limitations

- Phase 73 remains the only action model; this phase adds reach and completeness, not intelligence.
- Monitor stays outside the Action Center by design.
- Semantic cohorts remain on Sınıf Performansı.
- One class at a time; no cross-class inbox.
- No score, ranking, automatic intervention or notification; no new persistence.
- The full route remounts and repeats the Action Center's bounded reads; it does not share
  Sınıf Performansı's in-memory data.
- "Complete" means complete relative to bounded sources: the class's top 5 topic hotspots, and
  intervention outcomes from the 8 most recent assignments.
- If intervention outcomes fail to load, the full route says so; the embedded section keeps its
  Phase 73 behaviour of rendering the remaining actions without a notice.
- Visual QA was by measurement, not by signed-in screenshots.
- 4 known Functions lint findings; expo-doctor drift; historical unrelated NUL.

## Phase 102 Readiness

Discoverability READY · full-list access READY · summary/full consistency READY · Phase 73 semantics
READY · CTA routing READY · performance READY.

## Product Assessment

The Action Center was already the right list; it was just hard to find and never fully visible. A
teacher can now open a class and reach "Bugün Öne Çıkanlar" in one tap, see the same first five
actions Sınıf Performansı shows, and follow "Tümünü Gör" to every one of them — the same order,
the same rows, the same buttons — without any new judgement about their students being introduced
along the way.
