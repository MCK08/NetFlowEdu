import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

interface PasswordFieldProps extends TextInputProps {
  label: string;
  errorMessage?: string;
}

export function PasswordField({ label, errorMessage, style, ...inputProps }: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label} nativeID={`${label}-label`}>
        {label}
      </Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, errorMessage ? styles.inputError : null, style]}
          secureTextEntry={!isVisible}
          placeholderTextColor="#8A8F98"
          accessibilityLabel={label}
          accessibilityLabelledBy={`${label}-label`}
          {...inputProps}
        />
        <Pressable
          onPress={() => setIsVisible((v) => !v)}
          style={styles.toggle}
          accessibilityRole="button"
          accessibilityLabel={isVisible ? "Şifreyi gizle" : "Şifreyi göster"}
          hitSlop={8}
        >
          <Text style={styles.toggleText}>{isVisible ? "Gizle" : "Göster"}</Text>
        </Pressable>
      </View>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  inputError: {
    borderColor: "#D92D20",
  },
  toggle: {
    position: "absolute",
    right: 14,
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3358D9",
  },
  errorText: {
    fontSize: 13,
    color: "#D92D20",
  },
});
