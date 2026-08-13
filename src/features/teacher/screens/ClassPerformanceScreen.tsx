import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@components/ui/Card";
import { Chip } from "@components/ui/Chip";
import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { LearningTrend } from "@features/study/services/learningTrend";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { StudentPerformanceCard } from "../components/StudentPerformanceCard";
import { useClassPerformance } from "../hooks/useClassPerformance";
import { ClassTopicHotspot } from "../services/classTopicInsights";
import {
  AttentionCategory,
  StudentAttentionCard,
} from "../services/studentAttention";
import { buildClassPerformanceSummary, StudentPerformanceCard as StudentPerformanceCardData } from "../services/studentPerformance";

interface ClassPerformanceScreenProps {
  classId: string;
}

type FilterValue = AttentionCategory | "all";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "needs_attention", label: "Dikkat gereken" },
  { value: "watch", label: "İzlemede" },
  { value: "progressing", label: "İlerliyor" },
  { value: "strong", label: "Güçlü" },
  { value: "insufficient_data", label: "Yetersiz veri" },
];

function categoryEmoji(category: AttentionCategory): string {
  switch (category) {
    case "needs_attention":
      return "🔴";
    case "watch":
      return "🟠";
    case "progressing":
      return "🟢";
    case "strong":
      return "🌟";
    case "insufficient_data":
      return "⚪";
  }
}

function categoryLabel(category: AttentionCategory): string {
  switch (category) {
    case "needs_attention":
      return "Dikkat gereken";
    case "watch":
      return "İzlemede";
    case "progressing":
      return "İlerliyor";
    case "strong":
      return "Güçlü";
    case "insufficient_data":
      return "Yetersiz veri";
  }
}

function classTrendLabel(trend: LearningTrend): string {
  switch (trend) {
    case "improving":
      return "📈 Sınıf geneli gelişiyor";
    case "declining":
      return "📉 Sınıf geneli geriliyor";
    case "stable":
      return "➡️ Sınıf geneli sabit";
    case "insufficient_data":
      return "Sınıf trendi için henüz yeterli veri yok";
  }
}

function keyExtractor(card: StudentPerformanceCardData) {
  return card.studentUid;
}

function topicKey(subject: string, topic: string): string {
  return `${subject}__${topic}`;
}

// Read-only. The teacher can see every real number this screen shows;
// nothing here can change a student's own study state (no outcome
// controls, no editable fields anywhere on this screen or the detail
// screen it opens). Every new section (Class Health, Topic Hotspots,
// Student Attention, filters) is derived ENTIRELY from useClassPerformance's
// existing `cards` fetch — zero new Firestore reads.
export function ClassPerformanceScreen({ classId }: ClassPerformanceScreenProps) {
  const { cards, attentionCards, topicHotspots, trend, isLoading, error, refresh } =
    useClassPerformance(classId);
  const summary = buildClassPerformanceSummary(cards);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [expandedHotspot, setExpandedHotspot] = useState<string | null>(null);

  const attentionByStudent = useMemo(() => {
    const map = new Map<string, StudentAttentionCard>();
    for (const card of attentionCards) map.set(card.studentUid, card);
    return map;
  }, [attentionCards]);

  const categoryCounts = useMemo(() => {
    const counts: Record<AttentionCategory, number> = {
      needs_attention: 0,
      watch: 0,
      progressing: 0,
      strong: 0,
      insufficient_data: 0,
    };
    for (const card of attentionCards) counts[card.insight.category] += 1;
    return counts;
  }, [attentionCards]);

  const filteredCards = useMemo(() => {
    if (filter === "all") return cards;
    return cards.filter((card) => attentionByStudent.get(card.studentUid)?.insight.category === filter);
  }, [cards, filter, attentionByStudent]);

  // Priority students — the top of the already-sorted attentionCards list,
  // excluding "strong"/"insufficient_data" (a teacher opening this section
  // wants who needs THEM, not a reassurance list — those two categories
  // are still fully visible via the filter row and the main list below).
  const priorityStudents = useMemo(
    () =>
      attentionCards
        .filter((card) => card.insight.category === "needs_attention" || card.insight.category === "watch")
        .slice(0, 5),
    [attentionCards],
  );

  function openStudent(studentUid: string) {
    const card = cards.find((c) => c.studentUid === studentUid);
    router.push({
      pathname: "/(teacher)/class/[classId]/student/[studentId]",
      params: { classId, studentId: studentUid, studentName: card?.displayName ?? "" },
    });
  }

  function affectedStudentsForHotspot(hotspot: ClassTopicHotspot) {
    return cards.filter((card) =>
      card.snapshot.allTopics.some(
        (topic) => topic.subject === hotspot.subject && topic.topic === hotspot.topic && topic.struggledCount > 0,
      ),
    );
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
          data={filteredCards}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => <StudentPerformanceCard card={item} onPress={openStudent} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="filter-outline"
              title="Bu filtreye uyan öğrenci yok"
              description="Farklı bir filtre seçmeyi deneyin."
            />
          }
          ListHeaderComponent={
            <View style={styles.headerSections}>
              {/* CLASS HEALTH */}
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
                <Text style={styles.trendLine}>{classTrendLabel(trend)}</Text>
              </View>

              <View style={styles.healthRow}>
                {(Object.keys(categoryCounts) as AttentionCategory[])
                  .filter((category) => category !== "insufficient_data" || categoryCounts[category] > 0)
                  .map((category) => (
                    <View key={category} style={styles.healthChip}>
                      <Text style={styles.healthChipValue}>
                        {categoryEmoji(category)} {categoryCounts[category]}
                      </Text>
                      <Text style={styles.healthChipLabel}>{categoryLabel(category)}</Text>
                    </View>
                  ))}
              </View>

              {/* TOPIC HOTSPOTS */}
              {topicHotspots.length > 0 ? (
                <View style={styles.section}>
                  <SectionHeader title="Konu Sıcak Noktaları" />
                  <View style={styles.hotspotList}>
                    {topicHotspots.map((hotspot) => {
                      const key = topicKey(hotspot.subject, hotspot.topic);
                      const expanded = expandedHotspot === key;
                      return (
                        <Card key={key} style={styles.hotspotCard}>
                          <Pressable
                            onPress={() => setExpandedHotspot(expanded ? null : key)}
                            accessibilityRole="button"
                            accessibilityLabel={`${hotspot.topic}. ${hotspot.strugglingStudents} öğrenci zorlanıyor.`}
                          >
                            <Text style={styles.hotspotTopic}>
                              {hotspot.subject} · {hotspot.topic}
                            </Text>
                            <Text style={styles.hotspotDetail}>
                              {hotspot.studentsWithAttempts} öğrenci çalıştı · {hotspot.strugglingStudents} öğrenci
                              zorlandı{hotspot.dueStudents > 0 ? ` · ${hotspot.dueStudents} öğrenci tekrar bekliyor` : ""}
                            </Text>
                          </Pressable>
                          {expanded ? (
                            <View style={styles.hotspotStudents}>
                              {affectedStudentsForHotspot(hotspot).map((card) => (
                                <Chip
                                  key={card.studentUid}
                                  label={card.displayName}
                                  onPress={() => openStudent(card.studentUid)}
                                />
                              ))}
                            </View>
                          ) : null}
                        </Card>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {/* STUDENT ATTENTION */}
              {priorityStudents.length > 0 ? (
                <View style={styles.section}>
                  <SectionHeader title="Öncelikli Öğrenciler" />
                  <View style={styles.priorityList}>
                    {priorityStudents.map((student) => (
                      <Pressable
                        key={student.studentUid}
                        onPress={() => openStudent(student.studentUid)}
                        style={styles.priorityRow}
                        accessibilityRole="button"
                        accessibilityLabel={`${student.displayName}. ${student.insight.reasons[0] ?? ""}`}
                      >
                        <Text style={styles.priorityName}>
                          {categoryEmoji(student.insight.category)} {student.displayName}
                        </Text>
                        <Text style={styles.priorityReason}>{student.insight.reasons[0]}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* FILTERS */}
              <View style={styles.filterRow}>
                {FILTERS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={filter === option.value}
                    onPress={() => setFilter(option.value)}
                  />
                ))}
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
  headerSections: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
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
  trendLine: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  healthRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  healthChip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 2,
    minWidth: 90,
  },
  healthChipValue: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  healthChipLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  section: {
    gap: spacing.xs,
  },
  hotspotList: {
    gap: spacing.sm,
  },
  hotspotCard: {
    gap: spacing.xs,
  },
  hotspotTopic: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  hotspotDetail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  hotspotStudents: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  priorityList: {
    gap: spacing.xs,
  },
  priorityRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 2,
  },
  priorityName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  priorityReason: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
});
