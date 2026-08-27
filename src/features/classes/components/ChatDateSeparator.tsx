import { memo } from "react";
import { Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface ChatDateSeparatorProps {
  label: string;
}

// The label itself is produced by services/chatDateGrouping's
// formatDateSeparatorLabel ("Bugün" / "Dün" / an absolute Turkish date) —
// this component only draws it.
export const ChatDateSeparator = memo(function ChatDateSeparator({
  label,
}: ChatDateSeparatorProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  return (
    <View style={styles.row}>
      <View style={styles.pill}>
        <Text style={styles.text}>{label}</Text>
      </View>
    </View>
  );
});

const styles = themedStyles(() => ({
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
}));
