import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, useWindowDimensions, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { StatusLabel } from "@components/ui/StatusLabel";
import { studentAssignmentStatusGlyph } from "@features/teacher/services/statusGlyphs";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget, stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { StudentAssignmentRow, studentAssignmentStatusLabel } from "../services/teacherAssignmentProgress";

interface AssignmentStudentRowProps {
  row: StudentAssignmentRow;
  targetCount: number;
  onOpen: (row: StudentAssignmentRow) => void;
}

// Phase 128 — one targeted student's response to this assignment.
//
// What the product actually knows: the canonical status and how many of the
// assigned questions the student has completed. No score, no time taken, no
// comparison with anyone else. The row opens that student's canonical
// performance screen (Phase 124) — the place their real per-question evidence
// already lives — rather than a second, assignment-shaped copy of it.
//
// It used to be a static card with the name capped at one line, so a real
// Turkish name was truncated and the teacher could see a student was behind
// but not go and look.
export const AssignmentStudentRow = memo(function AssignmentStudentRow({
  row,
  targetCount,
  onOpen,
}: AssignmentStudentRowProps) {
  useThemeSubscription();
  const { fontScale } = useWindowDimensions();
  // Past the accessibility sizes the name, the status and the count cannot
  // share a line without breaking a word; they take the width in turn.
  const stacked = fontScale >= stackAtFontScale;
  const glyph = studentAssignmentStatusGlyph(row.status);
  const status = studentAssignmentStatusLabel(row.status);
  const progress = `${row.completedCount} / ${targetCount} soru`;

  return (
    <AnimatedPressable
      onPress={() => onOpen(row)}
      style={[styles.row, stacked ? styles.rowStacked : null]}
      accessibilityRole="button"
      accessibilityLabel={`${row.displayName}. ${status}. ${progress}`}
      accessibilityHint="Öğrencinin performans ekranını açar"
    >
      <View style={styles.body}>
        <Text style={styles.name}>{row.displayName}</Text>
        <View style={[styles.meta, stacked ? styles.metaStacked : null]}>
          <StatusLabel icon={glyph.icon} tone={glyph.tone} textStyle={styles.status}>
            {status}
          </StatusLabel>
          <Text style={styles.progress}>{progress}</Text>
        </View>
      </View>
      {/* Decorative: the row's hint says what it opens. Dropped once the row
          stacks, where it would sit alone beside a column of text. */}
      {stacked ? null : (
        <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
      )}
    </AnimatedPressable>
  );
});

const styles = themedStyles(() => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  rowStacked: {
    alignItems: "flex-start",
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: spacing.sm,
    rowGap: spacing.xxs,
  },
  metaStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  status: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  progress: {
    ...typography.caption,
    color: colors.textTertiary,
  },
}));
