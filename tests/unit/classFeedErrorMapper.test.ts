import {
  isRecoverableFeedError,
  mapClassErrorToMessage,
  mapClassFeedErrorToMessage,
} from "@features/classes/services/classErrorMapper";

// The class feed's read path surfaces raw Firestore error codes (no
// "functions/" prefix — these come from the Firestore client, not a
// callable). The same code means something different here than on the
// class-creation path, which is why the feed has its own mapper.
describe("mapClassFeedErrorToMessage", () => {
  it("explains that permission-denied almost certainly means removal from the class", () => {
    const msg = mapClassFeedErrorToMessage("permission-denied");
    expect(msg).toContain("erişiminiz yok");
    expect(msg).toContain("çıkarılmış");
    // Must NOT be the generic retry line — retrying cannot restore membership.
    expect(msg).not.toBe("Sorular yüklenemedi. Lütfen tekrar deneyin.");
  });

  it("does not reuse the class-CREATION message for the same code", () => {
    // "permission-denied" on create = "not a teacher"; on the feed =
    // "no longer a class member". Two different instructions.
    const createMsg = mapClassErrorToMessage("functions/permission-denied");
    const feedMsg = mapClassFeedErrorToMessage("permission-denied");
    expect(feedMsg).not.toBe(createMsg);
  });

  it("maps the transient/network codes to a connection-oriented retry message", () => {
    for (const code of ["unavailable", "network-request-failed", "deadline-exceeded"]) {
      const msg = mapClassFeedErrorToMessage(code);
      expect(msg).not.toBe("Sorular yüklenemedi. Lütfen tekrar deneyin.");
      expect(msg.length).toBeGreaterThan(10);
    }
  });

  it("gives every mapped code a distinct, actionable message", () => {
    const generic = "Sorular yüklenemedi. Lütfen tekrar deneyin.";
    for (const code of [
      "permission-denied",
      "unauthenticated",
      "failed-precondition",
      "not-found",
      "unavailable",
      "resource-exhausted",
    ]) {
      expect(mapClassFeedErrorToMessage(code)).not.toBe(generic);
    }
  });

  it("never leaks a raw error code to the user", () => {
    for (const code of ["permission-denied", "not-found", "some-unmapped-code"]) {
      const msg = mapClassFeedErrorToMessage(code);
      expect(msg).not.toContain(code);
    }
  });

  it("falls back to a safe generic message for unknown codes and undefined", () => {
    const generic = "Sorular yüklenemedi. Lütfen tekrar deneyin.";
    expect(mapClassFeedErrorToMessage("brand-new-code")).toBe(generic);
    expect(mapClassFeedErrorToMessage(undefined)).toBe(generic);
  });
});

describe("isRecoverableFeedError — decides whether to even offer a retry button", () => {
  it("treats membership/auth/missing-class failures as unrecoverable", () => {
    expect(isRecoverableFeedError("permission-denied")).toBe(false);
    expect(isRecoverableFeedError("unauthenticated")).toBe(false);
    expect(isRecoverableFeedError("not-found")).toBe(false);
  });

  it("treats transient failures as recoverable", () => {
    expect(isRecoverableFeedError("unavailable")).toBe(true);
    expect(isRecoverableFeedError("deadline-exceeded")).toBe(true);
    expect(isRecoverableFeedError("network-request-failed")).toBe(true);
    expect(isRecoverableFeedError("internal")).toBe(true);
  });

  it("defaults to recoverable for an unknown code — never strands the user without a retry", () => {
    expect(isRecoverableFeedError("brand-new-code")).toBe(true);
    expect(isRecoverableFeedError(undefined)).toBe(true);
  });
});
