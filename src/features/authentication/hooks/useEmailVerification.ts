import { useEffect, useRef, useState } from "react";

import { mapAuthErrorToMessage, mapOnboardingFailureToMessage } from "../services/errorMapper";
import { runGuardedOnce } from "../services/guardedAction";
import { useAuth } from "./useAuth";

const RESEND_COOLDOWN_SECONDS = 30;

export function useEmailVerification() {
  const { firebaseUser, isEmailVerified, resendVerification, refreshSession, signOut: signOutAuth } =
    useAuth();
  const [isResending, setIsResending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  // Synchronous guard against duplicate parallel sends on rapid multi-click —
  // isResending (state) only takes effect on the next render, so two taps in
  // the same tick could both pass an `isResending` check before either
  // re-render happens. A ref updates immediately, closing that gap.
  const isResendingRef = useRef(false);
  const isSigningOutRef = useRef(false);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function startCooldown() {
    setCooldownSeconds(RESEND_COOLDOWN_SECONDS);
    intervalRef.current = setInterval(() => {
      setCooldownSeconds((seconds) => {
        if (seconds <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
  }

  async function resend() {
    if (cooldownSeconds > 0) return;
    await runGuardedOnce(isResendingRef, async () => {
      setError(null);
      setIsResending(true);
      try {
        await resendVerification();
        startCooldown();
      } catch (err) {
        setError(mapAuthErrorToMessage(err));
      } finally {
        setIsResending(false);
      }
    });
  }

  // Returns whether onboarding is actually done — not just whether the call
  // completed without throwing. refreshSession() itself never throws for a
  // failed completeOnboarding (see onboardingSession.ts), so without
  // checking its boolean result this would previously report "verified"
  // even when the role/claims grant silently failed, letting the caller
  // navigate away from the one screen that can retry it.
  async function checkVerified(): Promise<boolean> {
    setError(null);
    setIsChecking(true);
    try {
      const { completed, failureCode } = await refreshSession();
      if (!completed) {
        // Production incident (2026-07-27): this used to hard-code one
        // generic sentence for EVERY failure, because the boolean it got
        // back carried no reason. The real code was
        // functions/failed-precondition ("Hesap türü seçilmemiş") and the
        // user had no way to learn that, or that it was permanent rather
        // than worth retrying. Now the actual reason drives the message.
        setError(mapOnboardingFailureToMessage(failureCode));
      }
      return completed;
    } catch (err) {
      setError(mapAuthErrorToMessage(err));
      return false;
    } finally {
      setIsChecking(false);
    }
  }

  // Previously wired directly to the raw AuthProvider.signOut with no
  // try/catch, loading state, or double-click guard — unlike resend/
  // checkVerified above. A thrown error (e.g. auth/network-request-failed)
  // became an unhandled promise rejection with zero visible feedback: the
  // button appeared to do nothing, the user stayed authenticated-but-
  // unverified, and RouteGuard kept forcing them back to this exact screen
  // for any other route (e.g. trying to register with a different email).
  async function signOut() {
    await runGuardedOnce(isSigningOutRef, async () => {
      setError(null);
      setIsSigningOut(true);
      try {
        await signOutAuth();
        // No explicit navigation here — RouteGuard reacts to isAuthenticated
        // becoming false (via the auth state listener) and replaces the
        // route to ROUTES.login itself; see routing.ts's !isAuthenticated
        // check, which takes priority over every other routing rule.
      } catch (err) {
        setError(mapAuthErrorToMessage(err));
      } finally {
        setIsSigningOut(false);
      }
    });
  }

  return {
    email: firebaseUser?.email ?? "",
    isEmailVerified,
    isResending,
    isChecking,
    isSigningOut,
    error,
    cooldownSeconds,
    resend,
    checkVerified,
    signOut,
  };
}
