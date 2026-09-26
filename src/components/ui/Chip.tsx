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
//
// Phase 125 (completion QA) — a chip is caption-sized (a 16pt line box) inside
// 4pt of vertical padding, so a SELECTABLE one offered a 24pt touch target,
// against the 44pt floor this app sets for itself (theme/sizes' own
// minTouchTarget). The pill only grows past that floor at the accessibility
// text sizes, so the shortfall is exactly at the sizes most people use, and
// Sınıf Performansı's filter row is a whole row of them.
//
// The slop reaches the floor without moving a single pixel: eight screens draw
// this pill at this size, and growing it to 44pt would have been a visual
// change to all of them rather than the accessibility fix this is. A static
// tag is not a target and gets none.
const INTERACTIVE_HIT_SLOP = { top: 10, bottom: 10, left: 4, right: 4 } as const;

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
      hitSlop={INTERACTIVE_HIT_SLOP}
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
