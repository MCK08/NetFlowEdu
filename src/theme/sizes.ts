// Icon/avatar sizes and the minimum touch target formalized from existing
// usage (Ionicons sizes of 18/20/22/40 and avatar diameters of 40/48/96
// were already the de facto scale across screens).
export const iconSize = {
  xs: 14,
  sm: 18,
  md: 22,
  lg: 28,
  xl: 40,
} as const;

export const avatarSize = {
  sm: 32,
  md: 40,
  lg: 48,
  xl: 96,
} as const;

// Apple HIG / Material minimum recommended tap target — Step 6
// (accessibility) baseline every new Pressable/IconButton should meet.
export const minTouchTarget = 44;

// Load-bearing, not a style choice: iOS Safari/WebView auto-zooms a focused
// input whose font is under 16pt, and RN's own TextInput inherits nothing
// from the type scale. Named here so TextField/PasswordField share one
// value instead of each hardcoding 16. Text still scales with the OS font
// setting — this is the base size, not a cap.
export const inputFontSize = 16;

// Phase 106 — the OS text scale at which a side-by-side pair stops fitting a
// phone and must stack. iOS "Accessibility Medium" and above (≈1.6): the
// first category where two half-width tiles or a name beside an avatar no
// longer hold a single Turkish word without breaking it mid-word. The same
// threshold TeacherDashboardHeader's identity row already stacks at.
export const stackAtFontScale = 1.6;
