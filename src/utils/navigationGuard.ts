// Guards against a rapid double-tap pushing the SAME screen twice.
//
// expo-router's router.push() is fire-and-forget and does not deduplicate:
// two taps landing before the pushed screen finishes presenting produce two
// stack entries, so the student has to press back twice to get back.
//
// WHY THIS IS A LOCK AND NOT A COOLDOWN
// ------------------------------------
// The first version of this used a fixed 600ms cooldown. That is the wrong
// primitive: it guesses how long navigation takes. On a real device the push
// animation plus mounting the destination screen (which fetches its own
// data) can easily exceed 600ms, and the student is still looking at the
// feed the whole time. Once the cooldown silently expires, a second tap is
// accepted and pushes the same screen again — which is exactly the bug that
// survived the first fix on hardware.
//
// The correct model: acquire a lock synchronously BEFORE navigating, and
// hold it until the screen is actually focused again (i.e. the user came
// back). Duration is then irrelevant — a slow push stays locked, a fast one
// unlocks as soon as the user returns. `maxHoldMs` exists only as a
// self-healing safety net for the case where focus never returns (e.g. the
// navigation silently failed), so a stuck lock can never permanently
// disable a button.

export const DEFAULT_MAX_HOLD_MS = 10_000;

export interface KeyedNavigationLock {
  // True if the lock was acquired (caller may navigate). False if a
  // navigation to this key is already in flight.
  acquire(key: string, now?: number): boolean;
  // Called when the screen regains focus — the user is back, so every
  // destination may be navigated to again.
  releaseAll(): void;
  isLocked(key: string, now?: number): boolean;
}

// Keyed so distinct destinations never block each other: tapping "Cevapla"
// must not lock out the comment button, but tapping the comment button twice
// must only ever open comments once.
export function createKeyedNavigationLock(
  maxHoldMs: number = DEFAULT_MAX_HOLD_MS,
): KeyedNavigationLock {
  const lockedAt = new Map<string, number>();

  function locked(key: string, now: number): boolean {
    const at = lockedAt.get(key);
    return at !== undefined && now - at < maxHoldMs;
  }

  return {
    acquire(key: string, now: number = Date.now()): boolean {
      if (locked(key, now)) return false;
      lockedAt.set(key, now);
      return true;
    },
    releaseAll(): void {
      lockedAt.clear();
    },
    isLocked(key: string, now: number = Date.now()): boolean {
      return locked(key, now);
    },
  };
}
