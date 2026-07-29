import { buildFriendshipPairId } from "../../functions/src/friends/pairId";
import { buildFriendshipPairId as clientBuild } from "@features/friends/services/friendshipPairId";

// Same behavior contract as the client mirror
// (@features/friends/services/friendshipPairId) — tested separately since
// the two are genuinely different files/builds (same duplication
// convention as social/likeId.ts's buildLikeId).
describe("buildFriendshipPairId (functions)", () => {
  it("is order-independent", () => {
    expect(buildFriendshipPairId("uid-a", "uid-b")).toBe(buildFriendshipPairId("uid-b", "uid-a"));
  });

  it("matches the client-side implementation's output exactly for the same inputs", () => {
    expect(buildFriendshipPairId("student-1", "teacher-9")).toBe(
      clientBuild("student-1", "teacher-9"),
    );
  });
});
