import { memo } from "react";
import { Text, View } from "react-native";

import { StatusLabel, statusToneColor } from "@components/ui/StatusLabel";
import { studentAssignmentStatusGlyph } from "@features/teacher/services/statusGlyphs";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { StudentAssignmentStatus } from "../services/assignmentProgress";
import { studentAssignmentStatusLabel } from "../services/teacherAssignmentProgress";

interface AssignmentResponseSummaryProps {
  totalStudents: number;
  counts: Record<StudentAssignmentStatus, number>;
  /** Whether the assignment has a deadline at all. Without one "Süresi geçti"
   *  can never happen, so a row for it would only ever read zero. */
  hasDeadline: boolean;
}

// Phase 128 — "who has answered", in the product's own states.
//
// Every number is a count of targeted students in ONE canonical status
// (resolveStudentAssignmentStatus): completion outranks a missed deadline, a
// student is in exactly one state, and so the rows always add up to the total
// above them. No percentage, no "başarı", no average — the fraction says the
// one thing a teacher opens this to learn, and the bar is that same fraction
// drawn, with the fraction itself as its spoken value.
const ORDER: readonly StudentAssignmentStatus[] = ["completed", "in_progress", "not_started", "past_due"];

export const AssignmentResponseSummary = memo(function AssignmentResponseSummary({
  totalStudents,
  counts,
  hasDeadline,
}: AssignmentResponseSummaryProps) {
  useThemeSubscription();
  const completed = counts.completed;
  const fraction = totalStudents > 0 ? completed / totalStudents : 0;
  const headline = `${completed} / ${totalStudents} tamamladı`;
  const rows = ORDER.filter((status) => status !== "past_due" || hasDeadline);

  return (
    <View style={styles.card}>
      <Text style={styles.headline}>{headline}</Text>
      <View
        style={styles.track}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Tamamlayan öğrenciler"
        accessibilityValue={{ min: 0, max: totalStudents, now: completed, text: headline }}
      >
        <View
          style={[
            styles.fill,
            { width: `${Math.round(fraction * 100)}%`, backgroundColor: statusToneColor("success") },
          ]}
        />
      </View>
      <View style={styles.rows}>
        {rows.map((status) => {
          const glyph = studentAssignmentStatusGlyph(status);
          const label = studentAssignmentStatusLabel(status);
          return (
            <View
              key={status}
              style={styles.row}
              accessible
              accessibilityLabel={`${counts[status]} öğrenci, ${label}`}
            >
              <StatusLabel icon={glyph.icon} tone={glyph.tone} textStyle={styles.rowLabel} style={styles.rowLabelWrap}>
                {label}
              </StatusLabel>
              <Text style={styles.rowCount}>{counts[status]}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});

const styles = themedStyles(() => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headline: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  rows: {
    gap: spacing.xs,
  },
  // Label and count share a line and wrap rather than truncate: the count is
  // a short number, the label takes whatever is left.
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowLabelWrap: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  rowCount: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
}));
