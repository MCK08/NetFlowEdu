import { OnboardingStatus } from "@utils/onboardingStatus";

export type UserRole = "student" | "teacher" | "organization_admin" | "platform_admin";

export type AccountStatus = "active" | "suspended";

// Server-managed fields (role, organizationId, totalPoints, weeklyPoints,
// accountStatus, createdAt, username) are written only by Cloud Functions —
// see firestore.rules, functions/src/triggers/onUserCreate.ts, and
// functions/src/users/setUsername.ts. The client may only ever write
// displayName / photoURL / updatedAt on its own document. `username` is
// null until setUsername succeeds (see authService.registerStudent) — UI
// must fall back to displayName, never to uid.
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  username: string | null;
  role: UserRole;
  organizationId: string | null;
  photoURL: string | null;
  totalPoints: number;
  weeklyPoints: number;
  accountStatus: AccountStatus;
  emailVerified: boolean;
  // Stage-2 onboarding state (functions/src/onboarding/completeOnboarding.ts).
  // "pending"/"provisioning" means the role/claims grant hasn't actually
  // completed yet, even if the account's `role` already looks like a
  // terminal value (e.g. the "student" onUserCreate defaults everyone to
  // until Stage 2 promotes it) — see RouteGuard, which treats this as "not
  // done yet, route back to the retry screen" rather than trusting `role`.
  onboardingStatus: OnboardingStatus;
  createdAt: number;
  updatedAt: number;
}
