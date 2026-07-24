import { useRouter, useSegments } from "expo-router";
import { ReactNode, useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuth } from "../hooks/useAuth";
import { resolveRouteForState } from "../services/routing";
import { isAtTarget } from "../services/routeTarget";

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
  const { isAuthenticated, isEmailVerified, role, profile, isLoading, profileLoading, profileError } =
    useAuth();

  const settledEnoughToRoute = !isLoading && !(isAuthenticated && isEmailVerified && profileLoading);
  const onboardingStatus = profile?.onboardingStatus ?? null;

  useEffect(() => {
    if (!settledEnoughToRoute) return;

    if (profileError) {
      if (!isAtTarget("/unknown-role", segments)) router.replace("/unknown-role");
      return;
    }

    const target = resolveRouteForState({ isAuthenticated, isEmailVerified, role, onboardingStatus });
    if (!isAtTarget(target, segments)) router.replace(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledEnoughToRoute, isAuthenticated, isEmailVerified, profileError, role, onboardingStatus, segments]);

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
