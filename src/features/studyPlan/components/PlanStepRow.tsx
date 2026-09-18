import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { StatusLabel } from "@components/ui/StatusLabel";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { PlanStep } from "../services/dailyPlan";
import {
  STEP_KIND_ICON,
  STEP_STATE_ICON,
  STEP_STATE_LABEL,
  STEP_STATE_TONE,
  stepAccessibilityLabel,
  stepDetail,
  stepTitle,
} from "../services/planPresentation";

interface PlanStepRowProps {
  step: PlanStep;
  index: number;
  total: number;
  onPress: (stepId: string) => void;
  /** True for every row but the first inside a grouped card. */
  divided?: boolean;
}

// Phase 108 — one step of the day. Order, subject — topic, kind · workload,
// state in a word and a mark. Completed and skipped rows dim rather than
// leave, so the day still reads as a whole. One accessible node per row.
export const PlanStepRow = memo(function PlanStepRow({ step, index, total, onPress, divided }: PlanStepRowProps) {
  useThemeSubscription();
  const isDone = step.state !== "pending";
  return (
    <AnimatedPressable
      onPress={() => onPress(step.id)}
      style={[styles.row, divided ? styles.divided : null, isDone ? styles.rowDone : null]}
      accessibilityRole="button"
      accessibilityLabel={stepAccessibilityLabel(step, index, total)}
      accessibilityHint="Adımın detayını açar"
    >
      <View style={[styles.order, step.state === "completed" ? styles.orderDone : null]}>
        {step.state === "completed" ? (
          <Ionicons name="checkmark" size={iconSize.xs} color={colors.textInverse} accessibilityElementsHidden />
        ) : (
          <Text style={styles.orderText}>{index + 1}</Text>
        )}
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {stepTitle(step)}
        </Text>
        <View style={styles.detailRow}>
          <Ionicons name={STEP_KIND_ICON[step.kind]} size={iconSize.xs} color={colors.textTertiary} accessibilityElementsHidden />
          <Text style={styles.detail} numberOfLines={2}>
            {stepDetail(step)}
          </Text>
        </View>
        {isDone ? (
          <StatusLabel icon={STEP_STATE_ICON[step.state]} tone={STEP_STATE_TONE[step.state]} textStyle={styles.state}>
            {STEP_STATE_LABEL[step.state]}
          </StatusLabel>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
    </AnimatedPressable>
  );
});

const styles = themedStyles(() => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingVertical: spacing.sm,
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  rowDone: {
    opacity: 0.65,
  },
  order: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryMuted,
  },
  orderDone: {
    backgroundColor: colors.primary,
  },
  orderText: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.primary,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  detail: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  state: {
    ...typography.caption,
    color: colors.textSecondary,
  },
}));
