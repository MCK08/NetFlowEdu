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
