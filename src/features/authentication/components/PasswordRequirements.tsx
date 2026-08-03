import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { evaluatePasswordRules } from "../validation";

interface PasswordRequirementsProps {
  password: string;
}

// The four password rules, visible BEFORE they can be failed and ticking
// off live as they are met. Previously the only way to discover them was
// to submit and read whichever single rule fired first, so a password
// could take four round trips to get right.
//
// Renders the exact same PASSWORD_RULES list validatePassword itself walks
// — this component cannot drift from the validator, because there is only
// one list.
export function PasswordRequirements({ password }: PasswordRequirementsProps) {
  const rules = evaluatePasswordRules(password);
  const metCount = rules.filter((rule) => rule.satisfied).length;

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={`Şifre kuralları: ${rules.length} kuraldan ${metCount} tanesi sağlandı.`}
    >
      {rules.map((rule) => (
        <View key={rule.id} style={styles.row}>
          {/* Icon + colour together, never colour alone. */}
          <Ionicons
            name={rule.satisfied ? "checkmark-circle" : "ellipse-outline"}
            size={14}
            color={rule.satisfied ? colors.success : colors.textTertiary}
          />
          <Text style={[styles.text, rule.satisfied ? styles.textSatisfied : null]}>
            {rule.hint}
          </Text>
        </View>
      ))}
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
  },
  text: {
    ...typography.caption,
    color: colors.textTertiary,
    // Wraps rather than truncating at large dynamic-type sizes.
    flex: 1,
  },
  textSatisfied: {
    color: colors.success,
  },
});
