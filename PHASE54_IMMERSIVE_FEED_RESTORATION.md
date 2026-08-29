# Phase 54 — Immersive Feed Restoration

## Regression / Product Decision

Phase 50 (`8517b50`) deliberately replaced the student feed's one-page-per-viewport
model with a conventional vertically scrolling list of cards, and its own
documentation recorded that the in-feed rating interleave was dropped as a
consequence.

Phase 54 reverses that decision **for the Student Akış screen only**. The
scrolling list made the student home read as an ordinary social feed — several
question cards stacked in one viewport — which is not the intended product. The
restored interaction is:

```
[QUESTION A] → swipe → [RATING A] → swipe → [QUESTION B] → swipe → [RATING B] → …
```

The Teacher Feed is deliberately untouched: its job is analytical scanning, and
a pager would be the wrong shape for it.

## Historical Source

The pre-Phase-50 implementation was recovered from history rather than
reinvented:

- `git show 5ace431:src/features/feed/screens/FeedScreen.tsx` — the paged
  student feed as it last shipped
- `git diff 5ace431..8517b50 -- src/features/feed/...` — confirmed Phase 50
  changed **only the consumer**

The decisive finding: **every mechanism the old feed used still exists at HEAD
and is still in active use.** Phase 50 only stopped calling it.

| Mechanism | File | Status at HEAD |
|---|---|---|
| Question/rating interleave | `useInterleavedStudyFeed.ts`, `feedItems.ts` | untouched, still used by `ClassFeedScreen` |
| Rating interstitial | `study/components/RatingCard.tsx` | untouched |
| Immersive card | `feed/components/FeedCard.tsx` | untouched (only this screen uses it) |
| Offset → page index | `classFeedPagination.ts` (`calculateActiveIndex`) | untouched |

`ClassFeedScreen` is the sibling immersive surface that kept this model through
Phases 50–53 and was device-validated in Phase 51 — it served as the living
reference for the exact FlatList configuration, in preference to the older
commit.

**Recovered behavior:** paging config (`pagingEnabled` + `snapToInterval` +
`snapToAlignment` + `decelerationRate` + `disableIntervalMomentum` +
`getItemLayout`), page-height derivation (`windowHeight - tabBarHeight`),
interleave wiring, rating write path, virtualization window, momentum
bookkeeping.

**Reimplemented (genuinely new):** only `feedSessionKey` — the pre-Phase-50 feed
had no channels, so its reset key was filter-only.

## Pager Architecture

The list fills the whole area above the tab bar, and the header + channel bar
float over it as absolutely-positioned chrome. That keeps the page height at
exactly `windowHeight - tabBarHeight` — one deterministic number that
`getItemLayout`, `snapToInterval` and `calculateActiveIndex` all agree on.

Laying the header out in normal flow would make page height depend on the
header's measured height, which is precisely the "magic height that only works
on one iPhone" this phase rules out.

Virtualization is unchanged from the proven config: `initialNumToRender: 1`,
`maxToRenderPerBatch: 2`, `windowSize: 3`, `removeClippedSubviews`.

## Question → Rating Interleave

Supplied entirely by `useInterleavedStudyFeed`. Swiping from a question lands on
**its own** rating card — the very next item — so there is no gesture
prediction and no shared "which question is being rated" state to race.

`resetKey` is now `feedSessionKey(channel, filterKey)`. Both inputs matter:
the channel decides which questions exist at all, and the filter narrows that
pool. A channel-blind key would let a rating card built for "Zorlandıklarım"
survive into "Keşfet", pointing at a question the new channel no longer
contains.

## Rating Data Integrity

The existing system is reused unchanged. `RatingCard` owns its whole lifecycle
via `useStudyQuestionState`: it submits, and only on a **confirmed** success
does it show the flourish and hand back to the parent. A failed write keeps the
student on the card with the error visible rather than advancing past a review
that was never saved.

No new rating schema, no second write path, and no change to Phase 41 evidence
semantics — the rating *is* the established outcome write, exactly as before
Phase 50.

## Daily Flow Integration

Phase 53's intelligence is fully preserved — same composer, same items, same
routing. Only the presentation moved.

An inline section above the pager would re-break the full-viewport page, which
is the whole point of this phase. So Daily Flow is now a compact pill in the
header (with a count badge) that opens `DailyFlowSheet`, a bottom sheet built on
the app's existing `BottomActionSheet`. Dismissing returns to the exact same
feed page, because the pager was never unmounted — verified: scroll offset 1526
before opening, 1526 after closing.

The Teacher Feed keeps the inline `DailyFlowSection`; its surface is still a
scan-friendly list where a section above the content is the right shape.

## Channels / Filters

Both survive as compact overlay chrome. Channel pools, ranking (Phase 45/26
`buildQuestionFeedRanking`, still "Sana Özel" only) and Phase 53's
`outcomeHistory` fix are all untouched — this phase changes presentation, not
selection.

Changing channel or filter starts a new session (new `resetKey`) and returns the
pager to the first page. Nothing else resets it.

## Native iOS

`ios/` did not exist, so it was regenerated with `npx expo prebuild --platform ios`.
Prebuild rewrote `package.json`'s `android`/`ios` scripts to `expo run:*`; that
was detected and reverted, per §33. `ios/` remains gitignored and is not staged.

CocoaPods initially failed with `Encoding::CompatibilityError` (a known
non-UTF-8-locale issue) and succeeded under `LANG/LC_ALL=en_US.UTF-8`.

See the Runtime Acceptance section for what was actually observed.

## Web

- Mobile width (375×812): full-page question, exact snap, rating interstitial,
  next question.
- Desktop: centered ~680px reading column — an educational image is never
  stretched across the monitor.
- Snap verified numerically, not just visually: page height 763,
  `scrollHeight` 7630 (10 pages = 5 questions interleaved with 5 ratings), and
  every rest position landed exactly on a page boundary.

## Small iPhone

Verified at 375×812 on web. Native small-device verification is covered in
Runtime Acceptance.

## Dynamic Type

See Known Limitations.

## Performance

No new Firestore reads, listeners, polling or N+1. The pager keeps the proven
3-page virtualization window. `getItemLayout` is exact, so no measurement pass
is needed and there is no layout jump as pages mount.

## Backend Impact

New collections: none. New schema: none. New rules: none. New Cloud Functions:
none. This is a presentation restoration.

## Automated Validation

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | 138 suites / 2320 tests (was 138 / 2315) |
| `npm run test:rules` | 5 suites / 350 tests (unchanged) |
| `npm run verify` | green |
| `npx expo-doctor` | 17/18 (known pre-existing drift) |
| `git diff --check` | clean |

## Runtime Acceptance

Recorded in the phase report.

## Known Limitations

Recorded in the phase report.

## Final Result

Recorded in the phase report.
