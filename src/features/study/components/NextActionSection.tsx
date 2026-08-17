import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { StudentNextAction, StudentNextActionKind } from "../services/studentNextAction";
import { nextActionCopy } from "../services/studyPresentation";

interface NextActionSectionProps {
  action: StudentNextAction;
  // A single callback, deliberately — the CALLER re-resolves the action
  // against a fresh clock at press time and routes from THAT, never from
  // the snapshot this component happens to be rendering. Same contract
  // DailyPracticePlanSection's own onStart already uses, and for the same
  // reason: a stale render may show the wrong sentence for a moment, but it
  // must never be able to open the wrong screen.
  onStart: () => void;
}

// One icon per action kind. Never the ONLY carrier of meaning — the label,
// title and detail all say the same thing in words (the icon is marked
// decorative for screen readers accordingly).
const ICONS: Record<StudentNextActionKind, keyof typeof Ionicons.glyphMap> = {
  continue_assignment: "clipboard-outline",
  due_review: "alert-circle",
  struggled_topic: "flame",
  adaptive_practice: "flame",
  goal_fill: "arrow-forward-circle",
  no_action: "checkmark-circle-outline",
};

const COLORS: Record<StudentNextActionKind, string> = {
  continue_assignment: colors.danger,
  due_review: colors.danger,
  struggled_topic: colors.primary,
  adaptive_practice: colors.primary,
  goal_fill: colors.textSecondary,
  no_action: colors.textTertiary,
};

// "Şimdi Ne Yapmalısın?" — the Hub's single headline answer. Deliberately
// NOT a replacement for "Bugünkü Plan" below it: this card names the one
// next step and why, the plan stays the day's full breakdown. Same Card /
// SectionHeader / PrimaryButton vocabulary as every sibling section, so it
// reads as part of the existing Hub rather than a new design.
//
// Unlike its siblings this section never hides itself. "Nothing to do" is a
// real, useful answer to the question it asks — silently disappearing is
// exactly the gap it exists to close (the plan card vanishes the moment the
// daily goal is met, see dailyPracticePlan.ts's remainingGoal cap).
export const NextActionSection = memo(function NextActionSection({
  action,
  onStart,
}: NextActionSectionProps) {
  const copy = nextActionCopy(action, Date.now());
  const icon = ICONS[action.kind];
  const tint = COLORS[action.kind];

  return (
    <View style={styles.container}>
      <SectionHeader title="Şimdi Ne Yapmalısın?" />
      <Card style={styles.card}>
        <View
          style={styles.row}
          accessible
          accessibilityLabel={`${copy.label}. ${copy.title}. ${copy.detail}.`}
        >
          <Ionicons name={icon} size={22} color={tint} accessibilityElementsHidden />
          <View style={styles.text}>
            <Text style={[styles.label, { color: tint }]}>{copy.label}</Text>
            <Text style={styles.title} numberOfLines={2}>
              {copy.title}
            </Text>
            <Text style={styles.detail}>{copy.detail}</Text>
          </View>
        </View>

        {copy.cta ? (
          <PrimaryButton
            label={copy.cta}
            onPress={onStart}
            accessibilityHint="Önerilen çalışmayı açar"
          />
        ) : null}
      </Card>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  card: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    ...typography.caption,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  detail: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
