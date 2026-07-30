import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";

interface TextFieldProps extends TextInputProps {
  label: string;
  errorMessage?: string;
}

export function TextField({ label, errorMessage, style, ...inputProps }: TextFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label} nativeID={`${label}-label`}>
        {label}
      </Text>
      <TextInput
        style={[styles.input, errorMessage ? styles.inputError : null, style]}
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={label}
        accessibilityLabelledBy={`${label}-label`}
        {...inputProps}
      />
      {errorMessage ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
  },
});
