import { Ionicons } from "@expo/vector-icons";

import { colors } from "@theme/colors";
import { shadows } from "@theme/shadows";
import { iconSize } from "@theme/sizes";
import { themedStyles } from "@theme/themeRuntime";

import { AnimatedPressable } from "./AnimatedPressable";

interface FloatingActionButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
}

const SIZE = 56;

export function FloatingActionButton({ icon, onPress, accessibilityLabel }: FloatingActionButtonProps) {
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.button, shadows.lg]}
    >
      <Ionicons name={icon} size={iconSize.md} color={colors.textInverse} />
    </AnimatedPressable>
  );
}

const styles = themedStyles(() => ({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
}));
