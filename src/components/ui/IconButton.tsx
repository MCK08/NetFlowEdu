import { Ionicons } from "@expo/vector-icons";
import { StyleSheet } from "react-native";

import { colors } from "@theme/colors";
import { iconSize } from "@theme/sizes";
import { minTouchTarget } from "@theme/sizes";

import { AnimatedPressable } from "./AnimatedPressable";

interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  size?: keyof typeof iconSize;
  color?: string;
  disabled?: boolean;
}

// A tappable icon with a guaranteed >=44pt hit area (Step 6 accessibility
// baseline) and the shared press-scale feedback — several screens
// currently wrap an Ionicons in a bare Pressable with ad hoc hitSlop
// (AccountSwitcherSheet's remove button, etc.); this is the primitive for
// any NEW icon-only touchable, existing ones are left as-is this phase.
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = "md",
  color = colors.textSecondary,
  disabled,
}: IconButtonProps) {
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={styles.hitArea}
    >
      <Ionicons name={icon} size={iconSize[size]} color={color} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
});
