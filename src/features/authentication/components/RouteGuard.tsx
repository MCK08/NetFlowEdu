import { useRouter, useSegments } from "expo-router";
import { ReactNode, useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuth } from "../hooks/useAuth";
import { resolveRouteForState } from "../services/routing";
import { isAtAnyTarget, isAtTarget, PUBLIC_AUTH_ROUTES } from "../services/routeTarget";

function Splash() {
  return (
    <View style={styles.splash}>
      <ActivityIndicator size="large" />
    </View>
  );
}

// Single centralized place that decides which route group the current auth
// state is allowed to be in, and redirects otherwise. The decision itself
// lives in resolveRouteForState (routing.ts) — the one place, shared with
// its own unit tests, that this and every other entry point agree on —
// rather than being reimplemented here.
export function RouteGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const {
    isAuthenticated,
    isEmailVerified,
    role,
    profile,
    isLoading,
    profileLoading,
    profileError,
    claimsSynced,
  } = useAuth();

  const settledEnoughToRoute = !isLoading && !(isAuthenticated && isEmailVerified && profileLoading);
  const onboardingStatus = profile?.onboardingStatus ?? null;

  useEffect(() => {
    if (!settledEnoughToRoute) return;

    if (profileError) {
      if (!isAtTarget("/unknown-role", segments)) router.replace("/unknown-role");
      return;
    }

    const target = resolveRouteForState({
      isAuthenticated,
      isEmailVerified,
      role,
      onboardingStatus,
      claimsSynced,
    });

    // resolveRouteForState always resolves "unauthenticated" to the single
    // literal ROUTES.login — but login, register, and forgot-password are
    // ALL valid places for an unauthenticated user to be (see
    // PUBLIC_AUTH_ROUTES's doc comment). Without this allowance, tapping
    // "Kayıt Ol" on login would get force-replaced back to login on every
    // RouteGuard re-render, since isAtTarget(login, register-segments) is
    // correctly `false` (login and register are distinct screens). This
    // allowance does NOT apply to verify-email — losing auth while there
    // (e.g. after signOut) must still force a real navigation to login.
    const alreadyOnAllowedPublicAuthScreen =
      !isAuthenticated && isAtAnyTarget(PUBLIC_AUTH_ROUTES, segments);

    if (!isAtTarget(target, segments) && !alreadyOnAllowedPublicAuthScreen) {
      router.replace(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settledEnoughToRoute,
    isAuthenticated,
    isEmailVerified,
    profileError,
    role,
    onboardingStatus,
    claimsSynced,
    segments,
  ]);

  return (
    <View style={styles.flex}>
      {children}
      {!settledEnoughToRoute ? <Splash /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  splash: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },
});
