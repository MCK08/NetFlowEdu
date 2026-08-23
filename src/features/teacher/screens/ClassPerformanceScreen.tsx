import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@components/ui/Card";
import { Chip } from "@components/ui/Chip";
import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { useAuth } from "@features/authentication";
import { useClassAssignments } from "@features/assignments/hooks/useClassAssignments";
import { resolveAssignmentDisplayStatus } from "@features/assignments/services/assignmentStatus";
import { selectRecentTopicAssignments } from "@features/assignments/services/assignmentHistorySignals";
import { ImageSourcePicker } from "@features/classes/components/ImageSourcePicker";
import { QuestionMetadataModal } from "@features/questions/components/QuestionMetadataModal";
import { LearningTrend } from "@features/study/services/learningTrend";
import { getClassById } from "@services/firebase/classes";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { StudentPerformanceCard } from "../components/StudentPerformanceCard";
import { useClassPerformance } from "../hooks/useClassPerformance";
import { useTeacherQuestionComposer } from "../hooks/useTeacherQuestionComposer";
import { ClassTopicHotspot } from "../services/classTopicInsights";
import {
  AttentionCategory,
  StudentAttentionCard,
} from "../services/studentAttention";
import { buildClassPerformanceSummary, StudentPerformanceCard as StudentPerformanceCardData } from "../services/studentPerformance";
import { buildTeacherActionSummary, TeacherAction } from "../services/teacherActionSummary";
import {
  hasRecentTopicIntervention,
  resolveTopicInterventionTargets,
} from "../services/teacherIntervention";

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
  const { firebaseUser } = useAuth();
  const { cards, attentionCards, topicHotspots, trend, isLoading, error, refresh } =
    useClassPerformance(classId);
  const summary = buildClassPerformanceSummary(cards);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [expandedHotspot, setExpandedHotspot] = useState<string | null>(null);

  // ONE new read this phase: the class doc's own organizationId, needed to
  // satisfy uploadClassQuestionImage's existing required parameter (the
  // exact same field useClassUpload/useStudentQuestionUpload already
  // require). useClassPerformance's own `getClassMembers` read doesn't
  // carry organizationId (it's a roster, not class metadata), so there's
  // no already-loaded value to reuse here — a single classes/{classId}
  // get() is the smallest correct source. Read once per screen mount, not
  // per composer open.
  const [classOrganizationId, setClassOrganizationId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getClassById(classId).then((room) => {
      if (!cancelled) setClassOrganizationId(room?.organizationId ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const [composerTopicContext, setComposerTopicContext] = useState<{
    subject: string;
    topic: string;
    gradeLevel: string | null;
  } | null>(
    null,
  );
  const composer = useTeacherQuestionComposer({
    uid: firebaseUser?.uid,
    organizationId: classOrganizationId,
    classId,
    // A teacher-created question changes the class's own topic hotspots
    // over time (once studied), so a refresh keeps the dashboard honest —
    // reuses the exact same refresh() the retry button already calls, no
    // new fetch mechanism.
    onUploaded: refresh,
  });

  // Phase 43 — gradeLevel is carried through when the topic's own questions
  // agree on one, and OMITTED when they do not. Passing a guess would be
  // worse than passing nothing: the composer validates against GRADE_LEVELS
  // and silently falls back to its first entry ("5"), which is exactly the
  // failure this fixes.
  function openComposerForTopic(subject: string, topic: string, gradeLevel: string | null) {
    setComposerTopicContext({ subject, topic, gradeLevel });
    composer.openComposer();
  }

  // Zero new reads to LIST assignments here beyond useClassAssignments'
  // own single classId-equality query — same "no composite index" query
  // shape as everything else this screen already reads.
  const { assignments } = useClassAssignments(classId);
  const recentAssignments = useMemo(() => assignments.slice(0, 3), [assignments]);

  // Phase 43 — the same param set AssignmentDetailScreen's follow-up flow
  // has always sent (classId + subject + topic + gradeLevel + studentIds).
  // This path previously sent only the first three, so an assignment
  // started from a hotspot silently prepared at the taxonomy's first grade
  // and targeted the WHOLE class — including students who had recovered or
  // never struggled.
  //
  // Undefined values are dropped from the params rather than sent as empty
  // strings: the composer treats an absent value as "no suggestion" and
  // keeps its own default, which is the honest outcome when the evidence
  // does not support a value.
  function openCreateAssignment(options?: {
    subject?: string;
    topic?: string;
    gradeLevel?: string | null;
    studentIds?: readonly string[];
    // Phase 44 — set ONLY by openTargetedAssignmentForHotspot below, never
    // by the bare "+ Yeni" button. Not inferred from subject/topic/
    // studentIds being present — this same function is the ordinary create
    // path too, which can legitimately carry all three without being an
    // intervention.
    isIntervention?: boolean;
  }) {
    const params: { classId: string } & Record<string, string> = { classId };
    if (options?.subject) params.subject = options.subject;
    if (options?.topic) params.topic = options.topic;
    if (options?.gradeLevel) params.gradeLevel = options.gradeLevel;
    if (options?.studentIds && options.studentIds.length > 0) {
      params.studentIds = options.studentIds.join(",");
    }
    if (options?.isIntervention) params.intervention = "1";
    router.push({ pathname: "/(teacher)/class/[classId]/assignment/create", params });
  }

  function openAssignmentDetail(assignmentId: string) {
    router.push({
      pathname: "/(teacher)/class/[classId]/assignment/[assignmentId]",
      params: { classId, assignmentId },
    });
  }

  const teacherActions = useMemo(
    () => buildTeacherActionSummary(topicHotspots, attentionCards),
    [topicHotspots, attentionCards],
  );

  function handleActionPress(action: TeacherAction) {
    if (action.kind === "create_question" && action.topicContext) {
      openComposerForTopic(
        action.topicContext.subject,
        action.topicContext.topic,
        action.topicContext.gradeLevel,
      );
    } else if (action.kind === "open_student" && action.studentUid) {
      openStudent(action.studentUid);
    }
  }

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

  // Phase 43 — who a TOPIC intervention should actually be for: the
  // students with a persistent, unresolved struggle in THAT topic (see
  // learningState.ts). Deliberately narrower than affectedStudentsForHotspot
  // below, which lists anyone with a question currently in a struggled
  // state — assigning to a student who slipped once, or who has already
  // recovered, is the over-intervention this phase exists to prevent.
  function interventionTargetsForHotspot(hotspot: ClassTopicHotspot): string[] {
    return resolveTopicInterventionTargets(
      cards.map((card) => ({
        studentUid: card.studentUid,
        persistentStruggleTopics: card.snapshot.persistentStruggleTopics,
      })),
      hotspot.subject,
      hotspot.topic,
    );
  }

  // When nobody in the class is persistently struggling in this topic there
  // is no evidence for a targeted intervention, so the composer opens on
  // the topic WITHOUT a forced target list and the teacher chooses — rather
  // than silently assigning to all 25 students in the name of a hotspot
  // only a couple of people slipped on.
  // Phase 43 §8 — reuses Phase 31's OWN same-topic/non-draft/bounded
  // selection over the assignments this screen already loaded. No new
  // query, no new "recent" rule, no new field.
  function alreadyAssignedForHotspot(hotspot: ClassTopicHotspot): boolean {
    return hasRecentTopicIntervention(
      selectRecentTopicAssignments(assignments, hotspot.topic, null),
      interventionTargetsForHotspot(hotspot),
    );
  }

  function openTargetedAssignmentForHotspot(hotspot: ClassTopicHotspot) {
    const studentIds = interventionTargetsForHotspot(hotspot);
    openCreateAssignment({
      subject: hotspot.subject,
      topic: hotspot.topic,
      gradeLevel: hotspot.gradeLevel,
      studentIds,
      isIntervention: true,
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
              {/* ACTION SUMMARY (§12) — a short, capped "what can I do now"
                  list, not a second dashboard. Every item links straight to
                  a real action (create_question opens the composer
                  pre-filled; open_student opens the existing student
                  detail route). */}
              {teacherActions.length > 0 ? (
                <View style={styles.section}>
                  <SectionHeader title="Şimdi Yapılabilecekler" />
                  <View style={styles.actionList}>
                    {teacherActions.map((action, index) => (
                      <Pressable
                        key={`${action.kind}-${action.studentUid ?? ""}-${action.title}-${index}`}
                        onPress={() => handleActionPress(action)}
                        style={styles.actionRow}
                        accessibilityRole="button"
                        accessibilityLabel={`${action.title}. ${action.reason}. ${action.kind === "create_question" ? "Soru oluştur" : "Öğrenciyi aç"}`}
                      >
                        <View style={styles.actionText}>
                          <Text style={styles.actionTitle}>{action.title}</Text>
                          <Text style={styles.actionReason}>{action.reason}</Text>
                        </View>
                        <Text style={styles.actionCta}>
                          {action.kind === "create_question" ? "Soru Oluştur" : "Öğrenciyi Aç"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

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
                            {/* Phase 42 — how many times, not just how many
                                students. Omitted entirely when no student in
                                this topic has trustworthy cumulative history,
                                rather than shown as 0. */}
                            {hotspot.struggledAttemptCount !== null && hotspot.struggledAttemptCount > 0 ? (
                              <Text style={styles.hotspotDetail}>
                                Toplam {hotspot.struggledAttemptCount} kez zorlanma
                              </Text>
                            ) : null}
                            {/* Phase 43 — who a targeted assignment would
                                actually go to, stated before the teacher
                                taps. Absent when nobody is persistently
                                struggling: the composer then opens on the
                                topic with no forced target list. */}
                            {interventionTargetsForHotspot(hotspot).length > 0 ? (
                              <Text style={styles.hotspotDetail}>
                                {interventionTargetsForHotspot(hotspot).length} öğrenci için ödev
                                oluşturulabilir
                                {alreadyAssignedForHotspot(hotspot)
                                  ? " · bu konuda yakın zamanda ödev verildi"
                                  : ""}
                              </Text>
                            ) : null}
                          </Pressable>
                          <View style={styles.hotspotActionRow}>
                            <Pressable
                              onPress={() => openComposerForTopic(hotspot.subject, hotspot.topic, hotspot.gradeLevel)}
                              style={styles.hotspotCreateButton}
                              accessibilityRole="button"
                              accessibilityLabel={`${hotspot.topic} konusundan soru oluştur`}
                            >
                              <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                              <Text style={styles.hotspotCreateButtonText}>Soru Oluştur</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => openTargetedAssignmentForHotspot(hotspot)}
                              style={styles.hotspotCreateButton}
                              accessibilityRole="button"
                              accessibilityLabel={`${hotspot.topic} konusunda ödev oluştur`}
                            >
                              <Ionicons name="clipboard-outline" size={16} color={colors.primary} />
                              <Text style={styles.hotspotCreateButtonText}>Ödev Oluştur</Text>
                            </Pressable>
                          </View>
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

              {/* ASSIGNMENTS (§11) */}
              <View style={styles.section}>
                <SectionHeader
                  title="Ödevler"
                  action={{ label: "+ Yeni", onPress: () => openCreateAssignment() }}
                />
                {recentAssignments.length === 0 ? (
                  <Text style={styles.priorityReason}>Henüz ödev oluşturulmadı.</Text>
                ) : (
                  <View style={styles.priorityList}>
                    {recentAssignments.map((assignmentItem) => {
                      const displayStatus = resolveAssignmentDisplayStatus(
                        assignmentItem.status,
                        assignmentItem.dueAt,
                        Date.now(),
                      );
                      return (
                        <Pressable
                          key={assignmentItem.id}
                          onPress={() => openAssignmentDetail(assignmentItem.id)}
                          style={styles.priorityRow}
                          accessibilityRole="button"
                          accessibilityLabel={`${assignmentItem.title}. ${displayStatus}`}
                        >
                          <Text style={styles.priorityName}>{assignmentItem.title}</Text>
                          <Text style={styles.priorityReason}>
                            {assignmentItem.subject} · {assignmentItem.topic} · {assignmentItem.targetCount} soru ·{" "}
                            {displayStatus === "draft"
                              ? "Taslak"
                              : displayStatus === "archived"
                                ? "Arşivlendi"
                                : displayStatus === "past_due"
                                  ? "Süresi geçti"
                                  : "Aktif"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

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

      <ImageSourcePicker
        visible={composer.isSourcePickerOpen}
        onSelect={composer.selectImageSource}
        onCancel={composer.cancelSourcePicker}
      />

      <QuestionMetadataModal
        visible={composer.pickedImageUri !== null}
        imageUri={composer.pickedImageUri}
        isUploading={composer.isUploading}
        errorMessage={composer.errorMessage}
        onSubmit={composer.submitDetails}
        onCancel={composer.cancelDetails}
        initialSubject={composerTopicContext?.subject}
        initialTopic={composerTopicContext?.topic}
        // Phase 43 — only ever a grade the topic's own questions agree on;
        // undefined when they do not, so the modal keeps its own default
        // instead of being handed a guess.
        initialGradeLevel={composerTopicContext?.gradeLevel ?? undefined}
      />
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
  actionList: {
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  actionText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  actionTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  actionReason: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  actionCta: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.primary,
  },
  hotspotActionRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xxs,
  },
  hotspotCreateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    alignSelf: "flex-start",
  },
  hotspotCreateButtonText: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.primary,
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
