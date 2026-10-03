import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

import { ASSIGNMENT_INSTRUCTION_TITLE, AssignmentSessionIdentity } from "../services/assignmentSessionPresentation";

interface AssignmentSessionContextProps {
  identity: AssignmentSessionIdentity;
  /** "5 soru" or "2 / 5 tamamlandı" — see assignmentSessionProgressLabel. */
  progressLabel: string;
}

// Phase 130 — which assignment this is, read top to bottom: the title, what
// it covers, whose class it belongs to, when it is due, how much of it there
// is, and the teacher's own note. Shown before the first question of an
// assignment the student has not started, and from the session header's
// "Çalışma bilgileri" at any point after that — so the instruction is never
// something a student saw once and lost.
//
// Every line wraps; nothing is cut to a line count. Every icon is decorative:
// the sentence beside it carries the meaning, so colour never does.
export function AssignmentSessionContext({ identity, progressLabel }: AssignmentSessionContextProps) {
  useThemeSubscription();
  return (
    <View style={styles.container}>
      <View style={styles.identity}>
        <Text style={styles.title} accessibilityRole="header">
          {identity.title}
        </Text>
        {identity.subjectLine ? <Text style={styles.subject}>{identity.subjectLine}</Text> : null}
        {identity.contextLine ? <Text style={styles.context}>{identity.contextLine}</Text> : null}
      </View>

      <View style={styles.facts}>
        {identity.dueLabel ? (
          <View style={styles.fact}>
            <Ionicons
              name={identity.isPastDue ? "alert-circle-outline" : "calendar-outline"}
              size={iconSize.sm}
              color={identity.isPastDue ? colors.danger : colors.textSecondary}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={[styles.factText, identity.isPastDue ? styles.factTextDanger : null]}>
              {identity.dueLabel}
            </Text>
          </View>
        ) : null}
        <View style={styles.fact}>
          <Ionicons
            name="documents-outline"
            size={iconSize.sm}
            color={colors.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={styles.factText}>{progressLabel}</Text>
        </View>
      </View>

      {identity.instruction ? (
        <View style={styles.instruction}>
          <Text style={styles.instructionTitle} accessibilityRole="header">
            {ASSIGNMENT_INSTRUCTION_TITLE}
          </Text>
          <Text style={styles.instructionText}>{identity.instruction}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  container: {
    gap: spacing.lg,
  },
  identity: {
    gap: spacing.xxs,
  },
  title: {
    ...typography.screenTitleSm,
    color: colors.textPrimary,
  },
  subject: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
  context: {
    ...typography.body,
    color: colors.textSecondary,
  },
  facts: {
    gap: spacing.xs,
  },
  // Top-aligned so the mark stays beside the first line when the text wraps.
  fact: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  factText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flexShrink: 1,
    minWidth: 0,
  },
  factTextDanger: {
    color: colors.danger,
  },
  // Calm, not a warning: the same muted panel the teacher's draft notice uses.
  instruction: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  instructionTitle: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  instructionText: {
    ...typography.body,
    color: colors.textPrimary,
  },
}));
