import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";

import { createKeyedNavigationLock, KeyedNavigationLock } from "../services/navigationGuard";

// Wraps a KeyedNavigationLock in React's lifecycle so that:
//
//  1. The lock instance is stable for the component's whole life (useRef) —
//     if it were recreated on render, the re-render caused by the first tap
//     would hand the second tap a fresh, unlocked instance and both would
//     navigate. See useNavigationGuard.test.ts, which proves that failure
//     mode explicitly.
//
//  2. The lock is released when the screen regains focus, i.e. when the user
//     actually comes back from the pushed screen. This is what makes the
//     guard independent of how long navigation takes — the flaw in the
//     original fixed-cooldown version.
//
// Note the lazy init: `useRef(createKeyedNavigationLock())` would build a
// throwaway lock on every render (React ignores the argument after the first
// render). Initialising inside the null check avoids that allocation.
export function useNavigationGuard(): (key: string, navigate: () => void) => boolean {
  const lockRef = useRef<KeyedNavigationLock | null>(null);
  if (lockRef.current === null) {
    lockRef.current = createKeyedNavigationLock();
  }
  const lock = lockRef.current;

  useFocusEffect(
    useCallback(() => {
      // Runs on focus — including the first mount, which is a harmless no-op,
      // and every return from a pushed screen, which is the real unlock.
      lock.releaseAll();
    }, [lock]),
  );

  return useCallback(
    (key: string, navigate: () => void): boolean => {
      // Acquire BEFORE navigating, synchronously — there is no promise to
      // await, so the lock must be taken in the same tick as the tap.
      if (!lock.acquire(key)) return false;
      navigate();
      return true;
    },
    [lock],
  );
}
