import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { FormError } from "@components/ui/FormError";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { StudyOutcome } from "../domain/studyTypes";
import { OUTCOME_OPTIONS } from "../services/studyPresentation";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface StudyOutcomeButtonsProps {
  onSelect: (outcome: StudyOutcome) => void;
  pendingOutcome: StudyOutcome | null;
  lastOutcome: StudyOutcome | null;
  error?: string | null;
  title?: string;
  // Phase 18 (scroll-first) — the class feed only ever offers two of the
  // three outcomes (no "Tekrar Et"/"again": a one-handed swipe surface has
  // no room for a third choice, and "again"'s 10-minute same-session
  // reshow doesn't fit a feed the student is continuously scrolling
  // through anyway). Filters OUTCOME_OPTIONS rather than the caller
  // picking outcomes ad hoc, so button ORDER stays governed by the one
  // shared list. Omitting it renders all three, unchanged from every
  // existing surface (Question surfaces removed this control entirely —
  // see QuestionDetailScreen; Review Queue and the Study dashboard still
  // want the full set).
  visibleOutcomes?: readonly StudyOutcome[];
}

// The three-way self-assessment control, used identically wherever a
// student can review a question (question detail today, the queue screen,
// any future surface) so the interaction never differs by context.
//
// Deliberately self-assessment: this app has no answer key, so claiming the
// system "knows" a student was right would be a lie. The student reports.
export const StudyOutcomeButtons = memo(function StudyOutcomeButtons({
  onSelect,
  pendingOutcome,
  lastOutcome,
  error,
  title = "Bu soruyu nasıl çözdün?",
  visibleOutcomes,
}: StudyOutcomeButtonsProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  const isBusy = pendingOutcome !== null;
  const options = visibleOutcomes
    ? OUTCOME_OPTIONS.filter((option) => visibleOutcomes.includes(option.outcome))
    : OUTCOME_OPTIONS;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.row}>
        {options.map((option) => {
          const isSelected = lastOutcome === option.outcome;
          const isPending = pendingOutcome === option.outcome;
          return (
            <AnimatedPressable
              key={option.outcome}
              onPress={() => onSelect(option.outcome)}
              disabled={isBusy}
              style={[styles.button, isSelected ? styles.buttonSelected : null]}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityHint={option.accessibilityHint}
              // State is announced, not conveyed by colour alone.
              accessibilityState={{ selected: isSelected, disabled: isBusy, busy: isPending }}
            >
              {/* The label stays mounted while busy so the button cannot
                  resize mid-request. */}
              <View style={[styles.buttonContent, isPending ? styles.hidden : null]}>
                <Ionicons
                  name={option.icon}
                  size={18}
                  color={isSelected ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[styles.buttonLabel, isSelected ? styles.buttonLabelSelected : null]}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
              </View>
              {isPending ? (
                <View style={styles.spinnerOverlay} pointerEvents="none">
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : null}
            </AnimatedPressable>
          );
        })}
      </View>

      <FormError message={error ?? null} />
    </View>
  );
});

const styles = themedStyles(() => ({
  container: {
    gap: spacing.xs,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  row: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  button: {
    // flex + minWidth:0 so three Turkish labels share a narrow phone width
    // without overflowing.
    flex: 1,
    minWidth: 0,
    minHeight: minTouchTarget,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxs,
  },
  buttonSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
  },
  hidden: {
    opacity: 0,
  },
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  buttonLabelSelected: {
    color: colors.primary,
    fontWeight: "700",
  },
}));
