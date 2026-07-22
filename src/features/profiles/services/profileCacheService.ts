import { getUserProfileOnce } from "@services/firebase/firestore";
import { UserProfile } from "@/types/user";

const FALLBACK_HANDLE = "Kullanıcı";

// Never fall back to uid — the fallback chain stops at a fixed Turkish
// string precisely so a raw Firebase UID can never end up on screen.
//
// Uses truthiness, not `??`: displayName is a legitimately reachable ""
// (see functions/src/triggers/onUserCreate.ts's `user.displayName ?? ""`,
// e.g. when a client-side setDisplayName call failed silently), and `??`
// only falls through on null/undefined — it would happily return "" as a
// "resolved" handle instead of continuing down the fallback chain.
export function getDisplayHandle(profile: UserProfile | null): string {
  if (!profile) return FALLBACK_HANDLE;
  return profile.username || profile.displayName || FALLBACK_HANDLE;
}

// uid -> resolved profile (or null if unavailable/denied). Module-level so
// it's shared across every card on screen, not per-component — that's the
// whole point of "avoid one Firestore read per rendered card."
const cache = new Map<string, UserProfile | null>();
// uid -> in-flight fetch, so two cards mounting in the same frame for the
// same uid share one request instead of firing two.
const pending = new Map<string, Promise<UserProfile | null>>();

// firestore.rules only lets a user read their own users/{uid} doc today
// (see getUserProfileOnce), so a lookup for any other uid rejects with
// permission-denied. That's treated as "profile unavailable," not a crash
// — cached as null so we don't retry every render, and getDisplayHandle
// falls back to "Kullanıcı" for it. This makes the cache already correct
// for a future phase where more than one person's profile is readable
// (e.g. class rosters), without any change needed here.
export async function getCachedProfile(uid: string): Promise<UserProfile | null> {
  if (cache.has(uid)) return cache.get(uid) ?? null;

  const existing = pending.get(uid);
  if (existing) return existing;

  const fetchPromise = getUserProfileOnce(uid)
    .catch(() => null)
    .then((profile) => {
      cache.set(uid, profile);
      pending.delete(uid);
      return profile;
    });

  pending.set(uid, fetchPromise);
  return fetchPromise;
}

// Test-only escape hatch — the module-level cache would otherwise leak
// state between test cases.
export function clearProfileCache(): void {
  cache.clear();
  pending.clear();
}
