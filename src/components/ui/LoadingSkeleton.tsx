import { memo, useEffect } from "react";
import { DimensionValue, StyleSheet, ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";

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

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surfaceMuted,
  },
});
