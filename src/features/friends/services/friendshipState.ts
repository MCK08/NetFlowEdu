import { Friendship } from "@/types/friendship";

export type FriendshipButtonState =
  | "none"
  | "requested_by_me"
  | "requested_by_them"
  | "friends";

// Pure resolver — the single source of truth PublicProfileScreen's button
// (and, eventually, any other surface) uses to decide which of the four
// states to render. No network/side effects, so it's trivially unit-tested
// against every Friendship shape without a Firestore fake.
export function resolveFriendshipButtonState(
  friendship: Friendship | null,
  ownUid: string,
): FriendshipButtonState {
  if (!friendship) return "none";
  if (friendship.status === "accepted") return "friends";
  return friendship.requesterId === ownUid ? "requested_by_me" : "requested_by_them";
}

// The participant that ISN'T the caller — every row (friend, incoming,
// outgoing) needs this to know whose public profile to render.
export function getOtherParticipantId(friendship: Friendship, ownUid: string): string {
  return friendship.participantIds[0] === ownUid
    ? friendship.participantIds[1]
    : friendship.participantIds[0];
}
