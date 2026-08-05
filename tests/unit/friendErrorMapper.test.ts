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

// Added after the 2026-08-05 production incident: a genuine backend
// exception surfaces as `functions/internal`, which was missing from the
// table and therefore rendered as the catch-all generic message — hiding a
// real, reproducible bug behind "Bir şeyler ters gitti".
describe("mapFriendErrorToMessage — server/transient codes (incident follow-up)", () => {
  it("maps functions/internal to a server-side message, NOT the generic fallback", () => {
    const message = mapFriendErrorToMessage("functions/internal");
    expect(message).toBe("Sunucu tarafında bir hata oluştu. Lütfen daha sonra tekrar deneyin.");
    expect(message).not.toBe("Bir şeyler ters gitti. Lütfen tekrar deneyin.");
  });

  it("maps functions/aborted", () => {
    expect(mapFriendErrorToMessage("functions/aborted")).toBe("İşlem çakıştı. Lütfen tekrar deneyin.");
  });

  it("maps functions/unavailable", () => {
    expect(mapFriendErrorToMessage("functions/unavailable")).toBe(
      "Bağlantı sorunu. Lütfen tekrar deneyin.",
    );
  });

  it("maps functions/deadline-exceeded", () => {
    expect(mapFriendErrorToMessage("functions/deadline-exceeded")).toBe(
      "İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.",
    );
  });

  it("maps functions/resource-exhausted", () => {
    expect(mapFriendErrorToMessage("functions/resource-exhausted")).toBe(
      "Çok fazla istek gönderildi. Lütfen biraz sonra tekrar deneyin.",
    );
  });

  it("failed-precondition names the real cause (inactive account), not a vague 'yapılamıyor'", () => {
    expect(mapFriendErrorToMessage("functions/failed-precondition")).toBe(
      "Bu hesap şu anda aktif değil.",
    );
  });

  it("still falls back to the generic message only for a genuinely unknown code", () => {
    expect(mapFriendErrorToMessage("functions/some-brand-new-code")).toBe(
      "Bir şeyler ters gitti. Lütfen tekrar deneyin.",
    );
  });

  it("never leaks a raw Firebase code into any mapped message", () => {
    for (const code of [
      "functions/internal",
      "functions/aborted",
      "functions/unavailable",
      "functions/deadline-exceeded",
      "functions/resource-exhausted",
      "functions/failed-precondition",
    ]) {
      expect(mapFriendErrorToMessage(code)).not.toContain("functions/");
    }
  });
});
