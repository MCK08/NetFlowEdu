export type FriendshipStatus = "pending" | "accepted";

// Doc id (pairId) is deterministic — see friendshipPairId.ts /
// functions/src/friends/pairId.ts — so there can only ever be one
// relationship document between any two users, by construction.
export interface Friendship {
  id: string;
  participantIds: [string, string];
  requesterId: string;
  recipientId: string;
  status: FriendshipStatus;
  createdAt: number;
  updatedAt: number;
  acceptedAt: number | null;
  schemaVersion: number;
}

// users/{uid}/socialMeta/summary — server-controlled exact counts (see
// functions/src/friends/*). Never client-writable; a client sees only its
// own document (firestore.rules).
export interface SocialMetaSummary {
  friendCount: number;
  incomingRequestCount: number;
  outgoingRequestCount: number;
  updatedAt: number;
}

export const EMPTY_SOCIAL_META: SocialMetaSummary = {
  friendCount: 0,
  incomingRequestCount: 0,
  outgoingRequestCount: 0,
  updatedAt: 0,
};
