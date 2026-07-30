import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { iconSize } from "@theme/sizes";

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
}

// Generic "nothing here yet" panel — several screens currently just render
// a bare centered <Text> for this (e.g. ProfileScreen's "Henüz soru
// paylaşmadın."). This is a new, opt-in primitive; existing bare-text empty
// states are left as-is for this phase.
export const EmptyState = memo(function EmptyState({
  icon = "file-tray-outline",
  title,
  description,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={iconSize.xl} color={colors.textTertiary} />
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
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
});
