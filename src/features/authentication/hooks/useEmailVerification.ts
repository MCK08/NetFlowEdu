import { useEffect, useRef, useState } from "react";

import { mapAuthErrorToMessage } from "../services/errorMapper";
import { useAuth } from "./useAuth";

const RESEND_COOLDOWN_SECONDS = 30;

export function useEmailVerification() {
  const { firebaseUser, isEmailVerified, resendVerification, refreshSession, signOut } =
    useAuth();
  const [isResending, setIsResending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

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
    if (cooldownSeconds > 0 || isResending) return;
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
      const onboardingCompleted = await refreshSession();
      if (!onboardingCompleted) {
        setError(
          "E-postanız doğrulandı ancak hesap tipiniz ayarlanamadı. Lütfen tekrar deneyin.",
        );
      }
      return onboardingCompleted;
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
    error,
    cooldownSeconds,
    resend,
    checkVerified,
    signOut,
  };
}
