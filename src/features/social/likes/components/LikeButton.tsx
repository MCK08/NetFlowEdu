import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { colors } from "@theme/colors";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";

interface LikeButtonProps {
  liked: boolean;
  likeCount: number;
  onPress: () => void;
  size?: number;
  color?: string;
  textStyle?: object;
}

// Shared by feed card / question detail / answer card — every caller
// supplies its own useLike() instance (different target), this is purely
// presentational.
export function LikeButton({
  liked,
  likeCount,
  onPress,
  size = 26,
  color = colors.textInverse,
  textStyle,
}: LikeButtonProps) {
  return (
    <AnimatedPressable
      onPress={onPress}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={liked ? "Beğeniyi geri al" : "Beğen"}
      accessibilityHint={liked ? "Bu beğeniyi kaldırır" : "Bu soruyu beğenir"}
      accessibilityState={{ selected: liked }}
      hitSlop={8}
    >
      <Ionicons
        name={liked ? "heart" : "heart-outline"}
        size={size}
        color={liked ? colors.accent : color}
      />
      <Text style={[styles.count, { color }, textStyle]}>{likeCount}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    gap: spacing.xxs,
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    justifyContent: "center",
  },
  count: {
    fontSize: 12,
    fontWeight: "600",
  },
});
