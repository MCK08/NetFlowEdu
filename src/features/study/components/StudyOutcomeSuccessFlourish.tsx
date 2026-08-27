import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@theme/colors";
import { duration, spring } from "@theme/animation";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";

interface StudyOutcomeSuccessFlourishProps {
  // Any non-null value mounts and animates the flourish in; the outcome
  // itself doesn't change what's shown (a single checkmark reads fine for
  // all three outcomes — this isn't a per-outcome celebration), it's just
  // what the caller already has on hand as the "show it" signal.
  visible: boolean;
}

// Phase 18 — the "küçük başarı animasyonu" between selecting an outcome
// and the review session auto-advancing to the next card. Deliberately
// small: a checkmark that scales+fades in, no confetti/haptics/sound. Built
// entirely from primitives already in the design system (theme/animation.ts
// durations + reanimated, same engine AnimatedPressable already uses) — no
// new animation library.
export function StudyOutcomeSuccessFlourish({ visible }: StudyOutcomeSuccessFlourishProps) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = withSpring(1, spring.snappy);
      opacity.value = withTiming(1, { duration: duration.fast });
    } else {
      scale.value = 0.6;
      opacity.value = 0;
    }
  }, [visible, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.container, animatedStyle]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name="checkmark-circle" size={28} color={colors.success} />
    </Animated.View>
  );
}

const styles = themedStyles(() => ({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xs,
  },
}));
