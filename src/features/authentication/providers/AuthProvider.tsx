import { onAuthStateChanged, User } from "firebase/auth";
import { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { UserProfile, UserRole } from "@/types/user";
import { auth } from "@services/firebase/config";
import { subscribeToUserProfile } from "@services/firebase/firestore";
import { reloadCurrentUser, refreshIdToken, signOutCurrentUser } from "@services/firebase/auth";

import { ForgotPasswordInput, LoginInput, RegisterInput } from "../types";
import {
  loginWithPassword,
  logout,
  registerStudent,
  requestPasswordReset,
  resendVerificationEmail,
} from "../services/authService";
import { waitForProfileDocument } from "../services/profileWait";

// Thrown by signIn() when the account's Firestore profile says
// accountStatus === "suspended". The login screen recognizes this sentinel
// and shows a dedicated Turkish message instead of the generic auth error
// mapping — see LoginScreen.tsx.
export class SuspendedAccountError extends Error {
  constructor() {
    super("SUSPENDED_ACCOUNT");
  }
}

const PROFILE_WAIT_TIMEOUT_MS = 10000;

export interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  isLoading: boolean;
  profileLoading: boolean;
  profileError: string | null;
  signIn: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<{ teacherRequestSubmitted: boolean }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (input: ForgotPasswordInput) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Subscribe once to Firebase Auth state; cleaned up on unmount.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setEmailVerified(user?.emailVerified ?? false);
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  // Subscribe to the signed-in user's profile document. Re-subscribes only
  // when the uid changes (not on every token refresh) to avoid duplicate
  // listeners. Bounded: if the profile never appears within
  // PROFILE_WAIT_TIMEOUT_MS (e.g. the onUserCreate trigger failed), stop
  // showing a loading spinner and surface a recoverable error instead.
  useEffect(() => {
    if (!firebaseUser) {
      setProfile(null);
      setProfileLoading(false);
      setProfileError(null);
      return;
    }

    setProfileLoading(true);
    setProfileError(null);

    const timeoutId = setTimeout(() => {
      setProfileLoading(false);
      setProfileError("Profil bilgileri yüklenemedi. Lütfen tekrar deneyin.");
    }, PROFILE_WAIT_TIMEOUT_MS);

    const unsubscribe = subscribeToUserProfile(
      firebaseUser.uid,
      (nextProfile) => {
        if (nextProfile === null) return; // still waiting on onUserCreate
        clearTimeout(timeoutId);
        setProfile(nextProfile);
        setProfileLoading(false);
        setProfileError(null);
      },
      () => {
        clearTimeout(timeoutId);
        setProfileLoading(false);
        setProfileError("Profil bilgileri yüklenirken bir hata oluştu.");
      },
    );

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
    // Intentionally keyed on uid, not the firebaseUser object — a token
    // refresh produces a new User reference for the same uid, and
    // resubscribing on every one of those would create duplicate listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser?.uid]);

  const signIn = useCallback(async (input: LoginInput) => {
    const user = await loginWithPassword(input);
    const signedInProfile = await waitForProfileDocument(user.uid, 5000);

    if (signedInProfile?.accountStatus === "suspended") {
      await signOutCurrentUser();
      throw new SuspendedAccountError();
    }

    await refreshIdToken(user);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const { teacherRequestSubmitted } = await registerStudent(input);
    return { teacherRequestSubmitted };
  }, []);

  const signOut = useCallback(async () => {
    await logout();
  }, []);

  const sendPasswordReset = useCallback(async (input: ForgotPasswordInput) => {
    await requestPasswordReset(input.email);
  }, []);

  const resendVerification = useCallback(async () => {
    if (!firebaseUser) return;
    await resendVerificationEmail(firebaseUser);
  }, [firebaseUser]);

  const refreshSession = useCallback(async () => {
    if (!firebaseUser) return;
    await reloadCurrentUser(firebaseUser);
    await refreshIdToken(firebaseUser);
    setEmailVerified(firebaseUser.emailVerified);
  }, [firebaseUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      firebaseUser,
      profile,
      role: profile?.role ?? null,
      isAuthenticated: firebaseUser !== null,
      isEmailVerified: emailVerified,
      isLoading,
      profileLoading,
      profileError,
      signIn,
      register,
      signOut,
      sendPasswordReset,
      resendVerification,
      refreshSession,
    }),
    [
      firebaseUser,
      profile,
      emailVerified,
      isLoading,
      profileLoading,
      profileError,
      signIn,
      register,
      signOut,
      sendPasswordReset,
      resendVerification,
      refreshSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
