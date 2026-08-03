import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { Auth, GoogleAuthProvider, signInWithCredential, UserCredential } from "firebase/auth";

import {
  GoogleAvailability,
  GooglePlatform,
  resolveGoogleAvailability,
} from "./googleAuthAvailability";

// Required for the browser-based OAuth redirect (expo-auth-session) to
// actually close and hand control back to the app after the user approves
// access in the system browser — without this, the promise from
// promptAsync() never resolves on some platforms.
WebBrowser.maybeCompleteAuthSession();

function currentPlatform(): GooglePlatform {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

// Reads process.env (fixed at bundle time) once and delegates the actual
// decision to the pure, unit-tested resolver.
export function googleAvailability(): GoogleAvailability {
  return resolveGoogleAvailability(currentPlatform(), {
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
}

// Deliberately NOT part of assertRequiredEnvVars() in config.ts — Google
// Sign-In is an additive feature, not a core dependency, so an environment
// that hasn't configured it yet must not have the ENTIRE app fail to boot
// over a missing Google client ID. The availability check itself lives in
// googleAvailability() above; a separate boolean wrapper existed here with
// no callers at all and has been removed rather than left as a second way
// to ask the same question.

// UNCONDITIONAL hook — always called from the top level of its component.
//
// Google.useIdTokenAuthRequest() calls expo-auth-session's `useAuthRequest`,
// which throws synchronously during render (via `invariantClientId`)
// whenever the CURRENT PLATFORM's required client id is missing — e.g.
// `iosClientId` on iOS, regardless of `webClientId` being set. That crashed
// the whole app at LoginScreen mount.
//
// The previous fix guarded that with an `if` INSIDE the hook plus two
// `eslint-disable react-hooks/rules-of-hooks` comments. It worked in
// practice (the branch is bundle-time constant) but it is still an illegal
// conditional hook, and it silenced the lint rule that would catch a future,
// genuinely dynamic condition. The guard now lives at a COMPONENT boundary
// instead — see GoogleSignInButton, which renders a different component
// entirely when Google is unconfigured, so this hook is simply never
// mounted in that environment.
export function useGoogleIdTokenRequest(): ReturnType<typeof Google.useIdTokenAuthRequest> {
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
