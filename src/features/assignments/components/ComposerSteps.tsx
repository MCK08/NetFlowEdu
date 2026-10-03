import { memo } from "react";
import { Text, useWindowDimensions, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

interface ComposerStepsProps {
  /** In order. Each one is a stage the flow really has. */
  steps: readonly string[];
  /** Zero-based index of the stage the teacher is on. */
  activeIndex: number;
}

// Phase 127 — where am I in this flow.
//
// The composer has TWO real stages and always had: filling the form, then
// the prepared question set the teacher confirms before anything is written
// (publish only ever writes the snapshot that was previewed — see
// useCreateAssignment). Nothing said so, so "Soruları Hazırla" read like a
// submit and the preview arrived as a surprise.
//
// Two steps because the flow has two. The approved mockup draws four
// (Temel Bilgiler / İçerik / Ayarlar / Önizleme); three of those are
// sections of one screen and one is this flow's second stage, so drawing
// four would promise navigation that does not exist.
export const ComposerSteps = memo(function ComposerSteps({ steps, activeIndex }: ComposerStepsProps) {
  useThemeSubscription();
  const { fontScale } = useWindowDimensions();
  // Past the accessibility sizes two labelled discs cannot share a line
  // without breaking their words; the steps take the width in turn.
  const stacked = fontScale >= stackAtFontScale;

  return (
    <View
      style={[styles.row, stacked ? styles.rowStacked : null]}
      accessible
      accessibilityLabel={`Adım ${activeIndex + 1} / ${steps.length}: ${steps[activeIndex] ?? ""}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: steps.length, now: activeIndex + 1 }}
    >
      {steps.map((step, index) => {
        const isActive = index === activeIndex;
        const isDone = index < activeIndex;
        return (
          <View key={step} style={[styles.step, stacked ? styles.stepStacked : null]}>
            <View style={[styles.disc, isActive || isDone ? styles.discOn : null]}>
              <Text style={[styles.discText, isActive || isDone ? styles.discTextOn : null]}>{index + 1}</Text>
            </View>
            <Text style={[styles.label, isActive ? styles.labelActive : null]}>{step}</Text>
          </View>
        );
      })}
    </View>
  );
});

const styles = themedStyles(() => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1,
    minWidth: 0,
  },
  stepStacked: {
    flexShrink: 0,
  },
  disc: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  discOn: {
    backgroundColor: colors.primary,
  },
  discText: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textTertiary,
  },
  discTextOn: {
    color: colors.textInverse,
  },
  label: {
    ...typography.caption,
    color: colors.textTertiary,
    flexShrink: 1,
    minWidth: 0,
  },
  labelActive: {
    fontWeight: "700",
    color: colors.primary,
  },
}));
