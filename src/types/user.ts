export type UserRole = "student" | "teacher" | "organization_admin" | "platform_admin";

export type AccountStatus = "active" | "suspended";

// Server-managed fields (role, organizationId, totalPoints, weeklyPoints,
// accountStatus, createdAt) are written only by Cloud Functions — see
// firestore.rules and functions/src/triggers/onUserCreate.ts. The client may
// only ever write displayName / photoURL / updatedAt on its own document.
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
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
