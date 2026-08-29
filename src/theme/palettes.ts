// The two concrete palettes. Split out of colors.ts (Phase 49) so that
// themeRuntime.ts can import the raw maps without importing the live proxy
// that colors.ts now exports — otherwise the two modules would cycle.
//
// Phase 52 replaced the blues and neutrals with values SAMPLED from the
// canonical logo at assets/branding/netflowedu-logo-source.jpeg. The token
// NAMES are still the Phase 12A set, so nothing downstream changed shape —
// only what each token resolves to.

export interface ColorTokens {
  // Brand
  primary: string;
  primaryMuted: string; // light tint, e.g. selected-row backgrounds
  // Phase 52 — the logo's other two blues, for BRAND surfaces only (the
  // mark, the splash, the auth brand area). Deliberately not part of the
  // action/state vocabulary: brandCyan measures 2.63:1 on white, so it can
  // never carry text or a control in the light theme.
  brandCyan: string;
  brandNavy: string;
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
  // Sampled from the canonical logo's own pixels: the N's left stem.
  // 6.31:1 on white — AA for text, and the colour the mark is actually made
  // of, rather than a blue chosen to look near it.
  primary: "#0052E4",
  primaryMuted: "#E6EEFE",
  brandCyan: "#2DA6FC", // the diagonal ribbon
  brandNavy: "#003EB9", // the right stem, the mark's deepest blue
  // Navy-tinted rather than neutral black, so body copy belongs to the same
  // family as the mark instead of sitting next to it. 17.9:1 on white.
  textPrimary: "#0F1729",
  textSecondary: "#4A5568",
  // Phase 49's #8A8F98 measured 3.25:1 on white and 3.03:1 on its own
  // surface — a real AA failure for the placeholder/metadata role it fills.
  // 5.13:1 / 4.83:1.
  textTertiary: "#666E7D",
  textInverse: "#FFFFFF",
  background: "#FFFFFF",
  // Cool-tinted neutrals, taken from the logo card's own off-white family
  // (#F9FAFC / #EDF1F9 were the two largest non-blue clusters in the source)
  // rather than the previous pure greys.
  surface: "#F6F8FC",
  surfaceMuted: "#EDF1F9",
  border: "#CBD5E8",
  divider: "#E6EAF2",
  danger: "#D92D20",
  dangerMuted: "#FEF3F2",
  success: "#027A48",
  successMuted: "#ECFDF3",
  accent: "#FF3B5C",
  overlay: "rgba(0,0,0,0.4)",
};

// Phase 52 — the blues below are SAMPLED from assets/branding, not matched
// by eye. Semantic state colours (danger/success/accent and their muted
// surfaces) are deliberately untouched: they carry meaning, not brand, and
// were re-checked against the new backgrounds rather than re-tinted.
//
// Dark keeps the same semantic roles and the same elevation hierarchy
// (background < surface < surfaceMuted).
//
// Measured against the new background #080B14:
//   textPrimary   #F2F5F9  → 17.98:1
//   textSecondary #AFBACD  → 10.04:1
//   textTertiary  #94A1B8  →  7.53:1
//   primary       #2DA6FC  →  7.46:1
//   danger        #FDA29B  → 10.13:1
//   success       #6CE9A6  → 12.96:1
//   textInverse on primary →  7.65:1  (dark label on a cyan button)
export const darkColors: ColorTokens = {
  // The logo's DIAGONAL, not a lightened version of its stem. The stem blue
  // manages only 3.08:1 on a dark ground, while the diagonal lands at
  // 7.46:1 — so the mark's own highlight is what the dark theme is built
  // from. Light uses the stem, dark uses the ribbon; both come out of the
  // same artwork.
  primary: "#2DA6FC",
  primaryMuted: "#12243D",
  brandCyan: "#75D3F9", // the diagonal's lightest fold
  brandNavy: "#0052E4",
  textPrimary: "#F2F5F9",
  textSecondary: "#AFBACD",
  textTertiary: "#94A1B8",
  textInverse: "#04070E",
  // Deep cool navy rather than neutral near-black, so the mark's blues sit
  // in a related ground instead of on grey.
  background: "#080B14",
  surface: "#111827",
  surfaceMuted: "#1A2233",
  border: "#31405A",
  divider: "#1E2839",
  danger: "#FDA29B",
  dangerMuted: "#3A1A17",
  success: "#6CE9A6",
  successMuted: "#0F2B1E",
  accent: "#FF7A90",
  // Deeper than light's 0.4: a dark sheet over a dark screen needs more
  // separation to read as an overlay at all.
  overlay: "rgba(0,0,0,0.6)",
};
