import { memo } from "react";
import { Text } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { SocialActionTone } from "../services/friendshipPresentation";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface RowActionButtonProps {
  label: string;
  accessibilityLabel: string;
  tone: SocialActionTone;
  onPress: () => void;
}

// A compact action for a list row — narrower than SocialActionButton (which
// is the full-width control on a profile) but still a real 44pt touch
// target. The previous inline buttons in FriendRow were 32pt tall, below
// the accessibility minimum this project applies everywhere else.
export const RowActionButton = memo(function RowActionButton({
  label,
  accessibilityLabel,
  tone,
  onPress,
}: RowActionButtonProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  const toneStyle = tone === "primary" ? styles.primary : tone === "destructive" ? styles.destructive : styles.neutral;
  const textStyle =
    tone === "primary" ? styles.primaryText : tone === "destructive" ? styles.destructiveText : styles.neutralText;

  return (
    <AnimatedPressable
      onPress={onPress}
      style={[styles.button, toneStyle]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.label, textStyle]} numberOfLines={1}>
        {label}
      </Text>
    </AnimatedPressable>
  );
});

const styles = themedStyles(() => ({
  button: {
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...typography.caption,
    fontWeight: "700",
  },
  primary: {
    backgroundColor: colors.primary,
  },
  primaryText: {
    color: colors.textInverse,
  },
  neutral: {
    backgroundColor: colors.surfaceMuted,
  },
  neutralText: {
    color: colors.textSecondary,
  },
  destructive: {
    backgroundColor: colors.dangerMuted,
  },
  destructiveText: {
    color: colors.danger,
  },
}));
