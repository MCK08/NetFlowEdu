import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { Auth, connectAuthEmulator } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";

import { resolveEmulatorHost, EMULATOR_PORTS } from "@constants/firebase";

import { initPlatformAuth } from "./initAuth";

// Exported (not just module-local) so multiAccountAuth.ts can initialize
// additional NAMED FirebaseApp instances (one per stored account, plus one
// transient staging instance) with the exact same project config — see that
// file's own doc comment for why this is required rather than reusing the
// single default `app` below for every account.
//
// Every field below is a LITERAL `process.env.EXPO_PUBLIC_X` member
// expression on purpose. Expo/Metro's env babel plugin statically replaces
// exactly that form with the build-time value, which is what puts the real
// configuration inside a production (EAS/native) bundle — verified by
// inspecting a real `expo export` output, where these appear as inlined
// string literals. Do not rewrite these into a loop or computed access: a
// computed read is not inlined, and in a production bundle `process.env` is
// an empty object (`process.env = process.env || {}`), so the config would
// silently become all-undefined.
export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Which env var supplies each config field — used only to name what is
// missing in the error below, never to READ the value (see above).
const CONFIG_FIELD_ENV_VARS: Readonly<Record<keyof typeof firebaseConfig, string>> = {
  apiKey: "EXPO_PUBLIC_FIREBASE_API_KEY",
  authDomain: "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  storageBucket: "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  appId: "EXPO_PUBLIC_FIREBASE_APP_ID",
};

// Validates the RESOLVED config object, not `process.env`.
//
// This previously did `REQUIRED_ENV_VARS.filter((key) => !process.env[key])`
// — a COMPUTED read, which Metro's env plugin cannot inline. In development
// that works (Expo populates a real `process.env` at runtime), but a
// production bundle has no such object, so all six keys read `undefined` and
// this guard threw at module-import time: the app would have crashed on
// launch for every TestFlight/App Store build, even though the configuration
// itself was correctly inlined into `firebaseConfig` directly above.
// Confirmed against a real production `expo export` bundle before changing
// this. Checking the resolved object instead keeps the guard's purpose (fail
// fast, with names, when configuration really is absent) while behaving
// identically in development and production.
function assertRequiredFirebaseConfig(): void {
  const missing = (Object.keys(CONFIG_FIELD_ENV_VARS) as (keyof typeof firebaseConfig)[])
    .filter((field) => !firebaseConfig[field])
    .map((field) => CONFIG_FIELD_ENV_VARS[field]);
  if (missing.length > 0) {
    // Names only — never log the values, even the missing ones' siblings.
    throw new Error(
      `Missing required Firebase environment variables: ${missing.join(", ")}. ` +
        "Copy .env.example to .env and fill in your Firebase Web app config.",
    );
  }
}

assertRequiredFirebaseConfig();

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
