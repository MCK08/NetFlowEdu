# Roadmap

Each phase must leave the application in a working, demoable state. No phase begins until the previous one is approved.

## Phase 1 — Bootstrap ✅
Folder structure, Firebase configuration, Expo/TypeScript/ESLint configuration, documentation. No business features.

## Phase 2 — Authentication ✅
Student / Teacher / Organization Admin / Platform Admin roles via Firebase custom claims. Teacher/admin accounts are never self-registered — only promotable server-side via `adminSetUserRole`. Student registration, email/password login, logout, password reset, email verification, persistent sessions, protected + role-aware routing, Turkish validation/error messages, Firestore rules tests. See [ARCHITECTURE.md](ARCHITECTURE.md#authentication) and [SECURITY.md](SECURITY.md).

## Phase 3 — Question Upload ✅
Students upload question images (PDFs later) to Cloud Storage. Metadata written to Firestore. Visibility: private / class / friends.

## Phase 4 — Swipe Feed ✅
TikTok-style vertical one-question-per-screen feed. Virtualized, animated, fast-loading.

## Phase 5 — Review System
Spaced-repetition scheduling: wrong answers resurface sooner, correct answers later. Configurable via [`REVIEW_CONFIG`](src/constants/config.ts), not hardcoded.

## Phase 6 — Social Feed, User Profiles, Likes and Comments ✅
Public/private/class question visibility (`class` currently fails closed, treated as owner-only pending a real class-roster system). Merged own+public paginated social feed. Public user profiles via a safe-field `publicProfiles/{uid}` mirror. Like system for questions and answers via transactional Cloud Functions callables. Comment system for questions (no nested replies). Server-maintained aggregate counts (`likeCount`, `commentCount`, `answerCount`). Storage paths now encode visibility directly to avoid a `firestore.get()` failure mode found in Storage rules. See [ARCHITECTURE.md](ARCHITECTURE.md#social-feed-phase-6) and [SECURITY.md](SECURITY.md#social-feed-phase-6). Not implemented (deliberately out of scope): friends, direct messaging, notifications, AI, OCR, PDF, full class management, leaderboards, subscriptions, payments, moderation dashboard.

## Phase 7 — Classes
Real class membership: teachers create classes; students join via code; teachers monitor progress. This will also be what finally lets `class`-visibility questions be readable by classmates instead of owner-only.

## Phase 8 — Friends
Friend graph; friends can solve each other's questions and upload solutions.

## Phase 9 — Leaderboards
Weekly / monthly / class / school / organization leaderboards. Points awarded exclusively via Cloud Functions — never trusted from the client.

## Phase 10 — Notifications
Firebase Cloud Messaging: review reminders, class activity, streaks.

## Phase 11 — AI Features
TBD — scoped once the core loop (Phases 2–9) is validated with real users.
