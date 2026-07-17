import { useRouter, useSegments } from "expo-router";
import { ReactNode, useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { ROUTES } from "@constants/routes";

import { useAuth } from "../hooks/useAuth";

function Splash() {
  return (
    <View style={styles.splash}>
      <ActivityIndicator size="large" />
    </View>
  );
}

// Single centralized place that decides which route group the current auth
// state is allowed to be in, and redirects otherwise. Every branch only
// calls router.replace() when the current location doesn't already match
// its target, so settled states never loop.
export function RouteGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isEmailVerified, role, isLoading, profileLoading, profileError } =
    useAuth();

  const settledEnoughToRoute = !isLoading && !(isAuthenticated && isEmailVerified && profileLoading);

  useEffect(() => {
    if (!settledEnoughToRoute) return;

    const group = segments[0];
    const path = "/" + segments.join("/");

    if (!isAuthenticated) {
      if (group !== "(auth)") router.replace(ROUTES.login);
      return;
    }

    if (!isEmailVerified) {
      if (path !== ROUTES.verifyEmail) router.replace(ROUTES.verifyEmail);
      return;
    }

    if (profileError) {
      if (group !== "unknown-role") router.replace("/unknown-role");
      return;
    }

    switch (role) {
      case "student":
        if (group !== "(student)") router.replace(ROUTES.student);
        return;
      case "teacher":
        if (group !== "(teacher)") router.replace(ROUTES.teacher);
        return;
      case "organization_admin":
      case "platform_admin":
        if (group !== "(admin)") router.replace(ROUTES.admin);
        return;
      default:
        if (group !== "unknown-role") router.replace("/unknown-role");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledEnoughToRoute, isAuthenticated, isEmailVerified, profileError, role, segments]);

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
