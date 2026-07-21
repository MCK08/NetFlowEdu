import {
  createUserAccount,
  reloadCurrentUser,
  sendPasswordReset as sendPasswordResetEmail,
  sendVerificationEmail,
  setDisplayName,
  signInWithPassword,
  signOutCurrentUser,
} from "@services/firebase/auth";
import { requestTeacherRole, setUsername } from "@services/firebase/functions";
import { User } from "firebase/auth";

import { LoginInput, RegisterInput } from "../types";
import { normalizeEmail } from "../validation";
import { waitForProfileDocument } from "./profileWait";

export interface RegisterResult {
  user: User;
  teacherRequestSubmitted: boolean;
}

// Registration sequence. Steps are ordered so the critical step (creating
// the Auth account) happens first; display name / verification email are
// best-effort afterward. If either fails, we deliberately don't roll back
// or throw — the user already has a working account and can fix both from
// the verify-email screen (resend button) without any orphaned/inconsistent
// state. The onUserCreate trigger creates the Firestore profile
// independently of whether these two steps succeed.
//
// intendedRole never affects the account itself — onUserCreate always
// creates it as "student". Choosing "teacher" only files a
// teacherRequests/{uid} document (via the requestTeacherRole callable) for
// an admin to review; only adminSetUserRole can ever grant the teacher role.
export async function registerStudent(input: RegisterInput): Promise<RegisterResult> {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();

  const user = await createUserAccount(email, input.password);

  try {
    await setDisplayName(user, displayName);
  } catch {
    // Non-fatal — see comment above.
  }

  try {
    await sendVerificationEmail(user);
  } catch {
    // Non-fatal — user can use "resend verification" on the next screen.
  }

  await waitForProfileDocument(user.uid);

  try {
    await setUsername(input.username.trim());
  } catch {
    // Non-fatal, same reasoning as displayName/verification email above —
    // uniqueness is still enforced server-side (see setUsername.ts), this
    // only means a rare collision leaves username unset; UI falls back to
    // displayName (see UserProfile.username doc comment), never to uid.
  }

  let teacherRequestSubmitted = false;
  if (input.intendedRole === "teacher") {
    try {
      await requestTeacherRole(displayName, input.organizationName.trim());
      teacherRequestSubmitted = true;
    } catch {
      // Non-fatal for the same reason as above — the student account is
      // already usable. The register screen falls back to a generic
      // message when this is false.
    }
  }

  return { user, teacherRequestSubmitted };
}

export async function loginWithPassword(input: LoginInput): Promise<User> {
  const email = normalizeEmail(input.email);
  return signInWithPassword(email, input.password);
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
  await sendVerificationEmail(user);
}

// Reloads the Auth user (to pick up a fresh emailVerified flag) and forces
// an ID token refresh (to pick up any custom-claims change made
// server-side, e.g. a role promotion) in one call.
export async function checkEmailVerifiedStatus(user: User): Promise<boolean> {
  await reloadCurrentUser(user);
  await user.getIdToken(true);
  return user.emailVerified;
}
