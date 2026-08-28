# Phase 50 — Launch Feed Experience

## Product Goal

Make the feed the app's home. After authentication a student lands on the
Student Feed and a teacher on the Teacher Feed, with the first viewport
showing a minimal header, the channel selector, and a complete content card
— not a dashboard wall.

The existing dashboards are unchanged and still one tap away: Teacher
Dashboard (now the `Sınıflarım` tab), Class Performance, Student
Performance, and the Study Hub were not modified by this phase.

## Student Feed

Route: `app/(student)/(tabs)/index.tsx` → `FeedScreen`.

Presentation changed from a full-screen paged feed (one card locked to the
viewport, `pagingEnabled` + `snapToInterval`) to a natural continuous
vertical scroll of intrinsically-sized cards, so the next card peeks into
the viewport. Upload, filtering, personalization and cursor pagination are
preserved unchanged.

## Teacher Feed

Route: `app/(teacher)/(tabs)/index.tsx` → `TeacherFeedScreen` (new).

The teacher's class list moved from `index` to `app/(teacher)/(tabs)/classes.tsx`
and kept its own tab immediately beside the feed. Nothing a teacher could
reach before became harder to reach.

## Channels

Defined in `src/features/feed/services/feedChannels.ts` — pure, role-aware,
and a closed union per role so a channel can never be shown to a role that
cannot read its data.

| Role | Channel | Label | Data source |
|---|---|---|---|
| Student | `for_you` | Sana Özel | `useSocialFeed` pages, reordered by the existing `buildQuestionFeedRanking` (Phase 26) |
| Student | `discover` | Keşfet | `useSocialFeed` pages, server order (deliberately un-personalized) |
| Student | `my_classes` | Derslerim | `getClassQuestionsPage` per joined class |
| Student | `struggles` | Zorlandıklarım | class + social pool, filtered by `selectStruggleQuestions` |
| Teacher | `discover` | Keşfet | `useSocialFeed` pages |
| Teacher | `my_class` | Sınıfım | `getClassQuestionsPage` per owned class |
| Teacher | `student_signals` | Öğrenci Sinyalleri | `useClassPerformance().attentionCards`, filtered to needs_attention/watch |
| Teacher | `my_content` | İçeriklerim | `selectOwnQuestions` over the social pool |

`resolveChannelForRole` re-checks the selected channel against the role on
every render. `discover` is the one id both unions share, which is exactly
why every other id must be re-validated after an account switch.

## Filters

The existing `FeedFilterSheet` and `feedFilters.ts` are reused unchanged:
Ders (subject), Sınıf (grade), and Konu (topic, gated behind a subject
choice). Options come from the app's own canonical subject/grade/topic
config — no invented options and no fabricated grade default.

Active filters render as removable chips on the feed itself; each chip
clears only its own field. Changing a filter or channel resets the list to
the top; nothing else does.

Filter and channel state are session-local React state. Nothing is written
to Firestore and no preference schema was added.

## Feed Card System

`LaunchFeedCard` (new) — a themed surface card with an explicit hierarchy:
subject/topic + timestamp row, source, question text, media, one primary
action. The action label is supplied by the caller (`Cevapla` for students,
`Ödevde Kullan` for teachers) and is `null` when the caller has no real
destination, so no dead button can render.

Media uses a fixed 200pt height rather than an aspect ratio. An aspect ratio
scaled with the container, which made the same card ~280pt tall on a phone
but over 500pt in the web content column — tall enough to push the card's
own action button out of the first viewport. This was caught and fixed
during runtime verification.

`StudentSignalCard` (new) — name, one reason sentence taken verbatim from
`studentAttention.ts`'s existing fixed REASONS table, and a chevron into
Student Performance. It computes nothing and makes no causal claim.

The pre-Phase-50 `FeedCard` (full-bleed paged card) is left in place and
still used by the class feed, which keeps its paged presentation.

## Navigation Changes

- Teacher tabs: `Akış` (new, index) · `Sınıflarım` (moved from index) ·
  `Arkadaşlar` · `Profil`.
- Student tabs: unchanged (`Akış` · `Çalış` · `Sınıflarım` · `Profil`).
- No route renames on the student side; no deep links removed.

## Data Sources

Every channel reads through an existing service function. No new collection,
no new schema, no new document type, and no Cloud Function change.

## Firestore Read Strategy

- `discover` / `for_you` / `my_content` share the one `useSocialFeed` fetch
  and are filtered or reordered purely in memory.
- `my_classes` / `my_class` issue one bounded `getClassQuestionsPage` per
  class, and only while that channel is selected.
- `struggles` additionally uses the class pages, because a student's
  struggle evidence overwhelmingly sits on class questions that the social
  feed never fetches.
- `student_signals` reuses `useClassPerformance` — the same aggregated
  per-class load the Class Performance screen already performs — and is
  only mounted while that channel is selected.

There is no per-card query anywhere in either feed.

`getClassQuestionsPage` was reused deliberately rather than adding a
`classId` filter to the main feed query: its exact query shape is the one
`firestore.rules` can statically prove readable for a class member. No rules
change was needed or made.

## Theme Integration

All new UI uses `themedStyles` + semantic tokens and subscribes via
`useThemeSubscription`. A sweep of every touched file for raw `#hex` /
`rgb()` / `rgba()` literals returned zero matches.

## Web Runtime

Verified against the documented emulator environment with the deterministic
demo fixtures, Expo Web, Auth confirmed bound to `localhost:9099` before any
login.

Student: landed on the feed; all four channels exercised; filter sheet
opened, `Matematik` applied (active chip + badge appeared); card → question
detail → back preserved channel and filter; Study Hub, Profile and the theme
selector still reachable.

Teacher: account switch landed directly on the Teacher Feed with teacher-only
channels (no student channels leaked); `Öğrenci Sinyalleri` rendered real
signals including `Öğrenci A — Aynı soruda 8 kez zorlandı` and correctly
omitted strong/insufficient-data students; a signal card opened Student
Performance with Phase 44 effectiveness and Phase 47 next-step intact;
`Sınıflarım` and Class Performance both still fully functional.

Responsive: desktop renders a centered ~680px column; mobile (375×812)
renders a full-bleed single column with a horizontally scrollable channel
bar and the next card peeking in. Light and Dark both verified, including
live switching via the System preference.

## iOS Runtime

**NOT RUN.** No iOS simulator session was started in this pass, so every
native item in §53 is UNVERIFIED rather than assumed from the web result.

## Accessibility

Channel chips carry `accessibilityRole="tab"` with `accessibilityState.selected`,
and signal selection is conveyed by background fill *and* font weight, not
colour alone. Action buttons and signal cards have a 44pt minimum height and
explicit accessibility labels.

## Performance

Cards are `memo`'d; channel lists, filtered lists and rankings are `useMemo`'d
on their real inputs. The list is virtualized (`FlatList`, `initialNumToRender: 4`,
`windowSize: 7`, `removeClippedSubviews`). No formal profiling was run — no
stutter or blank-gap was observed while scrolling the fixture feed, and that
is the honest extent of the measurement.

## Automated Validation

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | 136 suites / 2277 tests (was 134 / 2244) |
| `npm run test:rules` | 5 suites / 350 tests (unchanged) |
| `npm run verify` | green |
| `npx expo-doctor` | 17/18 (pre-existing Expo patch drift, untouched) |
| `git diff --check` | clean |

New tests: `tests/unit/feedChannels.test.ts` (role→channel config, defaults,
the cross-role account-switch guard, determinism) and
`tests/unit/channelSelection.test.ts` (struggle selection incl. the
"again is not a struggle" and legacy "absence is not evidence" rules,
own-content selection, no-mutation).

## Known Limitations

- **iOS not verified this pass.** Web only.
- **`Öğrenci Sinyalleri` covers the teacher's first class only.**
  `useClassPerformance` is a per-class hook; fanning it across every class
  would multiply its per-student reads by the class count. The full
  multi-class picture remains in Class Performance.
- **The interleaved in-feed rating card was dropped from the main student
  feed.** It was built for the paged one-card-per-viewport presentation and
  does not make sense between continuously scrolling cards. Outcome
  recording itself is unaffected and still reachable through question
  detail, the adaptive session, and the class feed (which keeps its paged
  presentation and its rating interleave).
- **Teacher cards do not open question detail.** That screen only exists as
  a `(student)`-group route; pushing across navigator groups was not
  verified in this phase, so the teacher card offers only the composer
  action rather than a possibly-stranding one.
- **Search was not built**, per §29 — no existing question search to surface.
- **Pre-existing, not introduced here:** `TeacherClassDetailScreen` renders
  in light colours while the app is in dark mode. It was last modified by
  Phase 49's own commit (`5ace431`) and is not in this phase's diff.
- Demo fixture question images point at a placeholder URL that does not
  resolve, so cards show an empty themed media box against the fixtures.
  That is a fixture limitation documented in `DEMO_CHECKLIST.md`, not a card
  bug.

## Final Result

The launch feed is the home surface for both roles, channel- and
filter-driven, theme-correct in light and dark, verified on Web against the
emulator fixtures, with no Firestore schema, rules, or read-pattern
regression and no loss of existing dashboard functionality.
