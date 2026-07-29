import { mapFriendErrorToMessage } from "@features/friends/services/friendErrorMapper";

describe("mapFriendErrorToMessage", () => {
  const GENERIC = "Bir şeyler ters gitti. Lütfen tekrar deneyin.";

  it("gives every mapped code a distinct, non-generic message", () => {
    const codes = [
      "functions/unauthenticated",
      "functions/invalid-argument",
      "functions/not-found",
      "functions/failed-precondition",
      "functions/permission-denied",
      "functions/already-exists",
    ];
    const messages = codes.map(mapFriendErrorToMessage);
    for (const m of messages) expect(m).not.toBe(GENERIC);
    expect(new Set(messages).size).toBe(messages.length);
  });

  it("never leaks a raw code to the user", () => {
    for (const code of ["functions/permission-denied", "functions/not-found"]) {
      expect(mapFriendErrorToMessage(code)).not.toContain("functions/");
    }
  });

  it("falls back to the generic message for an unknown code and for undefined", () => {
    expect(mapFriendErrorToMessage("functions/brand-new-code")).toBe(GENERIC);
    expect(mapFriendErrorToMessage(undefined)).toBe(GENERIC);
  });
});
