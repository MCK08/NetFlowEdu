// Formalizes the color palette that was already implicit across the app
// (same hex values were repeated inline in PrimaryButton, TextField,
// FormError, ProfileScreen, etc.) — no new colors are introduced here, this
// only names the ones already in production use so future UI reuses them
// instead of re-typing hex literals.
//
// Structured as light/dark from day one (Phase 12A step 5) so a future dark
// mode only has to swap which map is active — `colors` below is the ONLY
// active export today (light), dark mode is not enabled yet.
export interface ColorTokens {
  // Brand
  primary: string;
  primaryMuted: string; // light tint, e.g. selected-row backgrounds
  // Text
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  // Surfaces
  background: string;
  surface: string; // cards, elevated panels
  surfaceMuted: string; // subtle section backgrounds
  border: string;
  divider: string;
  // Feedback
  danger: string;
  dangerMuted: string;
  success: string;
  successMuted: string;
  accent: string; // e.g. notification/like badge red
  // Overlays
  overlay: string; // modal/bottom-sheet backdrop
}

export const lightColors: ColorTokens = {
  primary: "#3358D9",
  primaryMuted: "#EEF1FB",
  textPrimary: "#1A1A1A",
  textSecondary: "#5B5F66",
  textTertiary: "#8A8F98",
  textInverse: "#FFFFFF",
  background: "#FFFFFF",
  surface: "#F7F7F8",
  surfaceMuted: "#F2F2F2",
  border: "#D0D5DD",
  divider: "#EDEEF0",
  danger: "#D92D20",
  dangerMuted: "#FEF3F2",
  success: "#027A48",
  successMuted: "#ECFDF3",
  accent: "#FF3B5C",
  overlay: "rgba(0,0,0,0.4)",
};

// Not enabled anywhere yet (see theme/README below) — exists so components
// built against `useColors()`/`colors` today don't need a second pass of
// prop-drilling once dark mode actually ships.
export const darkColors: ColorTokens = {
  primary: "#5B7CFA",
  primaryMuted: "#1B2340",
  textPrimary: "#F5F6F7",
  textSecondary: "#B4B8C0",
  textTertiary: "#8A8F98",
  textInverse: "#0B0B0F",
  background: "#0B0B0F",
  surface: "#17181D",
  surfaceMuted: "#1F2026",
  border: "#2C2E36",
  divider: "#24252B",
  danger: "#F97066",
  dangerMuted: "#3A1A17",
  success: "#3CCB7F",
  successMuted: "#0F2B1E",
  accent: "#FF6B85",
  overlay: "rgba(0,0,0,0.6)",
};

// The single active palette. Every existing component's hardcoded hex
// values match these 1:1, so wiring a component to `colors.X` instead of a
// literal is guaranteed to be a no-visual-change refactor.
export const colors: ColorTokens = lightColors;
