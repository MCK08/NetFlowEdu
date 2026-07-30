import { Easing } from "react-native-reanimated";

// Consistent animation vocabulary (Phase 12A step 4) — reusable durations/
// curves/spring configs, NOT a mandate to animate every screen. Consumers
// (e.g. AnimatedPressable) import from here instead of inventing their own
// numbers, so a future global "make everything feel snappier" tweak is a
// one-line change instead of a grep-and-replace across the app.
export const duration = {
  fast: 120,
  normal: 200,
  slow: 320,
} as const;

export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  decelerate: Easing.out(Easing.cubic),
  accelerate: Easing.in(Easing.cubic),
} as const;

// withSpring() configs — "snappy" for small interactive feedback (button
// press, chip toggle), "gentle" for larger surfaces entering the screen
// (cards, bottom sheets) where an overshoot-y snap reads as sluggish.
export const spring = {
  snappy: { damping: 18, stiffness: 260, mass: 0.6 },
  gentle: { damping: 20, stiffness: 160, mass: 1 },
} as const;

// The scale a Pressable shrinks to on press (AnimatedPressable) — subtle
// enough to read as "responsive," not a bounce/wobble effect.
export const pressScale = 0.96;
