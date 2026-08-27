// Phase 49 — the runtime indirection that lets ~130 already-written screens
// become theme-aware without rewriting each one.
//
// WHY THIS EXISTS
//
// Every screen in this app was written as:
//
//     const styles = StyleSheet.create({ card: { backgroundColor: colors.surface } });
//
// That is evaluated ONCE, at module import time, so the palette's values are
// copied into the style object permanently. Swapping palettes later cannot
// reach them — which is exactly why `darkColors` had been sitting unused in
// colors.ts since Phase 12A.
//
// Rather than hand-edit 130 files (and risk a visual/logic regression right
// before TestFlight), both reads are made LAZY so they resolve at RENDER
// time instead of import time:
//
//   1. `colors` (colors.ts) is a proxy over whichever palette is active, so
//      every inline `colors.x` in JSX already reads the live value.
//   2. `themedStyles(() => ({...}))` defers StyleSheet.create until the first
//      property access, then caches one compiled StyleSheet per theme.
//
// Both are plain object reads to the caller, so no call site changes shape
// and nothing about layout, spacing or component structure moves.

import { ImageStyle, StyleSheet, TextStyle, ViewStyle } from "react-native";

import { ColorTokens, darkColors, lightColors } from "./palettes";
import { ResolvedTheme } from "./themePreference";

// The single source of truth for "what is on screen right now". Module-level
// rather than context because the two proxies above are plain object reads —
// they have no hook to read a context from. ThemeProvider keeps this in sync
// and is what actually triggers the re-render; this only decides what a read
// RESOLVES to once that re-render happens.
let activeTheme: ResolvedTheme = "light";

export function getActiveTheme(): ResolvedTheme {
  return activeTheme;
}

export function getActiveColors(): ColorTokens {
  return activeTheme === "dark" ? darkColors : lightColors;
}

// Called by ThemeProvider during render, before children read anything.
// Idempotent — setting the same theme twice is a no-op.
export function setActiveTheme(theme: ResolvedTheme): void {
  activeTheme = theme;
}

// A live view of the active palette. Typed as ColorTokens so all ~627
// existing `colors.x` call sites keep their exact types and need no edit.
export const themeAwareColors: ColorTokens = new Proxy({} as ColorTokens, {
  get(_target, property: string | symbol) {
    return getActiveColors()[property as keyof ColorTokens];
  },
  // Keeps object spreads / Object.keys() working on the proxy, which some
  // call sites rely on.
  ownKeys() {
    return Reflect.ownKeys(getActiveColors());
  },
  getOwnPropertyDescriptor(_target, property) {
    return {
      ...Reflect.getOwnPropertyDescriptor(getActiveColors(), property),
      configurable: true,
      enumerable: true,
    };
  },
  has(_target, property) {
    return property in getActiveColors();
  },
});

// Mirrors React Native's own StyleSheet.create signature on purpose. The
// `T extends NamedStyles<T>` shape is what gives the object literal its
// CONTEXTUAL typing — without it, `position: "absolute"` widens to `string`
// and every converted stylesheet fails to typecheck.
type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

// Drop-in replacement for a module-scope `StyleSheet.create({...})` whose
// values depend on the palette.
//
// Returns a proxy that looks identical to a compiled stylesheet (`styles.card`)
// but compiles lazily, per theme, on first access — so the SAME module-level
// `const styles = ...` line now yields light or dark values depending on when
// it is read. Each theme's stylesheet is compiled at most once and cached, so
// this costs one extra property lookup per style access, not a recompile.
export function themedStyles<T extends NamedStyles<T> | NamedStyles<unknown>>(
  factory: () => T & NamedStyles<unknown>,
): T {
  const cache = new Map<ResolvedTheme, T>();

  function resolved(): T {
    const theme = getActiveTheme();
    const cached = cache.get(theme);
    if (cached) return cached;
    // StyleSheet.create is still what actually validates/registers the
    // styles, exactly as before — only WHEN it runs has changed.
    //
    // The cast is confined to this one internal line: RN's own create() is
    // typed with a self-referential `T extends NamedStyles<T>` constraint
    // that a generic wrapper cannot re-satisfy structurally. Callers are
    // unaffected — they get the same contextual typing and the same T back.
    const created = StyleSheet.create(factory() as NamedStyles<unknown>) as T;
    cache.set(theme, created);
    return created;
  }

  return new Proxy({} as T, {
    get(_target, property: string | symbol) {
      return resolved()[property as keyof T];
    },
    ownKeys() {
      return Reflect.ownKeys(resolved());
    },
    getOwnPropertyDescriptor(_target, property) {
      return {
        ...Reflect.getOwnPropertyDescriptor(resolved(), property),
        configurable: true,
        enumerable: true,
      };
    },
    has(_target, property) {
      return property in resolved();
    },
  });
}
