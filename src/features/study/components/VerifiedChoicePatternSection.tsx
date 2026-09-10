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

import {
  CHOICE_RECOVERY_LABEL,
  choicePatternEvidence,
  choicePatternFact,
  choiceRecoveryFact,
  VerifiedChoicePattern,
} from "../services/verifiedChoicePatterns";

// Phase 78 — repeated authored selection meanings, rendered once for both
// audiences.
//
// ONE COMPONENT, TWO READERS
//
// The student and the teacher are shown the same verified facts, because they
// ARE the same facts — the teacher already has authorised access to this
// student's learning evidence, and giving them a second, differently-worded
// view of one dataset is how two surfaces start disagreeing. Only the lead-in
// sentence differs, and it is passed in.
//
// WHY IT DOES NOT LOOK LIKE AN ERROR REPORT
//
// No red card, no warning triangle, no count-up of mistakes. A repeated
// selection is a thing worth noticing, not a verdict on the learner, and the
// visual weight is set accordingly: a neutral surface, one brand-blue
// convergence mark, and text doing the work. The one accent used is
// deliberately not `danger` — this is not a failure state.
//
// THE MOTIF
//
// Each pattern shows its contributing questions as small markers converging on
// a single line. That is the literal claim being made: separate questions,
// one recorded meaning. It is decorative and hidden from assistive technology;
// the sentence beside it says the same thing in words.
//
// PHASE 79 — THE SECOND HALF OF THE STORY
//
// A pattern can now carry evidence of what happened AFTER it: the same trap
// offered again on other questions, and not taken. That is rendered as a
// continuation of the same row rather than a separate badge, because it is the
// same evidence trail moving forward — the convergence mark gains an onward
// step, and one more sentence appears beneath the first.
//
// It is deliberately NOT a success state. No trophy, no green tick, no
// percentage, and the accent stays the same brand blue the rest of the row
// uses. The strongest thing on screen is a sentence saying the option was not
// re-selected, because that is the strongest thing the evidence supports.
//
// WHAT IS NEVER RENDERED
//
// The conceptKey and the author's uid. They exist so occurrences can be
// grouped without guessing; they are internal vocabulary, not something a
// learner should read, and they appear in no label, no hint and no test id.

interface VerifiedChoicePatternSectionProps {
  patterns: readonly VerifiedChoicePattern[];
  /** The one sentence that differs by audience. */
  intro: string;
  /** Optional heading; omitted where the surrounding screen already provides
   *  one at the right level. */
  title?: string;
  compact?: boolean;
}

export const VerifiedChoicePatternSection = memo(function VerifiedChoicePatternSection({
  patterns,
  intro,
  title,
  compact = false,
}: VerifiedChoicePatternSectionProps) {
  // Phase 49 — memo() blocks prop-driven re-renders but not context updates.
  useThemeSubscription();
  if (patterns.length === 0) return null;

  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <Text style={styles.intro}>{intro}</Text>

      {patterns.map((pattern) => (
        <View
          key={pattern.id}
          style={[styles.row, compact ? styles.rowCompact : null]}
          accessible
          // Read in the order a sighted reader takes it: what area, what
          // repeated, and on how much evidence. The convergence marks add
          // nothing here — they are the same fact drawn.
          // Read in the order a sighted reader takes it: what area, what
          // repeated, on how much evidence, and only then what has happened
          // since. The state is carried by these words, never by the accent.
          accessibilityLabel={[
            `${pattern.subject}, ${pattern.topic}.`,
            choicePatternFact(pattern),
            `${choicePatternEvidence(pattern)}.`,
            pattern.recovery
              ? `${CHOICE_RECOVERY_LABEL}. ${choiceRecoveryFact(pattern.recovery)}`
              : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <View style={styles.markerColumn} accessibilityElementsHidden importantForAccessibility="no">
            <Converge
              count={pattern.distinctQuestionCount}
              onward={pattern.recovery !== null}
            />
          </View>

          <View style={styles.body}>
            <Text style={styles.scope} numberOfLines={2}>
              {pattern.subject} · {pattern.topic}
            </Text>
            <Text style={styles.fact}>{choicePatternFact(pattern)}</Text>
            <Text style={styles.evidence}>{choicePatternEvidence(pattern)}</Text>

            {pattern.recovery ? (
              // A continuation, not a verdict: the divider and the inset say
              // "and then this happened", which is exactly the claim.
              <View style={styles.recovery}>
                <View
                  style={styles.recoveryRule}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <View style={styles.recoveryHead}>
                  <Ionicons
                    name="arrow-forward-outline"
                    size={iconSize.xs}
                    color={colors.primary}
                    accessibilityElementsHidden
                  />
                  <Text style={styles.recoveryLabel}>{CHOICE_RECOVERY_LABEL}</Text>
                </View>
                <Text style={styles.fact}>{choiceRecoveryFact(pattern.recovery)}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
});

// Separate question markers meeting one line. Capped so a wide pattern stays a
// motif rather than becoming a chart.
const MAX_MARKERS = 4;

function Converge({ count, onward }: { count: number; onward: boolean }) {
  const markers = Math.min(Math.max(count, 2), MAX_MARKERS);
  return (
    <View style={styles.converge}>
      <View style={styles.markerStack}>
        {Array.from({ length: markers }, (_, index) => (
          <View key={index} style={styles.marker} />
        ))}
      </View>
      <View style={styles.convergeLine} />
      <Ionicons name="git-merge-outline" size={iconSize.xs} color={colors.primary} />
      {/* Phase 79 — the evidence continues past the pattern. A short onward
          stroke and a filled endpoint, not a badge: the trail moved forward,
          it did not finish. */}
      {onward ? (
        <>
          <View style={styles.convergeLine} />
          <View style={styles.onwardPoint} />
        </>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  intro: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowCompact: {
    padding: spacing.sm,
  },
  markerColumn: {
    paddingTop: 2,
  },
  converge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  markerStack: {
    gap: 3,
  },
  marker: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  convergeLine: {
    width: 8,
    height: 1,
    backgroundColor: colors.border,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  onwardPoint: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  recovery: {
    gap: 2,
    paddingTop: spacing.xs,
  },
  recoveryRule: {
    height: 1,
    backgroundColor: colors.divider,
    marginBottom: spacing.xxs,
  },
  recoveryHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  recoveryLabel: {
    ...typography.label,
    color: colors.primary,
    letterSpacing: 0.4,
    flex: 1,
    minWidth: 0,
  },
  scope: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  fact: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  evidence: {
    ...typography.caption,
    color: colors.textTertiary,
  },
}));
