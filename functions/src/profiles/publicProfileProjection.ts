// Phase 112 — the public profile contract, in one place.
//
// publicProfiles/{uid} is readable by EVERY authenticated user (see
// firestore.rules), so this projection is exactly what any peer can learn
// about an account. It is therefore identity only: what a name, an avatar
// and a role badge need, and nothing academic.
//
// WHY THIS NARROWED
//
// Phase 110 settled the social principle — no leaderboard, no ranking, no
// peer performance comparison. The stored data still disagreed with it:
// totalPoints/weeklyPoints were copied into this public document, which
// published a per-user score to everyone who could read a profile, and
// PublicProfileScreen rendered both as "Puan" / "Haftalık" on someone
// else's profile. organizationId/createdAt were copied too and had no
// reader at all, so they leaked which school an account belongs to for
// nothing.
//
// Private progress is untouched: users/{uid} keeps its own fields and
// stays owner-only (the client may still show a user their OWN numbers).
// This module only decides what leaves that document.

export interface PublicProfileProjection {
  uid: string;
  username: string | null;
  displayName: string;
  photoURL: string | null;
  // Kept deliberately: FriendRow, FindFriendsScreen and PublicProfileScreen
  // render an "Öğretmen" badge from it. It is a role, not a measurement —
  // it says nothing about how anyone is performing.
  role: string;
}

/** Fields an older projection wrote that must never be public again.
 *
 *  syncPublicProfile REPLACES the document rather than merging into it, so
 *  any profile written after this phase loses these on its own. Documents
 *  belonging to accounts that are never written again keep them until
 *  functions/scripts/cleanupPublicProfileFields.mts deletes them — that
 *  script reads this same list, so the two can't drift. */
export const LEGACY_PUBLIC_PROFILE_FIELDS = [
  "totalPoints",
  "weeklyPoints",
  "organizationId",
  "createdAt",
] as const;

/** The only shape ever written to publicProfiles/{uid}. Takes the raw
 *  users/{uid} data and keeps nothing it wasn't explicitly asked for, so a
 *  field added to the private document later cannot leak by default. */
export function buildPublicProfileProjection(
  uid: string,
  data: Record<string, unknown>,
): PublicProfileProjection {
  return {
    uid,
    username: typeof data.username === "string" ? data.username : null,
    displayName: typeof data.displayName === "string" ? data.displayName : "",
    photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
    role: typeof data.role === "string" ? data.role : "student",
  };
}
