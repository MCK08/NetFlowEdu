# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Chore — Expo SDK 52 → 54
- Upgraded `expo` and every Expo-managed dependency (`expo-router`, `expo-image`, `expo-image-picker`, `expo-linking`, `expo-splash-screen`, `expo-status-bar`, `expo-constants`, `expo-asset`) to their SDK 54 versions via `expo install --fix`, matching the SDK the currently-published Expo Go app requires. Also bumped `react` to 19.1.0, `react-native` to 0.81.5, `react-native-reanimated` to 4.x, `react-native-safe-area-context`/`react-native-screens`/`react-native-gesture-handler`, `@react-native-async-storage/async-storage` to 2.x, and `typescript`/`@types/react`/`eslint-config-expo` to their compatible versions.
- Added `react-native-worklets` (reanimated 4's babel plugin moved out of `react-native-reanimated` into this package) and repointed `babel.config.js` at `react-native-worklets/plugin`.
- Fixed a React 19 stricter-typing break: `useRef<ReturnType<typeof setInterval>>()` in `useEmailVerification.ts` now requires an explicit initial value.
- Split the Jest babel config out of the app's `babel.config.js` into `babel.jest.config.js`: the reanimated/worklets plugin errors when loaded outside a Metro bundling context, and unit tests never import RN code anyway.
- Generated placeholder `assets/images/{icon,adaptive-icon,splash,favicon}.png` (solid-color PNGs at the correct dimensions) — `app.json` referenced these paths since Phase 1 but the files never existed, which broke `expo start`. Replace with real artwork before shipping.
- Verified with `npx expo-doctor` (18/18 checks pass) and a full `npm run verify && npm run test:rules` re-run.

### Phase 2 — Authentication
- Client Firebase config rewritten: single guarded app/auth instance (survives Expo Fast Refresh), AsyncStorage-backed session persistence, guarded/platform-aware emulator connection, env var presence validation without logging values.
- Renamed the user schema's placeholder fields to match the authoritative Phase 2 spec: `orgId` → `organizationId`, single `points` → `totalPoints`/`weeklyPoints`, added `accountStatus`. Updated across `firestore.rules`, `storage.rules`, `firestore.indexes.json`, and shared types.
- `firestore.rules`: `users/{uid}` now denies all client-side document creation (profiles are Cloud-Function-only) and allows updates only to `displayName`/`photoURL`/`updatedAt` via explicit field-diff validation.
- Cloud Functions: `onUserCreate` (1st-gen Auth trigger, idempotent) creates the Firestore profile and initial custom claims on signup; `adminSetUserRole` (2nd-gen callable) is the sole, caller-authorized path for role promotion — not wired to any UI yet.
- Authentication feature module: Turkish-message validation, Firebase Auth error mapping, `authService` (register/login/logout/reset/resend orchestration), pure `resolveRouteForState` routing helper, `AuthProvider` with bounded profile-load retry, `RouteGuard` for centralized protected/role-aware routing.
- Screens: login, register, forgot password (privacy-safe generic response), verify email (resend cooldown), and placeholder student/teacher/admin dashboards.
- Tests: unit tests for validation, error mapping, and routing (33 tests); Firestore rules tests via the emulator covering ownership, field-level write protection, and create-denial (13 tests).
- Docs: README, ARCHITECTURE, SECURITY, FIREBASE_SETUP, ROADMAP updated for the authentication design and the `organizationId`/points/`accountStatus` rename.

### Phase 1 — Bootstrap
- Initial project architecture: feature-based folder structure under `src/features/`.
- Expo + TypeScript (strict) + Expo Router configuration.
- ESLint + Prettier configuration.
- Firebase project configuration: `firebase.json`, `firestore.rules`, `storage.rules`, `firestore.indexes.json`.
- Cloud Functions skeleton (`functions/`) with TypeScript build setup.
- Full documentation set: README, ROADMAP, CLAUDE, ARCHITECTURE, FIREBASE_SETUP, SECURITY, CONTRIBUTING, FEATURES, CHANGELOG.
- Minimal working Expo Router entry screen.
