import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { lazy, Suspense } from "react";

import { OfflineBanner } from "@components/ui/OfflineBanner";
import { AuthProvider, useAuth } from "@features/authentication";
import { GuidedTourHost, GuidedTourProvider, useGuidedTourState } from "@features/onboarding";
import { ThemeProvider, useTheme } from "@theme/ThemeProvider";
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

// Phase 49 — deliberately a CHILD of ThemeProvider that consumes the theme,
// not part of RootLayout itself.
//
// If this JSX lived directly in RootLayout, it would be passed to
// ThemeProvider as `children` — a prop whose element identity never changes
// when the provider's own state does, so React would bail out and the screen
// tree would keep rendering the previous palette until something else
// happened to re-render it. Consuming the context here is what actually
// propagates a theme change down through the navigator to every screen.
//
// Phase 74 — the guided tour's state, hoisted to the root so that both the
// overlay below and the "Tanıtımı Tekrar Gör" row inside Profile read one
// source. It reads auth state, so it must sit under AuthProvider; it renders
// over the navigator, so its host sits beside AccountSwitcherHost rather than
// inside any screen. Notably it does NOT wrap or alter <Stack> — routing,
// and the student feed's pager in particular, are untouched.
function ThemedApp() {
  const { resolvedTheme, colors } = useTheme();
  const guidedTour = useGuidedTourState();

  return (
    <GuidedTourProvider value={guidedTour}>
      {/* Explicitly derived from the RESOLVED theme rather than style="auto":
          "auto" follows the OS, which is wrong the moment someone overrides
          the OS with an explicit Açık/Koyu choice. */}
      <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />
      <RouteGuard>
        <Stack
          screenOptions={{
            headerShown: false,
            // Paints the navigator's own surface — without this the stack
            // keeps a white background behind/between screens, which shows
            // up as a white flash on push/pop in dark mode.
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </RouteGuard>
      <AccountSwitcherHost />
      {/* Above the navigator and the account switcher, below the offline
          banner: a connectivity problem is the one thing worth interrupting
          the introduction to say. */}
      <GuidedTourHost />
      <OfflineBanner />
    </GuidedTourProvider>
  );
}

export default function RootLayout() {
  return (
    // ThemeProvider sits ABOVE AuthProvider: appearance has no auth
    // dependency and must already be correct on the logged-out screens.
    <ThemeProvider>
      <AuthProvider>
        <ThemedApp />
      </AuthProvider>
    </ThemeProvider>
  );
}
