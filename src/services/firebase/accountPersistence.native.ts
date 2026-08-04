import AsyncStorage from "@react-native-async-storage/async-storage";
import { getReactNativePersistence, Persistence } from "firebase/auth";

// iOS/Android only — same platform-split reasoning as initAuth.native.ts:
// getReactNativePersistence exists only because Metro resolves firebase/auth's
// "react-native" package.json condition on these platforms.
export function getAccountPersistence(): Persistence {
  return getReactNativePersistence(AsyncStorage);
}
