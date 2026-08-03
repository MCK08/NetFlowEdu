import { Ionicons } from "@expo/vector-icons";
import { StyleProp, StyleSheet, Text, ViewStyle } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { iconSize } from "@theme/sizes";
import { typography } from "@theme/typography";

import { AnimatedPressable } from "./AnimatedPressable";

interface ActionTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  // Optional layout override, applied AFTER the base style so a caller can
  // relax `minWidth` when the tile sits in an equal-width flex row (see
  // TeacherQuickActions, where four tiles must fit the narrowest supported
  // phone without overflowing). Omitting it renders exactly as before —
  // this prop is additive and changes no existing caller's appearance.
  style?: StyleProp<ViewStyle>;
}

// Icon-over-label quick-action tile, distinct from ListCard's horizontal
// row shape. First adopted by the teacher dashboard's quick actions.
export function ActionTile({ icon, label, onPress, style }: ActionTileProps) {
  return (
    <AnimatedPressable
      onPress={onPress}
      style={[styles.container, style]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={iconSize.lg} color={colors.primary} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    padding: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    minWidth: 84,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
