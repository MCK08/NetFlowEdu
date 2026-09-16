import { ActivityIndicator, Pressable, Text } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  accessibilityHint?: string;
}

export function PrimaryButton({
  label,
  onPress,
  isLoading = false,
  disabled = false,
  variant = "primary",
  accessibilityHint,
}: PrimaryButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.button,
        variant === "secondary" ? styles.secondary : styles.primary,
        isDisabled ? styles.disabled : null,
      ]}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: isLoading }}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === "primary" ? colors.textInverse : colors.primary} />
      ) : (
        <Text style={variant === "primary" ? styles.primaryText : styles.secondaryText}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  disabled: {
    opacity: 0.6,
  },
  // Phase 104 (H1) — the control-label role, not a private pair of numbers.
  //
  // Both styles wrote 16/600 by hand with no lineHeight at all, which is the
  // shape that produced D11: a size with no line box of its own. `button`
  // carries 15/600/20, so the label now scales and wraps under the same
  // protection every other role has.
  primaryText: {
    ...typography.button,
    color: colors.textInverse,
  },
  secondaryText: {
    ...typography.button,
    color: colors.primary,
  },
}));
