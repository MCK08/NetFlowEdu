import { KnownAccount, sortByRecentlyUsed } from "@services/firebase/accountRegistry";

function account(uid: string, lastUsedAt: number): KnownAccount {
  return {
    uid,
    email: `${uid}@example.com`,
    displayName: uid,
    username: uid,
    photoURL: null,
    role: "student",
    lastUsedAt,
  };
}

describe("sortByRecentlyUsed", () => {
  it("orders accounts most-recently-used first", () => {
    const accounts = [account("a", 100), account("b", 300), account("c", 200)];
    expect(sortByRecentlyUsed(accounts).map((a) => a.uid)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const accounts = [account("a", 100), account("b", 300)];
    const copy = [...accounts];
    sortByRecentlyUsed(accounts);
    expect(accounts).toEqual(copy);
  });

  it("returns an empty array unchanged", () => {
    expect(sortByRecentlyUsed([])).toEqual([]);
  });
});
