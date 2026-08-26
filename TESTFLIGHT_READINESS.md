# NetFlowEdu TestFlight Readiness

Companion to [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md) (presenter workflow) and
[DEMO_CHECKLIST.md](DEMO_CHECKLIST.md) (QA record). This file covers only
what is required to produce the first internal TestFlight build.

## Engineering Status

**ENGINEERING READY.** MVP feature set frozen; final bug audit passed with
zero production bugs. One real release blocker was found and fixed during
this pass (see "Firebase Environment" below). No feature work was done.

The remaining blockers are **external owner actions** (Apple Developer
enrollment, EAS login, EAS environment variables) — not code.

## Current Baseline

| | |
|---|---|
| Branch | `phase17-moderation-infrastructure-20260806-195814` |
| Validation | 133 unit suites / 2211 tests · 5 rules suites / 350 tests · verify PASS |
| expo-doctor | 17/18 (known pre-existing Expo patch drift: `expo`, `expo-constants`, `expo-file-system`) |

## Bundle Identifier

`com.netflowedu.app` — already stable and appropriate. **Preserved, not changed.**
Android package matches (`com.netflowedu.app`).

## Marketing Version

`0.1.0` (from `app.json` → `expo.version`). Not bumped — no release has shipped yet.

## Build Number

`ios.buildNumber` is intentionally **not set in `app.json`**. `eas.json`'s
`production` profile has `autoIncrement: true`, so EAS owns the iOS build
number remotely and assigns `1` to the first build.

**NEXT BUILD BEHAVIOR:** each `eas build --profile production --platform ios`
increments the remote build number automatically. Do not hand-set
`ios.buildNumber` in `app.json` — doing so would compete with EAS's counter.

## EAS Profile

`eas.json` `production` profile is already correct for TestFlight and was
**not modified**:

- no `developmentClient` (correct — that is a dev-client-only flag)
- no `distribution` override → defaults to `store`, which is what
  TestFlight/App Store Connect requires (`internal` would produce an
  ad-hoc build instead)
- `autoIncrement: true`

The `development` and `preview` profiles are unrelated to TestFlight and
were left alone.

## Firebase Environment

### The release blocker that was found and fixed

`src/services/firebase/config.ts` validated configuration by reading
`process.env[key]` with a **computed** key. Expo/Metro's env babel plugin
only inlines *literal* `process.env.EXPO_PUBLIC_X` member expressions, and a
production bundle ships `process.env = process.env || {}` — an empty object.

Verified against a real `npx expo export` production bundle, not assumed:

```js
// production bundle, before the fix
const E=["EXPO_PUBLIC_FIREBASE_API_KEY", ... ,"EXPO_PUBLIC_FIREBASE_APP_ID"];
!(function(){const t=E.filter(t=>!process.env[t]);
  if(t.length>0)throw new Error(`Missing required Firebase environment variables...`)})()
```

All six keys read `undefined` → the guard threw at module-import time →
**every TestFlight/App Store build would have crashed on launch**, even
though the configuration itself was correctly inlined into `firebaseConfig`
directly above it (confirmed: `projectId:"netflowedu-2a8a9"`, storageBucket,
messagingSenderId and appId all appear as inlined literals in both the web
and the iOS Hermes bundles).

Fix: validate the already-resolved `firebaseConfig` object instead of
re-reading `process.env` by computed key. Same purpose (fail fast, by name,
when configuration is genuinely absent), identical behavior in development
and production. `useEmulators` was deliberately left on bracket access —
that is `b6d57cc`'s fix and it still resolves correctly in both modes.

### Required variables

Names only — no values in this file, and none are committed. `.env` is
gitignored and stays that way.

| Variable | Local `.env` | EAS production |
|---|---|---|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | SET | **OWNER ACTION REQUIRED** |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | SET | **OWNER ACTION REQUIRED** |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | SET | **OWNER ACTION REQUIRED** |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | SET | **OWNER ACTION REQUIRED** |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | SET | **OWNER ACTION REQUIRED** |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | SET | **OWNER ACTION REQUIRED** |

EAS status could not be read — `npx eas-cli whoami` reports **Not logged in**.

`EXPO_PUBLIC_USE_FIREBASE_EMULATORS` must **not** be set in the EAS
production environment. Absent (or anything other than the string `"true"`)
correctly resolves to production Firebase.

These six are Firebase **Web client configuration**, not secret credentials —
they ship inside any built app by design. They are still not committed,
following this repository's existing policy (`.env` gitignored,
`.env.example` holds blank placeholders).

### Delivery mechanism

EAS environment variables, created once by the owner. The repository
deliberately does **not** introduce a second environment system.

## Native Risks Requiring First Build Verification

None of these are known defects — they are paths that have only ever run on
web/Expo dev and must be confirmed once a real build exists.

1. **Production env inlining on a real device.** Proven correct in an
   `expo export` bundle; confirm the app actually launches (does not throw
   the Firebase-config error) on device.
2. **Native Auth persistence.** `initAuth.native.ts` /
   `accountPersistence.native.ts` use `getReactNativePersistence(AsyncStorage)`;
   all account-switch verification so far is web (`browserLocalPersistence`).
   Multi-account switching is core to the demo.
3. **Platform-suffixed module resolution.** There is no bare `.ts` for
   `initAuth` / `accountPersistence`; both rely on Metro resolving `.native.ts`
   in a release build.
4. **Session survival across force-close/reopen** on device.

## First TestFlight Smoke Checklist

Run in order on the device, against **production** Firebase:

1. App launches (no Firebase-config crash, no white screen)
2. Teacher login (`teacher-demo@…` equivalent production account)
3. Role routing → teacher tabs
4. Student login and **account switch** (add account, then instant switch back)
5. Role routing → student tabs (Akış / Çalış / Sınıflarım / Profil)
6. Study Hub loads; "Şimdi Ne Yapmalısın?" renders
7. Open a study session; record one outcome
8. Verify the outcome persisted (count updates, no double-count on reopen)
9. Teacher: Class Performance loads
10. Teacher: Student Performance + intervention/effectiveness card
11. Create + publish an assignment; student sees it
12. **Force-close and reopen** → session and stored accounts survive
13. Camera / photo-library permission prompt on question upload
14. Keyboard behavior on login and assignment-composer forms
15. Safe-area / notch and tab-bar layout on a notched device

## App Store Connect Owner Actions

Needed before external testing, not before an internal build:

- Create the App Store Connect app record for `com.netflowedu.app`
- Privacy Policy URL and Support URL (**not present anywhere in this repo**)
- App Privacy questionnaire. The product handles: account/auth data
  (email, display name), student study outcomes and progress,
  teacher↔student class relationships, and user-uploaded question/answer
  images. No analytics or crash-reporting SDK is present.
- Age rating, category, screenshots, description
- Export compliance is already declared in-app:
  `ITSAppUsesNonExemptEncryption: false`. Only standard TLS/Firebase
  encryption is used; `expo-crypto` is present solely as an
  `expo-auth-session` peer (OAuth PKCE hashing), which is exempt.

## Remaining External Blockers

1. **Apple Developer Program membership + signing** — not verifiable from
   this machine; no Apple session configured.
2. **EAS login** (`npx eas-cli login`) — currently "Not logged in", so EAS
   environment variables could not be inspected or set.
3. **EAS production environment variables** — the six names above.

## Known Non-Blocking Items

- App icon and splash are solid-colour generated placeholders (valid
  1024×1024, no alpha channel, so they will pass App Store validation).
  Replace with real artwork before public release.
- `app.json` declares `android.permission.RECORD_AUDIO` with no audio
  feature anywhere in the codebase. Android/Play hygiene only — it does not
  affect iOS or TestFlight, so it was deliberately left untouched here.
- Google Sign-In is disabled at runtime because the
  `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` values are blank; the UI degrades
  gracefully ("Google ile giriş bu sürümde kullanılamıyor").
- Push notifications (FCM) and leaderboards are not implemented.
