import { memo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { SocialAction } from "../services/friendshipPresentation";

interface SocialActionButtonProps {
  action: SocialAction;
  onPress: () => void;
  isBusy: boolean;
  // Lets a two-button row (accept + decline) share the width evenly.
  fill?: boolean;
}

// One friendship action, styled by the tone the pure presentation mapper
// assigned it. The destructive tone is what stops "Arkadaşlıktan Çık" and
// "İsteği İptal Et" from looking exactly like the positive actions they
// previously shared a style with.
//
// While busy the button stays mounted at its full size and swaps only its
// label for a spinner — the previous implementation unmounted the entire
// action area and rendered a bare ActivityIndicator instead, which made the
// profile visibly reflow on every tap.
export const SocialActionButton = memo(function SocialActionButton({
  action,
  onPress,
  isBusy,
  fill = false,
}: SocialActionButtonProps) {
  const toneStyle =
    action.tone === "primary"
      ? styles.primary
      : action.tone === "destructive"
        ? styles.destructive
        : styles.neutral;
  const toneTextStyle =
    action.tone === "primary"
      ? styles.primaryText
      : action.tone === "destructive"
        ? styles.destructiveText
        : styles.neutralText;

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isBusy}
      style={[styles.button, toneStyle, fill ? styles.fill : null]}
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel}
      accessibilityState={{ disabled: isBusy, busy: isBusy }}
    >
      {/* The label stays in the tree while busy (hidden but measured) so
          the button cannot change width mid-mutation. */}
      <Text style={[styles.label, toneTextStyle, isBusy ? styles.labelHidden : null]} numberOfLines={1}>
        {action.label}
      </Text>
      {isBusy ? (
        <View style={styles.spinnerOverlay} pointerEvents="none">
          <ActivityIndicator
            size="small"
            color={action.tone === "primary" ? colors.textInverse : colors.textSecondary}
          />
        </View>
      ) : null}
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  button: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  fill: {
    flex: 1,
  },
  label: {
    ...typography.subtitle,
    fontWeight: "700",
  },
  labelHidden: {
    opacity: 0,
  },
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
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
  // Outlined rather than filled red: this is a reversible action, not a
  // permanent deletion, so it should read as "careful" without shouting.
  destructive: {
    backgroundColor: colors.dangerMuted,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  destructiveText: {
    color: colors.danger,
  },
});
