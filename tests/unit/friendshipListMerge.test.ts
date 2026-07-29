import {
  dedupeFriendshipsById,
  mergeFriendshipPages,
} from "@features/friends/services/friendshipListMerge";
import { Friendship } from "@/types/friendship";

function f(id: string): Friendship {
  return {
    id,
    participantIds: ["a", "b"],
    requesterId: "a",
    recipientId: "b",
    status: "accepted",
    createdAt: 0,
    updatedAt: 0,
    acceptedAt: null,
    schemaVersion: 1,
  };
}

describe("mergeFriendshipPages", () => {
  it("appends a clean second page", () => {
    const merged = mergeFriendshipPages([f("a"), f("b")], [f("c")]);
    expect(merged.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("drops ids already present across an overlapping cursor page", () => {
    const merged = mergeFriendshipPages([f("a"), f("b")], [f("b"), f("c")]);
    expect(merged.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("returns the existing array untouched for an empty incoming page", () => {
    const existing = [f("a")];
    expect(mergeFriendshipPages(existing, [])).toBe(existing);
  });

  it("never mutates the existing array", () => {
    const existing = [f("a")];
    mergeFriendshipPages(existing, [f("b")]);
    expect(existing.map((x) => x.id)).toEqual(["a"]);
  });
});

describe("dedupeFriendshipsById", () => {
  it("keeps the first occurrence only", () => {
    expect(dedupeFriendshipsById([f("a"), f("b"), f("a")]).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("handles an empty list", () => {
    expect(dedupeFriendshipsById([])).toEqual([]);
  });
});
