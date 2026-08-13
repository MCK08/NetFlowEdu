import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@components/ui/Card";
import { Chip } from "@components/ui/Chip";
import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { LearningTrend } from "@features/study/services/learningTrend";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { useStudentPerformanceDetail } from "../hooks/useStudentPerformanceDetail";
import { buildStudentAttentionInsight } from "../services/studentAttention";

interface StudentPerformanceScreenProps {
  classId: string;
  studentId: string;
  studentName?: string;
}

function trendLabel(trend: LearningTrend): string {
  switch (trend) {
    case "improving":
      return "📈 Gelişiyor";
    case "declining":
      return "📉 Geriliyor";
    case "stable":
      return "➡️ Sabit";
    case "insufficient_data":
      return "Henüz yeterli veri yok";
  }
}

function formatLastStudied(timestampMs: number | null): string {
  if (!timestampMs) return "Henüz çalışılmadı";
  const date = new Date(timestampMs);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Bugün ${time}`;
  return `${date.toLocaleDateString("tr-TR")} ${time}`;
}

// Phase 27 — READ-ONLY. No outcome controls, no editable fields: everything
// on this screen is a Text/Chip rendering of buildStudentPerformanceSnapshot's
// output. A teacher cannot change a student's answer or study state here.
export function StudentPerformanceScreen({ classId, studentId, studentName }: StudentPerformanceScreenProps) {
  const { snapshot, isLoading, error, refresh } = useStudentPerformanceDetail(classId, studentId);
  const attention = useMemo(
    () => (snapshot ? buildStudentAttentionInsight(snapshot, Date.now()) : null),
    [snapshot],
  );

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
          {studentName ?? "Öğrenci Performansı"}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.skeletonList}>
          <LoadingSkeleton height={100} borderRadius={16} />
          <LoadingSkeleton height={140} borderRadius={16} />
          <LoadingSkeleton height={140} borderRadius={16} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <EmptyState icon="cloud-offline-outline" title={error} />
          <PrimaryButton label="Tekrar Dene" onPress={refresh} />
        </View>
      ) : !snapshot || snapshot.totalCount === 0 ? (
        <View style={styles.centered}>
          <EmptyState
            icon="school-outline"
            title="Bu öğrenci henüz bu sınıfta çalışmadı"
            description="Öğrenci bu sınıftaki sorulardan birini çözdüğünde performansı burada görünecek."
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Card style={styles.summaryCard}>
            <Text style={styles.sectionLabel}>Genel başarı</Text>
            <Text style={styles.bigValue}>
              {snapshot.successRatePercent === null ? "—" : `%${snapshot.successRatePercent}`}
            </Text>
          </Card>

          {attention ? (
            <Card style={styles.attentionCard}>
              <Text style={styles.sectionLabel}>Öğretmen notu</Text>
              {attention.reasons.map((reason) => (
                <Text key={reason} style={styles.bodyText}>
                  {reason}
                </Text>
              ))}
            </Card>
          ) : null}

          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>Bugünkü durum</Text>
            <Text style={styles.bodyText}>{snapshot.today.reviewedToday} soru çözüldü</Text>
            <Text style={styles.bodyTextMuted}>{snapshot.today.solvedToday} doğru</Text>
            {snapshot.today.struggledToday > 0 ? (
              <Text style={styles.bodyTextDanger}>{snapshot.today.struggledToday} zorlanılan soru</Text>
            ) : null}
          </Card>

          <View style={styles.row}>
            <Card style={styles.halfCard}>
              <Text style={styles.sectionLabel}>Tekrar durumu</Text>
              <Text style={styles.bigValueSmall}>{snapshot.dueCount}</Text>
              <Text style={styles.bodyTextMuted}>bekleyen tekrar</Text>
            </Card>
            <Card style={styles.halfCard}>
              <Text style={styles.sectionLabel}>Bu sınıfta aktif gün</Text>
              <Text style={styles.bigValueSmall}>{snapshot.daysActiveRecently}</Text>
              <Text style={styles.bodyTextMuted}>son 14 gün içinde</Text>
            </Card>
          </View>

          {snapshot.weakTopics.length > 0 ? (
            <Card style={styles.card}>
              <Text style={styles.sectionLabel}>Zayıf konular</Text>
              <View style={styles.chipRow}>
                {snapshot.weakTopics.map((topic) => (
                  <Chip key={`${topic.subject}-${topic.topic}`} label={`${topic.topic} (${topic.subject})`} />
                ))}
              </View>
            </Card>
          ) : null}

          {snapshot.strongTopics.length > 0 ? (
            <Card style={styles.card}>
              <Text style={styles.sectionLabel}>Güçlü konular</Text>
              <View style={styles.chipRow}>
                {snapshot.strongTopics.map((topic) => (
                  <Chip key={`${topic.subject}-${topic.topic}`} label={`${topic.topic} (${topic.subject})`} />
                ))}
              </View>
            </Card>
          ) : null}

          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>Son çalışma</Text>
            <Text style={styles.bodyText}>{formatLastStudied(snapshot.lastStudiedAt)}</Text>
          </Card>

          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>Son 14 günlük trend</Text>
            <Text style={styles.bodyText}>{trendLabel(snapshot.trend)}</Text>
          </Card>
        </ScrollView>
      )}
    </SafeAreaView>
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
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  summaryCard: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xl,
  },
  card: {
    gap: spacing.xxs,
  },
  attentionCard: {
    gap: spacing.xxs,
    backgroundColor: colors.surfaceMuted,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  halfCard: {
    flex: 1,
    gap: spacing.xxs,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    textTransform: "uppercase",
  },
  bigValue: {
    ...typography.displayLg,
    fontSize: 40,
    color: colors.primary,
  },
  bigValueSmall: {
    ...typography.title,
    fontSize: 24,
    color: colors.textPrimary,
  },
  bodyText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  bodyTextMuted: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  bodyTextDanger: {
    ...typography.caption,
    color: colors.danger,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
});
