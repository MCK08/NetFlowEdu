import { FirebaseApp } from "firebase/app";
import { Auth, getAuth } from "firebase/auth";

// Web only — firebase/auth's browser build never exports
// getReactNativePersistence, so web uses the standard getAuth(), which
// already persists to localStorage by default.
export function initPlatformAuth(app: FirebaseApp): Auth {
  return getAuth(app);
}
