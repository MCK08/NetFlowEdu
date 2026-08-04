import { browserLocalPersistence, Persistence } from "firebase/auth";

// Web only — firebase/auth's browser build never exports
// getReactNativePersistence (same reasoning as initAuth.web.ts). Each
// per-account named Auth instance persists to localStorage instead, keyed
// by its own FirebaseApp name, so accounts still don't collide.
export function getAccountPersistence(): Persistence {
  return browserLocalPersistence;
}
