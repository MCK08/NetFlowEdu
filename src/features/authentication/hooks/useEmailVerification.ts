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

  async function checkVerified(): Promise<boolean> {
    setError(null);
    setIsChecking(true);
    try {
      await refreshSession();
      return true;
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
