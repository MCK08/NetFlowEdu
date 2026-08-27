import { memo, useEffect } from "react";
import { DimensionValue, ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface LoadingSkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

// Reusable shimmer placeholder — a subtle opacity pulse (not a moving
// gradient sweep, which would need expo-linear-gradient, not currently a
// dependency) for list rows/cards while their real content loads, in place
// of the plain ActivityIndicator spinners used everywhere today. Existing
// screens keep their spinners for this phase; this is available for
// adoption once a screen is actually migrated.
export const LoadingSkeleton = memo(function LoadingSkeleton({
  width = "100%",
  height = 16,
  borderRadius: cornerRadius = radius.sm,
  style,
}: LoadingSkeletonProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius: cornerRadius },
        animatedStyle,
        style,
      ]}
    />
  );
});

const styles = themedStyles(() => ({
  base: {
    backgroundColor: colors.surfaceMuted,
  },
}));
