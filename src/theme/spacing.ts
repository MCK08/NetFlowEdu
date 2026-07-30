// Formalizes the spacing scale already dominant across existing
// StyleSheet.create blocks (4/8/12/16/20/24 accounted for the large
// majority of padding/margin/gap values found across the app).
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export type SpacingToken = keyof typeof spacing;
