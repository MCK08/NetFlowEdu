# Architecture

## Principles

- **Feature-based organization.** Code is grouped by what it does for the product (questions, review, classes), not by technical layer.
- **Business logic lives in services**, never inline in screens. Screens compose hooks; hooks call services; services talk to Firebase.
- **Reusable, composable components** over one-off screen-specific markup.
- **No large files with unrelated logic.** If a file is doing two jobs, split it.

## Folder Structure

```
app/                          Expo Router routes (file-based routing only — no logic)
  (auth)/                     Auth flow routes
  (student)/                  Student-facing routes
  (teacher)/                  Teacher-facing routes
  (admin)/                    Org/platform admin routes
  _layout.tsx                 Root layout
  index.tsx                   Entry route

src/
  features/                   One folder per product feature
    authentication/
      components/             Feature-specific UI (RouteGuard)
      hooks/                  useAuth, useLoginForm, useRegisterForm, useForgotPasswordForm, useEmailVerification
      providers/              AuthProvider (Firebase Auth state + profile subscription)
      screens/                LoginScreen, RegisterScreen, ForgotPasswordScreen, VerifyEmailScreen
      services/                authService, errorMapper, routing, profileWait
      types/                  RegisterInput, LoginInput, ForgotPasswordInput
      validation/             Turkish-message field validators
    questions/
    review/
    classes/
    friends/
    leaderboards/
    notifications/
  components/ui/               Shared, feature-agnostic UI primitives (Button, Card, etc.)
  hooks/                       Shared, cross-feature hooks
  services/firebase/           Firebase SDK initialization (config.ts) — the only place firebase/app is configured
  types/                       Shared domain types (User, Question, ...)
  utils/                       Pure helper functions
  constants/                   Tunable configuration (e.g. review algorithm parameters)

functions/
  src/
    questions/                Callable/HTTPS functions for question operations
    review/                   Spaced-repetition scheduling logic
    leaderboards/             Points aggregation (server-trusted only)
    classes/                  Class roster management
    friends/                  Friend graph operations
    triggers/                 Firestore/Auth triggers
    utils/                    Shared server-side helpers

tests/
  unit/
  integration/

docs/                          Supplementary documentation
```

## Why a feature ships across `src/features/<name>/*`

Each feature owns its full vertical slice — components, hooks, services, types — so it can be understood, tested, and removed as a unit. Cross-feature reuse goes through `src/components/ui`, `src/hooks`, or `src/services`, never by importing directly across feature folders.

## Firebase Access Pattern

- Client (`src/services/firebase/config.ts`) initializes the Firebase Web SDK only. It never uses the Admin SDK.
- All privileged writes (role changes, points, verified-solution status) go through Cloud Functions, which alone hold Admin SDK access.
- Firestore/Storage security rules ([firestore.rules](firestore.rules), [storage.rules](storage.rules)) are the actual enforcement layer — client code assumes nothing is trusted until the rules confirm it.

## Path Aliases

Configured in [tsconfig.json](tsconfig.json): `@/*`, `@features/*`, `@components/*`, `@services/*`, `@hooks/*`, `@types/*`, `@utils/*`, `@constants/*`. Mirrored in [jest.config.js](jest.config.js) via `moduleNameMapper` so unit tests can import the same way production code does.

## Authentication

### Profile document shape — one document, not split

`users/{uid}` holds the full profile (`role`, `organizationId`, `totalPoints`, `weeklyPoints`, `accountStatus`, plus `displayName`/`photoURL`/`email`). We deliberately did **not** split server-managed fields into a separate private document. The reasoning: Firestore rules can't hide individual fields within a document a user is allowed to read, but every field here is something the owner is meant to see about their own account — nothing needs to stay invisible to them, only protected from being *written* by them. `firestore.rules` enforces that with a field-diff check (`request.resource.data.diff(resource.data).affectedKeys().hasOnly([...])`) rather than document splitting. A split would only be justified once a field must be hidden from the owner too (e.g. internal moderation notes) — not the case yet. See [SECURITY.md](SECURITY.md).

### Profile creation — Cloud Functions v1 Auth trigger

`functions/src/triggers/onUserCreate.ts` uses `functions.auth.user().onCreate` (1st-gen) to create `users/{uid}` and set initial custom claims (`role: "student"`, `organizationId: null`) the moment a Firebase Auth account is created. This is a deliberate exception to the project's default of 2nd-gen functions: 2nd gen's only identity-adjacent hooks are the *blocking* `beforeUserCreated`/`beforeUserSignedIn` functions, meant for short-lived veto/mutation logic during sign-up, not for writing a Firestore document afterward. The 1st-gen Auth trigger is still Firebase's documented, fully supported mechanism for this, and it coexists in the same `functions/` codebase as the 2nd-gen HTTPS/callable functions used everywhere else (e.g. `adminSetUserRole`). The trigger checks for an existing document before creating one, so a Cloud Functions retry can never overwrite a promoted teacher/admin's role or points.

### Custom claims synchronization

`role` and `organizationId` live as Firebase Auth **custom claims**, set only by `onUserCreate` and `adminSetUserRole` (both Admin SDK, both server-only). The client's cached ID token doesn't pick up a claims change automatically — `AuthProvider.refreshSession()` and the post-login flow in `authService.ts` force a token refresh (`user.getIdToken(true)`) after any event that could have changed claims (login, explicit "check verification" tap). Firestore/Storage rules read claims directly (`request.auth.token.role`) rather than fetching the profile document, so authorization checks don't cost an extra read.

### AuthProvider

`src/features/authentication/providers/AuthProvider.tsx` is the single source of truth for auth state: it subscribes once to `onAuthStateChanged`, and — keyed on `uid` (not the `User` object reference, to avoid resubscribing on every token refresh) — subscribes to the signed-in user's `users/{uid}` document. If that document doesn't appear within 10 seconds (the `onUserCreate` trigger failed or is slow), it surfaces a recoverable `profileError` instead of spinning forever. It exposes `firebaseUser`, `profile`, `role`, `isAuthenticated`, `isEmailVerified`, `isLoading`, `profileLoading`, `profileError`, and the auth actions (`signIn`, `register`, `signOut`, `sendPasswordReset`, `resendVerification`, `refreshSession`) — no screen-specific logic lives here; that's in the `use*Form` hooks.

### Routing strategy

`src/features/authentication/services/routing.ts` exports a pure function, `resolveRouteForState`, that maps `{ isAuthenticated, isEmailVerified, role }` to a target route. It's the single place this decision is made — both the centralized `RouteGuard` component (`src/features/authentication/components/RouteGuard.tsx`, mounted once in `app/_layout.tsx`) and any future deep-link handling should call it rather than re-deriving the mapping. `RouteGuard` renders an opaque splash overlay (not a route swap) while auth/profile state is still loading, so the underlying `<Stack/>` stays mounted (`useSegments`/`useRouter` need a live navigator) without ever letting protected content flash through before a redirect fires. An authenticated, verified user with no recognized role fails closed to `/unknown-role` rather than falling through to a default dashboard.
