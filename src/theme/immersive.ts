import { darkColors } from "./palettes";

// Phase 102 — the one surface that is dark in BOTH themes.
//
// The student feed is an immersive, photo-first pager (Phase 55): its pages
// are full-bleed dark whether the app is Light or Dark, the same way a video
// player or an image viewer is. That was a deliberate decision and it stays.
// What Phase 102 fixes is that the chrome AROUND that pager — the channel
// strip above it and the tab bar below it — followed the app theme instead of
// the surface they sit on, so in the Light theme (or System on a light OS)
// the screen split into a dark page with white bars. Reproduced on the iOS
// simulator and on a physical iPhone.
//
// These tokens make the feed's chrome agree with the feed: they are the dark
// palette's own values, named for where they are used, so nothing here is an
// ad-hoc hex that would drift from the palette. Only the student feed tab
// consumes them; every other screen keeps following the theme.

/** The pager's own ground (Phase 55's value, unchanged). */
export const IMMERSIVE_SURFACE = "#0B0B0F";

/** Text and icons placed directly on the immersive surface or its scrim. */
export const IMMERSIVE_FOREGROUND = "#FFFFFF";

/** The immersive tab bar and channel strip: the dark palette, not the theme. */
export const immersiveChrome = {
  surface: IMMERSIVE_SURFACE,
  divider: darkColors.divider,
  chipSurface: darkColors.surface,
  chipBorder: darkColors.border,
  chipText: darkColors.textSecondary,
  inactiveTint: darkColors.textTertiary,
  activeTint: darkColors.primary,
} as const;

/** React Navigation tab-bar style for a screen that lives on the immersive surface. */
export function immersiveTabBarStyle(): { backgroundColor: string; borderTopColor: string } {
  return { backgroundColor: immersiveChrome.surface, borderTopColor: immersiveChrome.divider };
}
