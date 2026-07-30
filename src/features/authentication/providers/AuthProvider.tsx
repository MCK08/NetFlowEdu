import { onAuthStateChanged, User } from "firebase/auth";
import { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { UserProfile, UserRole } from "@/types/user";
import { auth } from "@services/firebase/config";
import { subscribeToUserProfile } from "@services/firebase/firestore";
import { refreshIdToken, signOutCurrentUser } from "@services/firebase/auth";
import {
  KnownAccount,
  listKnownAccounts,
  removeKnownAccount,
  touchKnownAccount,
  upsertKnownAccount,
} from "@services/firebase/accountRegistry";
import {
  forgetStoredAccount,
  runOnStagingAuthAndActivate,
  switchToStoredAccount,
  syncAccountAuth,
} from "@services/firebase/multiAccountAuth";
import { initializeOnboarding, setUsername } from "@services/firebase/functions";
import { GoogleAuthProvider, getAdditionalUserInfo, linkWithCredential } from "firebase/auth";

import { ForgotPasswordInput, LoginInput, RegisterInput } from "../types";
import {
  loginWithPassword,
  logout,
  registerStudent,
  requestPasswordReset,
  resendVerificationEmail,
} from "../services/authService";
import { signInWithGoogleIdToken } from "../services/googleAuth";
import {
  NO_CURRENT_USER_CODE,
  OnboardingCompletionResult,
  verifyAndCompleteOnboarding,
} from "../services/onboardingSession";
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
  refreshSession: () => Promise<OnboardingCompletionResult>;
  // Phase 11 — device account switcher / Google Sign-In. All built on top
  // of the SAME Firebase Auth instance/session model above (see
  // multiAccountAuth.ts for exactly how "switch without a password" works),
  // not a second auth system.
  knownAccounts: KnownAccount[];
  // Instantly activates a previously-added account with no credential
  // prompt. Returns false if that account's local session has expired —
  // the caller should fall back to a normal sign-in for it in that case
  // (and may want to call removeAccount to stop offering a dead switch).
  switchAccount: (uid: string) => Promise<boolean>;
  // Removes an account from the device entirely — clears its remembered
  // display metadata AND revokes its local persisted session.
  removeAccount: (uid: string) => Promise<void>;
  // Signs into a DIFFERENT account via email/password without disturbing
  // whichever account is currently active until the credential check
  // actually succeeds — "+ Başka Hesap Ekle".
  addAccountWithPassword: (input: LoginInput) => Promise<void>;
  // Same, via a Google ID token (see googleAuth.ts for how the token
  // itself is obtained). Returns whether this is a brand-new account, so
  // the caller can route to first-time username/role selection.
  addAccountWithGoogle: (idToken: string) => Promise<{ isNewUser: boolean }>;
  // Finishes onboarding for a brand-new Google sign-up — reuses the exact
  // same initializeOnboarding/setUsername Cloud Functions email/password
  // registration already goes through (see authService.registerStudent),
  // just without a password step.
  completeGoogleOnboarding: (input: {
    displayName: string;
    username: string;
    intendedRole: RegisterInput["intendedRole"];
  }) => Promise<void>;
  // Links a Google credential onto the CURRENTLY signed-in account (no
  // staging instance involved — this modifies the same user in place, via
  // Firebase Auth's own account-linking API).
  linkGoogleAccount: (idToken: string) => Promise<void>;
  // Visibility for the lazy-loaded Account Switcher bottom sheet, mounted
  // once at the root layout (app/_layout.tsx) and opened from a long-press
  // on the Profile tab button in either role's tab layout — kept here
  // rather than a second context/store so there is exactly one place that
  // owns "is the switcher open" for the whole app.
  isAccountSwitcherOpen: boolean;
  openAccountSwitcher: () => void;
  closeAccountSwitcher: () => void;
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

  const [knownAccounts, setKnownAccounts] = useState<KnownAccount[]>([]);

  const refreshKnownAccounts = useCallback(async () => {
    setKnownAccounts(await listKnownAccounts());
  }, []);

  useEffect(() => {
    refreshKnownAccounts();
  }, [refreshKnownAccounts]);

  // Keeps the on-device account registry in sync with whichever account is
  // ACTUALLY active, no matter which path got it there (normal sign-in,
  // register, switch, or Google) — a single generic effect instead of
  // repeating an upsert call at every one of those call sites. Only runs
  // once the real Firestore profile is available, so the remembered
  // display metadata (username/role/photo) is accurate, not a placeholder.
  useEffect(() => {
    if (!firebaseUser || !profile) return;
    // Bug fix: normal signIn/register never populate this account's own
    // per-uid Auth instance (only the staging-based add-account/Google
    // paths did) — without this, switchToStoredAccount would find that
    // instance empty and report the account's session as expired the
    // first time anyone tried to switch back to it. See syncAccountAuth's
    // doc comment in multiAccountAuth.ts.
    syncAccountAuth(firebaseUser);
    upsertKnownAccount({
      uid: firebaseUser.uid,
      email: profile.email,
      displayName: profile.displayName,
      username: profile.username,
      photoURL: profile.photoURL,
      role: profile.role,
    }).then(refreshKnownAccounts);
  }, [firebaseUser, profile, refreshKnownAccounts]);

  const switchAccount = useCallback(
    async (uid: string): Promise<boolean> => {
      const user = await switchToStoredAccount(uid);
      if (!user) return false;
      await touchKnownAccount(uid);
      await refreshKnownAccounts();
      return true;
    },
    [refreshKnownAccounts],
  );

  const removeAccount = useCallback(
    async (uid: string): Promise<void> => {
      await forgetStoredAccount(uid);
      await removeKnownAccount(uid);
      await refreshKnownAccounts();
    },
    [refreshKnownAccounts],
  );

  // Signs into a DIFFERENT account on a throwaway staging Auth instance —
  // never the shared default one — so whichever account is currently
  // active stays untouched unless/until the credential check actually
  // succeeds. See multiAccountAuth.ts's own doc comment for the full
  // mechanism.
  const addAccountWithPassword = useCallback(async (input: LoginInput): Promise<void> => {
    await runOnStagingAuthAndActivate(async (stagingAuth) => ({
      user: await loginWithPassword(input, stagingAuth),
    }));
  }, []);

  const addAccountWithGoogle = useCallback(
    async (idToken: string): Promise<{ isNewUser: boolean }> => {
      const result = await runOnStagingAuthAndActivate((stagingAuth) =>
        signInWithGoogleIdToken(idToken, stagingAuth),
      );
      return { isNewUser: getAdditionalUserInfo(result)?.isNewUser ?? false };
    },
    [],
  );

  // Stage 1 (initializeOnboarding) for a brand-new Google sign-up — the
  // EXACT same Cloud Function email/password registration calls (see
  // authService.registerStudent), just reached without a password step.
  // Stage 2 (completeOnboarding, granting the role/claims) still only ever
  // runs from refreshSession/signIn once email_verified is true — a Google
  // sign-in's email is already verified by Google itself, so this resolves
  // on the very next refreshSession call, same as any other account.
  const completeGoogleOnboarding = useCallback(
    async (input: {
      displayName: string;
      username: string;
      intendedRole: RegisterInput["intendedRole"];
    }): Promise<void> => {
      if (!firebaseUser) throw new NoCurrentUserError();
      await initializeOnboarding(input.intendedRole, input.displayName.trim());
      await setUsername(input.username.trim());
    },
    [firebaseUser],
  );

  // Links a Google credential onto the user that's CURRENTLY active on the
  // shared default Auth instance — a real in-place account-linking
  // operation (Firebase Auth's own linkWithCredential), never a session
  // switch, so it never touches the staging/per-account instances at all.
  const linkGoogleAccount = useCallback(async (idToken: string): Promise<void> => {
    if (!firebaseUser) throw new NoCurrentUserError();
    const credential = GoogleAuthProvider.credential(idToken);
    await linkWithCredential(firebaseUser, credential);
  }, [firebaseUser]);

  const [isAccountSwitcherOpen, setIsAccountSwitcherOpen] = useState(false);
  const openAccountSwitcher = useCallback(() => setIsAccountSwitcherOpen(true), []);
  const closeAccountSwitcher = useCallback(() => setIsAccountSwitcherOpen(false), []);

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
    const { completed } = await verifyAndCompleteOnboarding(user);
    // Only meaningful when a role transition actually happened during this
    // call (see below) — otherwise claimsSynced was never false to begin
    // with, so this is a no-op.
    if (completed) setClaimsSynced(true);
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
  const refreshSession = useCallback(async (): Promise<OnboardingCompletionResult> => {
    if (!firebaseUser) return { completed: false, failureCode: NO_CURRENT_USER_CODE };
    const result = await verifyAndCompleteOnboarding(firebaseUser);
    setEmailVerified(firebaseUser.emailVerified);
    // This client's own ID token has now actually been force-refreshed (see
    // verifyAndCompleteOnboarding's guaranteed refresh-after-completeOnboarding
    // ordering) — only NOW is it safe for RouteGuard to act on Firestore's
    // onboardingStatus "complete", closing the race documented in routing.ts.
    if (result.completed) setClaimsSynced(true);
    return result;
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
      knownAccounts,
      switchAccount,
      removeAccount,
      addAccountWithPassword,
      addAccountWithGoogle,
      completeGoogleOnboarding,
      linkGoogleAccount,
      isAccountSwitcherOpen,
      openAccountSwitcher,
      closeAccountSwitcher,
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
      knownAccounts,
      switchAccount,
      removeAccount,
      addAccountWithPassword,
      addAccountWithGoogle,
      completeGoogleOnboarding,
      linkGoogleAccount,
      isAccountSwitcherOpen,
      openAccountSwitcher,
      closeAccountSwitcher,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
