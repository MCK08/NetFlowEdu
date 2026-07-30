import { Platform, ViewStyle } from "react-native";

// Cross-platform elevation. iOS reads shadow*; Android only respects
// `elevation` (its shadow color/opacity/radius props are ignored by the
// renderer), so every level defines both rather than picking one per
// platform — existing cards/modals in the app used ad hoc combinations of
// these same two mechanisms.
function level(iosOpacity: number, iosRadius: number, elevation: number): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: "#000",
      shadowOpacity: iosOpacity,
      shadowRadius: iosRadius,
      shadowOffset: { width: 0, height: Math.ceil(iosRadius / 2) },
    },
    android: { elevation },
    default: {},
  })!;
}

export const shadows = {
  none: {} as ViewStyle,
  sm: level(0.06, 4, 2),
  md: level(0.1, 8, 4),
  lg: level(0.14, 16, 8),
};

export type ShadowToken = keyof typeof shadows;
