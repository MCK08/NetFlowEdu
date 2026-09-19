import { UserRole } from "./user";

// The client mirror of the projection in
// functions/src/profiles/publicProfileProjection.ts (the only writer) —
// publicProfiles/{uid} is readable by any authenticated user, unlike
// users/{uid} which stays owner-only.
//
// Identity only, by design (Phase 112): no points, no rank, no study
// statistics, nothing anyone could read as a score for someone else. A
// user's own progress comes from their private UserProfile instead, never
// from here.
export interface PublicProfile {
  uid: string;
  username: string | null;
  displayName: string;
  photoURL: string | null;
  role: UserRole;
}
