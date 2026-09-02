import { memo } from "react";
import { Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { StudyOutcome } from "../domain/studyTypes";
import {
  SessionReflection,
  sessionHeadline,
  sessionOutcomeLabel,
} from "../services/sessionReflection";

interface SessionReflectionCardProps {
  reflection: SessionReflection;
}

// Phase 66 — the receipt for the session that just ended.
//
// Everything shown here came from outcomes THIS session confirmed, in the
// order the student produced them. Nothing is a lifetime figure, a score or a
// percentage, and the topic sentence is scoped by "Bu çalışmada" so it cannot
// be read as a verdict on the student's overall grip.
//
// Deliberately calm: no confetti, no XP, no reward mechanics. The value is
// that the student can see what they just did.
export const SessionReflectionCard = memo(function SessionReflectionCard({
  reflection,
}: SessionReflectionCardProps) {
  // Phase 49 — memo() blocks prop-driven re-renders but not context updates.
  useThemeSubscription();

  // A completion state with nothing confirmed has no summary to give. The
  // surrounding screen still shows its own completion copy.
  if (reflection.isEmpty) return null;

  const counts: { outcome: StudyOutcome; value: number }[] = [
    { outcome: "solved", value: reflection.solvedCount },
    { outcome: "struggled", value: reflection.struggledCount },
    { outcome: "again", value: reflection.againCount },
  ];

  return (
    <View style={styles.wrapper}>
      <Text style={styles.headline}>{sessionHeadline(reflection)}</Text>

      <View style={styles.counts}>
        {counts
          // A zero is not information here — the student simply did not use
          // that outcome — so only what actually happened is listed.
          .filter((entry) => entry.value > 0)
          .map((entry) => (
            <View key={entry.outcome} style={styles.countRow}>
              {/* Text, never colour alone: the label carries the meaning. */}
              <Text style={styles.countLabel}>{sessionOutcomeLabel(entry.outcome)}</Text>
              <Text style={styles.countValue}>{entry.value}</Text>
            </View>
          ))}
      </View>

      {reflection.moments.map((moment) => (
        <View key={moment.id} style={styles.moment}>
          <Text style={styles.momentTopic} numberOfLines={1}>
            {moment.topic}
          </Text>
          <View
            style={styles.sequence}
            accessibilityRole="text"
            // Spoken as an ordered sequence, so the chronology survives for a
            // reader who cannot see the row.
            accessibilityLabel={moment.outcomes
              .map((outcome, index) => `${index + 1}. ${sessionOutcomeLabel(outcome)}`)
              .join(", ")}
          >
            {moment.outcomes.map((outcome, index) => (
              <View key={`${moment.id}-${index}`} style={styles.step}>
                {index > 0 ? <Text style={styles.arrow}>→</Text> : null}
                <Text
                  style={[
                    styles.stepLabel,
                    outcome === "solved"
                      ? styles.stepSolved
                      : outcome === "struggled"
                        ? styles.stepStruggled
                        : styles.stepAgain,
                  ]}
                >
                  {sessionOutcomeLabel(outcome)}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.observation}>{moment.observation}</Text>
        </View>
      ))}
    </View>
  );
});

const styles = themedStyles(() => ({
  wrapper: {
    width: "100%",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  headline: {
    ...typography.subtitle,
    color: colors.textPrimary,
    textAlign: "center",
  },
  counts: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  countLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  countValue: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  moment: {
    gap: spacing.xxs,
    paddingTop: spacing.xs,
  },
  momentTopic: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    textAlign: "center",
  },
  sequence: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xxs,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  arrow: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  stepLabel: {
    ...typography.caption,
  },
  stepSolved: {
    color: colors.success,
  },
  stepStruggled: {
    color: colors.danger,
  },
  stepAgain: {
    color: colors.textSecondary,
  },
  observation: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
}));
