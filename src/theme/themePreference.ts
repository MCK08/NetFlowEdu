// Phase 49 — the pure, dependency-free half of the theme system.
//
// Deliberately contains NO React, NO React Native and NO storage access, so
// every rule below is directly unit-testable the same way the study//
// teacher/ engines are (see tests/unit/themePreference.test.ts).

// What the USER chose. "system" is a real, distinct choice — it is not the
// absence of a preference, it means "keep following the OS".
export type ThemePreference = "system" | "light" | "dark";

// What the UI actually renders with. "system" is never a valid render mode:
// it always resolves to one of these two first.
export type ResolvedTheme = "light" | "dark";

export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"] as const;

// The default before anything is stored, and the fallback whenever a stored
// value cannot be trusted. "system" (not "light") on purpose: a device
// already in dark mode should open dark on first launch rather than flashing
// the app's light palette at someone who has told their OS otherwise.
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

// Reads a persisted value defensively. A hand-edited, corrupted, or
// version-skewed storage entry must never throw or leave the app themeless —
// it falls back to the same default a fresh install gets.
export function parseThemePreference(raw: unknown): ThemePreference {
  return isThemePreference(raw) ? raw : DEFAULT_THEME_PREFERENCE;
}

// THE resolution rule, in one place.
//
// An explicit "light"/"dark" always wins over the OS — that is the whole
// point of offering the override. Only "system" defers to `systemScheme`,
// and a null/unknown system scheme (which React Native genuinely reports on
// some platforms/at first paint) resolves to light rather than guessing.
export function resolveTheme(
  preference: ThemePreference,
  systemScheme: "light" | "dark" | null | undefined,
): ResolvedTheme {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return systemScheme === "dark" ? "dark" : "light";
}
