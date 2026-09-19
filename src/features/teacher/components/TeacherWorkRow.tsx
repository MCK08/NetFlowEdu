import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

interface TeacherWorkRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail?: string | null;
  onPress: () => void;
  accessibilityHint: string;
}

// Phase 111 — one line of "Sınıf İşleri": what is waiting, and a way into it.
// A row, not a card: several stack under one heading without becoming a wall
// of rectangles. The words carry the meaning; the icon is decoration.
export const TeacherWorkRow = memo(function TeacherWorkRow({
  icon,
  title,
  detail,
  onPress,
  accessibilityHint,
}: TeacherWorkRowProps) {
  useThemeSubscription();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      accessibilityHint={accessibilityHint}
      style={styles.row}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={iconSize.sm} color={colors.primary} accessibilityElementsHidden />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
    </Pressable>
  );
});

const styles = themedStyles(() => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingVertical: spacing.xs,
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
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  detail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
}));
