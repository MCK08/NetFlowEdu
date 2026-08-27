import { memo } from "react";
import { Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Avatar } from "@components/ui/Avatar";
import { Card } from "@components/ui/Card";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { StudentPerformanceCard as StudentPerformanceCardData } from "../services/studentPerformance";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface StudentPerformanceCardProps {
  card: StudentPerformanceCardData;
  onPress: (studentUid: string) => void;
}

// Only 3 existing feedback tones exist in the design system (success/
// danger/neutral, see theme/colors.ts) — no "warning/amber" token to
// invent one for, so "needs_support"/"declining" both read as danger-toned
// (both mean "this needs the teacher's attention now"), "strong" reads
// success-toned, "normal" stays neutral/primary.
function tierColor(tier: StudentPerformanceCardData["tier"]): string {
  if (tier === "needs_support" || tier === "declining") return colors.danger;
  if (tier === "strong") return colors.success;
  return colors.primary;
}

export const StudentPerformanceCard = memo(function StudentPerformanceCard({
  card,
  onPress,
}: StudentPerformanceCardProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  const { snapshot } = card;
  const progressPercent = snapshot.successRatePercent ?? 0;
  const barColor = tierColor(card.tier);

  const successLabel =
    snapshot.successRatePercent === null ? "Henüz veri yok" : `%${snapshot.successRatePercent} başarı`;

  // Phase 32 — a teacher scanning the class list needs "who has actually
  // worked this week" without opening each student. Real counts only (see
  // WeekActivity in studentPerformance.ts); never a placeholder number.
  const weekLabel = snapshot.thisWeek.studiedThisWeek
    ? `Bu hafta ${snapshot.thisWeek.reviewedThisWeek} soru · ${snapshot.thisWeek.activeDaysThisWeek} gün`
    : "Bu hafta çalışmadı";

  return (
    <AnimatedPressable
      onPress={() => onPress(card.studentUid)}
      accessibilityRole="button"
      accessibilityLabel={`${card.displayName}. ${successLabel}. ${weekLabel}. ${snapshot.dueCount} bekleyen tekrar. ${snapshot.weakTopics.length} zayıf konu.`}
    >
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <Avatar photoURL={card.photoURL} displayName={card.displayName} size="md" />
          <View style={styles.textColumn}>
            <Text style={styles.name} numberOfLines={1}>
              {card.displayName}
            </Text>
            <Text style={styles.statsLine} numberOfLines={1}>
              {successLabel} · {snapshot.dueCount} tekrar · {snapshot.weakTopics.length} zayıf konu
            </Text>
            <Text
              style={[styles.statsLine, snapshot.thisWeek.studiedThisWeek ? null : styles.inactiveWeek]}
              numberOfLines={1}
            >
              {weekLabel}
            </Text>
          </View>
        </View>

        <View
          style={styles.progressTrack}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${card.displayName} başarı oranı`}
          accessibilityValue={{ min: 0, max: 100, now: progressPercent }}
        >
          <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: barColor }]} />
        </View>
      </Card>
    </AnimatedPressable>
  );
});

const styles = themedStyles(() => ({
  card: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  statsLine: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  inactiveWeek: {
    color: colors.textTertiary,
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
  },
}));
