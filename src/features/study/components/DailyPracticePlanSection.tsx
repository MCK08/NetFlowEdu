import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { DailyPracticePlan } from "../services/dailyPracticePlan";
import { goalProgress, goalProgressLabel, planReasonLabel } from "../services/studyPresentation";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface DailyPracticePlanSectionProps {
  plan: DailyPracticePlan;
  // A single callback, not onStartDue/onStartAdaptive — the CALLER decides
  // mandatory vs. adaptive at press time via a fresh due-check (see
  // studyDueCheck.ts), not this component from a possibly-stale
  // plan.dueCount. This component only decides WHETHER to show the button
  // at all (is there anything to do), never WHICH mode to open.
  onStart: () => void;
}

interface PlanRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  detail: string;
  // The underlying, real reason this row exists — read by screen readers
  // alongside the visual title/count so "why" is never conveyed by color
  // or icon alone.
  reasonLabel: string;
}

function PlanRow({ icon, color, title, detail, reasonLabel }: PlanRowProps) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${title}. ${detail}. ${reasonLabel}`}
    >
      {/* Phase 106 — the mark sits in a small tinted disc so the three
          plan parts read as a list of steps rather than loose icons; still
          decorative, the row's own label says everything it says. */}
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={iconSize.sm} color={color} accessibilityElementsHidden />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDetail} numberOfLines={2}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

function questionWord(count: number): string {
  return `${count} soru`;
}

// "Bugünkü Plan" — the Learning Hub's answer to "what should I study right
// now", built entirely from buildDailyPracticePlan's already-deterministic
// output. Renders nothing when the plan has nothing to show (no due
// obligation and no reinforcement candidates), matching the sibling
// WeakTopicsSection/SubjectBreakdownSection's "hide when empty" convention.
export const DailyPracticePlanSection = memo(function DailyPracticePlanSection({
  plan,
  onStart,
}: DailyPracticePlanSectionProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  if (plan.dueCount === 0 && plan.planItems.length === 0) return null;

  const reinforceItems = plan.planItems.filter(
    (item) => item.reason === "struggled" || item.reason === "weak_topic",
  );
  const continueItems = plan.planItems.filter((item) => item.reason === "goal_fill");

  const reinforceDetail = plan.topicFocus
    ? `${plan.topicFocus.topic} · ${questionWord(reinforceItems.length)}`
    : questionWord(reinforceItems.length);

  const firstContinueSubject = continueItems.find((item) => item.subject !== "")?.subject ?? null;
  const continueDetail = firstContinueSubject
    ? `${firstContinueSubject} · ${questionWord(continueItems.length)}`
    : questionWord(continueItems.length);

  // Whether to render a button at all — a coarse, presentational gate from
  // the (possibly stale) plan snapshot. Fine to be stale here: worst case a
  // button briefly shows or hides one render late. WHICH mode it opens is
  // decided live by the caller (see onStart / studyDueCheck.ts) — that
  // decision must never be stale, since it changes what screen opens.
  const handleStart = plan.dueCount > 0 || plan.planItems.length > 0 ? onStart : undefined;
  const progressPercent: `${number}%` = `${Math.round(goalProgress(plan.reviewedToday, plan.dailyGoal) * 100)}%`;

  return (
    <View style={styles.container}>
      <SectionHeader title="Bugünkü Plan" />
      <Card variant="outlined" style={styles.card}>
        <View style={styles.rows}>
          {plan.dueCount > 0 ? (
            <PlanRow
              icon="alert-circle"
              color={colors.danger}
              title="Önce Tekrar Et"
              detail={questionWord(plan.dueCount)}
              reasonLabel={planReasonLabel("due")}
            />
          ) : null}
          {reinforceItems.length > 0 ? (
            <PlanRow
              icon="flame"
              color={colors.primary}
              title="Güçlendir"
              detail={reinforceDetail}
              reasonLabel={planReasonLabel(plan.topicFocus ? "weak_topic" : "struggled")}
            />
          ) : null}
          {continueItems.length > 0 ? (
            <PlanRow
              icon="arrow-forward-circle"
              color={colors.textSecondary}
              title="Devam Et"
              detail={continueDetail}
              reasonLabel={planReasonLabel("goal_fill")}
            />
          ) : null}
        </View>

        {/* Phase 106 — the day's progress as a bar with its count, the same
            real numbers the caption carried before; the goal surface below
            the plan owns the streak and the stats, so nothing is repeated. */}
        <View style={styles.progressBlock}>
          <View
            style={styles.progressTrack}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`Bugünkü plan ilerlemesi ${progressPercent}`}
            accessibilityValue={{ min: 0, max: plan.dailyGoal, now: plan.reviewedToday }}
          >
            <View style={[styles.progressFill, { width: progressPercent }]} />
          </View>
          <Text style={styles.progressCaption}>
            {goalProgressLabel(plan.reviewedToday, plan.dailyGoal)} tamamlandı
          </Text>
        </View>

        {handleStart ? (
          <PrimaryButton
            label="Çalışmaya Başla"
            onPress={handleStart}
            accessibilityHint="Bugünkü plana göre çalışmaya başlar"
          />
        ) : null}
      </Card>
    </View>
  );
});

const styles = themedStyles(() => ({
  container: {
    gap: spacing.xs,
  },
  card: {
    gap: spacing.md,
  },
  rows: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  rowDetail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  progressBlock: {
    gap: spacing.xs,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  progressCaption: {
    ...typography.caption,
    color: colors.textTertiary,
  },
}));
