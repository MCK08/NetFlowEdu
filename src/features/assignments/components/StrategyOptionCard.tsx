import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

interface StrategyOptionCardProps {
  label: string;
  /** What the option actually does, in one line. */
  description: string;
  selected: boolean;
  onPress: () => void;
}

// Phase 127 — one selectable option, with the thing it does written under it.
//
// The three options were bare Chips reading "Dengeli / Odaklan / Güçlendir",
// which says nothing about what changes: they pick DIFFERENT questions
// (selectSmartAssignmentQuestions), and a teacher could only learn that by
// preparing three times and comparing. The label now carries a sentence
// derived from what each branch really does.
//
// Selection is never colour alone: the mark changes shape (filled disc vs
// ring), the border thickens, and accessibilityState announces it.
export const StrategyOptionCard = memo(function StrategyOptionCard({
  label,
  description,
  selected,
  onPress,
}: StrategyOptionCardProps) {
  useThemeSubscription();
  return (
    <AnimatedPressable
      onPress={onPress}
      style={[styles.card, selected ? styles.cardSelected : null]}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={`${label}. ${description}`}
    >
      <View style={styles.head}>
        {/* Decorative: the card's own label and state carry the meaning. */}
        <Ionicons
          name={selected ? "radio-button-on" : "radio-button-off"}
          size={iconSize.sm}
          color={selected ? colors.primary : colors.textTertiary}
          accessibilityElementsHidden
        />
        <Text style={[styles.label, selected ? styles.labelSelected : null]}>{label}</Text>
      </View>
      <Text style={styles.description}>{description}</Text>
    </AnimatedPressable>
  );
});

const styles = themedStyles(() => ({
  card: {
    // One per row: three Turkish labels with a sentence each cannot share a
    // phone's width without breaking words, at any text size.
    minHeight: minTouchTarget,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xxs,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flexShrink: 1,
    minWidth: 0,
  },
  labelSelected: {
    color: colors.primary,
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
  },
}));
