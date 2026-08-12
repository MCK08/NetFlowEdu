import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { StudentPerformanceCard } from "../components/StudentPerformanceCard";
import { useClassPerformance } from "../hooks/useClassPerformance";
import { buildClassPerformanceSummary, StudentPerformanceCard as StudentPerformanceCardData } from "../services/studentPerformance";

interface ClassPerformanceScreenProps {
  classId: string;
}

function keyExtractor(card: StudentPerformanceCardData) {
  return card.studentUid;
}

// Phase 27 — read-only. The teacher can see every real number this screen
// shows; nothing here can change a student's own study state (no outcome
// controls, no editable fields anywhere on this screen or the detail
// screen it opens).
export function ClassPerformanceScreen({ classId }: ClassPerformanceScreenProps) {
  const { cards, isLoading, error, refresh } = useClassPerformance(classId);
  const summary = buildClassPerformanceSummary(cards);

  function openStudent(studentUid: string) {
    const card = cards.find((c) => c.studentUid === studentUid);
    router.push({
      pathname: "/(teacher)/class/[classId]/student/[studentId]",
      params: { classId, studentId: studentUid, studentName: card?.displayName ?? "" },
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
        <Text style={styles.title}>Sınıf Performansı</Text>
      </View>

      {isLoading ? (
        <View style={styles.skeletonList}>
          <LoadingSkeleton height={72} borderRadius={16} />
          <LoadingSkeleton height={88} borderRadius={16} />
          <LoadingSkeleton height={88} borderRadius={16} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <EmptyState icon="cloud-offline-outline" title={error} />
          <PrimaryButton label="Tekrar Dene" onPress={refresh} />
        </View>
      ) : cards.length === 0 ? (
        <View style={styles.centered}>
          <EmptyState
            icon="people-outline"
            title="Bu sınıfta henüz öğrenci yok"
            description="Öğrenciler sınıf koduyla katıldığında performansları burada görünecek."
          />
        </View>
      ) : (
        <FlatList
          data={cards}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => <StudentPerformanceCard card={item} onPress={openStudent} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.summaryCard}>
              <Text style={styles.summaryStudentCount}>{summary.studentCount} öğrenci</Text>
              <View style={styles.summaryRow}>
                <SummaryStat
                  value={summary.averageSuccessRatePercent === null ? "—" : `%${summary.averageSuccessRatePercent}`}
                  label="ortalama başarı"
                />
                <SummaryStat value={String(summary.totalDueCount)} label="bekleyen tekrar" />
                <SummaryStat
                  value={String(summary.needsSupportCount)}
                  label="desteğe ihtiyacı olan"
                  tone={summary.needsSupportCount > 0 ? "danger" : "neutral"}
                />
              </View>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function SummaryStat({ value, label, tone = "neutral" }: { value: string; label: string; tone?: "neutral" | "danger" }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={[styles.summaryStatValue, tone === "danger" ? styles.summaryStatValueDanger : null]}>
        {value}
      </Text>
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
  separator: {
    height: spacing.sm,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryStudentCount: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryStat: {
    alignItems: "flex-start",
    gap: 2,
  },
  summaryStatValue: {
    ...typography.title,
    color: colors.textPrimary,
  },
  summaryStatValueDanger: {
    color: colors.danger,
  },
  summaryStatLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
