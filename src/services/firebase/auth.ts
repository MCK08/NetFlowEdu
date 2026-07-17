import {
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

export async function createUserAccount(email: string, password: string): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function setDisplayName(user: User, displayName: string): Promise<void> {
  await updateProfile(user, { displayName });
}

export async function sendVerificationEmail(user: User): Promise<void> {
  await sendEmailVerification(user);
}

export async function signInWithPassword(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
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
