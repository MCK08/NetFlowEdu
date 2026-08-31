import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { SectionHeader } from "@components/ui/SectionHeader";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { ReviewReadyTopic, reviewReadyReasonText } from "../services/reviewReadiness";

interface ReviewReadySectionProps {
  topics: readonly ReviewReadyTopic[];
  onStart: (topic: ReviewReadyTopic) => void;
}

// Phase 62 — "Tekrar Zamanı".
//
// Names the topics the review scheduler has released, which the Hub
// previously only ever expressed as a number ("2 tekrar bekliyor"). The
// scheduler decides WHEN; this says WHICH and WHY, and routes into the
// existing review flow.
//
// Brand blue, not danger. These are topics going well enough to be worth
// revisiting — the semantic warning colours stay reserved for genuine
// struggle, which is a different section's job.
//
// Renders nothing when there is nothing due: an empty "all caught up" card
// every day is noise, and the Hub already reports progress elsewhere.
export const ReviewReadySection = memo(function ReviewReadySection({
  topics,
  onStart,
}: ReviewReadySectionProps) {
  // Phase 49 — memo() blocks prop-driven re-renders but not context updates.
  useThemeSubscription();

  if (topics.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <SectionHeader title="Tekrar Zamanı" />
      {topics.map((topic) => (
        <Card key={topic.id}>
          <View style={styles.row}>
            <View style={styles.iconWrap}>
              <Ionicons name="time-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.text}>
              <Text style={styles.topic} numberOfLines={1}>
                {topic.topic}
              </Text>
              <Text style={styles.subject} numberOfLines={1}>
                {topic.subject}
              </Text>
            </View>
          </View>

          <Text style={styles.reason}>{reviewReadyReasonText(topic)}</Text>

          <Pressable
            onPress={() => onStart(topic)}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel={`${topic.topic} konusunu tekrar çalış`}
          >
            <Text style={styles.actionText}>Tekrar Çalış</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.textInverse} />
          </Pressable>
        </Card>
      ))}
    </View>
  );
});

const styles = themedStyles(() => ({
  wrapper: {
    gap: spacing.sm,
  },
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
  topic: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  subject: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  reason: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    marginTop: spacing.sm,
  },
  actionText: {
    ...typography.bodyStrong,
    color: colors.textInverse,
  },
}));
