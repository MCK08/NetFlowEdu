import {
  mapClassErrorToMessage,
  mapJoinClassErrorToMessage,
  requiresSessionRefresh,
} from "@features/classes/services/classErrorMapper";

// Production incident: every joinClassByCode failure was collapsed into
// "Geçersiz kod veya katılım başarısız. Lütfen tekrar deneyin." A student
// entering a genuinely VALID code (rejected by the org-equality bug with
// permission-denied) was told the code was invalid — which both misled the
// user and pointed the investigation at the wrong layer.
describe("mapJoinClassErrorToMessage", () => {
  const GENERIC = "Sınıfa katılınamadı. Lütfen tekrar deneyin.";

  it("does not call a valid-but-rejected code 'invalid' — permission-denied is about the account type", () => {
    const msg = mapJoinClassErrorToMessage("functions/permission-denied");
    expect(msg).toContain("hesap");
    expect(msg).not.toContain("kod geçerli değil");
  });

  it("says clearly when the code itself does not exist", () => {
    const msg = mapJoinClassErrorToMessage("functions/not-found");
    expect(msg).toContain("kod");
    expect(msg).not.toBe(GENERIC);
  });

  it("says clearly when the student is already in the class", () => {
    expect(mapJoinClassErrorToMessage("functions/already-exists")).toContain("zaten");
  });

  it("suggests retrying only for genuinely transient failures", () => {
    for (const code of [
      "functions/unavailable",
      "functions/internal",
      "functions/deadline-exceeded",
      "network-request-failed",
    ]) {
      expect(mapJoinClassErrorToMessage(code)).toMatch(/tekrar deneyin/);
    }
  });

  it("gives each distinct failure its own message — no single catch-all", () => {
    const messages = [
      "functions/not-found",
      "functions/already-exists",
      "functions/permission-denied",
      "functions/unauthenticated",
      "functions/invalid-argument",
    ].map(mapJoinClassErrorToMessage);

    expect(new Set(messages).size).toBe(messages.length);
    for (const m of messages) expect(m).not.toBe(GENERIC);
  });

  it("never leaks a raw error code to the user", () => {
    for (const code of ["functions/not-found", "functions/permission-denied", "weird-code"]) {
      expect(mapJoinClassErrorToMessage(code)).not.toContain("functions/");
      expect(mapJoinClassErrorToMessage(code)).not.toContain(code);
    }
  });

  it("falls back safely for an unknown code and for undefined", () => {
    expect(mapJoinClassErrorToMessage("brand-new-code")).toBe(GENERIC);
    expect(mapJoinClassErrorToMessage(undefined)).toBe(GENERIC);
  });
});

// Regression coverage for the "Sınıf oluşturulamadı. Lütfen tekrar deneyin."
// dead end: useTeacherClasses.createClass used to swallow the callable's
// error entirely (bare `catch {}`) and show that single sentence for all
// seven codes createClass can raise. For the two claim-related codes that
// advice is actively wrong — the token's role/organizationId claims are
// stale or missing, so pressing the button again can never succeed.
describe("mapClassErrorToMessage", () => {
  it("tells a teacher with stale/missing role claims to refresh the session, NOT to retry", () => {
    const msg = mapClassErrorToMessage("functions/permission-denied");
    expect(msg).toContain("giriş");
    expect(msg).not.toContain("tekrar deneyin");
  });

  it("tells a teacher with no organizationId to refresh the session, NOT to retry", () => {
    const msg = mapClassErrorToMessage("functions/failed-precondition");
    expect(msg).toContain("giriş");
    expect(msg).not.toContain("tekrar deneyin");
  });

  it("still tells the user to retry for the genuinely transient codes", () => {
    for (const code of [
      "functions/resource-exhausted",
      "functions/already-exists",
      "functions/unavailable",
      "functions/internal",
      "functions/deadline-exceeded",
    ]) {
      expect(mapClassErrorToMessage(code)).toContain("tekrar deneyin");
    }
  });

  it("gives every mapped code a distinct, non-generic message", () => {
    const generic = "Sınıf oluşturulamadı. Lütfen tekrar deneyin.";
    for (const code of [
      "functions/permission-denied",
      "functions/failed-precondition",
      "functions/unauthenticated",
      "functions/invalid-argument",
    ]) {
      expect(mapClassErrorToMessage(code)).not.toBe(generic);
    }
  });

  it("never leaks a raw code to the user", () => {
    for (const code of [
      "functions/permission-denied",
      "functions/failed-precondition",
      "functions/invalid-argument",
      "functions/unknown-future-code",
    ]) {
      expect(mapClassErrorToMessage(code)).not.toContain("functions/");
    }
  });

  it("falls back to the generic message for an unknown code and for undefined", () => {
    const generic = "Sınıf oluşturulamadı. Lütfen tekrar deneyin.";
    expect(mapClassErrorToMessage("functions/brand-new-code")).toBe(generic);
    expect(mapClassErrorToMessage(undefined)).toBe(generic);
  });

  it("classifies which failures need a session refresh rather than a retry", () => {
    expect(requiresSessionRefresh("functions/permission-denied")).toBe(true);
    expect(requiresSessionRefresh("functions/failed-precondition")).toBe(true);
    expect(requiresSessionRefresh("functions/unauthenticated")).toBe(true);
    expect(requiresSessionRefresh("functions/resource-exhausted")).toBe(false);
    expect(requiresSessionRefresh("functions/already-exists")).toBe(false);
    expect(requiresSessionRefresh(undefined)).toBe(false);
  });
});
