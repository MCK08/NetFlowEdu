import AsyncStorage from "@react-native-async-storage/async-storage";
import { FirebaseApp } from "firebase/app";
import { Auth, getReactNativePersistence, initializeAuth } from "firebase/auth";

// iOS/Android only — getReactNativePersistence exists only because Metro
// resolves firebase/auth's "react-native" package.json condition on these
// platforms (see @/types/firebase-auth-rn.d.ts). Metro picks this file over
// initAuth.web.ts automatically based on platform, so this call is safe.
export function initPlatformAuth(app: FirebaseApp): Auth {
  return initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}
