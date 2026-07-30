import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
}

export const SectionHeader = memo(function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {action ? (
        <Text style={styles.action} onPress={action.onPress} accessibilityRole="button">
          {action.label}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  action: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600",
  },
});
