import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { StudentAssignmentCard } from "@features/assignments/hooks/useStudentAssignments";
import { assignmentDueLabel } from "@features/assignments/services/assignmentUrgency";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

interface AssignedWorkSectionProps {
  cards: readonly StudentAssignmentCard[];
  onOpen: (assignmentId: string) => void;
}

// "Atanan Çalışmalar" — never a second question-solving engine: "Devam Et"
// opens the existing StudySessionScreen (mode="assignment"), the same
// swipe-card/outcome-recording UI the adaptive round already uses. Hidden
// entirely when the student has no assignments at all, matching
// DailyPracticePlanSection/WeakTopicsSection's own "hide when empty"
// convention.
export const AssignedWorkSection = memo(function AssignedWorkSection({
  cards,
  onOpen,
}: AssignedWorkSectionProps) {
  if (cards.length === 0) return null;

  // One clock reading for the whole list, so two cards rendered in the same
  // pass can never straddle a day boundary and disagree.
  const now = Date.now();

  return (
    <View style={styles.container}>
      <SectionHeader title="Atanan Çalışmalar" />
      <View style={styles.list}>
        {cards.map(({ assignment, submission, status }) => {
          const completedCount = submission?.completedCount ?? 0;
          // Phase 39 — shared with the "Şimdi Ne Yapmalısın?" card, so the
          // same assignment can never carry two different deadline labels
          // on the same screen (see assignmentUrgency.ts).
          const due = assignmentDueLabel(assignment.dueAt, now);
          return (
            <Card key={assignment.id} style={styles.card}>
              <Pressable onPress={() => onOpen(assignment.id)} accessibilityRole="button">
                <Text style={styles.title} numberOfLines={1}>
                  {assignment.title}
                </Text>
                <Text style={styles.subject}>
                  {assignment.subject} · {assignment.topic}
                </Text>
                <Text style={styles.progress}>
                  {completedCount} / {assignment.targetCount} tamamlandı
                  {due ? ` · ${due}` : ""}
                </Text>
              </Pressable>
              {status !== "completed" ? (
                <PrimaryButton label="Devam Et" onPress={() => onOpen(assignment.id)} />
              ) : null}
            </Card>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  list: {
    gap: spacing.sm,
  },
  card: {
    gap: spacing.xs,
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
    color: colors.textTertiary,
  },
});
