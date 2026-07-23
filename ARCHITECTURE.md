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

## Social Feed (Phase 6)

### Visibility model

`Question.visibility` is `"private" | "public" | "class"`. `"class"` is schema-reserved but not creatable yet — there's no real class-membership/roster system, and rather than fake one, `firestore.rules`' `canReadQuestionData` treats `class` as owner-only (same as `private`) until a real roster check exists. The upload UI's `VisibilityPicker` shows the option disabled with "Sınıf özelliği yakında" rather than hiding it, so the eventual activation is a rules + UI-enable change, not a schema migration.

### Feed query strategy

Firestore can't safely serve one broad query mixing private/public/class documents — a query can only succeed if *every* possible matching document satisfies the rules for the caller, which a single `questions` query spanning visibilities can't guarantee. `src/features/feed/services/socialFeedService.ts` instead runs two **separate, rules-safe queries as sequential phases** rather than a merged/interleaved feed:

1. **own** — `where ownerId == uid`, paginated (10/page), until exhausted.
2. **public** — `where visibility == "public"`, paginated (10/page), until exhausted.

This is simpler and more robust than merging two cursors by date while still matching the required priority order ("own questions first, then public"). A `seenIds` set (threaded through by `useSocialFeed`) deduplicates the case where a user's own question is also public, which would otherwise appear once per phase. `useSocialFeed` tracks pagination state in refs (not React state) so `loadMore()` never needs to be recreated per page, and a `generation` counter discards stale in-flight results from a previous refresh/uid-change.

### Public profile split

`users/{uid}` contains `email`/`accountStatus` and stays strictly owner-only readable (unchanged from Phase 2). A new `publicProfiles/{uid}` document — `uid`, `username`, `displayName`, `photoURL`, `role`, `organizationId`, `totalPoints`, `weeklyPoints`, `createdAt` only, **never** email/accountStatus/moderation data — is readable by any authenticated user. It's synced by `functions/src/profiles/syncPublicProfile.ts`, an `onDocumentWritten("users/{uid}")` trigger: idempotent by construction (re-running with the same source data always produces the same public copy), and deletes the public profile outright if `accountStatus` becomes `"suspended"` rather than maintaining a second "is this visible" branch through every reader.

`src/features/profiles/services/profileCacheService.ts` (the uid → display-handle cache used by feed cards, answer cards, comments) now reads from `publicProfiles` instead of `users` — this is what makes cross-user username/avatar display actually work; previously every non-self lookup silently failed closed (owner-only rule) and fell back to "Kullanıcı".

### Like model

`questionLikes/{questionId_userId}` and `answerLikes/{answerId_userId}` — the deterministic doc id (`buildLikeId`, duplicated intentionally in `functions/src/social/likeId.ts` and `src/features/social/likes/services/likeId.ts` since one runs server-side and one client-side) is what makes toggling idempotent: there can only ever be one like document per (target, user) pair. Clients can read only their own like doc (`allow read: if isOwner(resource.data.userId)`) and can never write one directly — `toggleQuestionLike`/`toggleAnswerLike` (`functions/src/social/`) are the only path, each running the like-doc create/delete and the target's `likeCount` update inside one Firestore transaction, floored at 0. The client (`useLike`) applies an optimistic update immediately and rolls back on failure, with an `isToggling` guard against rapid double-taps firing overlapping requests.

### Comment model

`questionComments/{commentId}` — flat, no nested replies, questions only (not answers) this phase. `firestore.rules` validates `ownerId == uid()`, `status == "active"`, `createdAt == request.time`, and `1 <= text.size() <= 500` server-side; `validateCommentText`/`normalizeCommentText` (`src/features/social/comments/services/commentValidation.ts`, pure/testable) do the same check client-side first for a fast, specific Turkish error instead of a round-trip `permission-denied`. Read access mirrors answers: readable by anyone who can read the parent question. No edit feature — `allow update: if false`; only the comment's own owner may delete (admin moderation deferred).

### Aggregate count model

`answerCount`, `likeCount` (on both questions and answers), and `commentCount` are all denormalized fields, never client-writable (`firestore.rules` field-diffs every one of them on `questions`/`answers` updates). Three different write paths, chosen per how the count changes:

- **answerCount / commentCount** — Firestore-triggered increment/decrement (`onAnswerCreate`, `onQuestionCommentCreate`/`onQuestionCommentDelete`). At-least-once delivery means a retried trigger could in principle double-count; accepted for the same reason as Phase 5's `answerCount` — an informational display count, not security- or scoring-sensitive. Decrements go through a transaction floored at 0 rather than a bare `FieldValue.increment(-1)`, so a delivery race can't drive the count negative.
- **likeCount** — transactional increment/decrement inside the same transaction as the like-doc create/delete (`toggleQuestionLike`/`toggleAnswerLike`), also floored at 0. This one has to be transactional (not trigger-based) because it needs to read-then-write the like doc's existence to decide increment vs. decrement in the same atomic step.

### Storage path encodes visibility

Storage Rules' `firestore.get()` is empirically unsafe to depend on — a prior phase reproduced it throwing `EvaluationException: Null value error` on real requests, breaking `getDownloadURL()` even for a file's own owner (see the comment block in `storage.rules`). Now that public questions need Storage access broader than "owner only," visibility is encoded directly in the **path** instead of looked up: `questions/{public|private}/{ownerId}/{fileName}` and `answers/{public|private}/{questionId}/{ownerId}/{fileName}`. Every access check in `storage.rules` is a path-segment comparison, never a cross-service call, so it can't fail this way. `class` visibility collapses to the `private` access level (same reasoning as the Firestore rule — no real membership check yet). The client already has the question's visibility in hand at both question-upload time (`VisibilityPicker`) and answer-upload time (`QuestionDetailScreen` passes it through the `answer/[questionId]` route's `visibility` query param, defaulting to the strictest option, `private`, if the param is ever missing/malformed) — so building the correct path segment client-side needs no extra read.
