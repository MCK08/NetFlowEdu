import { FirebaseError } from "firebase/app";
import { Auth } from "firebase/auth";
import {
  createUserAccount,
  reloadCurrentUser,
  sendPasswordReset as sendPasswordResetEmail,
  sendVerificationEmail,
  setDisplayName,
  signInWithPassword,
  signOutCurrentUser,
} from "@services/firebase/auth";
import { getUserProfileOnce } from "@services/firebase/firestore";
import { initializeOnboarding, setUsername } from "@services/firebase/functions";
import { User } from "firebase/auth";

import { LoginInput, RegisterInput } from "../types";
import { normalizeEmail } from "../validation";
import { waitForProfileDocument } from "./profileWait";

export interface RegisterResult {
  user: User;
  // False when sendVerificationEmail actually failed during registration —
  // the account still exists in Firebase Auth (never rolled back for this),
  // so the caller must not claim "we sent you an email" and must instead let
  // the user retry from the resend button on VerifyEmailScreen. Never
  // inferred from "registration didn't throw" — that used to be exactly the
  // bug: a swallowed send failure was indistinguishable from success.
  verificationEmailSent: boolean;
}

function isEmailAlreadyInUse(error: unknown): boolean {
  return error instanceof FirebaseError && error.code === "auth/email-already-in-use";
}

// setUsername.ts throws 'failed-precondition' ONLY when the CALLER's own
// account already has a username set — never for someone else's (that's the
// DIFFERENT code 'already-exists', never swallowed). On the
// email-already-in-use retry path this COULD be proof a prior attempt
// already finished this exact step for THIS uid with THIS SAME username —
// but it could just as easily mean the account already owns a DIFFERENT
// username (e.g. the retry form was reopened with a different value typed
// in). Those two cases must never be treated the same way: silently
// continuing in the second case would be exactly the "silently replace/
// mismatch" bug this guards against. The caller (registerStudent) reads
// the account's actual stored username and compares before deciding.
function isUsernameAlreadySetForCaller(error: unknown): boolean {
  return error instanceof FirebaseError && error.code === "functions/failed-precondition";
}

// Registration sequence. Steps are ordered so the critical step (creating
// the Auth account) happens first. displayName/verification-email on the
// Firebase Auth user object are best-effort afterward and non-fatal if they
// fail — nothing in this app reads them (see initializeOnboarding below for
// why).
//
// Retry-safe: if createUserAccount fails with "email already in use",
// that's not necessarily a genuine duplicate signup — it's exactly what
// happens if a PRIOR attempt for this same email got past account creation
// but then failed later (e.g. setUsername below rejecting a taken
// username). Rather than dead-ending, this signs back into that same
// account and resumes the rest of onboarding — so "fix the username,
// submit again" actually works instead of permanently stranding the
// account. Every step after that point is itself idempotent/safe to redo
// (waitForProfileDocument, initializeOnboarding — see its own doc comment).
//
// setUsername is NOT swallowed — a taken username must reach the caller so
// the register screen can show a clear, recoverable error and let the user
// pick a different one and resubmit (via the retry path above), rather
// than silently leaving the account with no username forever.
//
// Stage 2 (completeOnboarding — the step that actually GRANTS the role and
// any teacher claims/organization) deliberately does NOT run here: it
// requires a verified email, which a brand-new account never has yet. It
// runs from AuthProvider.refreshSession instead, once verification is
// confirmed — see that file.
// `authInstance` defaults to the shared default Auth (every existing call
// site behaves exactly as before). Phase 11's "Başka Hesap Ekle" flow is
// the only caller that ever passes the transient staging instance instead,
// so registering a second account can never disturb whichever account is
// currently active — see multiAccountAuth.ts.
export async function registerStudent(
  input: RegisterInput,
  authInstance?: Auth,
): Promise<RegisterResult> {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();
  const username = input.username.trim();

  let user: User;
  try {
    user = authInstance
      ? await createUserAccount(email, input.password, authInstance)
      : await createUserAccount(email, input.password);
  } catch (error) {
    if (!isEmailAlreadyInUse(error)) throw error;
    user = authInstance
      ? await signInWithPassword(email, input.password, authInstance)
      : await signInWithPassword(email, input.password);
  }

  try {
    await setDisplayName(user, displayName);
  } catch {
    // Non-fatal — see comment above.
  }

  let verificationEmailSent = true;
  try {
    await sendVerificationEmail(user);
  } catch (error) {
    // Non-fatal for registration itself — the Auth account already exists
    // and must not be rolled back — but no longer silently discarded: the
    // caller needs to know so it can avoid claiming the email was sent
    // (previous bug) and instead let the user retry via resend.
    verificationEmailSent = false;
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      const code = error instanceof FirebaseError ? error.code : "unknown";
      console.warn("[authService] sendVerificationEmail failed during registration", { code });
    }
  }

  await waitForProfileDocument(user.uid);

  // MUST stay ahead of setUsername. Production incident (2026-07-27): this
  // call used to run LAST, after setUsername. A user picked an already-taken
  // username, setUsername threw `functions/already-exists`, registerStudent
  // re-threw (correctly — a taken username has to reach the user), and
  // initializeOnboarding therefore never ran. requestedRole stayed null.
  //
  // That would merely have been a failed registration to retry, except the
  // Auth account already exists by this point, so onAuthStateChanged has
  // already fired and RouteGuard has already replaced the route to
  // verify-email (an authenticated+unverified session resolves there — see
  // routeGuardDecision.ts). The register screen's "username taken" error is
  // therefore rendered on a screen the user is no longer looking at, and
  // they land on verify-email holding an account with requestedRole=null.
  // Verifying their email then made completeOnboarding throw
  // `functions/failed-precondition` ("Hesap türü seçilmemiş") forever — a
  // permanently stranded account with no in-app recovery path.
  //
  // requestedRole is the user's core intent and the one input Stage 2 can
  // never reconstruct on its own, so it is persisted here — immediately
  // after the profile document exists and before ANY step that can fail for
  // a user-correctable reason. initializeOnboarding is safe in this position:
  // it needs only users/{uid} to exist, it never touches username, it is
  // idempotent, and requestedRole is write-once server-side (see
  // functions/src/onboarding/initializeOnboarding.ts).
  //
  // The exact typed displayName is passed directly as an argument here —
  // not read back off the Auth user object — so this can never race against
  // setDisplayName's eventual-consistency propagation into Firebase Auth.
  await initializeOnboarding(input.intendedRole, displayName);

  // Not swallowed — see comment above. The one exception is "this uid
  // already owns exactly this normalized username" — verified against the
  // account's own stored value (an owner-only-readable field, so this
  // check can't be spoofed), not just inferred from the error code alone.
  // A mismatch (this uid owns a DIFFERENT username) re-throws instead of
  // silently continuing — never replaces, never releases, never changes
  // the existing reservation.
  //
  // Still fatal, and still last: a taken username must reach the caller.
  // What changed is that failing here no longer costs the account its
  // requestedRole, so the user can resubmit with a different username (the
  // email-already-in-use path above signs them back in) and Stage 2 can
  // complete either way.
  try {
    await setUsername(username);
  } catch (error) {
    if (!isUsernameAlreadySetForCaller(error)) throw error;

    const existingProfile = await getUserProfileOnce(user.uid);
    const ownsRequestedUsername =
      existingProfile?.username?.toLowerCase() === username.toLowerCase();
    if (!ownsRequestedUsername) throw error;
  }

  return { user, verificationEmailSent };
}

export async function loginWithPassword(input: LoginInput, authInstance?: Auth): Promise<User> {
  const email = normalizeEmail(input.email);
  return authInstance
    ? signInWithPassword(email, input.password, authInstance)
    : signInWithPassword(email, input.password);
}

export async function logout(): Promise<void> {
  await signOutCurrentUser();
}

// Never reveals whether the address exists — the caller shows a generic
// success message regardless of the outcome the SDK reports.
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(normalizeEmail(email));
  } catch {
    // Swallowed intentionally: don't let enumeration-relevant errors
    // (e.g. auth/user-not-found) leak to the UI.
  }
}

export async function resendVerificationEmail(user: User): Promise<void> {
  try {
    await sendVerificationEmail(user);
  } catch (error) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      const code = error instanceof FirebaseError ? error.code : "unknown";
      console.warn("[authService] resendVerificationEmail failed", { code });
    }
    throw error;
  }
}

// Reloads the Auth user (to pick up a fresh emailVerified flag) and forces
// an ID token refresh (to pick up any custom-claims change made
// server-side, e.g. a role promotion) in one call.
export async function checkEmailVerifiedStatus(user: User): Promise<boolean> {
  await reloadCurrentUser(user);
  await user.getIdToken(true);
  return user.emailVerified;
}
