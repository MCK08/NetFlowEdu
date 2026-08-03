import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { minTouchTarget } from "@theme/sizes";

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
        <View
          style={[
            styles.box,
            checked ? styles.boxChecked : null,
            errorMessage && !checked ? styles.boxError : null,
          ]}
        >
          {/* An icon rather than a "✓" text glyph: the glyph inherited the
              user's OS font scaling and overflowed the fixed 22pt box at
              large dynamic-type settings. */}
          {checked ? <Ionicons name="checkmark" size={14} color={colors.textInverse} /> : null}
        </View>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
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
    gap: spacing.xxs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: minTouchTarget,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.sm - 2,
    borderWidth: 1.5,
    borderColor: colors.textTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  // An unchecked-with-error box was previously indistinguishable from a
  // normal unchecked one — the only signal was the message underneath.
  boxError: {
    borderColor: colors.danger,
  },
  label: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
  },
});
