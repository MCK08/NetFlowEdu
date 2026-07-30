import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { Auth, GoogleAuthProvider, signInWithCredential, UserCredential } from "firebase/auth";

// Required for the browser-based OAuth redirect (expo-auth-session) to
// actually close and hand control back to the app after the user approves
// access in the system browser — without this, the promise from
// promptAsync() never resolves on some platforms.
WebBrowser.maybeCompleteAuthSession();

// Mirrors expo-auth-session's OWN per-platform client id resolution
// (node_modules/expo-auth-session/build/providers/Google.js's
// `Platform.select({ ios: 'iosClientId', android: 'androidClientId',
// default: 'webClientId' })`) — that is the exact property it reads
// `invariantClientId` against, and throwing there is what crashed app
// startup when e.g. iosClientId was missing on iOS even though
// webClientId was set. This must check the SAME property that platform
// requires, not just webClientId, or "configured" would lie on iOS/Android.
function requiredClientId(): string | undefined {
  if (Platform.OS === "ios") return process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (Platform.OS === "android") return process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
}

// Deliberately NOT part of assertRequiredEnvVars() in config.ts — Google
// Sign-In is an additive feature, not a core dependency, so an environment
// that hasn't configured it yet must not have the ENTIRE app fail to boot
// over a missing Google client ID. Callers check this first: the button
// always renders, but disables itself and shows an explanatory alert
// instead of calling into expo-auth-session at all when this is false.
export function isGoogleSignInConfigured(): boolean {
  const clientId = requiredClientId();
  return typeof clientId === "string" && clientId.length > 0;
}

// A stable, no-op stand-in for expo-auth-session's own return tuple, used
// only when isGoogleSignInConfigured() is false. Its promptAsync is never
// actually invoked (GoogleSignInButton checks isGoogleSignInConfigured()
// before ever calling promptAsync), but it must still be a valid,
// non-throwing value — never `undefined` — since it's a hook return.
const UNCONFIGURED_REQUEST_RESULT: ReturnType<typeof Google.useIdTokenAuthRequest> = [
  null,
  null,
  async () => ({ type: "cancel" }),
];

// Thin wrapper around expo-auth-session's Google ID-token flow — this is
// the one place `webClientId`/`iosClientId`/`androidClientId` are read, so
// every screen that needs a Google sign-in button configures identically.
//
// Google.useIdTokenAuthRequest() calls expo-auth-session's `useAuthRequest`,
// which unconditionally throws (via `invariantClientId`, synchronously,
// during render) whenever the CURRENT PLATFORM's required client id prop is
// missing — e.g. `iosClientId` on iOS, regardless of `webClientId` being
// set. That crashed the whole app at LoginScreen mount before this fix.
// Only constructing the real hook once the platform-required id is known
// to exist (checked above, via the SAME per-platform property
// expo-auth-session itself requires) prevents that call from ever
// happening in an unconfigured environment.
//
// This branch is safe under the rules of hooks in practice even though it
// is syntactically conditional: `isGoogleSignInConfigured()` reads
// `process.env`, which is fixed at bundle time — the branch taken can
// never change across renders for a given running app, only across
// separate builds/environments.
export function useGoogleIdTokenRequest(): ReturnType<typeof Google.useIdTokenAuthRequest> {
  if (!isGoogleSignInConfigured()) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- see doc comment above
    return UNCONFIGURED_REQUEST_RESULT;
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- see doc comment above
  return Google.useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
  });
}

// Uses Firebase Authentication's own Google provider (GoogleAuthProvider +
// signInWithCredential) — not a second/parallel auth system. The id_token
// comes from expo-auth-session's browser-based OAuth flow; everything after
// that point is exactly the same Firebase Auth API this app already uses
// for email/password, just a different credential type.
export async function signInWithGoogleIdToken(
  idToken: string,
  authInstance: Auth,
): Promise<UserCredential> {
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(authInstance, credential);
}
