import { getPublicProfileOnce } from "@services/firebase/publicProfile";
import { PublicProfile } from "@/types/publicProfile";
import { PublicIdentity, resolvePublicIdentity } from "@utils/publicIdentity";

// Never falls back to uid — the fallback chain stops at a fixed Turkish
// string precisely so a raw Firebase UID can never end up on screen.
export function getPublicIdentity(profile: PublicProfile | null): PublicIdentity {
  return resolvePublicIdentity(profile);
}

// uid -> resolved public profile (or null if unavailable/deleted/
// suspended). Module-level so it's shared across every card on screen, not
// per-component — that's the whole point of "avoid one Firestore read per
// rendered card."
const cache = new Map<string, PublicProfile | null>();
// uid -> in-flight fetch, so two cards mounting in the same frame for the
// same uid share one request instead of firing two.
const pending = new Map<string, Promise<PublicProfile | null>>();

// Reads publicProfiles/{uid} (safe fields, readable by any authenticated
// user — see firestore.rules and functions/src/profiles/syncPublicProfile.ts).
// A missing doc (not yet synced, or the account was suspended) is treated
// as "profile unavailable," not a crash — cached as null so we don't retry
// every render, and getPublicIdentity falls back to "Kullanıcı" for it.
export async function getCachedProfile(uid: string): Promise<PublicProfile | null> {
  if (cache.has(uid)) return cache.get(uid) ?? null;

  const existing = pending.get(uid);
  if (existing) return existing;

  // Two distinct "null" outcomes need two distinct caching policies:
  //
  // - getPublicProfileOnce RESOLVES with null when publicProfiles/{uid}
  //   simply doesn't exist *yet* — e.g. right after a fresh signup/upload,
  //   there's a real propagation gap before the syncPublicProfile Cloud
  //   Function trigger has finished writing it. This is transient, so it
  //   must NOT be cached permanently: caching it would freeze the
  //   "Kullanıcı" fallback in place for the rest of the app session even
  //   after the real profile becomes available moments later (confirmed
  //   on-device — the bug this fixes; only an app restart, which clears
  //   this in-memory Map, previously cleared the stale null).
  // - getPublicProfileOnce REJECTS (permission-denied, etc.) for a genuine,
  //   permanent denial — that outcome is still cached forever, exactly as
  //   before, to avoid retrying a fetch that can never succeed.
  const fetchPromise = getPublicProfileOnce(uid)
    .then((profile) => {
      if (profile !== null) {
        cache.set(uid, profile);
      }
      pending.delete(uid);
      return profile;
    })
    .catch(() => {
      cache.set(uid, null);
      pending.delete(uid);
      return null;
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
