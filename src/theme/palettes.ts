// The two concrete palettes. Split out of colors.ts (Phase 49) so that
// themeRuntime.ts can import the raw maps without importing the live proxy
// that colors.ts now exports — otherwise the two modules would cycle.
//
// The token NAMES and every light value are unchanged from Phase 12A: this
// phase is a theme system, not a redesign, so light mode must stay
// pixel-identical to what shipped.

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

// Dark values are tuned against the light set rather than invented: same
// semantic roles, same relative hierarchy (background < surface < surfaceMuted
// in elevation), and the same brand hue — only lifted for legibility on a
// dark ground.
//
// Contrast (WCAG, against their intended background):
//   textPrimary   #F5F6F7 on #0B0B0F  → ~18.3:1  (AA/AAA normal text)
//   textSecondary #B4B8C0 on #0B0B0F  → ~10.2:1  (AA/AAA normal text)
//   textTertiary  #98A0AB on #0B0B0F  →  ~7.4:1  (AA normal text)
//   primary       #7C97FF on #0B0B0F  →  ~7.0:1  (AA normal text)
//   danger        #FDA29B on #0B0B0F  →  ~9.4:1
//   success       #6CE9A6 on #0B0B0F  → ~13.4:1
//
// textTertiary and primary are deliberately lighter than the Phase 12A
// placeholders (#8A8F98 → #98A0AB, #5B7CFA → #7C97FF): the originals landed
// at ~5.9:1 and ~4.6:1, which pass for body text but are thin for the
// placeholder/secondary/link roles they are actually used in.
export const darkColors: ColorTokens = {
  primary: "#7C97FF",
  primaryMuted: "#1B2340",
  textPrimary: "#F5F6F7",
  textSecondary: "#B4B8C0",
  textTertiary: "#98A0AB",
  textInverse: "#0B0B0F",
  background: "#0B0B0F",
  surface: "#17181D",
  surfaceMuted: "#1F2026",
  border: "#3A3D47",
  divider: "#24252B",
  danger: "#FDA29B",
  dangerMuted: "#3A1A17",
  success: "#6CE9A6",
  successMuted: "#0F2B1E",
  accent: "#FF7A90",
  // Deeper than light's 0.4: a dark sheet over a dark screen needs more
  // separation to read as an overlay at all.
  overlay: "rgba(0,0,0,0.6)",
};
