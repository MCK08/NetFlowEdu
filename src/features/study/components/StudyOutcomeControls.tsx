import { memo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Badge } from "@components/ui/Badge";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { StudyOutcome } from "../domain/studyTypes";
import { HydratedStudyItem } from "../services/studyItemParser";
import { summarizeStudyState } from "../services/studyStatePresentation";
import { StudyOutcomeButtons } from "./StudyOutcomeButtons";

interface StudyOutcomeControlsProps {
  item: HydratedStudyItem | null;
  isHydrating: boolean;
  hydrationError?: string | null;
  pendingOutcome: StudyOutcome | null;
  onSelect: (outcome: StudyOutcome) => void;
  mutationError?: string | null;
  now?: number;
  // Whether the student's PREVIOUS answer is shown pre-selected.
  //
  // True on a question surface: the highlight reads as "this is what you last
  // told us about this question", which is the whole point of hydrating.
  //
  // False in a review session, where the student is being asked to judge the
  // question right now — a highlighted button there reads as "you already
  // answered, the screen is stuck". The information is not lost: the status
  // badge and next-review line above still say where the question stands, in
  // the same words every other surface uses. An explicit flag, so the two
  // behaviours are a decision rather than a divergence nobody noticed.
  showLastOutcome?: boolean;
  // The class feed renders this over a dark scrim on top of the question
  // image. The buttons and the status badge are opaque light pills and read
  // fine there, but the secondary text is colors.textTertiary (#8A8F98) —
  // a light-theme grey chosen for white backgrounds. Left as-is it was the
  // only low-contrast text on that screen, sitting next to captions and
  // timestamps that use white. Switches just those three labels.
  onDarkSurface?: boolean;
}

// The full self-assessment control INCLUDING current state — the single
// component every surface uses (question detail, class feed, review queue),
// so the interaction and the wording can never differ by context.
//
// Shows the student where this question actually stands (plan membership,
// status, next review) instead of always starting blank, which was the
// Phase 16 gap: the buttons rendered with lastOutcome=null on every open
// even for a question already mastered.
export const StudyOutcomeControls = memo(function StudyOutcomeControls({
  item,
  isHydrating,
  hydrationError,
  pendingOutcome,
  onSelect,
  mutationError,
  now = Date.now(),
  showLastOutcome = true,
  onDarkSurface = false,
}: StudyOutcomeControlsProps) {
  const summary = summarizeStudyState(item, now);
  // Same opacity/weight, readable tone. textInverse is the exact white the
  // surrounding feed captions and timestamps already use.
  const secondaryText = onDarkSurface ? styles.secondaryOnDark : null;

  return (
    <View style={styles.container}>
      <View style={styles.stateRow}>
        {isHydrating ? (
          // Fixed-height row so hydrating -> loaded causes no layout shift.
          <View style={styles.hydratingRow} accessibilityRole="progressbar">
            <ActivityIndicator
              size="small"
              color={onDarkSurface ? colors.textInverse : colors.textTertiary}
            />
            <Text style={[styles.hydratingText, secondaryText]}>Durum yükleniyor…</Text>
          </View>
        ) : (
          <View style={styles.loadedRow} accessible accessibilityLabel={summary.accessibilityLabel}>
            <Badge
              label={summary.statusLabel}
              variant={item?.status === "mastered" ? "success" : item ? "primary" : "neutral"}
            />
            {summary.scheduleLabel ? (
              <Text style={[styles.scheduleText, secondaryText]} numberOfLines={1}>
                {summary.scheduleLabel}
              </Text>
            ) : null}
          </View>
        )}
      </View>

      {/* A hydration failure must never block recording an outcome — the
          student can still study; they just don't see prior state. */}
      {hydrationError ? (
        <Text style={[styles.hydrationError, secondaryText]}>{hydrationError}</Text>
      ) : null}

      <StudyOutcomeButtons
        onSelect={onSelect}
        pendingOutcome={pendingOutcome}
        lastOutcome={showLastOutcome ? (item?.lastOutcome ?? null) : null}
        error={mutationError ?? null}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  stateRow: {
    minHeight: 24,
    justifyContent: "center",
  },
  hydratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  hydratingText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  loadedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  scheduleText: {
    ...typography.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  hydrationError: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  secondaryOnDark: {
    color: colors.textInverse,
    opacity: 0.85,
  },
});
