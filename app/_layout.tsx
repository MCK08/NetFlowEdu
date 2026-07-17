import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AuthProvider } from "@features/authentication";
import { RouteGuard } from "@/features/authentication/components/RouteGuard";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <RouteGuard>
        <Stack screenOptions={{ headerShown: false }} />
      </RouteGuard>
    </AuthProvider>
  );
}
