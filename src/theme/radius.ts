// Formalizes the border-radius scale already in use (10/12/16 were the
// most common values found across cards/buttons/inputs; 999 is the
// existing convention for fully circular/pill shapes).
export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  xxl: 20,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;
