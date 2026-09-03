import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import {
  hasHints,
  hintActionLabel,
  hintLabel,
  nextRevealCount,
} from "../services/questionHints";

// Phase 72 — the progressive hint ladder, inside the question the student is
// working on.
//
// WHAT IT IS NOT
//
// Not an answer button. Opening a hint selects nothing, submits nothing,
// reveals no correctChoice and records no outcome — this component holds one
// number in local state and renders authored strings. Everything the student
// sees was typed by the question's author; nothing here generates content.
//
// WHY LOCAL STATE
//
// The reveal depth is not evidence. Asking for help is not the same as
// struggling, so it is deliberately not persisted, not counted, and not fed to
// Phase 41/42, the scheduler or adaptive ranking. It resets on remount, and
// the student simply reopens what they need.
//
// PROGRESSION, NOT DECORATION
//
// Earlier rungs stay visible when a later one opens, because the ladder IS the
// support: seeing hint 1 beside hint 2 is what makes the second one land.
// Progression reads from the numbers, never from fading earlier hints out —
// dimming them would make the most-read text the least legible.

interface QuestionHintLadderProps {
  hints: readonly string[];
}

export const QuestionHintLadder = memo(function QuestionHintLadder({
  hints,
}: QuestionHintLadderProps) {
  // Phase 49 — memo() blocks prop-driven re-renders but not context updates.
  useThemeSubscription();
  const [revealed, setRevealed] = useState(0);

  const handleReveal = useCallback(() => {
    setRevealed((current) => nextRevealCount(hints, current));
  }, [hints]);

  // A question with no authored support renders nothing at all — no disabled
  // button, and no "this question has no hints" explanation, which would tell
  // the student about our schema rather than about their learning.
  if (!hasHints(hints)) return null;

  const actionLabel = hintActionLabel(hints, revealed);
  const opened = hints.slice(0, revealed);

  return (
    <View style={styles.wrapper}>
      {opened.length > 0 ? (
        <View style={styles.ladder}>
          {opened.map((hint, index) => (
            <View key={index} style={styles.rung}>
              <View style={styles.marker}>
                <Text style={styles.markerText}>{index + 1}</Text>
              </View>
              <View style={styles.rungBody} accessible accessibilityLabel={`${hintLabel(index)}. ${hint}`}>
                <Text style={styles.rungLabel}>{hintLabel(index)}</Text>
                <Text style={styles.rungText}>{hint}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {actionLabel ? (
        <Pressable
          onPress={handleReveal}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityHint="Sorunun cevabını göstermez"
          style={styles.action}
        >
          <Ionicons name="bulb-outline" size={iconSize.sm} color={colors.primary} />
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = themedStyles(() => ({
  wrapper: {
    width: "100%",
    gap: spacing.xs,
  },
  ladder: {
    gap: spacing.xs,
  },
  rung: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  marker: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  markerText: {
    ...typography.label,
    color: colors.textInverse,
  },
  rungBody: {
    flex: 1,
    gap: 2,
  },
  rungLabel: {
    ...typography.caption,
    color: colors.primary,
  },
  rungText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    minHeight: minTouchTarget,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  actionText: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
}));
