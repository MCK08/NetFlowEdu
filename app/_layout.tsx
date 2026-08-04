import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { lazy, Suspense } from "react";

import { OfflineBanner } from "@components/ui/OfflineBanner";
import { AuthProvider, useAuth } from "@features/authentication";
import { RouteGuard } from "@/features/authentication/components/RouteGuard";

// Lazy-loaded (Phase 11 requirement) — the vast majority of app sessions
// never open the Account Switcher, so its code shouldn't be part of the
// initial bundle evaluation. Only actually mounted (and only then does
// Suspense trigger the dynamic import) once isAccountSwitcherOpen flips
// true for the first time.
const AccountSwitcherSheet = lazy(
  () => import("@features/authentication/components/AccountSwitcherSheet"),
);

function AccountSwitcherHost() {
  const { isAccountSwitcherOpen } = useAuth();
  if (!isAccountSwitcherOpen) return null;
  return (
    <Suspense fallback={null}>
      <AccountSwitcherSheet />
    </Suspense>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <RouteGuard>
        <Stack screenOptions={{ headerShown: false }} />
      </RouteGuard>
      <AccountSwitcherHost />
      <OfflineBanner />
    </AuthProvider>
  );
}
