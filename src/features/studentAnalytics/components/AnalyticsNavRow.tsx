import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

interface AnalyticsNavRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
  accessibilityHint?: string;
}

// Phase 107 — a secondary destination. The same outlined surface and tinted
// mark as Öğrenme Atlasım's entry, laid out as a row so several can stack
// without competing with the one loud card above them.
export const AnalyticsNavRow = memo(function AnalyticsNavRow({
  icon,
  title,
  description,
  onPress,
  accessibilityHint,
}: AnalyticsNavRowProps) {
  useThemeSubscription();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      accessibilityHint={accessibilityHint}
      style={styles.pressable}
    >
      <Card variant="outlined" style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={iconSize.sm} color={colors.primary} accessibilityElementsHidden />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
        <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
      </Card>
    </Pressable>
  );
});

const styles = themedStyles(() => ({
  pressable: {
    minHeight: minTouchTarget,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryMuted,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
  },
}));
