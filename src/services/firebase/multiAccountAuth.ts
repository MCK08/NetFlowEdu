import { deleteApp, FirebaseApp, getApps, initializeApp } from "firebase/app";
import {
  Auth,
  getReactNativePersistence,
  inMemoryPersistence,
  initializeAuth,
  Persistence,
  signOut,
  updateCurrentUser,
  User,
} from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { auth as defaultAuth, firebaseConfig } from "./config";

// ---------------------------------------------------------------------------
// Device account switcher — architecture
//
// Firebase Auth's single default `auth` instance (config.ts) can only ever
// hold ONE signed-in user. There is no supported API to make it "forget"
// account A and "become" account B without either signing out (losing A's
// session) or performing a fresh credential sign-in (which is exactly the
// "ask for the password again" this feature exists to avoid).
//
// The mechanism that actually delivers instant, no-password switching
// without touching config.ts or any of the ~15 existing service files that
// import its `auth`/`db`/`storage`/`functions` singletons:
//
//  1. Every stored account gets its OWN separate, NAMED FirebaseApp +
//     Auth instance ("account-{uid}"), persisted via the EXACT SAME
//     getReactNativePersistence(AsyncStorage) mechanism the app's single
//     default Auth already uses today — just one slot per account instead
//     of one slot total. Firebase's persistence key format is scoped by
//     app name internally, so these never collide with each other or with
//     the default app's own persisted session.
//  2. `updateCurrentUser(auth, user)` (a real, documented firebase/auth
//     API) transfers an already-authenticated User from one Auth instance
//     onto another. Calling `updateCurrentUser(defaultAuth, storedUser)`
//     makes that user active on the SAME default `auth` every existing
//     file already imports — Firestore/Storage/Functions calls from those
//     files start reflecting the new account immediately, with no changes
//     to any of them, because they all read the current auth state off
//     that same shared instance at request time.
//  3. A brand-new sign-in (login, register, or Google) for an account NOT
//     yet stored runs against a throwaway, in-memory-only "staging" Auth
//     instance first (never the shared default, so it can never disturb
//     whichever account is currently active while the credential exchange
//     is in flight). Once it resolves, the SAME resulting User is copied
//     into that account's own permanent named instance (for future
//     instant resume) and onto the default instance (to make it active
//     right now), and the staging instance is signed out again.
//
// No plaintext credential/token is ever handled by this module — every
// step above passes around Firebase SDK `User`/`Auth` objects, and the
// actual serialized session data stays entirely inside Firebase's own
// persistence layer, exactly as it already does for the single-account
// case today.
// ---------------------------------------------------------------------------

const ACCOUNT_APP_PREFIX = "account-";
const STAGING_APP_NAME = "staging-auth";

declare global {
  // eslint-disable-next-line no-var
  var __netflowEduNamedAuthInstances__: Map<string, Auth> | undefined;
}

// Same Fast-Refresh-survival reasoning as config.ts's own
// __netflowEduFirebaseAuth__ sentinel: a module-local Map would be
// recreated on every Fast Refresh, but the underlying named FirebaseApps
// (tracked by the SDK itself via getApps()) would still exist — calling
// initializeAuth on an app that already has one throws. Caching on
// globalThis keeps this module's own bookkeeping in sync with reality
// across Fast Refresh remounts.
const authInstances: Map<string, Auth> =
  globalThis.__netflowEduNamedAuthInstances__ ?? new Map<string, Auth>();
globalThis.__netflowEduNamedAuthInstances__ = authInstances;

function getOrCreateNamedAuth(appName: string, persistence: Persistence): Auth {
  const cached = authInstances.get(appName);
  if (cached) return cached;

  const app: FirebaseApp =
    getApps().find((existing) => existing.name === appName) ??
    initializeApp(firebaseConfig, appName);
  const authInstance = initializeAuth(app, { persistence });
  authInstances.set(appName, authInstance);
  return authInstance;
}

function accountAppName(uid: string): string {
  return `${ACCOUNT_APP_PREFIX}${uid}`;
}

function getAccountAuth(uid: string): Auth {
  return getOrCreateNamedAuth(accountAppName(uid), getReactNativePersistence(AsyncStorage));
}

function getStagingAuth(): Auth {
  return getOrCreateNamedAuth(STAGING_APP_NAME, inMemoryPersistence);
}

// Makes `user` the active session on the app's single shared default Auth
// instance — the only Auth instance every existing screen/service actually
// reads from. This is the one line that makes a switch/add-account "count"
// for the rest of the app.
//
// `null` is a supported value for updateCurrentUser and signs the default
// instance out; it is what "there was no previous account to restore" means
// on the rollback path below.
export async function setActiveUser(user: User | null): Promise<void> {
  await updateCurrentUser(defaultAuth, user);
}

async function activateOnDefaultAuth(user: User): Promise<void> {
  await setActiveUser(user);
}

// The account currently active on the shared default instance, captured
// BEFORE an add-account attempt so it can be put back if the newly signed-in
// account turns out to be rejected (e.g. suspended). Reading it through this
// module keeps every default-Auth mutation in one file.
export function currentActiveUser(): User | null {
  return defaultAuth.currentUser;
}

// Runs a credential operation (sign-in, register, or a Google credential
// exchange) against a transient staging Auth instance — never the shared
// default one — so it can never disturb whichever account is currently
// active while the operation is in flight. On success, the resulting
// session is (a) copied into that account's own permanent, uid-scoped Auth
// instance so it can be resumed instantly later without a password, and
// (b) activated on the default Auth instance so the rest of the app sees
// it right now. The staging instance itself is always signed back out
// afterward, clean for the next use.
//
// Generic over T (rather than fixed to `User`) so a caller can return the
// full UserCredential from signInWithCredential/signInWithEmailAndPassword —
// e.g. Google sign-in needs `additionalUserInfo?.isNewUser` from that
// result to decide whether to route to first-time username/role selection,
// which a bare `User` doesn't carry.
export async function runOnStagingAuthAndActivate<T extends { user: User }>(
  action: (stagingAuth: Auth) => Promise<T>,
): Promise<T> {
  const staging = getStagingAuth();
  const result = await action(staging);
  const { user } = result;

  const permanentAuth = getAccountAuth(user.uid);
  await updateCurrentUser(permanentAuth, user);
  await activateOnDefaultAuth(user);
  await signOut(staging).catch(() => undefined);

  return result;
}

// Mirrors `user`'s session onto its own permanent, uid-scoped Auth instance
// without disturbing the default Auth instance. Every account reaches
// "known" status via AuthProvider's single generic upsert effect regardless
// of which path signed it in — normal signIn/register never go through
// runOnStagingAuthAndActivate, so without this call their per-uid instance
// would never get populated, and switchToStoredAccount would later find it
// empty (see that function's null-return case). Safe to call redundantly
// for accounts that WERE staged (updateCurrentUser is idempotent).
export async function syncAccountAuth(user: User): Promise<void> {
  const permanentAuth = getAccountAuth(user.uid);
  await updateCurrentUser(permanentAuth, user);
}

// Instantly resumes a previously-added account with NO credential prompt —
// `permanentAuth`'s own persistence layer already rehydrated its last
// signed-in user when this module first created it (or on a prior app
// launch); authStateReady() just waits for that rehydration to actually
// finish before reading `currentUser`. Returns null if that account's
// session has since expired/been revoked (e.g. the user changed their
// password elsewhere, or it was explicitly forgotten) — the caller should
// fall back to a normal credential sign-in for that account in that case.
export async function switchToStoredAccount(uid: string): Promise<User | null> {
  const permanentAuth = getAccountAuth(uid);
  await permanentAuth.authStateReady();
  const user = permanentAuth.currentUser;
  if (!user) return null;
  await activateOnDefaultAuth(user);
  return user;
}

// Fully revokes a stored account's LOCAL session (not just removing it
// from the display list) — signs its permanent Auth instance out and tears
// down the underlying named FirebaseApp, so "delete this account" in the
// switcher actually means it, not just "hide it from the list".
export async function forgetStoredAccount(uid: string): Promise<void> {
  const appName = accountAppName(uid);
  const cached = authInstances.get(appName);
  if (cached) {
    await signOut(cached).catch(() => undefined);
  }
  authInstances.delete(appName);

  const app = getApps().find((existing) => existing.name === appName);
  if (app) {
    await deleteApp(app).catch(() => undefined);
  }
}
