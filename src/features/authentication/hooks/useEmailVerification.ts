import { useEffect, useRef, useState } from "react";

import { mapAuthErrorToMessage, mapOnboardingFailureToMessage } from "../services/errorMapper";
import { runGuardedOnce } from "../services/guardedAction";
import { useAuth } from "./useAuth";
import { useSignOut } from "./useSignOut";

const RESEND_COOLDOWN_SECONDS = 30;

export function useEmailVerification() {
  const { firebaseUser, isEmailVerified, resendVerification, refreshSession } = useAuth();
  // Shared with the Google onboarding screen's own escape hatch — same
  // guard, same loading flag, same error mapping, one implementation.
  const { signOut, isSigningOut, error: signOutError } = useSignOut();
  const [isResending, setIsResending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  // Synchronous guard against duplicate parallel sends on rapid multi-click —
  // isResending (state) only takes effect on the next render, so two taps in
  // the same tick could both pass an `isResending` check before either
  // re-render happens. A ref updates immediately, closing that gap.
  const isResendingRef = useRef(false);

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

  return {
    email: firebaseUser?.email ?? "",
    isEmailVerified,
    isResending,
    isChecking,
    isSigningOut,
    // A failed sign-out has to stay visible even though it is produced by a
    // different hook — this screen has exactly one error slot, and silently
    // dropping the sign-out failure is the bug that made the button look
    // like it did nothing.
    error: error ?? signOutError,
    cooldownSeconds,
    resend,
    checkVerified,
    signOut,
  };
}
