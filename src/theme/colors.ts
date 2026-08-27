// The app's palette entry point.
//
// Phase 12A named the tokens and defined light + dark maps. Phase 49 made the
// dark map actually reachable: `colors` is no longer the light object itself,
// it is a live view of whichever palette the ThemeProvider has made active.
//
// Every existing `colors.x` call site is unchanged and still typed
// ColorTokens — the difference is only WHEN the value is read (at render,
// not at import). See themeRuntime.ts for why that indirection is needed and
// what it costs.
//
// Style objects need the same treatment: a module-scope
// `StyleSheet.create({...})` still bakes its values in at import time, so
// those call sites use `themedStyles(() => ({...}))` instead.

import { themeAwareColors } from "./themeRuntime";
import type { ColorTokens } from "./palettes";

export type { ColorTokens } from "./palettes";
export { lightColors, darkColors } from "./palettes";

export const colors: ColorTokens = themeAwareColors;
