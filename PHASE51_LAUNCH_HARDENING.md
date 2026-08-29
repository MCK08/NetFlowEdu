# Phase 51 — Launch Experience Hardening

## Goal

Phase 50 shipped the launch feed and was validated on web only. Phase 51 put
it on a real iOS simulator for the first time, closed the known
TeacherClassDetail dark-mode bug, and fixed what native testing actually
surfaced. No learning or business logic was touched: zero files under
`services/`, `domain/` or `hooks/` changed.

## Launch UX Audit

First ten seconds, both roles, on an iPhone 17 Pro:

- **Student** — minimal header, four channels, one complete card, next card
  peeking, one obvious CTA (`Cevapla`). No hero block, no dashboard wall.
- **Teacher** — same shape, teacher channels, `Ödevde Kullan`. Reads as an
  entry surface, not a second dashboard; analytics stay in Class/Student
  Performance.

Hierarchy, channel state and filter discoverability all held up on device.
The layout needed no restructuring — the defects were in the details below.

## Student Feed

All four channels verified on device. `Sana Özel` and `Keşfet` are empty for
the demo student because `useSocialFeed` only loads own + public questions
and every fixture question is a class question. That is honest, not a bug,
and the empty state says so plainly — it was left alone rather than padded
with content the student has no real relationship to.

`Derslerim` and `Zorlandıklarım` carry content. Channel switching, filtering,
scrolling, question open/back, and scroll-position restoration on back all
pass.

## Teacher Feed

`Keşfet`, `Sınıfım`, `Öğrenci Sinyalleri`, `İçeriklerim` all verified.
Signals surfaced only genuinely-flagged students (F, E, A) with their
verbatim reason strings — no healthy student labelled, no causal claim
invented. The filter control correctly hides on the signals channel, so
there is no dead control on a list that filters cannot apply to.

Signal → Student Performance preserved confidence gating: the demo
intervention still reports `Sonuç için erken` / `yeterli kanıt yok` rather
than inventing a verdict.

## Native iOS

Xcode 26.6 · iOS 26.5 · iPhone 17 Pro · existing debug build reused (`ios/`
untouched and still gitignored). Emulators proven local before any
credential was typed — Auth on 9099, Firestore on 8080.

Verified: launch, both roles, all eight channels, scroll, filters, question
open/back, account switch both directions, force-close/reopen, Study Hub,
Student Performance, light/dark/system.

## Theme Closure

### TeacherClassDetail Fix

**Before** — Teacher → Sınıflarım → Demo Sınıfı in dark mode rendered a white
screen with black text and an invisible back chevron.

**Root cause** — two layers, both traceable to how Phase 49's sweep was
written:

1. That sweep searched for **hex** literals (`#[0-9A-Fa-f]{3,8}`), so CSS
   **named** colours were invisible to it. `TeacherClassDetailScreen`'s root
   was literally `backgroundColor: "white"`, with `color: "black"` on its
   title, code and section headers.
2. Phase 49's literal fix ran *after* its `themedStyles` codemod, so it
   introduced `colors.*` into seven files that still used
   `StyleSheet.create`. Those resolve **once at import time** and were
   therefore frozen on the light palette no matter what theme was active.

**Fix** — named colours mapped to the tokens whose values they already
matched (`background`, `textPrimary`, `textInverse`), and the seven frozen
stylesheets converted to `themedStyles`. Light mode is unchanged: light
`background` is `#FFFFFF`, exactly the white being replaced.

Files: `TeacherClassDetailScreen`, `JoinClassModal`, `CreateClassModal`,
`ImageSourcePicker`, `VisibilityPicker`, `CommentComposer`, `CommentItem`,
`EditProfileScreen`, and the two `user/[userId]` routes.

**After** — dark PASS, light PASS (pixel-identical to before), system PASS.

### Remaining named colours, deliberately kept

- `ClassFeedScreen` — the immersive full-bleed media feed, dark in both
  themes by design (Phase 49 limitation, unchanged).
- `ImageViewer` — fullscreen viewer, black in both themes, as Photos does.
- `DrawingBoard` — pen and eraser **ink**; content, not chrome.

## Filters

Sheet verified on device in both themes: title, Ders, Sınıf, the
subject→topic dependency stated explicitly (`Konu filtresi için önce bir ders
seçin.`), Temizle, Uygula, safe area respected. Applying a filter sets the
count badge, renders a removable chip, and resets the list to the top.
Removing the chip updates immediately. No fabricated grade default.

## Loading / Empty / Error

- Feed loading uses themed skeletons, not a full-screen spinner.
- Session bootstrap shows a branded themed loader.
- Empty states are channel-specific and honest — never "Veri bulunamadı".
- **Media states fixed.** A question whose image was slow or broken left a
  featureless 200pt grey slab that dominated the card. The placeholder is now
  the media slot's base layer with the image drawn over it, so missing,
  loading and failed all read as themselves (`Görsel yok`, `Görsel
  yükleniyor`, `Görsel yüklenemedi`).
- Offline behaviour was observed live when the machine dropped connectivity:
  the feed **kept its content** instead of blanking, and the banner explained
  why.

## Accessibility

Channel chips, filter button, filter chips, cards and CTAs all carry roles
and labels; selection is not colour-only (the active channel is a filled pill
with a weight change). Touch targets ≥44pt. Contrast unchanged from Phase 49.
Large-text smoke was not run.

## Performance

Native launch, first feed render, channel switch, filter apply, scroll,
question open, and teacher signal load were all **PASS** by observation —
nothing felt slow enough to note, no dropped-frame stutter while scrolling,
no visible delay switching channels. No performance code was changed, since
nothing at runtime justified it.

Read discipline was re-checked rather than measured: the three social
channels share one `useSocialFeed` fetch and are filtered in memory, class
questions load only while a channel that needs them is selected, and theme
changes re-render without refetching.

## Native Persistence

Force-close → reopen relaunched straight into the Teacher Feed with account,
role and dark theme all preserved, no crash and no stale student UI. Account
switching in both directions swapped channels, tabs and CTA labels with no
stale content, and never reset the theme.

## Regression Safety

Zero `services/`, `domain/` or `hooks/` files changed. Study Hub, adaptive
recommendation, assigned work, Student Performance, intervention
effectiveness and confidence gating all verified unchanged on device.
Security rules untouched — 350/350 still pass.

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | 136 suites / 2277 tests |
| rules | 5 suites / 350 tests |
| verify | PASS |
| expo-doctor | 17/18 (pre-existing Expo patch drift, untouched) |
| `git diff --check` | PASS |

## Launch Polish Changes

1. **Media slot never a void** — missing / loading / failed image states are
   now distinguishable and labelled.
2. **Feed clears the camera button** — the FAB is absolute at `bottom: 32`
   and 68pt tall, and the list had no matching bottom padding, so it sat
   permanently on top of the last card's action. Caught on device.
3. **No glowing shadow in dark** — the FAB's `shadowColor` was
   `colors.textPrimary`, which is near-white in dark mode and turned its
   shadow into a halo. Shadows are cast light, so it is now black in both
   themes and the button's own border carries the separation.

## Known Limitations

- **The offline banner overlays the screen header.** It is absolutely
  positioned at `top: 0`, so when offline it covers the top of whatever
  screen is showing. Pre-existing, offline-only, and correcting it means
  coordinating the root layout with every screen's own `SafeAreaView` top
  inset — a global safe-area change with real regression surface, which is
  not a proportionate risk in a hardening phase. Documented rather than
  rushed.
- **Small-iPhone matrix not run.** The app was installed and launched on an
  iPhone 17e, but the simulator panel was not granted access to that device,
  so it could not be driven. All native results are from the iPhone 17 Pro.
- Large-text accessibility smoke not run.
- `Sana Özel` / `Keşfet` are empty for the demo student — a fixture property
  (all fixture questions are class-scoped), not a defect.
- Question images 404 against the demo fixtures, which is what surfaced the
  media-state work; in production these resolve normally.

## Final Result

The launch feed now works on native iOS as well as it did on web, the known
dark-mode bug is closed along with the systemic gap that caused it, and three
device-only defects were found and fixed. No learning logic, no schema, no
new backend behaviour.
