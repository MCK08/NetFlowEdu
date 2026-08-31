import { memo } from "react";
import { Text, View } from "react-native";

import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import {
  formatRelativeDayLabel,
  TeacherLearningTimeline as Timeline,
} from "../services/teacherLearningTimeline";

import { LearningTrail } from "./LearningTrail";

interface TeacherLearningTimelineProps {
  timeline: Timeline;
  isLoading: boolean;
  hasError: boolean;
}

// Phase 60 — "Son Öğrenme Akışı" inside Student Performance.
//
// A WRAPPER, NOT A SECOND TIMELINE ENGINE
//
// The chronology itself is drawn by the SHARED LearningTrail the student's
// Learning Story already uses, passed through untouched. Only the framing
// around it is teacher-specific: a topic heading, when the topic was last
// recorded, and one observational sentence. Forking the trail for a second
// role would have meant two components free to disagree about what the same
// events look like.
//
// Each topic's trail is rendered WITHOUT its own sentence (`insight={null}`).
// The observation is stated once, at section level, for the most recently
// active topic — repeating it per topic put the same line on screen twice in
// the common single-topic case.
export const TeacherLearningTimeline = memo(function TeacherLearningTimeline({
  timeline,
  isLoading,
  hasError,
}: TeacherLearningTimelineProps) {
  // Phase 49 — memo() blocks prop-driven re-renders but not context updates.
  useThemeSubscription();

  if (isLoading) {
    // Compact and fixed-height so the surrounding cards do not jump when the
    // timeline resolves (§43).
    return <LoadingSkeleton height={72} borderRadius={12} />;
  }

  if (hasError) {
    return (
      <Text style={styles.muted}>
        Öğrenme akışı şu anda yüklenemedi. Diğer bilgiler geçerliliğini koruyor.
      </Text>
    );
  }

  if (timeline.isEmpty) {
    // Deliberately not "bu öğrenci çalışmadı": the chronological record only
    // begins with Phase 59, so its absence says nothing about the cumulative
    // evidence shown elsewhere on this screen.
    return (
      <Text style={styles.muted}>
        Bu öğrenci için kronolojik öğrenme akışı yeni çalışmalarla oluşacak.
      </Text>
    );
  }

  return (
    <View style={styles.wrapper}>
      {timeline.topics.map((topic) => {
        const latest = topic.events[topic.events.length - 1];
        return (
          <View key={topic.id} style={styles.topic}>
            <View style={styles.topicHeader}>
              <Text style={styles.topicName} numberOfLines={1}>
                {topic.topic}
              </Text>
              {latest ? (
                <Text style={styles.topicTime}>{formatRelativeDayLabel(latest.occurredAt)}</Text>
              ) : null}
            </View>
            <Text style={styles.topicSubject} numberOfLines={1}>
              {topic.subject}
            </Text>
            <LearningTrail trail={topic.events} insight={null} />
          </View>
        );
      })}

      {timeline.observation ? (
        <Text style={styles.observation}>{timeline.observation}</Text>
      ) : null}
    </View>
  );
});

const styles = themedStyles(() => ({
  wrapper: {
    gap: spacing.md,
  },
  topic: {
    gap: spacing.xxs,
  },
  topicHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  topicName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  topicTime: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  topicSubject: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  observation: {
    ...typography.body,
    color: colors.textSecondary,
  },
  muted: {
    ...typography.body,
    color: colors.textTertiary,
  },
}));
