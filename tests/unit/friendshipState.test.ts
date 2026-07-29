import {
  getOtherParticipantId,
  resolveFriendshipButtonState,
} from "@features/friends/services/friendshipState";
import { Friendship } from "@/types/friendship";

function friendship(overrides: Partial<Friendship> = {}): Friendship {
  return {
    id: "a_b",
    participantIds: ["a", "b"],
    requesterId: "a",
    recipientId: "b",
    status: "pending",
    createdAt: 0,
    updatedAt: 0,
    acceptedAt: null,
    schemaVersion: 1,
    ...overrides,
  };
}

describe("resolveFriendshipButtonState", () => {
  it("is 'none' when there is no relationship at all", () => {
    expect(resolveFriendshipButtonState(null, "a")).toBe("none");
  });

  it("is 'requested_by_me' when the caller is the pending request's requester", () => {
    const state = resolveFriendshipButtonState(friendship({ requesterId: "a" }), "a");
    expect(state).toBe("requested_by_me");
  });

  it("is 'requested_by_them' when the caller is the pending request's recipient", () => {
    const state = resolveFriendshipButtonState(friendship({ requesterId: "b", recipientId: "a" }), "a");
    expect(state).toBe("requested_by_them");
  });

  it("is 'friends' once accepted, regardless of who originally requested", () => {
    expect(resolveFriendshipButtonState(friendship({ status: "accepted" }), "a")).toBe("friends");
    expect(resolveFriendshipButtonState(friendship({ status: "accepted" }), "b")).toBe("friends");
  });
});

describe("getOtherParticipantId", () => {
  it("returns the participant that isn't the caller", () => {
    const f = friendship({ participantIds: ["a", "b"] });
    expect(getOtherParticipantId(f, "a")).toBe("b");
    expect(getOtherParticipantId(f, "b")).toBe("a");
  });
});
