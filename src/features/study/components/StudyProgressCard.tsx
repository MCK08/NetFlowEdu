import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { StudySummary } from "../services/studyService";
import { goalProgress, goalProgressLabel, streakLabel } from "../services/studyPresentation";

interface StudyProgressCardProps {
  summary: StudySummary;
  dueCount: number;
}

interface StatProps {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}

function Stat({ icon, value, label }: StatProps) {
  return (
    // One accessible node per stat: a screen reader reads "12, tekrar
    // bekliyor" rather than two disconnected fragments.
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// Every number here comes from the server-owned studyMeta/summary document
// (or the live queue length) — nothing is invented, estimated or projected.
export const StudyProgressCard = memo(function StudyProgressCard({
  summary,
  dueCount,
}: StudyProgressCardProps) {
  const progress = goalProgress(summary.reviewedToday, summary.dailyGoal);
  const progressPercent: `${number}%` = `${Math.round(progress * 100)}%`;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Bugünkü hedef</Text>
        <Text style={styles.goalValue}>
          {goalProgressLabel(summary.reviewedToday, summary.dailyGoal)}
        </Text>
      </View>

      <View
        style={styles.progressTrack}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Günlük hedef ilerlemesi ${progressPercent}`}
        accessibilityValue={{ min: 0, max: summary.dailyGoal, now: summary.reviewedToday }}
      >
        <View style={[styles.progressFill, { width: progressPercent }]} />
      </View>

      <View style={styles.statsRow}>
        <Stat icon="flame-outline" value={String(summary.currentStreak)} label="günlük seri" />
        <Stat icon="time-outline" value={String(dueCount)} label="tekrar bekliyor" />
        <Stat icon="ribbon-outline" value={String(summary.masteredCount)} label="ustalaşıldı" />
      </View>

      <Text style={styles.streakCaption}>
        {streakLabel(summary.currentStreak)} · En uzun seri: {summary.longestStreak}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  goalValue: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  stat: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    ...typography.title,
    color: colors.textPrimary,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },
  streakCaption: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
