// Phase 49 — the one place that decides which palette is live.
//
// Mounted above RouteGuard in app/_layout.tsx so it covers logged-out screens
// (login/register), both role trees, modals and the account switcher. It has
// no auth dependency and performs no network call: theme must work before
// anyone signs in.

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import type { ColorTokens } from "./palettes";
import { darkColors, lightColors } from "./palettes";
import {
  DEFAULT_THEME_PREFERENCE,
  ResolvedTheme,
  resolveTheme,
  ThemePreference,
} from "./themePreference";
import { loadThemePreference, saveThemePreference } from "./themeStorage";
import { setActiveTheme } from "./themeRuntime";

interface ThemeContextValue {
  // What the user picked ("system" included) — this is what the appearance
  // selector should check against, NOT resolvedTheme.
  preference: ThemePreference;
  // What is actually rendering right now.
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  colors: ColorTokens;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // React Native's own hook — already re-renders on OS appearance changes on
  // iOS/Android, and maps to prefers-color-scheme on web, so "system" tracks
  // the OS live with no listener of our own.
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);

  // Load the stored choice once. Until it arrives the app renders with the
  // default ("system"), which already follows the OS — so a device in dark
  // mode never flashes light, and the only possible transition is for someone
  // whose stored choice DISAGREES with their OS. Startup is never blocked on
  // this, and it is local-only (no network).
  useEffect(() => {
    let cancelled = false;
    loadThemePreference().then((stored) => {
      if (!cancelled) setPreferenceState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedTheme = resolveTheme(preference, systemScheme);

  // Publish to the module-level runtime BEFORE children render, so the
  // `colors` proxy and every themedStyles() proxy resolve to this theme on
  // this very pass. Synchronous and idempotent — safe during render, and it
  // must happen here rather than in an effect (an effect would run after
  // children had already read the previous palette, causing a one-frame
  // flash of the old theme).
  setActiveTheme(resolvedTheme);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    // Not awaited: the UI is already switching, and a storage failure must
    // not undo the user's choice.
    void saveThemePreference(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolvedTheme,
      isDark: resolvedTheme === "dark",
      colors: resolvedTheme === "dark" ? darkColors : lightColors,
      setPreference,
    }),
    [preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Throws rather than silently returning a light default: a component reading
// the theme outside the provider is a wiring bug, and a silent fallback would
// hide it behind "the dark mode just doesn't work on that one screen".
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

// Subscribes a screen to theme changes WITHOUT reading any value from it.
//
// The `colors` / themedStyles proxies resolve at render time, so a screen
// shows the right palette as soon as it renders — but nothing makes it
// re-render when the theme changes. React bails out of a subtree whose props
// did not change, and React Navigation additionally isolates each screen, so
// a provider state change on its own reaches neither.
//
// Called at the top of every route in app/, which is the root of each
// screen's tree: the route re-renders on a theme change, and its whole
// subtree re-renders with it and re-reads the proxies. Only MOUNTED routes
// pay for this; anything not on screen simply reads the new palette when it
// next mounts.
export function useThemeSubscription(): void {
  useTheme();
}
