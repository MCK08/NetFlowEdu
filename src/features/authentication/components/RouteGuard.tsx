import { useRouter, useSegments } from "expo-router";
import { ReactNode, useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { AuthBootstrapScreen } from "./AuthBootstrapScreen";
import { useAuth } from "../hooks/useAuth";
import { decideRouteGuardTarget } from "../services/routeGuardDecision";

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
    // `router` is included rather than suppressed. Even if expo-router
    // handed back a fresh object each render, this effect would only re-run
    // decideRouteGuardTarget — which returns null once the current segments
    // already satisfy the target, so no extra router.replace is ever issued
    // (proved by routeGuardDecision.test.ts's idempotency matrix).
  }, [
    router,
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
      {/* Overlaid rather than swapped in: unmounting `children` while the
          auth state settles would tear down and remount the whole navigator
          on every cold start. This covers it instead, so no protected
          screen is ever visible before the destination is known. */}
      {!settledEnoughToRoute ? (
        <View style={styles.bootstrapOverlay}>
          <AuthBootstrapScreen />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  bootstrapOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
