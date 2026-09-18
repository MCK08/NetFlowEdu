import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Card } from "@components/ui/Card";
import { SectionHeader } from "@components/ui/SectionHeader";
import { StudentAssignmentCard } from "@features/assignments/hooks/useStudentAssignments";
import { StudentAssignmentStatus } from "@features/assignments/services/assignmentProgress";
import { assignmentDueLabel } from "@features/assignments/services/assignmentUrgency";
import { colors } from "@theme/colors";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface AssignedWorkSectionProps {
  cards: readonly StudentAssignmentCard[];
  onOpen: (assignmentId: string) => void;
}

// Phase 106 — the status of a row, in a word and a mark. Never colour alone:
// the word is what a screen reader gets and what a colour-blind reader
// keys on; the mark and tone only restate it. The statuses themselves are
// resolveStudentAssignmentStatus's, untouched.
function statusPresentation(status: StudentAssignmentStatus): {
  icon: keyof typeof Ionicons.glyphMap;
  word: string;
  tone: "success" | "danger" | "primary" | "muted";
} {
  switch (status) {
    case "completed":
      return { icon: "checkmark-circle", word: "Tamamlandı", tone: "success" };
    case "past_due":
      return { icon: "alert-circle-outline", word: "Süresi geçti", tone: "danger" };
    case "in_progress":
      return { icon: "play-circle-outline", word: "Devam ediyor", tone: "primary" };
    case "not_started":
    default:
      return { icon: "clipboard-outline", word: "Başlamadı", tone: "muted" };
  }
}

function toneColor(tone: "success" | "danger" | "primary" | "muted"): string {
  switch (tone) {
    case "success":
      return colors.success;
    case "danger":
      return colors.danger;
    case "primary":
      return colors.primary;
    case "muted":
      return colors.textTertiary;
  }
}

// "Atanan Çalışmalar" — never a second question-solving engine: opening a
// row goes to the existing StudySessionScreen (mode="assignment"), the same
// swipe-card/outcome-recording UI the adaptive round already uses. Hidden
// entirely when the student has no assignments at all, matching
// DailyPracticePlanSection/WeakTopicsSection's own "hide when empty"
// convention.
//
// Phase 106 — one grouped list instead of a card-and-button per assignment.
// Each row: the status mark, the title, subject · topic, and a progress
// line that carries the count, the deadline and the status WORD. The whole
// row is the button (it opens the same assignment "Devam Et" used to);
// finished work stays in the list, dimmed, so the student can see what they
// have done without it competing with what is left.
export const AssignedWorkSection = memo(function AssignedWorkSection({
  cards,
  onOpen,
}: AssignedWorkSectionProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  if (cards.length === 0) return null;

  // One clock reading for the whole list, so two cards rendered in the same
  // pass can never straddle a day boundary and disagree.
  const now = Date.now();

  return (
    <View style={styles.container}>
      <SectionHeader title="Atanan Çalışmalar" />
      <Card variant="outlined" style={styles.list}>
        {cards.map(({ assignment, submission, status }, index) => {
          const completedCount = submission?.completedCount ?? 0;
          // Phase 39 — shared with the "Şimdi Ne Yapmalısın?" card, so the
          // same assignment can never carry two different deadline labels
          // on the same screen (see assignmentUrgency.ts).
          const due = assignmentDueLabel(assignment.dueAt, now);
          const presentation = statusPresentation(status);
          const isCompleted = status === "completed";
          const progressLine = `${completedCount} / ${assignment.targetCount} tamamlandı`;
          // "Süresi geçti" is already the status word for past_due; do not
          // say it twice on one line.
          const detailLine = [progressLine, status !== "past_due" ? due : null, presentation.word]
            .filter((part): part is string => Boolean(part))
            .join(" · ");
          const tint = toneColor(presentation.tone);

          return (
            <AnimatedPressable
              key={assignment.id}
              onPress={() => onOpen(assignment.id)}
              style={[styles.row, index > 0 ? styles.rowDivider : null, isCompleted ? styles.rowCompleted : null]}
              accessibilityRole="button"
              accessibilityLabel={`${assignment.title}. ${assignment.subject}, ${assignment.topic}. ${detailLine}.`}
              accessibilityHint={isCompleted ? "Tamamlanan çalışmayı açar" : "Çalışmaya devam eder"}
            >
              {/* Decorative: the row's own label already speaks the status word. */}
              <Ionicons name={presentation.icon} size={iconSize.md} color={tint} accessibilityElementsHidden />
              <View style={styles.text}>
                <Text style={styles.title} numberOfLines={2}>
                  {assignment.title}
                </Text>
                <Text style={styles.subject} numberOfLines={1}>
                  {assignment.subject} · {assignment.topic}
                </Text>
                <Text style={[styles.progress, { color: isCompleted ? colors.textTertiary : tint }]}>
                  {detailLine}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
            </AnimatedPressable>
          );
        })}
      </Card>
    </View>
  );
});

const styles = themedStyles(() => ({
  container: {
    gap: spacing.xs,
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
  rowCompleted: {
    opacity: 0.6,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  subject: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  progress: {
    ...typography.caption,
    fontWeight: "600",
  },
}));
