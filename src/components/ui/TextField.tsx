import { forwardRef } from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { inputFontSize, minTouchTarget } from "@theme/sizes";

interface TextFieldProps extends TextInputProps {
  label: string;
  errorMessage?: string;
  // A rule stated BEFORE the person can break it (username format, what a
  // display name is for). Replaced by errorMessage when there is one, so the
  // row below the input never stacks two lines and the form geometry stays
  // put as errors appear and clear.
  hint?: string;
}

// forwardRef so a preceding field's return key can move focus here — the
// email -> password -> submit chains on login and register. Purely
// additive: every existing caller that passes no ref renders as before.
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, errorMessage, hint, style, ...inputProps },
  ref,
) {
  const helperText = errorMessage ?? hint;

  return (
    <View style={styles.container}>
      <Text style={styles.label} nativeID={`${label}-label`}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        style={[styles.input, errorMessage ? styles.inputError : null, style]}
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={label}
        accessibilityLabelledBy={`${label}-label`}
        accessibilityHint={hint}
        {...inputProps}
      />
      {helperText ? (
        <Text
          style={errorMessage ? styles.errorText : styles.hintText}
          // Only a real error is announced — re-reading a static rule on
          // every keystroke would make the field unusable with a screen
          // reader.
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
  input: {
    minHeight: minTouchTarget + 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    fontSize: inputFontSize,
    color: colors.textPrimary,
  },
  inputError: {
    borderColor: colors.danger,
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
