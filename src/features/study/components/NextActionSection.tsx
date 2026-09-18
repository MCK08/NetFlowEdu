import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, View } from "react-native";

import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { StudentNextAction, StudentNextActionKind } from "../services/studentNextAction";
import { nextActionCopy } from "../services/studyPresentation";
import { useThemeSubscription } from "@theme/ThemeProvider";

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

// Phase 52 — a FUNCTION, not a module-scope constant. Read at import
// time this map froze on whichever palette happened to be active when
// the module first loaded, so it kept rendering light values in dark
// mode. Same freeze Phase 49/51 fixed for StyleSheet.create, in a
// plain object that the codemod never looked at.
function actionColors(): Record<StudentNextActionKind, string> {
  return {
    continue_assignment: colors.danger,
    due_review: colors.danger,
    struggled_topic: colors.primary,
    adaptive_practice: colors.primary,
    goal_fill: colors.textSecondary,
    no_action: colors.textTertiary,
  };
}

// "Şimdi Ne Yapmalısın?" — the Hub's single headline answer. Deliberately
// NOT a replacement for "Bugünkü Plan" below it: this card names the one
// next step and why, the plan stays the day's full breakdown.
//
// Phase 106 — the one card on the Hub allowed to be loud. It sits on the
// theme's blue-tinted panel (`primaryMuted`: the soft light-blue in Light,
// the elevated navy in Dark) so it reads as the focus of the page, with the
// action's mark in a tinted disc, the topic as a real title, and the CTA as
// the only filled button in the first screenful. Same copy, same routing,
// same "never hides itself" rule: "nothing to do" is a real, useful answer
// to the question it asks.
//
// Unlike its siblings this section never hides itself. "Nothing to do" is a
// real, useful answer to the question it asks — silently disappearing is
// exactly the gap it exists to close (the plan card vanishes the moment the
// daily goal is met, see dailyPracticePlan.ts's remainingGoal cap).
export const NextActionSection = memo(function NextActionSection({
  action,
  onStart,
}: NextActionSectionProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  const copy = nextActionCopy(action, Date.now());
  const icon = ICONS[action.kind];
  const tint = actionColors()[action.kind];

  return (
    <View style={styles.container}>
      <SectionHeader title="Şimdi Ne Yapmalısın?" />
      <View style={styles.card}>
        <View
          style={styles.row}
          accessible
          accessibilityLabel={`${copy.label}. ${copy.title}. ${copy.detail}.`}
        >
          <View style={styles.iconDisc}>
            <Ionicons name={icon} size={iconSize.md} color={tint} accessibilityElementsHidden />
          </View>
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
      </View>
    </View>
  );
});

const styles = themedStyles(() => ({
  container: {
    gap: spacing.xs,
  },
  card: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.xxl,
    padding: spacing.md,
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  iconDisc: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    ...typography.caption,
    fontWeight: "600",
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  detail: {
    ...typography.body,
    color: colors.textSecondary,
  },
}));
