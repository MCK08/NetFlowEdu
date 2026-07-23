# Firebase Setup

## 1. Create the Firebase Project

1. Go to the Firebase Console and create a project (e.g. `netflow-edu-prod`, plus a separate `netflow-edu-dev` for development).
2. Enable **Authentication** → Sign-in method → **Email/Password** (toggle it on; social login is not implemented yet). Also review the Email/Password templates under Authentication → Templates if you want to customize the verification/reset email copy — the app sends Firebase's default templates as-is in Phase 2.
3. Enable **Cloud Firestore** (production mode).
4. Enable **Cloud Storage**.
5. Enable **Cloud Messaging**.
6. Upgrade to the **Blaze plan** (required for Cloud Functions 2nd Gen — note that Phase 2's `onUserCreate` trigger is 1st-gen and `adminSetUserRole` is 2nd-gen; both deploy under the same Blaze-plan requirement).

## 2. Register the Web App

In Project Settings → General → Your apps, register a Web app. Copy the config values into `.env` (see `.env.example`):

```
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
```

These values are safe to ship client-side — they identify the project, they don't authorize anything. Actual access control lives in `firestore.rules` and `storage.rules`.

## 2b. Note on `npm install`

`.npmrc` sets `legacy-peer-deps=true`. This is needed because `@firebase/rules-unit-testing` (used only by `npm run test:rules`) declares a peer dependency on `firebase@^10`, even though it works correctly against the `firebase@^11` used everywhere else in this project — it's a stale peer range in that package, not an actual incompatibility.

## 3. Install the Firebase CLI

```bash
npm install -g firebase-tools
firebase login
firebase use --add    # link this repo to your Firebase project
```

## 4. Local Emulator Suite

```bash
npm run emulators
```

Starts Auth (9099), Firestore (8080), Storage (9199), Functions (5001), and the Emulator UI (4000). Set `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true` in `.env` to point the app at the emulators instead of production.

### Emulator Requirements

The Firestore Emulator runs on the JVM — you need a **JDK 11+** installed and on `PATH` (`java -version` should succeed). On Windows, `winget install -e --id EclipseAdoptium.Temurin.21.JDK` is the fastest path; on macOS, `brew install temurin`. Without it, both `npm run emulators` and `npm run test:rules` fail with `Could not spawn 'java -version'`.

### Platform-specific emulator host

The app resolves which host to use for the emulators (`src/constants/firebase.ts`, `resolveEmulatorHost()`) automatically:

- **iOS Simulator / web:** `localhost` — the simulator shares the host machine's network namespace.
- **Android Emulator:** `10.0.2.2` — Android's virtual device maps this special address to the host machine's `localhost`; plain `localhost` inside the Android emulator refers to the emulator itself, not your machine.
- **Physical device:** neither of the above works, since there's no loopback shortcut to your dev machine. We fall back to the LAN IP Expo's own dev server reports itself running on (`Constants.expoConfig.hostUri`, e.g. `192.168.1.23:8081`) — this only works if the phone and the dev machine are on the same Wi-Fi network and the emulator ports (9099/8080/9199/5001) aren't blocked by a firewall.

## 5. Custom Claims (Roles)

Roles (`student`, `teacher`, `organization_admin`, `platform_admin`) and `organizationId` are stored as **custom claims** on the Firebase Auth user, set exclusively by Cloud Functions — never client-writable. Security rules read `request.auth.token.role` / `request.auth.token.organizationId`. See [SECURITY.md](SECURITY.md).

Two functions manage claims:
- `onUserCreate` (`functions/src/triggers/onUserCreate.ts`) — a 1st-gen `functions.auth.user().onCreate` trigger. Sets `{ role: "student", organizationId: null }` and creates `users/{uid}` the moment a Firebase Auth account is created. Idempotent: it checks the document doesn't already exist before creating it, so a Cloud Functions retry can't clobber a promoted user.
- `adminSetUserRole` (`functions/src/admin/setUserRole.ts`) — a 2nd-gen callable. Verifies the caller's own custom claims are `organization_admin` or `platform_admin` before changing anyone else's role/claims. Not called from any UI yet in Phase 2 — it's the trusted path a future admin panel will use.

Because the client's ID token is cached, a claims change doesn't take effect until the client calls `getIdToken(true)`. The app does this automatically right after login and whenever the user taps "check verification" — see `AuthProvider.refreshSession()`.

## 6. Deploying Rules & Functions

```bash
firebase deploy --only firestore:rules,storage:rules
firebase deploy --only functions
```

`functions/` has its own `npm install` — run it inside `functions/` before building or deploying (the root `npm install` does not install the Cloud Functions dependency tree).

## 6b. Phase 6 Resources (not yet deployed)

The following are implemented in this repo but must be deployed explicitly (`firebase deploy --only firestore:rules,storage:rules,firestore:indexes,functions`) before they take effect in any real Firebase project — nothing in Phase 6 has been auto-deployed:

- Updated `firestore.rules` (visibility model, `publicProfiles`, `questionLikes`, `answerLikes`, `questionComments`, immutable aggregate count fields).
- Updated `storage.rules` (path-encoded visibility for `questions/` and `answers/`, 5MB avatar cap).
- New composite indexes in `firestore.indexes.json`: `questions` (`visibility ASC, createdAt DESC`), `questions` (`ownerId ASC, visibility ASC, createdAt DESC`), `questionComments` (`questionId ASC, createdAt ASC`).
- New Cloud Functions: `syncPublicProfile` (trigger), `toggleQuestionLike`, `toggleAnswerLike` (callables), `onQuestionCommentCreate`, `onQuestionCommentDelete` (triggers).

Firestore index builds can take time on a populated database — check the Firebase Console's Indexes tab after deploying before relying on the new queries in production.

## 7. Native Config Files (later phases)

When building native binaries, download `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) from the Firebase Console and place them at the project root. Both are gitignored — never commit them.
