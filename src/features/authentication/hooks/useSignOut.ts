import { useCallback, useRef, useState } from "react";

import { mapAuthErrorToMessage } from "../services/errorMapper";
import { runGuardedOnce } from "../services/guardedAction";
import { useAuth } from "./useAuth";

// Signing out with a loading state, a duplicate-tap guard and a visible
// error — the three things a raw AuthProvider.signOut() call has none of.
// Extracted from useEmailVerification so the Google onboarding escape hatch
// gets identical behaviour instead of a second, subtly different copy.
//
// Deliberately performs NO navigation: RouteGuard reacts to isAuthenticated
// becoming false and replaces the route itself (see routing.ts's
// !isAuthenticated check, which outranks every other rule). A screen that
// navigated here too would be a second owner of the same decision.
export function useSignOut() {
  const { signOut: signOutAuth } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not the isSigningOut state: state updates land on the next
  // render, so two taps in the same tick could both read a stale false.
  const guardRef = useRef(false);

  const signOut = useCallback(async () => {
    await runGuardedOnce(guardRef, async () => {
      setError(null);
      setIsSigningOut(true);
      try {
        await signOutAuth();
      } catch (err) {
        setError(mapAuthErrorToMessage(err));
      } finally {
        setIsSigningOut(false);
      }
    });
  }, [signOutAuth]);

  return { signOut, isSigningOut, error };
}
