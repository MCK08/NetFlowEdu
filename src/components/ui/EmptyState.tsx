import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, View, ViewStyle } from "react-native";

import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { iconSize } from "@theme/sizes";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  // Escape hatch for callers that need to size/position the container
  // beyond the default centered padding (e.g. a full-screen paged feed
  // sizing itself to one page's height) — additive, every existing call
  // site that omits it keeps rendering exactly as before.
  style?: ViewStyle;
}

// Generic "nothing here yet" panel — several screens currently just render
// a bare centered <Text> for this (e.g. ProfileScreen's "Henüz soru
// paylaşmadın."). This is a new, opt-in primitive; existing bare-text empty
// states are left as-is for this phase.
export const EmptyState = memo(function EmptyState({
  icon = "file-tray-outline",
  title,
  description,
  style,
}: EmptyStateProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  return (
    <View style={[styles.container, style]}>
      <Ionicons name={icon} size={iconSize.xl} color={colors.textTertiary} />
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
});

const styles = themedStyles(() => ({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
    textAlign: "center",
  },
  description: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },
}));
