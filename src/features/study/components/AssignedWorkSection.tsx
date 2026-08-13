import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { StudentAssignmentCard } from "@features/assignments/hooks/useStudentAssignments";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

interface AssignedWorkSectionProps {
  cards: readonly StudentAssignmentCard[];
  onOpen: (assignmentId: string) => void;
}

function dueLabel(dueAt: number | null): string | null {
  if (dueAt === null) return null;
  const days = Math.ceil((dueAt - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return "Süresi geçti";
  if (days === 0) return "Son tarih: Bugün";
  if (days === 1) return "Son tarih: Yarın";
  return `Son tarih: ${days} gün sonra`;
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

  return (
    <View style={styles.container}>
      <SectionHeader title="Atanan Çalışmalar" />
      <View style={styles.list}>
        {cards.map(({ assignment, submission, status }) => {
          const completedCount = submission?.completedCount ?? 0;
          const due = dueLabel(assignment.dueAt);
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
