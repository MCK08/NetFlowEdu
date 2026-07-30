import { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { duration } from "@theme/animation";

export type ToastVariant = "neutral" | "danger" | "success";

interface ToastProps {
  message: string | null;
  variant?: ToastVariant;
}

const VARIANT_BACKGROUND: Record<ToastVariant, string> = {
  neutral: colors.textPrimary,
  danger: colors.danger,
  success: colors.success,
};

// Purely presentational — mounts per-screen (via useToast below), NOT a
// global provider wired into app/_layout.tsx. Wiring an app-wide toast host
// would be a behavior/navigation change outside this foundation-only
// phase's scope; this is the primitive a screen opts into later.
export function Toast({ message, variant = "neutral" }: ToastProps) {
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(message ? 1 : 0, { duration: duration.normal });
  }, [message, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        { bottom: insets.bottom + spacing.xl, backgroundColor: VARIANT_BACKGROUND[variant] },
        animatedStyle,
      ]}
    >
      <Text style={styles.text} numberOfLines={2}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  text: {
    ...typography.body,
    color: colors.textInverse,
    textAlign: "center",
  },
});
