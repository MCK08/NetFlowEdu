# Changelog

All notable changes to this project are documented here.

## [Unreleased]

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
