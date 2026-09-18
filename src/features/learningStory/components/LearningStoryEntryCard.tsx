import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize } from "@theme/sizes";
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
// Deliberately one restrained tile rather than an inline preview of the story
// itself: the hub's job is to get the student (or teacher) moving, and
// rendering the whole narrative here would both duplicate the screen and push
// the next-action card — the thing that actually drives practice — down the
// page.
//
// Phase 106 — a compact insight tile, paired beside Öğrenme Atlasım on the
// Hub: mark, title, one supporting line, chevron. Same destination and the
// same accessible sentence as before; only the shape changed so the two
// "deeper insight when I want it" entries read as one quiet layer under the
// next action instead of two full-width cards competing with it.
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
      style={styles.pressable}
    >
      <Card variant="outlined" style={styles.card}>
        <View style={styles.topRow}>
          <View style={styles.iconWrap}>
            {/* Decorative: the tile's own label carries title + description. */}
            <Ionicons name="trail-sign-outline" size={iconSize.sm} color={colors.primary} accessibilityElementsHidden />
          </View>
          <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
      </Card>
    </Pressable>
  );
});

const styles = themedStyles(() => ({
  pressable: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    flex: 1,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
