import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@components/ui/Card";
import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { useAssignmentDetail } from "../hooks/useAssignmentDetail";
import { StudentAssignmentRow } from "../services/teacherAssignmentProgress";
import { StudentAssignmentStatus } from "../services/assignmentProgress";
import { AssignmentEffectiveness } from "../services/assignmentOutcomeInsights";
import { AssignmentFollowUpEntry, FollowUpReason } from "../services/assignmentFollowUp";

interface AssignmentDetailScreenProps {
  assignmentId: string;
}

function statusLabel(status: StudentAssignmentStatus): string {
  switch (status) {
    case "completed":
      return "Tamamladı";
    case "in_progress":
      return "Devam ediyor";
    case "past_due":
      return "Süresi geçti";
    case "not_started":
      return "Başlamadı";
  }
}

function statusColor(status: StudentAssignmentStatus): string {
  if (status === "completed") return colors.success;
  if (status === "past_due") return colors.danger;
  if (status === "in_progress") return colors.primary;
  return colors.textTertiary;
}

function effectivenessLabel(effectiveness: AssignmentEffectiveness): string {
  switch (effectiveness) {
    case "effective":
      return "🟢 Çoğu öğrenci ilerledi";
    case "mixed":
      return "🟡 Sonuçlar karışık";
    case "needs_follow_up":
      return "🔴 Bu konuda hâlâ zorlanılıyor";
    case "insufficient_data":
      return "Yeterli veri yok";
  }
}

const FOLLOW_UP_REASON_LABEL: Record<FollowUpReason, string> = {
  incomplete: "Tamamlamadı",
  stale: "Süresi geçti",
  repeated_struggle: "Tekrar tekrar zorlandı",
};

// Read-only, same invariant as ClassPerformanceScreen/StudentPerformanceScreen
// — a teacher can see every student's real progress here, but nothing on
// this screen can change a student's own study state.
export function AssignmentDetailScreen({ assignmentId }: AssignmentDetailScreenProps) {
  const { assignment, progress, outcomeInsights, followUp, isLoading, error, refresh } =
    useAssignmentDetail(assignmentId);

  // System only ever SUGGESTS a follow-up (§12 "DO NOT AUTO-PUBLISH") — this
  // navigates to the exact same CreateAssignmentScreen a teacher would open
  // manually, prefilled, never itself creating or publishing anything.
  function handleCreateFollowUp() {
    if (!assignment) return;
    router.push({
      pathname: "/(teacher)/class/[classId]/assignment/create",
      params: {
        classId: assignment.classId,
        subject: assignment.subject,
        topic: assignment.topic,
        // Phase 32 — carried through as well: without it the follow-up form
        // silently reset to the FIRST grade level in the taxonomy, so a
        // follow-up to a 9th-grade assignment was prepared as a 5th-grade
        // one. gradeLevel is a real selection input (see
        // smartAssignmentSelection's baseMatchScore), so dropping it
        // changed which questions got picked.
        gradeLevel: assignment.gradeLevel,
        studentIds: followUp.map((entry) => entry.studentUid).join(","),
      },
    });
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Geri"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {assignment?.title ?? "Ödev"}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.skeletonList}>
          <LoadingSkeleton height={72} borderRadius={16} />
          <LoadingSkeleton height={56} borderRadius={16} />
          <LoadingSkeleton height={56} borderRadius={16} />
        </View>
      ) : error || !assignment || !progress ? (
        <View style={styles.centered}>
          <EmptyState icon="cloud-offline-outline" title={error ?? "Ödev bulunamadı"} />
          <PrimaryButton label="Tekrar Dene" onPress={refresh} />
        </View>
      ) : (
        <FlatList
          data={progress.rows}
          keyExtractor={(row: StudentAssignmentRow) => row.studentUid}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Card style={styles.row}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.displayName}
              </Text>
              <View style={styles.rowMeta}>
                <Text style={styles.rowCount}>
                  {item.completedCount} / {assignment.targetCount}
                </Text>
                <Text style={[styles.rowStatus, { color: statusColor(item.status) }]}>
                  {statusLabel(item.status)}
                </Text>
              </View>
            </Card>
          )}
          ListHeaderComponent={
            <View style={styles.headerSections}>
              <View style={styles.summaryCard}>
                <Text style={styles.summarySubject}>
                  {assignment.subject} · {assignment.topic}
                </Text>
                {assignment.description ? (
                  <Text style={styles.summaryDescription}>{assignment.description}</Text>
                ) : null}
                <View style={styles.summaryRow}>
                  <SummaryStat value={String(progress.totalStudents)} label="öğrenci" />
                  <SummaryStat value={String(progress.startedCount)} label="başladı" />
                  <SummaryStat value={String(progress.completedCount)} label="tamamladı" />
                </View>
              </View>

              {outcomeInsights && outcomeInsights.effectiveness !== "insufficient_data" ? (
                <View style={styles.summaryCard}>
                  <Text style={styles.sectionTitle}>Bu Ödevde Ne Oldu?</Text>
                  <Text style={styles.previewLine}>{effectivenessLabel(outcomeInsights.effectiveness)}</Text>
                  {outcomeInsights.topicOutcome.struggleRate !== null ? (
                    <Text style={styles.previewLine}>
                      {Math.round(outcomeInsights.topicOutcome.struggleRate * 100)}% zorlanma oranı
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {followUp.length > 0 ? (
                <View style={styles.summaryCard}>
                  <Text style={styles.sectionTitle}>Takip Gerekenler</Text>
                  {followUp.map((entry: AssignmentFollowUpEntry) => (
                    <Text key={entry.studentUid} style={styles.previewLine}>
                      {entry.displayName} · {entry.reasons.map((reason) => FOLLOW_UP_REASON_LABEL[reason]).join(", ")}
                    </Text>
                  ))}
                  <Pressable
                    onPress={handleCreateFollowUp}
                    style={styles.followUpButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.followUpButtonText}>Takip Ödevi Oluştur</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function SummaryStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={styles.summaryStatValue}>{value}</Text>
      <Text style={styles.summaryStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -spacing.sm,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    flex: 1,
  },
  skeletonList: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  list: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.sm,
  },
  headerSections: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  previewLine: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  followUpButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  followUpButtonText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.textInverse,
  },
  summarySubject: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  summaryDescription: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  summaryStat: {
    alignItems: "flex-start",
    gap: 2,
  },
  summaryStatValue: {
    ...typography.title,
    color: colors.textPrimary,
  },
  summaryStatLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
  },
  rowMeta: {
    alignItems: "flex-end",
    gap: 2,
  },
  rowCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  rowStatus: {
    ...typography.caption,
    fontWeight: "700",
  },
});
