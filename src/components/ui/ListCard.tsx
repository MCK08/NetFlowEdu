import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { iconSize } from "@theme/sizes";
import { typography } from "@theme/typography";

import { AnimatedPressable } from "./AnimatedPressable";

interface ListCardProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
}

// A tappable row: leading visual (e.g. an <Avatar>) + title/subtitle +
// optional trailing chevron. Generalizes the row shape already repeated
// (with slightly different styles each time) in AccountSwitcherSheet's
// account rows and RecentAccountsList's account rows.
export function ListCard({ title, subtitle, leading, onPress, showChevron = false }: ListCardProps) {
  const content = (
    <View style={styles.row}>
      {leading}
      <View style={styles.textColumn}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {showChevron ? (
        <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} />
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <AnimatedPressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      {content}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
