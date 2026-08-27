// Phase 49 — the theme system's one piece of real branching logic.
//
// Covers the whole decision surface: what a stored value is allowed to mean,
// and how a preference plus an OS appearance become the theme that actually
// renders. Everything else in the theme system is wiring (a provider, a
// proxy, an AsyncStorage read) rather than rules.

import {
  DEFAULT_THEME_PREFERENCE,
  isThemePreference,
  parseThemePreference,
  resolveTheme,
  THEME_PREFERENCES,
} from "../../src/theme/themePreference";

describe("themePreference — the three valid preferences", () => {
  it("exposes exactly system/light/dark, in that order", () => {
    expect(THEME_PREFERENCES).toEqual(["system", "light", "dark"]);
  });

  it("defaults to system, so a dark-mode device opens dark on first launch", () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe("system");
  });

  it.each(["system", "light", "dark"])("accepts %s", (value) => {
    expect(isThemePreference(value)).toBe(true);
  });

  it.each([undefined, null, "", "Dark", "SYSTEM", "auto", 0, 1, {}, []])(
    "rejects %p",
    (value) => {
      expect(isThemePreference(value)).toBe(false);
    },
  );
});

describe("parseThemePreference — persisted values are never trusted blindly", () => {
  it.each(["system", "light", "dark"] as const)("round-trips a valid stored %s", (value) => {
    expect(parseThemePreference(value)).toBe(value);
  });

  // A corrupted / hand-edited / version-skewed entry must not throw or leave
  // the app themeless — it degrades to the same default a fresh install gets.
  it.each([null, undefined, "", "dArK", "blue", 42, {}, []])(
    "falls back to the default for %p",
    (value) => {
      expect(parseThemePreference(value)).toBe(DEFAULT_THEME_PREFERENCE);
    },
  );
});

describe("resolveTheme — preference + OS appearance => what renders", () => {
  it("follows the OS when the preference is system", () => {
    expect(resolveTheme("system", "light")).toBe("light");
    expect(resolveTheme("system", "dark")).toBe("dark");
  });

  // The entire point of offering an override: an explicit choice must beat
  // the OS in BOTH directions, not just the one that happens to differ.
  it("lets an explicit light override a dark OS", () => {
    expect(resolveTheme("light", "dark")).toBe("light");
  });

  it("lets an explicit dark override a light OS", () => {
    expect(resolveTheme("dark", "light")).toBe("dark");
  });

  it("keeps an explicit choice when the OS scheme is unknown", () => {
    expect(resolveTheme("light", null)).toBe("light");
    expect(resolveTheme("dark", undefined)).toBe("dark");
  });

  // React Native genuinely reports null on some platforms and at first paint.
  // Guessing dark there would flash a dark screen at a light-mode user.
  it("resolves system to light when the OS scheme is unavailable", () => {
    expect(resolveTheme("system", null)).toBe("light");
    expect(resolveTheme("system", undefined)).toBe("light");
  });

  it("never returns the non-render value 'system'", () => {
    for (const preference of THEME_PREFERENCES) {
      for (const scheme of ["light", "dark", null, undefined] as const) {
        expect(["light", "dark"]).toContain(resolveTheme(preference, scheme));
      }
    }
  });

  it("is deterministic and free of hidden state", () => {
    expect(resolveTheme("system", "dark")).toBe(resolveTheme("system", "dark"));
    expect(resolveTheme("light", "dark")).toBe(resolveTheme("light", "dark"));
  });
});
