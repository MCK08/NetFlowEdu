import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import { joinSpokenLabel } from "@utils/spokenLabel";

import {
  patternChronologyLabel,
  patternOutcomeLabel,
  patternSupportingFact,
  patternTitle,
  StrugglePattern,
  StrugglePatternKind,
} from "../services/strugglePatternMemory";

// Phase 71 — repetition, shown as repetition.
//
// THE ECHO MARK
//
// Each pattern carries a small stack of marks: the visual sense of "this
// happened more than once" without a number pretending to be a measurement.
// It is capped, so a count of nine draws four marks and the real figure stays
// in the sentence beside it. Decorative, and hidden from screen readers.
//
// NO RED WALL
//
// Every row on this screen is about difficulty, so colouring them all red
// would be noise rather than signal. Repetition reads in brand blue, recovery
// in success green, and the icon plus the title carry the meaning — colour is
// never the message.

interface StrugglePatternListViewProps {
  patterns: readonly StrugglePattern[];
}

const KIND_ICON: Readonly<Record<StrugglePatternKind, keyof typeof Ionicons.glyphMap>> = {
  topic_spread: "git-branch-outline",
  same_question: "repeat-outline",
  recovery: "trending-up-outline",
};

// How many echo marks may be drawn. The sentence carries the true count.
const MAX_ECHO_MARKS = 4;

function accentFor(kind: StrugglePatternKind): string {
  return kind === "recovery" ? colors.success : colors.primary;
}

function echoCount(pattern: StrugglePattern): number {
  const raw =
    pattern.kind === "topic_spread" ? pattern.distinctQuestionCount : pattern.focusStruggleCount;
  return Math.max(2, Math.min(MAX_ECHO_MARKS, raw));
}

const PatternRow = memo(function PatternRow({ pattern }: { pattern: StrugglePattern }) {
  useThemeSubscription();

  const accent = accentFor(pattern.kind);
  const title = patternTitle(pattern);
  const fact = patternSupportingFact(pattern);
  const chronologyLabel = patternChronologyLabel(pattern);

  const spokenChronology =
    pattern.recentOutcomes.length > 0
      ? `${chronologyLabel}: ${pattern.recentOutcomes
          .map((outcome, index) => `${index + 1}. ${patternOutcomeLabel(outcome)}`)
          .join(", ")}`
      : null;

  return (
    <View style={styles.row}>
      {/* Decorative echo marks — the sense of repetition, not its measurement. */}
      <View
        style={styles.echo}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: echoCount(pattern) }, (_, index) => (
          <View
            key={index}
            style={[
              styles.echoMark,
              { backgroundColor: accent, opacity: 1 - index * 0.18 },
            ]}
          />
        ))}
      </View>

      <View
        style={styles.content}
        accessible
        // Read in the required order: subject/topic, pattern, evidence, then
        // the bounded chronology.
        accessibilityLabel={joinSpokenLabel([
          `${pattern.subject}, ${pattern.topic}`,
          title,
          fact,
          spokenChronology,
        ])}
      >
        <Text style={styles.subject}>{pattern.subject}</Text>
        <Text style={styles.topic}>{pattern.topic}</Text>

        <View style={styles.titleRow}>
          <Ionicons name={KIND_ICON[pattern.kind]} size={iconSize.xs} color={accent} />
          <Text style={[styles.patternTitle, { color: accent }]}>{title}</Text>
        </View>

        <Text style={styles.fact}>{fact}</Text>

        {chronologyLabel ? (
          <View style={styles.chronology}>
            {/* Scoped wording: this comes from a bounded window, so it says
                "recent records" and never "always" or "your whole history". */}
            <Text style={styles.chronologyLabel}>{chronologyLabel}</Text>
            <View style={styles.outcomeRow}>
              {pattern.recentOutcomes.map((outcome, index) => (
                <View key={`${pattern.id}-${index}`} style={styles.outcomeStep}>
                  {index > 0 ? <Text style={styles.arrow}>→</Text> : null}
                  <Text
                    style={[
                      styles.outcomeLabel,
                      outcome === "solved"
                        ? styles.outcomeSolved
                        : outcome === "struggled"
                          ? styles.outcomeStruggled
                          : styles.outcomeAgain,
                    ]}
                  >
                    {patternOutcomeLabel(outcome)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
});

export const StrugglePatternListView = memo(function StrugglePatternListView({
  patterns,
}: StrugglePatternListViewProps) {
  useThemeSubscription();
  return (
    <View style={styles.wrapper}>
      {patterns.map((pattern) => (
        <PatternRow key={pattern.id} pattern={pattern} />
      ))}
    </View>
  );
});

const styles = themedStyles(() => ({
  wrapper: {
    width: "100%",
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.md,
  },
  echo: {
    width: 10,
    paddingTop: spacing.xxs,
    gap: 3,
  },
  echoMark: {
    width: 10,
    height: 4,
    borderRadius: radius.pill,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  subject: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  topic: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  titleRow: {
    flexDirection: "row",
    // Anchored to the FIRST line, not centred and not wrapping: a long title
    // wrapping to two lines was pushing the icon onto a line of its own.
    alignItems: "flex-start",
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  patternTitle: {
    ...typography.bodyStrong,
    // Takes the remaining width so the title wraps within itself while the
    // icon stays put beside its first line.
    flex: 1,
  },
  fact: {
    ...typography.body,
    color: colors.textSecondary,
  },
  chronology: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.xxs,
  },
  chronologyLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  outcomeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xxs,
  },
  outcomeStep: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  arrow: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  outcomeLabel: {
    ...typography.caption,
  },
  outcomeSolved: {
    color: colors.success,
  },
  outcomeStruggled: {
    color: colors.danger,
  },
  outcomeAgain: {
    color: colors.textSecondary,
  },
}));
