import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";

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

const styles = StyleSheet.create({
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
  primaryText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "600",
  },
});
