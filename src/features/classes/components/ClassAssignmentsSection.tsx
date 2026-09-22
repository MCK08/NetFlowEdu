import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Card } from "@components/ui/Card";
import type { Assignment } from "@features/assignments/domain/assignmentTypes";
import { assignmentDueLabel, resolveAssignmentUrgency } from "@features/assignments/services/assignmentUrgency";
import { colors } from "@theme/colors";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

export const CLASS_ASSIGNMENTS_TITLE = "Sınıfın Ödevleri";

interface ClassAssignmentsSectionProps {
  /** Already selected by selectClassAssignments — this component applies no
   *  rule of its own about which assignments a class has. */
  assignments: readonly Assignment[];
  /** One clock reading for the whole list, so two rows rendered in the same
   *  pass can never straddle a day boundary and disagree. */
  now: number;
}

// Phase 118 — the class's assignments, where the class is.
//
// They were already read here (useClassSocial has fetched them since Phase
// 110) and already spoken about — "Yeni bir ödev verildi" in Sınıf
// Etkinliği — but the work itself was never listed, so the only way to it
// from this screen was an activity line that scrolls away. This section
// costs no read: it renders the assignments the screen is already holding.
//
// Deliberately NOT called "Yaklaşan Ödevler", and deliberately carrying no
// completion state. Whether THIS student has finished an assignment lives in
// assignments/{id}/submissions/{uid} — one read per assignment — and Çalış's
// "Atanan Çalışmalar" is the surface that pays for it and shows it. A row
// here states what the teacher set and when it is due, which is the
// assignment's own document, and opens the canonical assignment screen where
// the student's real progress is.
//
// Which is also why a passed deadline is left unsaid here. "Süresi geçti" is
// true of the ASSIGNMENT, but on a row that cannot say whether this student
// finished it, it reads as a verdict on the student — and it was read that
// way on the simulator, above an assignment the student had in fact
// completed ("Ödev tamamlandı, 2 / 2"). A deadline still ahead is useful and
// carries no such claim, so that is the one this list states.
export const ClassAssignmentsSection = memo(function ClassAssignmentsSection({
  assignments,
  now,
}: ClassAssignmentsSectionProps) {
  useThemeSubscription();
  if (assignments.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title} accessibilityRole="header">
        {CLASS_ASSIGNMENTS_TITLE}
      </Text>
      <Card variant="outlined" style={styles.list}>
        {assignments.map((assignment, index) => {
          // Phase 39's label and Phase 39's own past-due test, so one
          // assignment can never carry two different deadlines in this app.
          const due =
            resolveAssignmentUrgency(assignment.dueAt, now) === "past_due"
              ? null
              : assignmentDueLabel(assignment.dueAt, now);
          const detail = [`${assignment.subject} · ${assignment.topic}`, due]
            .filter((part): part is string => Boolean(part))
            .join(" · ");

          return (
            <AnimatedPressable
              key={assignment.id}
              onPress={() =>
                router.push(`/(student)/assignment/${encodeURIComponent(assignment.id)}` as never)
              }
              style={[styles.row, index > 0 ? styles.rowDivider : null]}
              accessibilityRole="button"
              accessibilityLabel={`${assignment.title}. ${detail}.`}
              accessibilityHint="Ödevi açar"
            >
              {/* Decorative: the row's own label already reads the whole line. */}
              <Ionicons
                name="document-text-outline"
                size={iconSize.md}
                color={colors.primary}
                accessibilityElementsHidden
              />
              <View style={styles.text}>
                <Text style={styles.rowTitle}>{assignment.title}</Text>
                <Text style={styles.rowDetail}>{detail}</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={iconSize.sm}
                color={colors.textTertiary}
                accessibilityElementsHidden
              />
            </AnimatedPressable>
          );
        })}
      </Card>
    </View>
  );
});

const styles = themedStyles(() => ({
  section: {
    gap: spacing.xs,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  list: {
    paddingVertical: 0,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingVertical: spacing.sm,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  rowDetail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
}));
