# Contributing

## Workflow

1. Work phase-by-phase per [ROADMAP.md](ROADMAP.md) — don't build features ahead of the current phase.
2. Before changing code, understand the existing structure ([ARCHITECTURE.md](ARCHITECTURE.md)) and state your plan briefly.
3. Implement the change.
4. Run checks before committing:
   ```bash
   npm run lint
   npm run typecheck
   ```
5. Commit with a message describing *why*, not just *what*.

## Code Style

- TypeScript strict mode — avoid `any`; if unavoidable, comment why.
- Business logic goes in `src/services/` or `src/features/<feature>/services/`, never inline in screens.
- Prefer small, composable components and hooks over large multi-purpose files.
- No unnecessary abstraction — don't build for hypothetical future requirements.
- Formatting is enforced by Prettier (`.prettierrc`) and linted by ESLint (`.eslintrc.js`).

## Firebase Changes

- Any change to `firestore.rules` or `storage.rules` must be tested against the Firebase Emulator Suite (`npm run emulators`) before merging.
- Privileged writes (roles, points, verification status) belong in `functions/`, never in client code.

## Commit Messages

Short imperative summary, then context if the "why" isn't obvious from the diff alone.
