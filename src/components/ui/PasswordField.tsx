import { forwardRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { inputFontSize, minTouchTarget } from "@theme/sizes";

interface PasswordFieldProps extends TextInputProps {
  label: string;
  errorMessage?: string;
  // Same contract as TextField's: a rule shown up front, replaced by the
  // error when there is one.
  hint?: string;
}

// forwardRef so a preceding field's return key can move focus here (see
// LoginScreen's email -> password chain). Purely additive: every existing
// caller that passes no ref renders exactly as before.
export const PasswordField = forwardRef<TextInput, PasswordFieldProps>(function PasswordField(
  { label, errorMessage, hint, style, ...inputProps },
  ref,
) {
  const [isVisible, setIsVisible] = useState(false);
  const helperText = errorMessage ?? hint;

  return (
    <View style={styles.container}>
      <Text style={styles.label} nativeID={`${label}-label`}>
        {label}
      </Text>
      <View style={styles.row}>
        <TextInput
          ref={ref}
          style={[styles.input, errorMessage ? styles.inputError : null, style]}
          // Never revealed by default — the toggle below is the only way,
          // and it announces its own state to a screen reader.
          secureTextEntry={!isVisible}
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={label}
          accessibilityLabelledBy={`${label}-label`}
          accessibilityHint={hint}
          {...inputProps}
        />
        <Pressable
          onPress={() => setIsVisible((v) => !v)}
          style={styles.toggle}
          accessibilityRole="button"
          accessibilityLabel={isVisible ? "Şifreyi gizle" : "Şifreyi göster"}
          accessibilityState={{ selected: isVisible }}
          hitSlop={8}
        >
          <Text style={styles.toggleText}>{isVisible ? "Gizle" : "Göster"}</Text>
        </Pressable>
      </View>
      {helperText ? (
        <Text
          style={errorMessage ? styles.errorText : styles.hintText}
          accessibilityLiveRegion={errorMessage ? "polite" : "none"}
        >
          {helperText}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing.xxs,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    minHeight: minTouchTarget + 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    // Reserves room for the Göster/Gizle control so a long password never
    // runs underneath it.
    paddingRight: 84,
    fontSize: inputFontSize,
    color: colors.textPrimary,
  },
  inputError: {
    borderColor: colors.danger,
  },
  toggle: {
    position: "absolute",
    right: spacing.sm,
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.primary,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
  },
  hintText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
