# Phase 55 — TestFlight Gate

## Starting Baseline

`03730f1` (Phase 54 Immersive Feed Restoration). Worktree clean, sync 0/0,
main untouched.

## Scope Freeze

No features, no redesign, no backend change. Four release fixes, all
presentation or emulator-only. Business logic, Firestore schema, rules and
Cloud Functions untouched.

## Native Acceptance

Xcode 26.6 · iOS 26.5 · iPhone 17 Pro (402×874) and a created iPhone SE 3rd
gen (375×667, existing runtime — no download).

## Immersive Feed Acceptance

Question A → Rating A → Question B → Rating B all verified on device, with
clean full-page snapping and no half-page rest state. Backward paging returns
to the previous page correctly. Rating A and Rating B showed *different*
per-question state ("Öğreniliyor" vs "Henüz çalışma planında değil"), so the
interstitial is reading real state rather than a stale card.

## Answer → Return → Rating

Feed → `Çöz` → question detail → `Cevapla` → composer → back → feed: the feed
returned to the **same** question in the **same** channel, not to the top, and
the next swipe produced the correct Rating interstitial.

Submitting the rating wrote exactly once:

| | before | after |
|---|---|---|
| `attemptCount` | 10 | 11 |
| `solvedCount` | 8 | 9 |
| `successfulReviews` | 0 | 1 |
| `status` | learning | review |

`demo-q-heavy` was untouched, and swiping backward then forward again left
every counter identical — no duplicate write on re-render or re-paging.

**The answer upload itself could not be completed locally.** Root cause is an
emulator bucket mismatch, proven not inferred:

- the client uploads to the configured bucket → the 3 uploaded objects are
  present there (`moderation/pending/demo-student-a/…`)
- the function's `getStorage().bucket()` resolves to the emulator's legacy
  default `…appspot.com` → **0 objects**
- `submitAnswer.ts` then fails its `file.exists()` precondition and throws
  `failed-precondition`, which the client maps to "Görsel yüklenemedi"

In production `FIREBASE_CONFIG.storageBucket` is the project's real default
bucket, which is the same bucket the client is configured with, so the two
agree. Backend is frozen this phase, so the function was not changed to work
around a local-only naming difference.

## Small iPhone

iPhone SE 3rd gen, 375×667 — the smallest size this runtime supports. Header,
brand lockup, channel bar, Daily Flow pill, filter pill, immersive page and
tab bar all render correctly with no clipped CTA and no overlap. The channel
bar's last chip extends past the right edge because that row is a horizontal
scroll view; it scrolls rather than being cut off.

This device is what surfaced the empty-state contrast regression below.

## Text-Only Question

Not separately verified. The demo fixtures are image-only and creating a
text-only question requires the answer/upload path that the bucket mismatch
above blocks locally. Carried forward as an open item rather than claimed.

## Accessibility

The two contrast defects found this phase (below) were both accessibility
defects, and both are fixed. Touch targets on the immersive chrome remain
44×36pt minimum. Dynamic Type was not re-swept beyond Phase 54's pass.

## Auth Persistence

Force-close and relaunch kept the student signed in, on the right role and
tab, with the theme preserved. `getReactNativePersistence(AsyncStorage)` is
intact in `initAuth.native.ts` — no in-memory fallback.

## Offline / Reconnect

Not re-tested this phase; unchanged since Phase 53.

## Theme

Light, dark and system all verified on the immersive feed, profile and auth.
Two theme defects were found and fixed — see below.

## Production Export

Both produced locally with `NODE_ENV=production`:

- iOS Hermes bundle — 6.81 MB `.hbc`, built clean
- Web export — built clean, served locally and **booted with no startup
  crash**, no console errors

## Firebase Production Configuration

All six values are inlined into the production bundle as non-empty string
literals (verified in the readable web bundle, values redacted). The guard
validates the *resolved* config object, so the Phase-48 computed-`process.env`
crash cannot recur — that regression is confirmed absent.

## Emulator Isolation

Proven at runtime in the production bundle, not by reading code:

- `process.env` contains **only** `NODE_ENV`
- `EXPO_PUBLIC_USE_FIREBASE_EMULATORS` reads `undefined`
- `useEmulators = process.env[EMULATOR_FLAG_KEY] === "true"` compiles as a
  **computed** read, so Metro cannot inline it → `false` in production
- zero network requests to any emulator host or port
- the Hermes bundle contains no emulator ports and no demo credentials

## EAS Configuration

`production` profile has `autoIncrement: true`, no `developmentClient`, and no
emulator env. Project `7a7b80f6-…`, bundle `com.netflowedu.app`, name
"NetFlow Edu", slug `netflow-edu`, scheme `netflowedu`, version 0.1.0,
first build number 1.

## Apple Signing

Not reachable — EAS is not authenticated. Owner action.

## App Store Connect

Not checked — requires Apple authentication. Owner action.

## Privacy / Support

Privacy Policy URL and Support URL are still absent from the repo, as
`TESTFLIGHT_READINESS.md` already recorded. Owner action. Export compliance
(`ITSAppUsesNonExemptEncryption: false`) remains correct — nothing added this
phase changes the encryption posture.

## Performance

Launch, splash → root, paging and channel switching all felt immediate. No
crash, blank screen, navigation loop or repeated Firebase initialization.

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | 138 suites / 2320 tests |
| rules | 5 suites / 350 tests |
| verify | PASS |
| expo-doctor | 17/18 (known drift) |
| `git diff --check` | PASS |

## Release Fixes

1. **Unused microphone permission.** The build declared
   `NSMicrophoneUsageDescription` — English boilerplate, auto-injected by
   `expo-image-picker`'s video path — for a capability the app never uses.
   An untruthful purpose string and an avoidable App Review question.
   `microphonePermission: false`; only the two real Turkish strings remain.

2. **Invisible immersive chrome.** The floating header uses theme tokens but
   sits on a surface that is dark in *both* themes. In light mode the wordmark
   was near-black on near-black; in dark mode `textInverse` made the Daily
   Flow and filter icons near-black on the dark scrim, so the filter control
   rendered as a completely empty pill. Both pinned to a constant light
   foreground, matching the reasoning `chromePill` already documents for its
   own background.

3. **Immersive surface flipped white when empty.** Found on the SE, and
   introduced by fix 2: the pager's container, loading and empty states still
   painted `colors.background`, so an empty channel turned the surface white
   under a now-permanently-light header. The pager is now one constant colour
   in every state, consistent with the FeedCard pages it hosts.

4. **Emulator host pinned to IPv4.** iOS resolves `localhost` to `::1` first,
   but the Firebase emulators bind IPv4 only — verified directly: `127.0.0.1`
   answered on 9099/8080/9199 while `[::1]` was refused on all three. Auth and
   Firestore hid this by retrying; Storage did not. Emulator-only code, so
   production behaviour is untouched.

## Owner Actions

1. EAS login — blocks production env inspection and the build attempt.
2. Apple Developer access / 2FA — blocks signing and App Store Connect.
3. Privacy Policy URL and Support URL — still absent.

## Engineering Blockers

None. The answer-upload path could not be exercised end to end locally, but
the cause is a proven emulator bucket-naming difference, not product code.

## Final Gate

Engineering is ready. The build cannot actually be produced until EAS and
Apple access exist, so the gate is owner-blocked rather than engineering-
blocked.
