import { resolvePublicIdentity } from "@utils/publicIdentity";

describe("resolvePublicIdentity", () => {
  it("uses displayName as primary and @username as secondary when both exist", () => {
    const result = resolvePublicIdentity({ displayName: "Sinem Hoca", username: "sinemmat" });
    expect(result).toEqual({ primaryName: "Sinem Hoca", usernameHandle: "@sinemmat" });
  });

  it("uses displayName as primary with no secondary when username is missing", () => {
    const result = resolvePublicIdentity({ displayName: "Mert Can", username: null });
    expect(result).toEqual({ primaryName: "Mert Can", usernameHandle: null });
  });

  it("falls back to @username as primary (no secondary) when displayName is empty", () => {
    const result = resolvePublicIdentity({ displayName: "", username: "burakmat" });
    expect(result).toEqual({ primaryName: "@burakmat", usernameHandle: null });
  });

  it("falls back to Kullanıcı when both are missing", () => {
    const result = resolvePublicIdentity({ displayName: null, username: null });
    expect(result).toEqual({ primaryName: "Kullanıcı", usernameHandle: null });
  });

  it("falls back to Kullanıcı when the source itself is null", () => {
    expect(resolvePublicIdentity(null)).toEqual({ primaryName: "Kullanıcı", usernameHandle: null });
  });

  it("falls back to Kullanıcı when the source itself is undefined", () => {
    expect(resolvePublicIdentity(undefined)).toEqual({
      primaryName: "Kullanıcı",
      usernameHandle: null,
    });
  });

  // Regression: an empty string is a real, reachable stored value (a
  // registration race, or a legacy record) — must be treated as absent,
  // same as null/undefined. `??` would NOT do this correctly.
  it("treats an empty-string displayName as absent, not as a valid name", () => {
    const result = resolvePublicIdentity({ displayName: "", username: "burakmat" });
    expect(result.primaryName).toBe("@burakmat");
  });

  it("treats an empty-string username as absent, not as a valid handle", () => {
    const result = resolvePublicIdentity({ displayName: "Sinem Hoca", username: "" });
    expect(result).toEqual({ primaryName: "Sinem Hoca", usernameHandle: null });
  });

  it("treats whitespace-only values as absent", () => {
    expect(resolvePublicIdentity({ displayName: "   ", username: "sinemmat" })).toEqual({
      primaryName: "@sinemmat",
      usernameHandle: null,
    });
    expect(resolvePublicIdentity({ displayName: "Sinem Hoca", username: "   " })).toEqual({
      primaryName: "Sinem Hoca",
      usernameHandle: null,
    });
  });

  it("never returns a bare '@' with nothing after it, for any input combination", () => {
    const cases = [
      { displayName: null, username: null },
      { displayName: "", username: "" },
      { displayName: undefined, username: undefined },
      { displayName: "   ", username: "   " },
    ];
    for (const source of cases) {
      const result = resolvePublicIdentity(source);
      expect(result.primaryName).not.toBe("@");
      expect(result.primaryName.length).toBeGreaterThan(0);
    }
  });

  // The exact forbidden shape called out by the product spec.
  it("never puts an @ in front of displayName", () => {
    const result = resolvePublicIdentity({ displayName: "Sinem Hoca", username: "sinemmat" });
    expect(result.primaryName).toBe("Sinem Hoca");
    expect(result.primaryName).not.toBe("@Sinem Hoca");
  });

  // Never renders the username twice — usernameHandle is null whenever
  // primaryName already IS the @username form.
  it("never surfaces the username in both primaryName and usernameHandle simultaneously", () => {
    const result = resolvePublicIdentity({ displayName: "", username: "burakmat" });
    expect(result.primaryName).toBe("@burakmat");
    expect(result.usernameHandle).toBeNull();
  });
});
