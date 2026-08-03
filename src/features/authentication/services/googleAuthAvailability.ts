export type GooglePlatform = "ios" | "android" | "web";

export interface GoogleClientIds {
  ios?: string;
  android?: string;
  web?: string;
}

export type GoogleAvailability =
  | { status: "available" }
  // The platform's REQUIRED client id is missing. Reported as its own
  // status (never as a credential/network failure) so the UI can say
  // "not configured" instead of implying the user did something wrong.
  | { status: "unconfigured"; platform: GooglePlatform };

// Mirrors expo-auth-session's OWN per-platform client-id resolution
// (Google.js: `Platform.select({ ios: 'iosClientId', android:
// 'androidClientId', default: 'webClientId' })`) — that is the exact
// property its `invariantClientId` throws on. Checking any other property
// would make "configured" lie: a project with only a webClientId would
// look configured on iOS and then crash at render.
export function requiredClientIdFor(
  platform: GooglePlatform,
  clientIds: GoogleClientIds,
): string | undefined {
  if (platform === "ios") return clientIds.ios;
  if (platform === "android") return clientIds.android;
  return clientIds.web;
}

function isUsableClientId(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function resolveGoogleAvailability(
  platform: GooglePlatform,
  clientIds: GoogleClientIds,
): GoogleAvailability {
  const required = requiredClientIdFor(platform, clientIds);
  if (isUsableClientId(required)) return { status: "available" };
  return { status: "unconfigured", platform };
}

// User-facing copy for an unconfigured environment. Deliberately says
// nothing about WHICH client id is missing and never echoes a value — a
// client id is configuration, not something a user can act on or should
// see.
export const GOOGLE_UNCONFIGURED_MESSAGE =
  "Google ile giriş bu sürümde kullanılamıyor. E-posta ve şifrenizle devam edebilirsiniz.";

export function isGoogleAvailable(availability: GoogleAvailability): boolean {
  return availability.status === "available";
}
