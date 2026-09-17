import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Card } from "@components/ui/Card";
import { Chip } from "@components/ui/Chip";
import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { AppBackButton } from "@components/ui/AppBackButton";
import { StatusLabel } from "@components/ui/StatusLabel";
import { useAuth } from "@features/authentication";
import { useClassAssignments } from "@features/assignments/hooks/useClassAssignments";
import { resolveAssignmentDisplayStatus } from "@features/assignments/services/assignmentStatus";
import { selectRecentTopicAssignments } from "@features/assignments/services/assignmentHistorySignals";
import { useClassSemanticDefinitions } from "@features/questions/hooks/useClassSemanticDefinitions";
import type { SemanticDefinitionInput } from "@features/questions/services/semanticDefinition";
import { LearningTrend } from "@features/study/services/learningTrend";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { ClassConceptHeatmapSection } from "../components/ClassConceptHeatmapSection";
import { ClassSemanticCohortSection } from "../components/ClassSemanticCohortSection";
import { ClassTopicComposerModals } from "../components/ClassTopicComposerModals";
import { StudentPerformanceCard } from "../components/StudentPerformanceCard";
import { TeacherActionCenterSection } from "../components/TeacherActionCenterSection";
import { useClassActionCenter } from "../hooks/useClassActionCenter";
import {
  actionCenterComposerContext,
  teacherActionCenterHref,
  teacherStudentHref,
} from "../services/actionCenterNavigation";
import { TeacherActionCenterItem } from "../services/teacherActionCenter";
import { useClassPerformance } from "../hooks/useClassPerformance";
import { useClassSemanticCohorts } from "../hooks/useClassSemanticCohorts";
import { useClassTopicComposer } from "../hooks/useClassTopicComposer";
import { ClassSemanticCohort } from "../services/classSemanticCohorts";
import { ClassTopicHotspot } from "../services/classTopicInsights";
import { attentionCategoryGlyph, learningTrendGlyph } from "../services/statusGlyphs";
import {
  AttentionCategory,
  StudentAttentionCard,
} from "../services/studentAttention";
import { buildClassPerformanceSummary, StudentPerformanceCard as StudentPerformanceCardData } from "../services/studentPerformance";
import {
  hasRecentTopicIntervention,
  InterventionCandidate,
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

// Phase 104 — the words only; the mark comes from learningTrendGlyph so the
// class line and the student line draw the same trend the same way.
function classTrendLabel(trend: LearningTrend): string {
  switch (trend) {
    case "improving":
      return "Sınıf geneli gelişiyor";
    case "declining":
      return "Sınıf geneli geriliyor";
    case "stable":
      return "Sınıf geneli sabit";
    case "insufficient_data":
      return "Sınıf trendi için henüz yeterli veri yok";
  }
}

// Phase 104 (B6) — the status word an assignment row shows AND speaks. The
// accessibility label used to read the raw enum ("past_due", "draft") to a
// screen reader while the eye saw "Süresi geçti".
function assignmentStatusLabel(status: ReturnType<typeof resolveAssignmentDisplayStatus>): string {
  switch (status) {
    case "draft":
      return "Taslak";
    case "archived":
      return "Arşivlendi";
    case "past_due":
      return "Süresi geçti";
    default:
      return "Aktif";
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
  const {
    cards,
    attentionCards,
    topicHotspots,
    trend,
    conceptHeatmap,
    studentEvidence,
    isLoading,
    error,
    refresh,
  } = useClassPerformance(classId);
  const summary = buildClassPerformanceSummary(cards);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [expandedHotspot, setExpandedHotspot] = useState<string | null>(null);

  // Phase 101 — the question composer that "Müdahale Hazırla" and the hotspot
  // CTA open, extracted verbatim into useClassTopicComposer so the dedicated
  // "Bugün Öne Çıkanlar" route offers the identical composer: the same single
  // classes/{classId} read for organizationId, the same prefill.
  const topicComposer = useClassTopicComposer({
    classId,
    uid: firebaseUser?.uid,
    // A teacher-created question changes the class's own topic hotspots
    // over time (once studied), so a refresh keeps the dashboard honest —
    // reuses the exact same refresh() the retry button already calls, no
    // new fetch mechanism.
    onUploaded: refresh,
  });
  // Phase 80 loaded this only while the composer was open, because the composer
  // was its only consumer. Phase 82 added a second one that needs it on first
  // paint: a cohort must show what its definition is called NOW, and resolving
  // that after the section has already rendered would flash the old name.
  //
  // It stays ONE bounded read (MAX_CLASS_SEMANTIC_DEFINITIONS), shared by both
  // consumers, on a screen that already performs one query per student member.
  const { definitions: semanticDefinitions, create: createSemanticDefinition } =
    useClassSemanticDefinitions(classId, true);

  const handleCreateSemanticDefinition = useCallback(
    (input: SemanticDefinitionInput) =>
      firebaseUser ? createSemanticDefinition(firebaseUser.uid, input) : Promise.resolve(null),
    [createSemanticDefinition, firebaseUser],
  );

  // Phase 43 — gradeLevel is carried through when the topic's own questions
  // agree on one, and OMITTED when they do not. Passing a guess would be
  // worse than passing nothing: the composer validates against GRADE_LEVELS
  // and silently falls back to its first entry ("5"), which is exactly the
  // failure this fixes.
  function openComposerForTopic(subject: string, topic: string, gradeLevel: string | null) {
    topicComposer.openForTopic(subject, topic, gradeLevel);
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
    // Phase 44 — set ONLY by openTargetedAssignmentForHotspot and Phase 81's
    // openSmallGroupDraft below, never by the bare "+ Yeni" button. Both of
    // those gate on resolveTopicInterventionTargets, which is what makes them
    // interventions; a semantic cohort on its own never sets this. Not
    // inferred from subject/topic/
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

  // Phase 73 — one list: post-intervention follow-ups and escalations first,
  // then the hotspot/student actions buildTeacherActionSummary already ranked.
  // Phase 101 — composed by useClassActionCenter, which the dedicated "Bugün
  // Öne Çıkanlar" route also uses, so the two surfaces cannot list different
  // actions. Assignments are already loaded by this screen, so the only fetch
  // remains Phase 73's at most MAX_INSPECTED_ASSIGNMENTS submission queries.
  const actionCenter = useClassActionCenter({
    classId,
    topicHotspots,
    attentionCards,
    assignments,
    studentEvidence,
  });

  function handleActionCenterPress(item: TeacherActionCenterItem) {
    const context = actionCenterComposerContext(item);
    if (context) openComposerForTopic(context.subject, context.topic, context.gradeLevel);
  }

  // Phase 101 — the complete Action Center, only offered when the summary
  // above actually hides something.
  function openFullActionCenter() {
    router.push(teacherActionCenterHref(classId));
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
    router.push(teacherStudentHref(classId, studentUid, cards));
  }

  // Phase 43's own input, derived once from the roster this screen already
  // holds. Phase 81 needs the SAME list the hotspot CTA has always used —
  // sharing it is what guarantees the two surfaces can never disagree about
  // who is targetable.
  const interventionCandidates: InterventionCandidate[] = useMemo(
    () =>
      cards.map((card) => ({
        studentUid: card.studentUid,
        persistentStruggleTopics: card.snapshot.persistentStruggleTopics,
      })),
    [cards],
  );

  // Phase 43 — who a TOPIC intervention should actually be for: the
  // students with a persistent, unresolved struggle in THAT topic (see
  // learningState.ts). Deliberately narrower than affectedStudentsForHotspot
  // below, which lists anyone with a question currently in a struggled
  // state — assigning to a student who slipped once, or who has already
  // recovered, is the over-intervention this phase exists to prevent.
  function interventionTargetsForHotspot(hotspot: ClassTopicHotspot): string[] {
    return resolveTopicInterventionTargets(interventionCandidates, hotspot.subject, hotspot.topic);
  }

  const semanticRoster = useMemo(
    () => cards.map((card) => ({ studentUid: card.studentUid, displayName: card.displayName })),
    [cards],
  );

  // Phase 82 — the class's shared vocabulary, so a cohort shows what its
  // definition is called NOW rather than what it was called when the events
  // were recorded. One bounded read, already loaded on this screen for the
  // question composer, and reused rather than fetched a second time.
  const currentDefinitionLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const definition of semanticDefinitions) map.set(definition.id, definition.label);
    return map;
  }, [semanticDefinitions]);

  // Phase 81 — the class's shared semantic cohorts. The only NEW read cost on
  // this screen: one bounded studyEvents query per student member. See the
  // hook's own doc comment for why that fan-out was preferred to a
  // collection-group query.
  const {
    summary: semanticCohorts,
    isLoading: isLoadingCohorts,
    hasError: cohortsFailed,
  } = useClassSemanticCohorts({
    classId,
    students: semanticRoster,
    interventionCandidates,
    currentLabels: currentDefinitionLabels,
  });

  function openSemanticVocabulary() {
    router.push({
      pathname: "/(teacher)/class/[classId]/semantic-vocabulary",
      params: { classId },
    });
  }

  // Phase 81 — opens the EXISTING composer, prefilled, and writes nothing.
  //
  // Recipients are exactly cohort.actionReadyStudentIds: the cohort members
  // Phase 43 independently marks targetable in this exact topic. Cohort
  // members who are not are deliberately left out — being in a cohort is not
  // evidence that anyone should be assigned anything, and padding the group
  // with them would be precisely the over-intervention Phase 43 exists to
  // prevent.
  //
  // gradeLevel is OMITTED, not guessed. The cohort's supporting questions come
  // from studyEvents, and this screen's question metadata was resolved from
  // studyItems — overlapping, but not guaranteed to be the same set. A grade
  // derived from a partial set could be confidently wrong, and a wrong grade
  // silently changes which questions the composer selects (see
  // teacherIntervention.ts). An absent one just means the teacher picks.
  function openSmallGroupDraft(cohort: ClassSemanticCohort) {
    openCreateAssignment({
      subject: cohort.subject,
      topic: cohort.topic,
      studentIds: cohort.actionReadyStudentIds,
      isIntervention: true,
    });
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

  const trendGlyph = learningTrendGlyph(trend);

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <AppBackButton fallbackHref={{ pathname: "/(teacher)/class/[classId]", params: { classId } }} style={styles.backButton} />
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
          style={styles.scroller}
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
              {/* Phase 73 — the Action Center supersedes the Phase 27 action
                  summary block that stood here: it renders those SAME hotspot
                  and student actions plus Phase 47's post-intervention
                  follow-ups and escalations, which previously only existed on
                  each student's own screen. Rendering both would have shown
                  the same hotspot twice. */}
              <TeacherActionCenterSection
                items={actionCenter.summary.items}
                onOpenStudent={openStudent}
                onPrepareIntervention={handleActionCenterPress}
                viewAll={
                  actionCenter.summary.hasMore
                    ? { totalCount: actionCenter.summary.totalCount, onPress: openFullActionCenter }
                    : null
                }
              />

              {/* Phase 73 — where the class's signals concentrate, by topic.
                  Derived from evidence useClassPerformance already loaded;
                  detail opens on tap so the scan surface stays scannable. */}
              <ClassConceptHeatmapSection
                heatmap={conceptHeatmap}
                onOpenStudent={openStudent}
              />

              {/* Phase 81 — where SEVERAL students independently met the same
                  shared authored meaning. A third, distinct question from the
                  two above it: the Action Center says what needs attention now,
                  the heatmap says how concept states are distributed, and this
                  says where a single shared instructional focus would reach
                  more than one person at once. */}
              <ClassSemanticCohortSection
                summary={semanticCohorts}
                isLoading={isLoadingCohorts}
                hasError={cohortsFailed}
                onOpenStudent={openStudent}
                onDraftSmallGroup={openSmallGroupDraft}
                onManageVocabulary={openSemanticVocabulary}
              />

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
                {trendGlyph ? (
                  <StatusLabel icon={trendGlyph.icon} tone={trendGlyph.tone} textStyle={styles.trendLine}>
                    {classTrendLabel(trend)}
                  </StatusLabel>
                ) : (
                  <Text style={styles.trendLine}>{classTrendLabel(trend)}</Text>
                )}
              </View>

              <View style={styles.healthRow}>
                {(Object.keys(categoryCounts) as AttentionCategory[])
                  .filter((category) => category !== "insufficient_data" || categoryCounts[category] > 0)
                  .map((category) => (
                    <View
                      key={category}
                      style={styles.healthChip}
                      // Phase 104 (B6) — one spoken unit per chip, count and
                      // category together, instead of two loose text nodes.
                      accessible
                      accessibilityLabel={`${categoryCounts[category]} ${categoryLabel(category)}`}
                    >
                      <StatusLabel
                        icon={attentionCategoryGlyph(category).icon}
                        tone={attentionCategoryGlyph(category).tone}
                        textStyle={styles.healthChipValue}
                      >
                        {String(categoryCounts[category])}
                      </StatusLabel>
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
                            // Phase 104 (B6) — the row toggles the student
                            // chips beneath it; say so.
                            accessibilityState={{ expanded }}
                            accessibilityHint="Zorlanan öğrencileri gösterir veya gizler"
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
                        // Phase 104 (B6) — the category used to be conveyed
                        // by the emoji alone; the spoken row now names it.
                        accessibilityLabel={`${student.displayName}. ${categoryLabel(student.insight.category)}. ${student.insight.reasons[0] ?? ""}`}
                      >
                        <StatusLabel
                          icon={attentionCategoryGlyph(student.insight.category).icon}
                          tone={attentionCategoryGlyph(student.insight.category).tone}
                          textStyle={styles.priorityName}
                        >
                          {student.displayName}
                        </StatusLabel>
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
                          accessibilityLabel={`${assignmentItem.title}. ${assignmentStatusLabel(displayStatus)}`}
                        >
                          <Text style={styles.priorityName}>{assignmentItem.title}</Text>
                          <Text style={styles.priorityReason}>
                            {assignmentItem.subject} · {assignmentItem.topic} · {assignmentItem.targetCount} soru ·{" "}
                            {assignmentStatusLabel(displayStatus)}
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

      <ClassTopicComposerModals
        state={topicComposer}
        // Phase 80/82 — the class's shared vocabulary. Loaded on first paint on
        // this screen because the cohort section needs it too.
        semanticDefinitions={semanticDefinitions}
        onCreateSemanticDefinition={handleCreateSemanticDefinition}
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

const styles = themedStyles(() => ({
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
    // Phase 74 — the reading measure the rest of the product already uses.
    // Applied to the chrome and the scroller alike: capping only the list
    // would have left the back button and title pinned to the window edge
    // while the cards centred under them.
    width: "100%",
    maxWidth: contentWidth.readable,
    alignSelf: "center",
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
    width: "100%",
    maxWidth: contentWidth.readable,
    alignSelf: "center",
  },
  // Phase 74 — the cap for a SCROLLING box goes on the element, not on its
  // content container. Capping the content centres it inside the scroller's
  // inner width, which is a few pixels narrower than the screen because the
  // scrollbar lives there — so the list settled slightly left of the header
  // that was centred against the full width. Capping the element puts both
  // boxes on the same measure and leaves the scrollbar at the column's own
  // edge, where a capped page normally puts it.
  scroller: {
    flex: 1,
    width: "100%",
    maxWidth: contentWidth.readable,
    alignSelf: "center",
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
}));
