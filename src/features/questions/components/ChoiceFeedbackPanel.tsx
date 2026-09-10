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

import { ChoiceFeedbackEntry } from "../services/choiceFeedback";

// Phase 77 — what the author says a particular wrong option suggests the
// student should reconsider.
//
// WHAT IT IS NOT
//
// Not a diagnosis. The sentence on screen is the author's description of an
// OPTION, shown because the student picked that option — not a claim about the
// student. So the copy is anchored to the answer ("Bu seçenekte…"), never to
// the learner ("Sen şunu bilmiyorsun"), and nothing here is generated,
// rewritten or inferred. If the author attached nothing, this renders nothing;
// there is no fallback sentence, because a fabricated reason is the one
// failure this whole feature exists to avoid.
//
// Not a second screen and not a chat. No avatar, no speech bubble, no "AI
// says". It sits between the result and the rating, inside the flow the
// student is already in.
//
// WHY IT IS NOT RED
//
// The result banner above has already said the answer was wrong; that is the
// correctness channel and it owns the danger colour. Repeating it here in a
// bigger red panel would turn a correction into a scolding, and the student
// would read the tone before the sentence.
//
// So this panel belongs to the INSTRUCTIONAL family instead, and uses
// `primary` — the exact token the hint ladder uses — rather than `accent`,
// which the palette defines as the notification/like badge red (#FF3B5C).
// Tried that first and it was wrong on screen: a second red block directly
// under a red banner reads as one long alarm, whatever the words say.
//
// It stays distinguishable from a hint rather than identical to one: a hint
// is a filled blue block ABOVE the choices (help you asked for, before
// answering), this is a neutral surface with a blue rule BELOW the result
// (a response to what you actually chose). Same family, different jobs.
//
// Meaning never rests on colour alone: the heading names what this is, the
// icon reinforces it, and the connector shows the relationship between the
// choice and the redirection.

interface ChoiceFeedbackPanelProps {
  /** Non-null only after an answer has been committed — the caller resolves
   *  this with resolveChoiceFeedback and passes null when there is nothing
   *  authored, so this component never has to guess. */
  feedback: ChoiceFeedbackEntry | null;
}

export const ChoiceFeedbackPanel = memo(function ChoiceFeedbackPanel({
  feedback,
}: ChoiceFeedbackPanelProps) {
  // Phase 49 — memo() blocks prop-driven re-renders but not context updates.
  useThemeSubscription();

  if (!feedback) return null;

  return (
    <View style={styles.wrapper}>
      {/* The connector carries the "your choice → reconsider this" idea
          structurally, so the relationship survives without colour and
          without a paragraph explaining it. Decorative only: the text below
          is announced, this is not. */}
      <View style={styles.connector} importantForAccessibility="no-hide-descendants">
        <View style={styles.connectorLine} />
      </View>

      <View
        style={styles.panel}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Yeniden düşün. ${feedback.text}`}
      >
        <View style={styles.header}>
          <Ionicons name="compass-outline" size={iconSize.sm} color={colors.primary} />
          <Text style={styles.headerText}>Yeniden düşün</Text>
        </View>
        <Text style={styles.body}>{feedback.text}</Text>
      </View>
    </View>
  );
});

const styles = themedStyles(() => ({
  wrapper: {
    width: "100%",
  },
  connector: {
    // A short tether from the result above, offset to sit under the result
    // banner's own left edge rather than centred, so it reads as "this
    // follows from that" instead of as a divider.
    height: spacing.sm,
    paddingLeft: spacing.md,
    justifyContent: "center",
  },
  connectorLine: {
    width: 2,
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  panel: {
    gap: spacing.xxs,
    backgroundColor: colors.surfaceMuted,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    // Wraps rather than clipping once text scales up.
    flexWrap: "wrap",
  },
  headerText: {
    ...typography.label,
    color: colors.primary,
  },
  body: {
    ...typography.body,
    color: colors.textPrimary,
  },
}));
