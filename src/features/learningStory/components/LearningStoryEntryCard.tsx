import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

interface LearningStoryEntryCardProps {
  title: string;
  description: string;
  onPress: () => void;
}

// Phase 56 — the way into Learning Story from a hub screen.
//
// Deliberately one restrained row rather than an inline preview of the story
// itself: the hub's job is to get the student (or teacher) moving, and
// rendering the whole narrative here would both duplicate the screen and push
// the next-action card — the thing that actually drives practice — down the
// page.
export const LearningStoryEntryCard = memo(function LearningStoryEntryCard({
  title,
  description,
  onPress,
}: LearningStoryEntryCardProps) {
  // Phase 49 — memo() blocks prop-driven re-renders but not context updates.
  useThemeSubscription();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
    >
      <Card>
        <View style={styles.row}>
          <View style={styles.iconWrap}>
            <Ionicons name="trail-sign-outline" size={18} color={colors.primary} />
          </View>
          <View style={styles.text}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </View>
      </Card>
    </Pressable>
  );
});

const styles = themedStyles(() => ({
  row: {
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
