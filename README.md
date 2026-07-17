# NetFlow Edu

A social learning platform where students permanently learn from the questions they previously got wrong. Instead of grinding easy questions, the review feed intelligently resurfaces the ones a student has failed — TikTok-style, one question per swipe, powered by spaced repetition.

Built for tutoring centers, schools, and educational institutions. Content is user-generated: students upload their own questions, and the platform's job is to make sure the *wrong* ones come back until they're not wrong anymore.

## Core Philosophy

Students don't improve by solving what they already know. They improve by repeatedly confronting what they got wrong. Every feature in this product should reinforce that.

## Tech Stack

- **Frontend:** Expo, React Native, TypeScript, Expo Router
- **Backend:** Firebase Authentication, Cloud Firestore, Cloud Storage, Cloud Functions (2nd Gen), Firebase Cloud Messaging
- **Testing:** Firebase Emulator Suite, ESLint, TypeScript strict mode

## Getting Started

```bash
npm install
cp .env.example .env   # fill in Firebase web config
npm start
```

To develop against local Firebase services instead of production:

```bash
npm run emulators       # starts Auth, Firestore, Storage, Functions emulators
# set EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true in .env
```

The Firestore emulator requires a local Java runtime (JDK 11+) — see [FIREBASE_SETUP.md](FIREBASE_SETUP.md#emulator-requirements).

See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for full project setup.

## Project Structure

See [ARCHITECTURE.md](ARCHITECTURE.md).

## Authentication

Phase 2 implements a full authentication foundation: student self-registration, email/password login, password reset, email verification, persistent sessions, and role-aware protected routing (student / teacher / organization_admin / platform_admin). Public registration only ever creates a `student` account — role promotion is a server-only Cloud Function, never client-writable. See [ARCHITECTURE.md](ARCHITECTURE.md#authentication) and [SECURITY.md](SECURITY.md) for the full design and threat model.

## Commands

```bash
npm run lint            # ESLint
npm run typecheck       # tsc --noEmit
npm run test             # unit tests (validation, error mapping, routing)
npm run test:rules       # Firestore security rules tests (spins up the emulator)
npm run functions:build  # compile Cloud Functions
npm run verify            # lint + typecheck + test + functions build
```

## Documentation

- [ROADMAP.md](ROADMAP.md) — phased delivery plan
- [ARCHITECTURE.md](ARCHITECTURE.md) — folder structure and design principles
- [FIREBASE_SETUP.md](FIREBASE_SETUP.md) — Firebase project configuration
- [SECURITY.md](SECURITY.md) — security model and rules
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute
- [FEATURES.md](FEATURES.md) — feature inventory and status
- [CHANGELOG.md](CHANGELOG.md) — release history
- [CLAUDE.md](CLAUDE.md) — instructions for AI-assisted development on this repo

## Status

Phase 1 (bootstrap architecture) and Phase 2 (authentication) complete. See [ROADMAP.md](ROADMAP.md) for what's next.
