import { onAuthStateChanged, User } from "firebase/auth";
import { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { UserProfile, UserRole } from "@/types/user";
import { auth } from "@services/firebase/config";
import { subscribeToUserProfile } from "@services/firebase/firestore";
import { refreshIdToken, signOutCurrentUser } from "@services/firebase/auth";

import { ForgotPasswordInput, LoginInput, RegisterInput } from "../types";
import {
  loginWithPassword,
  logout,
  registerStudent,
  requestPasswordReset,
  resendVerificationEmail,
} from "../services/authService";
import { verifyAndCompleteOnboarding } from "../services/onboardingSession";
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

// Thrown by resendVerification() when there is no signed-in Auth user to
// send to (e.g. session expired/signed out while sitting on VerifyEmailScreen).
// Previously this case was a silent no-op — the button showed a loading
// spinner, resolved, and gave zero feedback, indistinguishable from success.
export class NoCurrentUserError extends Error {
  constructor() {
    super("NO_CURRENT_USER");
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
  // Production bug fix — see routing.ts's doc comment. False only in the
  // narrow window between Firestore reporting onboardingStatus "complete"
  // and this client's own ID token having actually been force-refreshed.
  claimsSynced: boolean;
  signIn: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<{ verificationEmailSent: boolean }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (input: ForgotPasswordInput) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Production bug fix — see routing.ts's `claimsSynced` doc comment for the
  // full race explanation. Defaults true (every existing session/login path
  // behaves exactly as before); flipped false the moment this session
  // observes onboardingStatus "pending"/"provisioning" for the current uid
  // (a claims-changing operation is now known to be in flight), and only
  // flipped back to true once THIS client's own ID token has actually been
  // force-refreshed afterward (verifyAndCompleteOnboarding returning true in
  // signIn/refreshSession below) — never merely because Firestore says
  // "complete", which is exactly the signal that used to fire too early.
  const [claimsSynced, setClaimsSynced] = useState(true);

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
      setClaimsSynced(true); // fresh session; no known claims lag yet
      return;
    }

    setProfileLoading(true);
    setProfileError(null);
    setClaimsSynced(true); // reset per-uid; the watcher below will flip it if needed

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

  // Production bug fix — the moment Firestore reports a claims-changing
  // operation is in flight for this uid (pending/provisioning), mark claims
  // as NOT synced. This is what makes RouteGuard hold the user on
  // verify-email through the "complete" transition too, instead of routing
  // on Firestore's write alone — see routing.ts's `claimsSynced` doc.
  useEffect(() => {
    const status = profile?.onboardingStatus;
    if (status === "pending" || status === "provisioning") {
      setClaimsSynced(false);
    }
  }, [profile?.onboardingStatus]);

  const signIn = useCallback(async (input: LoginInput) => {
    const user = await loginWithPassword(input);
    const signedInProfile = await waitForProfileDocument(user.uid, 5000);

    if (signedInProfile?.accountStatus === "suspended") {
      await signOutCurrentUser();
      throw new SuspendedAccountError();
    }

    await refreshIdToken(user);

    // Covers the path where email verification happened OUTSIDE the app
    // (the user tapped the link in their mail client, then just logged in
    // fresh, never tapping "check again" in-app) — refreshSession's hook
    // into Stage 2 only fires from that in-app button, so this is the other
    // trigger point. verifyAndCompleteOnboarding is itself non-fatal/no-op
    // safe (re-checks email_verified, and completeOnboarding re-checks it
    // again server-side).
    const onboardingCompleted = await verifyAndCompleteOnboarding(user);
    // Only meaningful when a role transition actually happened during this
    // call (see below) — otherwise claimsSynced was never false to begin
    // with, so this is a no-op.
    if (onboardingCompleted) setClaimsSynced(true);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const { verificationEmailSent } = await registerStudent(input);
    return { verificationEmailSent };
  }, []);

  const signOut = useCallback(async () => {
    await logout();
  }, []);

  const sendPasswordReset = useCallback(async (input: ForgotPasswordInput) => {
    await requestPasswordReset(input.email);
  }, []);

  const resendVerification = useCallback(async () => {
    if (!firebaseUser) throw new NoCurrentUserError();
    await resendVerificationEmail(firebaseUser);
  }, [firebaseUser]);

  // Also drives Stage 2 of onboarding: once the reloaded Auth user reports
  // emailVerified, this calls completeOnboarding (which itself re-checks
  // request.auth.token.email_verified server-side — the client-observed
  // flag here is only what decides whether to bother calling at all, never
  // the actual authorization). A second token refresh afterward is what
  // lets a just-promoted teacher's client-side calls (e.g. createClass)
  // pass firestore.rules' claims checks immediately, without waiting for
  // the token's natural expiry.
  //
  // Returns whether Stage 2 actually completed. A `false` result is not an
  // error to swallow here — the caller (useEmailVerification's
  // checkVerified, ultimately the verify-email screen's button) uses it to
  // decide whether it's safe to navigate away or whether the user needs to
  // retry. completeOnboarding is idempotent/retry-safe by design (see its
  // own doc comment), so retrying is always safe and never double-acts.
  const refreshSession = useCallback(async () => {
    if (!firebaseUser) return false;
    const onboardingCompleted = await verifyAndCompleteOnboarding(firebaseUser);
    setEmailVerified(firebaseUser.emailVerified);
    // This client's own ID token has now actually been force-refreshed (see
    // verifyAndCompleteOnboarding's guaranteed refresh-after-completeOnboarding
    // ordering) — only NOW is it safe for RouteGuard to act on Firestore's
    // onboardingStatus "complete", closing the race documented in routing.ts.
    if (onboardingCompleted) setClaimsSynced(true);
    return onboardingCompleted;
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
      claimsSynced,
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
      claimsSynced,
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
