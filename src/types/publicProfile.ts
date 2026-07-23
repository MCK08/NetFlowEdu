import { UserRole } from "./user";

// Deliberately excludes email/accountStatus/moderation fields — see
// functions/src/profiles/syncPublicProfile.ts (the only writer) and
// firestore.rules `publicProfiles/{uid}` (readable by any authenticated
// user, unlike users/{uid} which stays owner-only).
export interface PublicProfile {
  uid: string;
  username: string | null;
  displayName: string;
  photoURL: string | null;
  role: UserRole;
  organizationId: string | null;
  totalPoints: number;
  weeklyPoints: number;
  createdAt: number;
}
