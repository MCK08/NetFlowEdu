import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text } from "react-native";

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
}

// Icon-over-label quick-action tile, for a future actions grid (distinct
// from ListCard's horizontal row shape) — a new primitive, not yet adopted
// by any screen (ProfileScreen's "Arkadaşlarım"/"Arkadaş Bul" buttons stay
// on PrimaryButton this phase).
export function ActionTile({ icon, label, onPress }: ActionTileProps) {
  return (
    <AnimatedPressable
      onPress={onPress}
      style={styles.container}
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
