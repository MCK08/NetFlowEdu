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

const firebaseConfig = {
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

const useEmulators = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "true";

if (useEmulators && !globalThis.__netflowEduEmulatorsConnected__) {
  const host = resolveEmulatorHost();

  connectAuthEmulator(auth, `http://${host}:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, EMULATOR_PORTS.firestore);
  connectStorageEmulator(storage, host, EMULATOR_PORTS.storage);
  connectFunctionsEmulator(functions, host, EMULATOR_PORTS.functions);

  globalThis.__netflowEduEmulatorsConnected__ = true;
}
