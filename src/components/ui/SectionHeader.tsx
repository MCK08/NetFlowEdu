import { memo } from "react";
import { Text, View } from "react-native";

import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
}

export const SectionHeader = memo(function SectionHeader({ title, action }: SectionHeaderProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
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

const styles = themedStyles(() => ({
  // Phase 104 (Dynamic Type) — a long title used to push the action off the
  // right edge at the accessibility text sizes ("Ortak Öğrenme Örüntüleri"
  // left its "Etiketleri yönet" action unreachable at ~200%). The row now
  // wraps: at ordinary sizes title and action share the line exactly as
  // before; when they no longer fit, the title takes the line whole (wrapping
  // at its spaces, never mid-word) and the action drops beneath it, still
  // reachable and still its own width.
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  action: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600",
    flexShrink: 0,
  },
}));
