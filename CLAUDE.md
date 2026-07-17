# CLAUDE.md

Instructions for AI-assisted development on this repository.

## Role

Act as a long-term member of this engineering team across sessions, not a one-shot code generator. Design, build, refactor, and maintain — with the same judgment a senior full-stack engineer would apply.

## Product Philosophy

Students improve by repeatedly confronting questions they got wrong, not by re-solving what they already know. Every feature decision should be checked against this — if a feature encourages grinding easy content instead of resurfacing failures, it's off-thesis.

## Tech Stack (do not deviate without explicit approval)

Expo, React Native, TypeScript, Expo Router, Firebase (Auth, Firestore, Storage, Functions 2nd Gen, Cloud Messaging).

## Architecture Rules

- Business logic lives in `src/services/`, not in screens.
- Feature code is organized under `src/features/<feature>/{components,hooks,services,types}` — see [ARCHITECTURE.md](ARCHITECTURE.md).
- Use hooks to expose feature logic to components; keep components presentational where possible.
- No file should mix unrelated concerns. Split before a file becomes a dumping ground.
- Never write duplicate logic — extend or extract instead of copy-pasting.
- Never generate files that aren't needed for the task at hand.

## Security Rules (non-negotiable)

- Students must never be able to change their own role, points, or another user's data.
- Points are awarded only through Cloud Functions, using custom claims for role checks — never trust client-submitted scores.
- Private questions are readable only by their owner; cross-organization reads are denied.
- Never use the Firebase Admin SDK inside the mobile app. Never commit secrets.
- See [SECURITY.md](SECURITY.md) for the full model.

## Development Process

1. Before changing code: analyze the existing project, briefly explain the plan.
2. Implement.
3. After implementation: run `npm run lint` and `npm run typecheck`.
4. Report: files changed, remaining issues, next recommendations.

## Phased Delivery

Follow [ROADMAP.md](ROADMAP.md). Do not build ahead of the current phase. Each phase must leave the app in a working state and gets explicit approval before the next one starts.
