import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface ChipProps {
  label: string;
  // Omit onPress to render a static, non-interactive tag (e.g. a subject
  // label) — same visual, just not a Pressable underneath.
  onPress?: () => void;
  selected?: boolean;
}

// One primitive covers both "static tag" (no onPress) and "selectable
// filter chip" (onPress + selected) — the two only differ in interactivity,
// not appearance, so this intentionally isn't split into two components.
export const Chip = memo(function Chip({ label, onPress, selected = false }: ChipProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  const content = (
    <Text
      style={[styles.text, selected ? styles.textSelected : null]}
      numberOfLines={1}
    >
      {label}
    </Text>
  );

  if (!onPress) {
    return <View style={[styles.container, selected ? styles.containerSelected : null]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={[styles.container, selected ? styles.containerSelected : null]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {content}
    </Pressable>
  );
});

const styles = themedStyles(() => ({
  container: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    backgroundColor: colors.surfaceMuted,
    alignSelf: "flex-start",
  },
  containerSelected: {
    backgroundColor: colors.primaryMuted,
  },
  text: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  textSelected: {
    color: colors.primary,
  },
}));
