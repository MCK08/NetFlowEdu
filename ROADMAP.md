# Roadmap

Each phase must leave the application in a working, demoable state. No phase begins until the previous one is approved.

## Phase 1 — Bootstrap ✅
Folder structure, Firebase configuration, Expo/TypeScript/ESLint configuration, documentation. No business features.

## Phase 2 — Authentication ✅
Student / Teacher / Organization Admin / Platform Admin roles via Firebase custom claims. Teacher/admin accounts are never self-registered — only promotable server-side via `adminSetUserRole`. Student registration, email/password login, logout, password reset, email verification, persistent sessions, protected + role-aware routing, Turkish validation/error messages, Firestore rules tests. See [ARCHITECTURE.md](ARCHITECTURE.md#authentication) and [SECURITY.md](SECURITY.md).

## Phase 3 — Question Upload (current)
Students upload question images (PDFs later) to Cloud Storage. Metadata written to Firestore. Visibility: private / class / friends.

## Phase 4 — Swipe Feed
TikTok-style vertical one-question-per-screen feed. Virtualized, animated, fast-loading.

## Phase 5 — Review System
Spaced-repetition scheduling: wrong answers resurface sooner, correct answers later. Configurable via [`REVIEW_CONFIG`](src/constants/config.ts), not hardcoded.

## Phase 6 — Classes
Teachers create classes; students join via code; teachers monitor progress.

## Phase 7 — Friends
Friend graph; friends can solve each other's questions and upload solutions.

## Phase 8 — Leaderboards
Weekly / monthly / class / school / organization leaderboards. Points awarded exclusively via Cloud Functions — never trusted from the client.

## Phase 9 — Notifications
Firebase Cloud Messaging: review reminders, class activity, streaks.

## Phase 10 — AI Features
TBD — scoped once the core loop (Phases 2–8) is validated with real users.
