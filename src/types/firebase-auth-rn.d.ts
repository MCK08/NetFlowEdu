// `firebase/auth`'s published type declarations don't vary by platform, so
// TypeScript never sees `getReactNativePersistence` even though it's a real
// runtime export once Metro resolves the package's "react-native" condition
// (see @firebase/auth/dist/rn/index.js, which is what actually runs). This
// augmentation only adds the missing type — it changes nothing at runtime.
import "firebase/auth";

declare module "firebase/auth" {
  export function getReactNativePersistence(storage: unknown): Persistence;
}
