export interface PublicIdentitySource {
  displayName?: string | null;
  username?: string | null;
}

export interface PublicIdentity {
  primaryName: string;
  usernameHandle: string | null;
}

const FALLBACK_NAME = "Kullanıcı";

// The single source of truth for "how do we show this person's identity",
// shared by every surface in the app (feed cards, comments, profile
// screens, class member rows...). displayName is the primary, public-facing
// identity — a chosen name, not necessarily a legal one (e.g. "Sinem Hoca",
// "Matematikçi Burak") — with @username shown underneath/beside it only
// when a username exists. A user who hasn't set a username yet still shows
// their displayName alone, never a lone "@".
//
// Deliberately uses `.trim() ... : falsy-check`, never `??` — a stored
// value can legitimately be an empty string (e.g. a partially-completed
// registration race — see completeOnboarding.ts), and `??` only falls
// through on null/undefined, so it would treat "" as a "resolved" value
// and stop the fallback chain right there. That exact bug used to render a
// bare "@" — see formatDisplayHandle's history (this resolver replaces it,
// with the priority now flipped: displayName primary, username secondary,
// per the current identity model).
export function resolvePublicIdentity(
  source: PublicIdentitySource | null | undefined,
): PublicIdentity {
  const displayName = source?.displayName?.trim() ?? "";
  const username = source?.username?.trim() ?? "";

  if (displayName) {
    return { primaryName: displayName, usernameHandle: username ? `@${username}` : null };
  }
  if (username) {
    return { primaryName: `@${username}`, usernameHandle: null };
  }
  return { primaryName: FALLBACK_NAME, usernameHandle: null };
}
