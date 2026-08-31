import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

import { LearningEvent, trailStepLabel } from "../services/learningTrail";

interface LearningTrailProps {
  // Already chronological (oldest → newest) and already capped by
  // selectTopicTrail. This component never sorts or slices — it renders what
  // it is given, so the order on screen is provably the order in the data.
  trail: readonly LearningEvent[];
  // The observational sentence for the trail's shape, or null when the
  // sequence supports none.
  insight: string | null;
}

// Phase 59 — the signature Learning Trail.
//
// Reads OLDEST → NEWEST, left to right, so the newest outcome is the visual
// conclusion — which is what makes a recovery legible without any copy
// claiming it. The direction is conveyed by the chevrons between steps, not
// by position alone.
//
// ACCESSIBILITY (§67): each step is numbered in its own accessibility label
// ("1. Zorlandım"), so chronology survives for a screen reader that cannot
// see the chevrons. The outcome is also carried by an icon AND text, never by
// colour alone.
function LearningTrailComponent({ trail, insight }: LearningTrailProps) {
  useThemeSubscription();

  if (trail.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      {/* Wraps rather than scrolls: at larger text sizes the steps flow onto
          a second line instead of being clipped or trapping the reader in a
          horizontal scroller (§68). */}
      <View style={styles.row}>
        {trail.map((event, index) => {
          const isStruggle = event.outcome === "struggled";
          const isSolved = event.outcome === "solved";
          return (
            <View key={event.id} style={styles.stepGroup}>
              {index > 0 ? (
                <Ionicons
                  name="chevron-forward"
                  size={12}
                  color={colors.textTertiary}
                  // The chevron is decoration; the order it implies is already
                  // stated in each step's own numbered label.
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              ) : null}
              <View
                style={[
                  styles.step,
                  isStruggle ? styles.stepStruggle : isSolved ? styles.stepSolved : styles.stepAgain,
                ]}
                accessibilityLabel={`${index + 1}. ${trailStepLabel(event.outcome)}`}
              >
                <Ionicons
                  name={
                    isStruggle
                      ? "alert-circle-outline"
                      : isSolved
                        ? "checkmark-circle-outline"
                        : "refresh-outline"
                  }
                  size={13}
                  color={
                    isStruggle ? colors.danger : isSolved ? colors.success : colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.stepText,
                    isStruggle
                      ? styles.stepTextStruggle
                      : isSolved
                        ? styles.stepTextSolved
                        : styles.stepTextAgain,
                  ]}
                >
                  {trailStepLabel(event.outcome)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {insight ? <Text style={styles.insight}>{insight}</Text> : null}
    </View>
  );
}

export const LearningTrail = memo(LearningTrailComponent);

const styles = themedStyles(() => ({
  wrapper: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xxs,
  },
  stepGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  stepStruggle: {
    backgroundColor: colors.dangerMuted,
    borderColor: colors.danger,
  },
  stepSolved: {
    backgroundColor: colors.successMuted,
    borderColor: colors.success,
  },
  stepAgain: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  stepText: {
    ...typography.label,
  },
  stepTextStruggle: {
    color: colors.danger,
  },
  stepTextSolved: {
    color: colors.success,
  },
  stepTextAgain: {
    color: colors.textSecondary,
  },
  insight: {
    ...typography.caption,
    color: colors.textSecondary,
  },
}));
