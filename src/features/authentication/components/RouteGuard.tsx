import { useRouter, useSegments } from "expo-router";
import { ReactNode, useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuth } from "../hooks/useAuth";
import { decideRouteGuardTarget } from "../services/routeGuardDecision";

function Splash() {
  return (
    <View style={styles.splash}>
      <ActivityIndicator size="large" />
    </View>
  );
}

// Single centralized place that decides which route group the current auth
// state is allowed to be in, and redirects otherwise. The decision itself
// lives in decideRouteGuardTarget (routeGuardDecision.ts) — the one place,
// exhaustively unit-tested (state×screen matrix + navigation-loop
// simulation) — rather than being reimplemented here. This component's only
// job is to feed it the current segments/auth state each render and act on
// the result.
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
  // undefined (profile not loaded yet) intentionally maps to `true` (the
  // default), not `false` — only an actually-loaded profile with a null
  // requestedRole (a brand-new Google sign-up) should ever divert to
  // googleOnboarding.
  const hasRequestedRole = profile ? profile.requestedRole !== null : undefined;

  useEffect(() => {
    const target = decideRouteGuardTarget(
      {
        settledEnoughToRoute,
        profileError,
        isAuthenticated,
        isEmailVerified,
        role,
        onboardingStatus,
        claimsSynced,
        hasRequestedRole,
      },
      segments,
    );
    if (target !== null) router.replace(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settledEnoughToRoute,
    isAuthenticated,
    isEmailVerified,
    profileError,
    role,
    onboardingStatus,
    claimsSynced,
    hasRequestedRole,
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
