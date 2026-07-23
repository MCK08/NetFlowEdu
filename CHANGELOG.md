# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Phase 6 — Social Feed, User Profiles, Likes and Comments
- Question visibility model changed from `private/class/friends` to `private/public/class`; `public` questions are readable by any authenticated user regardless of organization. `class` currently fails closed (treated as owner-only) pending a real class-roster system — the `VisibilityPicker` shows it disabled ("Sınıf özelliği yakında").
- New `publicProfiles/{uid}` collection: a safe-field mirror of `users/{uid}` (no email/accountStatus), readable by any authenticated user, kept in sync by the new `syncPublicProfile` Cloud Function trigger. Fixes a pre-existing bug where any user but yourself would show as "Kullanıcı" everywhere.
- Social feed rebuilt: merged own+public paginated feed (`useSocialFeed`/`socialFeedService`), sequential-phase pagination (own questions first, then public), replacing the old single-query `useFeed`/`feedService`.
- Like system for questions and answers: `questionLikes`/`answerLikes` collections (deterministic `{targetId}_{userId}` doc IDs), toggled only via the new `toggleQuestionLike`/`toggleAnswerLike` transactional Cloud Functions callables; `LikeButton` component with optimistic UI.
- Comment system for questions (no nested replies, no edit): `questionComments` collection, `CommentSection`/`CommentItem` components, real-time via `onSnapshot`.
- Server-maintained aggregate counts: `likeCount` (transactional), `commentCount`/`answerCount` (trigger-based, floored at 0) — all client-writes to these fields denied by `firestore.rules`.
- Public profile screen (`app/(student)/user/[userId].tsx`) with the user's public questions; owner rows across feed/detail/answers now navigate there.
- Storage rules reworked: visibility is now encoded directly in the Storage path (`questions/{public|private}/...`, `answers/{public|private}/...`) instead of a cross-service `firestore.get()` lookup, which was found to throw `EvaluationException: Null value error` on real requests. Avatar upload cap raised 2MB → 5MB.
- New Firestore indexes: `questions` (`visibility ASC, createdAt DESC`), `questions` (`ownerId ASC, visibility ASC, createdAt DESC`), `questionComments` (`questionId ASC, createdAt ASC`).
- Tests: ~34 new Firestore rules tests, rewritten Storage rules tests for the new path scheme, new unit tests for `likeId`, `commentValidation`, `socialFeedService`, rewritten `profileCache` tests.
- Docs: ARCHITECTURE, SECURITY, README, ROADMAP, FEATURES, FIREBASE_SETUP updated for the Phase 6 design.

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
