import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Badge } from "@components/ui/Badge";
import { Card } from "@components/ui/Card";
import { Chip } from "@components/ui/Chip";
import { SectionHeader } from "@components/ui/SectionHeader";
import { colors } from "@theme/colors";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { TopicInsight } from "../services/learningInsights";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface WeakTopicsSectionProps {
  topics: readonly TopicInsight[];
  onSelectTopic: (topic: TopicInsight) => void;
}

// Phase 41 — what the badge is allowed to claim.
//
// It used to read "{struggledCount} kez zorlandın" ("N TIMES"), but
// struggledCount counts QUESTIONS currently in a struggled state, not
// struggle events: a student who struggled eight times on one question was
// told "1 kez zorlandın". Now the "times" sentence is used only when the
// server's cumulative counters can actually back it; otherwise the badge
// states what is genuinely known — how many questions are struggling —
// rather than inventing an event count for a pre-counter item.
function struggleLabel(topic: TopicInsight): string {
  if (topic.struggledAttemptCount !== null && topic.struggledAttemptCount > 0) {
    return `${topic.struggledAttemptCount} kez zorlandın`;
  }
  return `${topic.struggledCount} soruda zorlandın`;
}

// "Zorlandığın Konular" — only ever rendered with topics that have at least
// one real struggled outcome (see learningInsights.ts's rankTopics), so
// there is no empty/placeholder state to design for: this section simply
// doesn't render when the student has none, same as EmptyState elsewhere
// only appearing when there's genuinely nothing to show.
export const WeakTopicsSection = memo(function WeakTopicsSection({
  topics,
  onSelectTopic,
}: WeakTopicsSectionProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  if (topics.length === 0) return null;

  // Phase 106 — one grouped list, not a card per topic: the topic and its
  // subject on the left, the real struggle count as a quiet danger badge on
  // the right, a chevron because the row opens the topic. Red never fills
  // the row; it marks the count and nothing else.
  return (
    <View style={styles.container}>
      <SectionHeader title="Zorlandığın Konular" />
      <Card variant="outlined" style={styles.list}>
        {topics.map((topic, index) => (
          <AnimatedPressable
            key={`${topic.subject}-${topic.topic}`}
            onPress={() => onSelectTopic(topic)}
            style={[styles.row, index > 0 ? styles.rowDivider : null]}
            accessibilityRole="button"
            accessibilityLabel={`${topic.subject}, ${topic.topic}. ${struggleLabel(topic)}.`}
            accessibilityHint="Bu konuyu çalışmayı açar"
          >
            <View style={styles.textColumn}>
              <Text style={styles.topic} numberOfLines={2}>
                {topic.topic}
              </Text>
              <Text style={styles.subject} numberOfLines={1}>
                {topic.subject}
              </Text>
              {/* Phase 25 — only the single most actionable recency
                  signal (genuinely stale), not every band, to keep this
                  row from turning into a badge farm. */}
              {topic.recency === "stale" ? <Chip label="Uzun süredir çalışılmadı" /> : null}
            </View>
            <View style={styles.trailing}>
              <Badge label={struggleLabel(topic)} variant="danger" />
              <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
            </View>
          </AnimatedPressable>
        ))}
      </Card>
    </View>
  );
});

const styles = themedStyles(() => ({
  container: {
    gap: spacing.xs,
  },
  list: {
    paddingVertical: 0,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    alignItems: "flex-start",
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    flexShrink: 0,
  },
  topic: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  subject: {
    ...typography.caption,
    color: colors.textSecondary,
  },
}));
