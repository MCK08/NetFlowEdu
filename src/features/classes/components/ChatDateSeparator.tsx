import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

interface ChatDateSeparatorProps {
  label: string;
}

// The label itself is produced by services/chatDateGrouping's
// formatDateSeparatorLabel ("Bugün" / "Dün" / an absolute Turkish date) —
// this component only draws it.
export const ChatDateSeparator = memo(function ChatDateSeparator({
  label,
}: ChatDateSeparatorProps) {
  return (
    <View style={styles.row}>
      <View style={styles.pill}>
        <Text style={styles.text}>{label}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  pill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  text: {
    ...typography.label,
    color: colors.textSecondary,
  },
});
