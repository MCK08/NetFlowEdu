import {
  GOOGLE_UNCONFIGURED_MESSAGE,
  GooglePlatform,
  isGoogleAvailable,
  requiredClientIdFor,
  resolveGoogleAvailability,
} from "@features/authentication/services/googleAuthAvailability";

const ALL_PLATFORMS: GooglePlatform[] = ["ios", "android", "web"];

describe("requiredClientIdFor — mirrors expo-auth-session's own per-platform property", () => {
  const ids = { ios: "ios-id", android: "android-id", web: "web-id" };

  it("requires the iOS client id on iOS", () => {
    expect(requiredClientIdFor("ios", ids)).toBe("ios-id");
  });

  it("requires the Android client id on Android", () => {
    expect(requiredClientIdFor("android", ids)).toBe("android-id");
  });

  it("requires the web client id everywhere else", () => {
    expect(requiredClientIdFor("web", ids)).toBe("web-id");
  });
});

describe("resolveGoogleAvailability", () => {
  it("is available when the platform's own client id is present", () => {
    expect(resolveGoogleAvailability("ios", { ios: "ios-id" })).toEqual({ status: "available" });
    expect(resolveGoogleAvailability("android", { android: "a-id" })).toEqual({
      status: "available",
    });
    expect(resolveGoogleAvailability("web", { web: "w-id" })).toEqual({ status: "available" });
  });

  // The exact production crash this guards: expo-auth-session throws
  // synchronously during render when iosClientId is missing on iOS, even
  // though webClientId is set — so "configured" must not be decided by
  // webClientId alone.
  it("is UNCONFIGURED on iOS when only the web client id is set", () => {
    expect(resolveGoogleAvailability("ios", { web: "web-id" })).toEqual({
      status: "unconfigured",
      platform: "ios",
    });
  });

  it("is UNCONFIGURED on Android when only the web client id is set", () => {
    expect(resolveGoogleAvailability("android", { web: "web-id" })).toEqual({
      status: "unconfigured",
      platform: "android",
    });
  });

  it("is unconfigured when no client id is set at all", () => {
    for (const platform of ALL_PLATFORMS) {
      expect(resolveGoogleAvailability(platform, {})).toEqual({
        status: "unconfigured",
        platform,
      });
    }
  });

  it("treats an empty or whitespace-only client id as unconfigured", () => {
    expect(resolveGoogleAvailability("ios", { ios: "" }).status).toBe("unconfigured");
    expect(resolveGoogleAvailability("ios", { ios: "   " }).status).toBe("unconfigured");
  });

  it("reports which platform is unconfigured, so the boundary can be reasoned about", () => {
    const result = resolveGoogleAvailability("android", {});
    expect(result.status === "unconfigured" && result.platform).toBe("android");
  });
});

describe("isGoogleAvailable", () => {
  it("is true only for the available status", () => {
    expect(isGoogleAvailable({ status: "available" })).toBe(true);
    expect(isGoogleAvailable({ status: "unconfigured", platform: "ios" })).toBe(false);
  });
});

describe("GOOGLE_UNCONFIGURED_MESSAGE", () => {
  it("never leaks a client id, env var name or technical term to the user", () => {
    const lowered = GOOGLE_UNCONFIGURED_MESSAGE.toLowerCase();
    for (const forbidden of ["client", "clientid", "expo_public", "env", "oauth", "token"]) {
      expect(lowered).not.toContain(forbidden);
    }
  });

  it("tells the user what they CAN do instead of only what failed", () => {
    expect(GOOGLE_UNCONFIGURED_MESSAGE).toContain("şifre");
  });
});
