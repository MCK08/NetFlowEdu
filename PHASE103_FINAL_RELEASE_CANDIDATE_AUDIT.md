# Phase 103 — Final Release Candidate Audit + Physical iPhone Sign-Off

Starting canonical HEAD: **8c46375** (`origin/phase17-moderation-infrastructure-20260806-195814`)

This phase audited the whole product (student, teacher, iPhone, web surfaces, security,
error states), closed the Phase 102 physical checklist P1–P14, and fixed eleven confirmed
release blockers — each with a regression test that fails against 8c46375 and passes after
the fix, plus runtime proof in the iOS Simulator or on the physical iPhone.

No feature work, no Expo SDK change, no push notifications, no presence/typing, no new
learning intelligence, no product restructuring. TestFlight remains deferred.

---

## 1. Environment and safety

- Runtime QA ran **exclusively against the Firebase emulator suite** (`auth`, `firestore`,
  `functions`, `storage`) under project `netflowedu-2a8a9`, bound on the LAN so the physical
  iPhone could reach it. **No production Firebase project was touched**: no production users
  were created, no production Firestore document was read or written, nothing was uploaded to
  production Storage.
- Seeded fixtures came from `functions/scripts/seedDemoFixtures.mts`, which refuses to run
  unless `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST` are set.
- Two iOS simulators were used: iPhone 17 Pro (402pt, student session) and iPhone SE (375pt,
  teacher session). The physical iPhone was operated **only by the user**; this audit's author
  never drove, installed to, or changed settings on the physical device.
- Emulator QA state was exported before any destructive check so the seeded fixtures remain
  restorable. Exports, screenshots and QA helper scripts live outside the repository and are
  not part of this commit.

---

## 2. Blockers found and fixed (D1–D11)

| ID | Surface | Defect | Fix | Regression test |
|----|---------|--------|-----|-----------------|
| D1 | Profile | Social counters rendered `0` while still loading, and silently rendered `0` when the snapshot failed — an unreadable state presented as real data | `subscribeToOwnSocialMeta` gained an error path; `useSocialMeta` exposes `loading \| ready \| error`; `ownProfileStats` maps loading → skeleton, error → unavailable | `profileSocialMetaStatus.test.ts`, `profileStats.test.ts` |
| D2 | Akış + guided tour | The feed's light `StatusBar` stayed mounted under the guided-tour overlay, so status-bar content was unreadable during the tour | Feed yields its `StatusBar` while the tour is visible (mount order, not a second StatusBar) | `guidedTourStatusBar.test.ts`, `themeChrome.test.ts` |
| D3 | Class feed / profile archive | Fast pagination could append a page that overlapped the in-flight first load, duplicating questions in the list | In-flight guard on the initial load plus `dedupeQuestionsById` on append and prepend in both hooks | `paginatedQuestionListIntegrity.test.ts` |
| D4 | Class detail (student + teacher) | `AppBackButton` stretched to full width inside a column parent, giving a 375pt-wide invisible touch target | `alignSelf: "flex-start"` on the back button style | `backButtonAlignment.test.ts` |
| D6 | Profil, teacher dashboard, appearance selector | Equal-width button labels clipped at large text ("Arkadaşla…", "Hesap De…"); "Sistem" broke mid-word at accessibility sizes | Single-line shrink-to-fit (`adjustsFontSizeToFit`, `minimumFontScale={0.5}`) on `ActionTile` and the appearance options | `actionLabelTextScaling.test.ts` |
| D7 | Çalış | "tekrar bekliyor" clipped to "tekrar bekli…" in the third-width stat column at 135% | Same shrink-to-fit contract on `StudyProgressCard` stat labels | `actionLabelTextScaling.test.ts` |
| D8 | Study session | The core thesis action "Zorlandım" clipped to "Zorland…" | Same shrink-to-fit contract on `StudyOutcomeButtons` labels | `actionLabelTextScaling.test.ts` |
| D9 | İlerleme Hikâyem (student + teacher) | Footnote sentence was laid out on one unconstrained line and cut mid-word ("…tüm çalışma so") instead of wrapping | Footnote text moved into its own `flex: 1` column in a top-aligned row — the shape `ProfileScreen`'s tour row already uses | `learningStoryFootnoteWrap.test.ts` |
| D10 | Akış, class feed, class detail (Dark theme) | Feed media cards are pinned dark in **both** themes, but their overlay used `colors.textInverse`, which flips to `#04070E` in dark: author, caption, counts, pills, spinners, the "Cevapla" pill and "Soru Akışına Gir" were unreadable | Overlay foreground pinned to the constant `IMMERSIVE_FOREGROUND` (the Phase 55 chrome fix, extended to the cards); the accent pill keeps the theme pairing because it sits on `colors.primary` | `immersiveOverlayForeground.test.ts` |
| D11 | Student Performance | Hero percentage drew 40pt glyphs inside `displayLg`'s inherited 34pt line box (ratio 0.85); iOS trimmed the ascender and sliced the top off the "%" glyph in both themes | `lineHeight` made proportional to the overridden size (40→50); `bigValueSmall` corrected from ratio 1.00 → 1.25 as the same, clearly unsafe pattern | `textLineBoxIntegrity.test.ts` |

**D5 was investigated and is not a defect** — a live-change text re-measure artifact that
disappears on a cold relaunch. It is recorded as a non-blocking observation in §6.

Each fix was proven by a negative control: the same predicate run against 8c46375 fails for
every fixed file.

---

## 3. Simulator-proven QA

Everything below was verified by this audit in the iOS Simulator, with screenshots retained
in the session scratchpad. Nothing here was delegated to the physical device.

**Phase 102 checklist items closed in the simulator**

| Item | Result |
|------|--------|
| P1 Akış Light — no white strip/bar | PASS |
| P2 Akış Dark | PASS (D2 and D10 fixed here) |
| P3 System theme follows the OS toggle | PASS |
| P4 Çalış → İlerleme Hikâyem → back | PASS |
| P5 Atlas → Harita → Örüntüler → back ×3 | PASS |
| P6 Profil → Düzenle → Kapat | PASS |
| P7 swipe-back gesture (simulator gesture) | PASS (device feel confirmed separately as PH5) |
| P8 deep link → back lands on the tab (warm start) | PASS — cold start limitation in §5 |
| P9 teacher removes a student message | PASS — sheet, confirm, placeholder on **both** devices, `deleted=true` server-side |
| P10 teacher long-press on own message | PASS — no affordance |
| P11 student long-press (own and teacher message) | PASS — no affordance |
| P12 "Görüldü" after the teacher opens the chat | PASS — group-safe count, sender excluded |
| P13 backgrounding does not mark a new message seen | PASS |
| P14 white flash in Dark | Not closable by sampling — see PH3 in §4 |

**Part 13 (150% text) surfaces**, checked at 135% and 179% Dynamic Type, which bracket the
150% target, on 402pt and 375pt: login, Akış, Öğrenme Merkezi, Öğrenme Atlasım, Öğrenme
Haritam, Zorlanma Örüntülerim, İlerleme Hikâyem, class detail, class chat, seen label,
question detail, composer, Profil, Sınıf Performansı, Öğrenci Performansı, Bugün Öne
Çıkanlar. No horizontal page overflow, no back/title collision, no clipped button text, no
unreachable controls, no fixed-height truncation after D6–D11.

**Message moderation matrix** (teacher on the SE, student on the 17 Pro, live): positive case
plus three negatives (teacher's own message ×2, already-removed message), exercising every
clause of `canRemoveMessage` with `removeClassMessage` as the server authority.

**Teacher surfaces**: Class Performance, Student Performance and Action Center verified in
Light, Dark, 135% and 179% at 375pt. Accessibility labels verified from source (the
simulator's accessibility-tree inspector is unavailable in this build): composed spoken
labels on heatmap cells, Action Center rows and performance cards, `progressbar` role on the
success rate, `accessibilityRole="button"` with the title as accessible name on the
moderation sheet's rows, and a real `Modal` with `onRequestClose` plus a "Kapat" backdrop.

**D11 pixel evidence**: the "%" ring's first rendered row measured 79% of the ring's maximum
width before the fix (a flat slice) and 3% at default size / 0% at 179% after it (a rounded
cap), identically in Light and Dark, with digits intact.

---

## 4. Manually verified on the physical iPhone

These were run by the user on the physical device. This audit's author did not touch the
phone.

| ID | Check | Result |
|----|-------|--------|
| PH3 | No visible white flash in Dark mode during navigation | **PASS (manual, physical iPhone)** |
| PH4 | Akış safe areas, status bar and home-indicator regions in Light and Dark | **PASS (manual, physical iPhone)** |
| PH5 | Native edge swipe-back works and feels correct | **PASS (manual, physical iPhone)** |
| D11 | Student Performance hero "%" glyph renders fully in Light and Dark | **PASS (manual, physical iPhone)** — reported and reproduced from device screenshots, fixed, re-verified on device |

D11 was **found on the physical iPhone first**: the device screenshots are the authoritative
before-fix evidence, the simulator reproduced it, and the device confirmed the fix.

---

## 5. Known limitation — cold-start deep link

A cold-start deep link cannot be exercised in this build: the Expo dev launcher intercepts
app-scheme links on a cold start in dev builds. Proving it requires a **release/TestFlight
build**, and **TestFlight remains deferred** for this phase. Warm-start deep links and the
in-app fallback route are verified (P8). This is a build-channel limitation, not a defect.

---

## 6. Non-blocking observations (explicitly NOT blockers)

1. **Live-change text re-measure (D5)** — text edited while a screen is mounted may keep its
   previous measurement until a cold relaunch. Development-only; never observed after a cold
   start.
2. **Student Performance screen title** clips at ≈168% Dynamic Type and above ("Öğrenci
   Performa…"). It renders in full at 135% and, by measurement, at the 150% audit target.
3. **Display names ellipsize** at large text (dashboard greeting, feed author, performance
   cards). This is the app's deliberate treatment for variable-length user data, not clipped
   UI text.
4. **`ChatHeader` and `PublicProfileScreen` header titles** sit at a 1.18 lineHeight ratio —
   marginal against SF Pro's ~1.19 natural line height but rendering correctly in captured
   evidence. Left unchanged deliberately; the D11 guard threshold (1.15) covers the unsafe
   band without forcing churn here.
5. **Question detail meta line** can render a leading "· " when a seeded question has no
   resolvable `createdAt`. Fixture artifact of the seed script's numeric timestamps.
6. **Placeholder images** in seeded questions ("Görsel yüklenemedi") — fixture artifact.
7. **Transient offline pill** during emulator QA — environment, not product.
8. **Historical require cycle** in the study services — pre-existing, non-blocking debt.
9. **`RECORD_AUDIO` Android permission** remains declared — MEDIUM, non-blocking for an iOS
   release candidate.
10. **expo-doctor patch drift** — see §7.
11. **Functions lint debt** — see §7.

---

## 7. Final validation from the committed working tree

| Check | Result |
|-------|--------|
| `npm run verify` (lint → typecheck → unit → Functions build) | **exit 0** |
| Unit suite | **197 suites / 3780 tests passed** |
| `npm run test:rules` (rules + emulator integration) | **15 suites / 668 tests passed** |
| Functions build (`tsc`) | **exit 0** |
| Functions lint | **4 historical findings, all in `functions/src/moderation/textNormalization.ts`** — unchanged by this phase and deliberately not "fixed" to go green; `functions/` has zero diff |
| `npx expo-doctor` | **17/18** — the single failure is the known Expo SDK 54 patch drift (`expo` 54.0.36 vs ~54.0.37, `expo-constants` 18.0.13 vs ~18.0.14, `expo-file-system` 19.0.23 vs ~19.0.24) |
| `git diff --check` | clean |
| Source integrity (NUL / CRLF / BOM / control chars / final newline) | clean across all 35 touched source and test files |
| Historical raw-NUL file | `src/features/teacher/services/studentPerformance.ts` **identical to 8c46375**, its historical NUL byte untouched |
| Forbidden paths | none — no `.env`, `ios/`, `android/`, `Pods/`, `DerivedData/`, emulator exports, screenshots, scratch scripts or credentials in the diff |

---

## 8. Release-readiness conclusion

Every defect found in this audit — including D11, which only the physical device surfaced —
is fixed, covered by a regression test that fails against 8c46375, and verified at runtime.
The Phase 102 checklist P1–P14 is closed: P1–P13 in the simulator, P14 by human eye on the
physical iPhone (PH3), with PH4, PH5 and D11 additionally confirmed on device.

NetFlowEdu is ready for release-candidate packaging. TestFlight remains deferred, and the
cold-start deep-link path stays unproven until a release build exists.
