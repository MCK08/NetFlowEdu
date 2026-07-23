# Security Model

## Roles

- `student` — the only role public registration can ever create
- `teacher` — cannot self-register; promoted only via the server-verified `adminSetUserRole` callable
- `organization_admin` — manages a tutoring center / school's org; can promote within their own `organizationId` only, and cannot grant `platform_admin`
- `platform_admin` — NetFlow Edu staff; can promote anyone to any role

Roles and `organizationId` are stored as **Firebase custom claims**, set only by Cloud Functions via the Admin SDK:
- `functions/src/triggers/onUserCreate.ts` sets the initial `{ role: "student", organizationId: null }` claims when an Auth account is created.
- `functions/src/admin/setUserRole.ts` (`adminSetUserRole`, a callable) is the only path that ever changes them afterward, and it verifies the *caller's own* custom claims before acting — never a client-supplied "I am an admin" flag. It is not wired to any UI in Phase 2; it exists as the trusted path a future admin panel will call.

Firestore/Storage rules check `request.auth.token.role` and `request.auth.token.organizationId` — never a client-writable field. Because the client's ID token is cached, `AuthProvider.refreshSession()` and the login flow force a token refresh (`getIdToken(true)`) at the points where claims could have changed, so rule checks never run against a stale token for longer than one session.

## Non-Negotiables

- Students cannot change their own role, points, organization, account status, or `createdAt`. `firestore.rules` enforces this with an explicit field-diff check on `users/{uid}` updates (`affectedKeys().hasOnly(['displayName', 'photoURL', 'updatedAt'])`) plus per-field equality checks — not a blanket "authenticated users can write" rule.
- Students cannot modify another user's data — reads and writes on `users/{uid}` require `request.auth.uid == userId`.
- Students cannot create their own profile document at all (`allow create: if false`) — only the `onUserCreate` Cloud Function, via the Admin SDK, creates it. A client `setDoc`/`create` on `users/{uid}` is always denied, even with otherwise-valid data.
- Students cannot read private questions belonging to another user.
- Users cannot read data belonging to a different organization.
- Points/scores are written **only** by Cloud Functions. Firestore rules deny all client writes to `leaderboards/*` and reject any `users/{uid}` update that changes `totalPoints` or `weeklyPoints`.
- The Firebase Admin SDK is never bundled into the mobile app — it runs only in Cloud Functions.
- No secrets (API keys beyond the public Firebase web config, service account credentials, etc.) are committed to the repository. Service account keys, if ever needed locally, stay in `.gitignore`d files.
- Firebase Auth error codes are never shown to users directly — `mapAuthErrorToMessage` (`src/features/authentication/services/errorMapper.ts`) maps every known code to a Turkish message and falls back to a generic one for anything unmapped, so no internal detail leaks through an error string.
- Password reset never confirms or denies whether an email address is registered — `requestPasswordReset` swallows `sendPasswordResetEmail` errors and the UI always shows the same generic success message, closing the account-enumeration side channel.
- A suspended account (`accountStatus: "suspended"`) is signed out server-of-truth-side at login: `AuthProvider.signIn()` fetches the profile immediately after Firebase Auth sign-in and forces a sign-out before any protected route is reachable if `accountStatus` is `"suspended"`.

## Enforcement Layers

1. **Firestore rules** ([firestore.rules](firestore.rules)) — the primary enforcement point for reads/writes.
2. **Storage rules** ([storage.rules](storage.rules)) — file type/size/ownership checks on uploads.
3. **Cloud Functions** — the only place privileged mutations (role changes, point awards, solution verification) happen, using the Admin SDK, which bypasses client rules by design.

## Data Isolation

Every org-scoped document carries an `organizationId` field. Rules compare it against the caller's `organizationId` custom claim before allowing access — this is what prevents cross-organization data leaks between tutoring centers/schools. (`public`-visibility questions are the one deliberate exception — "public" means visible to any authenticated user, regardless of organization, by design.)

## Threats and Mitigations

| Threat | Mitigation |
|---|---|
| Client forges a `role`/`organizationId`/points value on registration or profile update | `firestore.rules` denies client `create` on `users/{uid}` outright and field-diffs every `update`; the actual values only ever come from `onUserCreate`/`adminSetUserRole`, both Admin SDK. |
| Client claims to be `organization_admin`/`platform_admin` to call a privileged function | `adminSetUserRole` reads `request.auth.token.role`, set server-side — a forged claim in the request body is ignored. |
| Stale ID token still carries an old role after a promotion/demotion | Claims changes only take effect once the client refreshes its token; `refreshSession()` and the login flow force that refresh at the points where staleness would matter. Until refreshed, Firestore rules still enforce the *old* claims (fails closed, not open). |
| Attacker enumerates registered emails via password reset | `requestPasswordReset` never surfaces whether `sendPasswordResetEmail` succeeded or failed with `auth/user-not-found` — the UI always shows one generic Turkish message. |
| Registration partially fails after Auth account creation (e.g. network drop before `sendEmailVerification`) | Non-fatal by design: `registerStudent` swallows failures on `setDisplayName`/`sendVerificationEmail` since the account and the server-created profile are already valid; the user can resend verification from the verify-email screen. No orphaned/inconsistent Firestore state results, because the profile's creation doesn't depend on either of those steps succeeding. |
| Suspended user keeps a live session | Checked at sign-in time (`AuthProvider.signIn()` reads the profile immediately after Auth sign-in and force-signs-out on `accountStatus === "suspended"`). Not yet a continuous real-time check while already in a session — see Known Limitations in the Phase 2 completion report. |

## Social Feed (Phase 6)

- **Cross-user profile exposure, fixed.** `users/{uid}` contains `email`/`accountStatus` and was already owner-only, but before Phase 6 nothing else was readable cross-user either — meaning username/avatar display for anyone but yourself silently failed and fell back to "Kullanıcı". `publicProfiles/{uid}` (readable by any authenticated user; write always denied to clients) is a safe-field-only mirror — `uid`, `username`, `displayName`, `photoURL`, `role`, `organizationId`, `totalPoints`, `weeklyPoints`, `createdAt` — synced by `functions/src/profiles/syncPublicProfile.ts`. It never contains email, `accountStatus`, or any moderation field, and is deleted outright if the source account is suspended.
- **Likes cannot be forged or double-counted client-side.** `questionLikes`/`answerLikes` deny all direct client writes (`allow write: if false`) — the only path is `toggleQuestionLike`/`toggleAnswerLike` (Admin SDK), which verify the caller can read the target, then create/delete the deterministic `{targetId}_{userId}` like doc and update the target's `likeCount` inside one Firestore transaction. A client can read only its own like record.
- **Comments cannot spoof an owner or bypass question visibility.** `questionComments` create requires `ownerId == request.auth.uid`, `1–500` character `text`, server `createdAt`, and — via the same `canReadQuestionData` indirection used by `answers/{answerId}` — the caller must be able to read the comment's parent question. Only the comment's own owner may delete it; no edit path exists.
- **Aggregate counts (`answerCount`, `likeCount`, `commentCount`) are never client-writable.** `firestore.rules` field-diffs every one of them on `questions`/`answers` updates; the only writers are Cloud Functions (transactional for `likeCount`, trigger-based increment/decrement floored at 0 for the others — see ARCHITECTURE.md's "Aggregate count model").
- **`class` visibility fails closed, not open.** There's no real class-roster system yet. Rather than fake membership, both `firestore.rules`' `canReadQuestionData` and the Storage path's access-level segment treat `class` as owner-only — identical to `private` — until a real membership check exists. The client-side `VisibilityPicker` shows the option but disabled ("Sınıf özelliği yakında"), so it's not reachable through the UI either.
- **Storage no longer risks the `firestore.get()` failure mode for question/answer images.** A prior phase found `firestore.get()` inside Storage Rules throws `EvaluationException: Null value error` on real requests, breaking `getDownloadURL()` even for a file's own owner. Visibility is now encoded in the Storage path itself (`questions/{public|private}/{ownerId}/{fileName}`, `answers/{public|private}/{questionId}/{ownerId}/{fileName}`), so every access check is a path-segment comparison — it cannot fail this way, by construction.
- **Avatar upload cap raised to 5 MB** (from 2 MB), per this phase's spec; still content-type-restricted to `image/*` and owner-only write.

## Reporting a Concern

If you find a security issue in this codebase during development, do not deploy the change — flag it in the PR description and fix the rule/function before merging.
