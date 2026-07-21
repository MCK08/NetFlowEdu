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
  createdAt: number;
  updatedAt: number;
}
