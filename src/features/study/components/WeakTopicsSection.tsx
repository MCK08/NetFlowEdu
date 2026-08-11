import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Badge } from "@components/ui/Badge";
import { Card } from "@components/ui/Card";
import { Chip } from "@components/ui/Chip";
import { SectionHeader } from "@components/ui/SectionHeader";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { TopicInsight } from "../services/learningInsights";

interface WeakTopicsSectionProps {
  topics: readonly TopicInsight[];
  onSelectTopic: (topic: TopicInsight) => void;
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
  if (topics.length === 0) return null;

  return (
    <View style={styles.container}>
      <SectionHeader title="Zorlandığın Konular" />
      <View style={styles.list}>
        {topics.map((topic) => (
          <AnimatedPressable
            key={`${topic.subject}-${topic.topic}`}
            onPress={() => onSelectTopic(topic)}
            accessibilityRole="button"
            accessibilityLabel={`${topic.subject}, ${topic.topic}. ${topic.struggledCount} kez zorlandın.`}
          >
            <Card style={styles.card}>
              <View style={styles.row}>
                <View style={styles.textColumn}>
                  <Text style={styles.topic} numberOfLines={1}>
                    {topic.topic}
                  </Text>
                  <Text style={styles.subject} numberOfLines={1}>
                    {topic.subject}
                  </Text>
                  {/* Phase 25 — only the single most actionable recency
                      signal (genuinely stale), not every band, to keep this
                      card from turning into a badge farm. */}
                  {topic.recency === "stale" ? (
                    <Chip label="Uzun süredir çalışılmadı" />
                  ) : null}
                </View>
                <Badge label={`${topic.struggledCount} zorlandın`} variant="danger" />
              </View>
            </Card>
          </AnimatedPressable>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  list: {
    gap: spacing.xs,
  },
  card: {
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  topic: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  subject: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
