import { buildFriendshipPairId } from "@features/friends/services/friendshipPairId";

describe("buildFriendshipPairId (client)", () => {
  it("is order-independent — the same pair always produces the same id", () => {
    expect(buildFriendshipPairId("uid-a", "uid-b")).toBe(buildFriendshipPairId("uid-b", "uid-a"));
  });

  it("sorts the two uids lexicographically", () => {
    expect(buildFriendshipPairId("zebra", "apple")).toBe("apple_zebra");
  });

  it("produces different ids for different pairs", () => {
    expect(buildFriendshipPairId("a", "b")).not.toBe(buildFriendshipPairId("a", "c"));
  });

  it("is deterministic across repeated calls", () => {
    const first = buildFriendshipPairId("student-1", "teacher-1");
    const second = buildFriendshipPairId("student-1", "teacher-1");
    expect(first).toBe(second);
  });
});
