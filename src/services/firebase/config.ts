import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, connectAuthEmulator } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";

import { resolveEmulatorHost, EMULATOR_PORTS } from "@constants/firebase";

import { initPlatformAuth } from "./initAuth";

const REQUIRED_ENV_VARS = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
] as const;

function assertRequiredEnvVars(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    // Names only — never log the values, even the missing ones' siblings.
    throw new Error(
      `Missing required Firebase environment variables: ${missing.join(", ")}. ` +
        "Copy .env.example to .env and fill in your Firebase Web app config.",
    );
  }
}

assertRequiredEnvVars();

// Exported (not just module-local) so multiAccountAuth.ts can initialize
// additional NAMED FirebaseApp instances (one per stored account, plus one
// transient staging instance) with the exact same project config — see that
// file's own doc comment for why this is required rather than reusing the
// single default `app` below for every account.
export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Expo Fast Refresh re-runs this module without restarting the JS runtime,
// so both app/auth initialization and emulator connection must be guarded
// against running twice. `getApps()`/`getApp()` already guard the app
// instance; everything else needs an explicit sentinel on `globalThis`,
// which survives Fast Refresh module remounts.
declare global {
  // eslint-disable-next-line no-var
  var __netflowEduFirebaseAuth__: Auth | undefined;
  // eslint-disable-next-line no-var
  var __netflowEduEmulatorsConnected__: boolean | undefined;
}

export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth: Auth = globalThis.__netflowEduFirebaseAuth__ ?? initPlatformAuth(app);
globalThis.__netflowEduFirebaseAuth__ = auth;

export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Exported so multiAccountAuth.ts's named per-account/staging Auth
// instances can apply the exact same emulator guard this file applies to
// the default instance below — see that file's getOrCreateNamedAuth.
//
// WHY THIS IS NOT PLAIN `process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS`
//
// Expo/Metro statically replaces any literal `process.env.EXPO_PUBLIC_X`
// member expression with a reference into its own bundle-time "virtual env"
// snapshot (`expo/virtual/env`) — a snapshot built directly from `.env`
// FILE contents, not from the live Node process's environment. A value
// exported at the shell (`EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true npm run
// web`) genuinely reaches `process.env` at runtime (confirmed: Expo's own
// dev-mode "HMR env vars" polyfill block correctly mirrors it), but that
// live object is never what a literal dot-access reads once Metro has
// statically rewritten it — the rewritten code reads `.env`'s own committed
// value instead, silently ignoring the shell override. This was verified
// directly: a fresh `--clear` restart with the shell var set still produced
// `auth.emulatorConfig === null` (i.e. still bound to production), while
// the exact same running process's live `process.env` object held "true".
//
// A COMPUTED (bracket) property read is not a literal member expression, so
// Metro's inliner does not pattern-match and rewrite it — this line
// therefore reads the REAL, shell-aware `process.env` at runtime instead of
// the file-only snapshot. Verified empirically: switching to bracket access
// changed the observed value from "false" to "true" for the exact same
// shell invocation, with no other change. Keep this as bracket access
// deliberately; reverting to `process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS`
// silently reintroduces the bug (compiles fine, boots fine, quietly talks
// to production).
const EMULATOR_FLAG_KEY = "EXPO_PUBLIC_USE_FIREBASE_EMULATORS";
export const useEmulators = process.env[EMULATOR_FLAG_KEY] === "true";

if (useEmulators && !globalThis.__netflowEduEmulatorsConnected__) {
  const host = resolveEmulatorHost();

  connectAuthEmulator(auth, `http://${host}:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, EMULATOR_PORTS.firestore);
  connectStorageEmulator(storage, host, EMULATOR_PORTS.storage);
  connectFunctionsEmulator(functions, host, EMULATOR_PORTS.functions);

  globalThis.__netflowEduEmulatorsConnected__ = true;

  // Fail closed, not silently open: `useEmulators` being true and
  // `connectAuthEmulator` running is exactly the state that silently talked
  // to production before this fix (see the doc comment above). This is a
  // narrow, dev-only sanity check on the one property the SDK exposes for
  // it — not a diagnostics framework — and it only ever fires in emulator
  // mode, so production-mode behavior below is untouched either way.
  if (!auth.emulatorConfig) {
    throw new Error(
      "EXPO_PUBLIC_USE_FIREBASE_EMULATORS is true but Firebase Auth did not bind to the " +
        "local emulator (auth.emulatorConfig is still null after connectAuthEmulator). " +
        "Refusing to continue rather than silently sending demo credentials to production.",
    );
  }
}
