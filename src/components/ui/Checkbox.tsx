import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";

interface CheckboxProps {
  label: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
  errorMessage?: string;
}

export function Checkbox({ label, checked, onToggle, errorMessage }: CheckboxProps) {
  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => onToggle(!checked)}
        style={styles.row}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        hitSlop={8}
      >
        <View style={[styles.box, checked ? styles.boxChecked : null]}>
          {checked ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.textTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: "700",
  },
  label: {
    flex: 1,
    fontSize: 14,
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
  },
});
