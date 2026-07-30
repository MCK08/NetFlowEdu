import {
  Auth,
  createUserWithEmailAndPassword,
  User,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";

import { auth } from "./config";

export function getCurrentUser(): User | null {
  return auth.currentUser;
}

// `authInstance` defaults to the app's single shared `auth` — every
// EXISTING call site (registerStudent, etc.) omits it and behaves exactly
// as before. multiAccountAuth.ts's "add another account" flow is the only
// caller that ever passes a different (staging) instance explicitly, so a
// brand-new sign-in/sign-up never disturbs whichever account is currently
// active on the shared default instance.
export async function createUserAccount(
  email: string,
  password: string,
  authInstance: Auth = auth,
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(authInstance, email, password);
  return credential.user;
}

export async function setDisplayName(user: User, displayName: string): Promise<void> {
  await updateProfile(user, { displayName });
}

export async function sendVerificationEmail(user: User): Promise<void> {
  await sendEmailVerification(user);
}

export async function signInWithPassword(
  email: string,
  password: string,
  authInstance: Auth = auth,
): Promise<User> {
  const credential = await signInWithEmailAndPassword(authInstance, email, password);
  return credential.user;
}

export async function signOutCurrentUser(): Promise<void> {
  await signOut(auth);
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function reloadCurrentUser(user: User): Promise<void> {
  await reload(user);
}

// Custom claims (role, organizationId) only change server-side, but the
// client's cached ID token doesn't know that until it's force-refreshed.
// Call this after login and after any action that might have changed
// claims (e.g. an admin promotion happening while the user is signed in).
export async function refreshIdToken(user: User): Promise<void> {
  await user.getIdToken(true);
}
