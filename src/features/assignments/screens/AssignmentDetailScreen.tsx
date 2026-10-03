import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppBackButton } from "@components/ui/AppBackButton";
import { Badge, BadgeVariant } from "@components/ui/Badge";
import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { StatusLabel } from "@components/ui/StatusLabel";
import { useClassRoom } from "@features/classes/hooks/useClassRoom";
import { teacherStudentRoute } from "@features/teacher/services/actionCenterNavigation";
import { assignmentEffectivenessGlyph } from "@features/teacher/services/statusGlyphs";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { iconSize, stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { AssignmentDetailTab, AssignmentDetailTabs } from "../components/AssignmentDetailTabs";
import { AssignmentQuestionList } from "../components/AssignmentQuestionList";
import { AssignmentResponseSummary } from "../components/AssignmentResponseSummary";
import { AssignmentStudentRow } from "../components/AssignmentStudentRow";
import { useAssignmentDetail } from "../hooks/useAssignmentDetail";
import { useAssignmentQuestions } from "../hooks/useAssignmentQuestions";
import { AssignmentFollowUpEntry, FollowUpReason } from "../services/assignmentFollowUp";
import { AssignmentEffectiveness } from "../services/assignmentOutcomeInsights";
import {
  AssignmentDisplayStatus,
  assignmentStatusLabel,
  resolveAssignmentDisplayStatus,
} from "../services/assignmentStatus";
import { countAssignmentStatuses, StudentAssignmentRow } from "../services/teacherAssignmentProgress";

interface AssignmentDetailScreenProps {
  assignmentId: string;
}

/** The screen's own name. Phase 128 — the header used to print the
 *  assignment's title here, capped at one line, with "Ödev" as the fallback;
 *  the title now lives in the identity card, in full. */
export const ASSIGNMENT_DETAIL_TITLE = "Çalışma Detayı";
export const REVIEW_RESPONSES_LABEL = "Yanıtları İncele";

// Phase 104 — the words only; the mark comes from assignmentEffectivenessGlyph,
// the same vocabulary the teacher's other verdict lines use.
function effectivenessLabel(effectiveness: AssignmentEffectiveness): string {
  switch (effectiveness) {
    case "effective":
      return "Çoğu öğrenci ilerledi";
    case "mixed":
      return "Sonuçlar karışık";
    case "needs_follow_up":
      return "Bu konuda hâlâ zorlanılıyor";
    case "insufficient_data":
      return "Yeterli veri yok";
  }
}

const FOLLOW_UP_REASON_LABEL: Record<FollowUpReason, string> = {
  incomplete: "Tamamlamadı",
  stale: "Süresi geçti",
  repeated_struggle: "Tekrar tekrar zorlandı",
};

// The status word carries the meaning; the pill's tone only repeats it.
const STATUS_BADGE: Record<AssignmentDisplayStatus, BadgeVariant> = {
  active: "primary",
  draft: "neutral",
  past_due: "danger",
  archived: "neutral",
};

/** The deadline as a calendar date. `dueAt` is always the END of the local
 *  day the teacher picked (assignmentDueDate.ts), so the time of day is an
 *  implementation detail, not a choice anyone made — it is not printed. */
function formatDueDate(dueAt: number | null): string | null {
  if (dueAt === null || !Number.isFinite(dueAt)) return null;
  return new Date(dueAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

/** "Sınıf · Ders · Konu · N. sınıf", from fields that exist; a class name not
 *  yet loaded, or a field empty on an older document, is left out rather
 *  than printed as a stray separator. */
function contextLine(parts: readonly (string | null | undefined)[]): string {
  return parts
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join(" · ");
}

// Read-only, same invariant as ClassPerformanceScreen/StudentPerformanceScreen
// — a teacher can see every student's real progress here, but nothing on
// this screen can change a student's own study state.
//
// Phase 128 — ONE assignment, in three views. The identity stays on top; the
// overview answers what this is and how far the class has got; Öğrenciler is
// this assignment's actual responses, one canonical status per targeted
// student, each opening that student's canonical performance screen; Sorular
// is what was asked, in the order it was assigned.
//
// "Yanıtları İncele" leads to Öğrenciler, because that IS where this
// assignment's responses live. The product has no assignment-scoped review
// route: "Yanıt İncelemeleri" is the class's answer-publication queue
// (moderationSubmissions, Phase 97) and knows nothing about assignments, so
// pointing this button there would send a teacher to an unrelated list.
export function AssignmentDetailScreen({ assignmentId }: AssignmentDetailScreenProps) {
  const { assignment, progress, outcomeInsights, followUp, isLoading, error, notFound, refresh } =
    useAssignmentDetail(assignmentId);
  // ONE classes/{classId} get, for the class's name and whether it is archived.
  const classRoom = useClassRoom(assignment?.classId);
  const [tab, setTab] = useState<AssignmentDetailTab>("overview");
  // Nothing is read for the questions until the teacher opens them.
  const questions = useAssignmentQuestions(assignment?.questionIds ?? null, tab === "questions");
  const scrollRef = useRef<ScrollView>(null);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= stackAtFontScale;
  const outcomeGlyph = outcomeInsights ? assignmentEffectivenessGlyph(outcomeInsights.effectiveness) : null;

  function selectTab(next: AssignmentDetailTab) {
    setTab(next);
    // A view switched while scrolled deep into the previous one would open
    // halfway down the new one.
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function openStudent(row: StudentAssignmentRow) {
    if (!assignment) return;
    // The ONE student destination (Phase 123/124), with the name this row
    // already resolved from the class roster.
    router.push(teacherStudentRoute(assignment.classId, row.studentUid, row.displayName));
  }

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

  const header = (
    <View style={[styles.header, stacked ? styles.headerStacked : null]}>
      <AppBackButton
        fallbackHref={
          assignment
            ? { pathname: "/(teacher)/class/[classId]", params: { classId: assignment.classId } }
            : "/(teacher)/(tabs)/classes"
        }
        style={styles.backButton}
      />
      <Text style={styles.title} accessibilityRole="header">
        {ASSIGNMENT_DETAIL_TITLE}
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        {header}
        <View style={styles.skeletonList} accessible accessibilityLabel="Çalışma yükleniyor">
          <LoadingSkeleton height={120} borderRadius={radius.xl} />
          <LoadingSkeleton height={48} borderRadius={radius.lg} />
          <LoadingSkeleton height={140} borderRadius={radius.xl} />
        </View>
      </SafeAreaView>
    );
  }

  if (notFound) {
    // Permanent: retrying cannot bring a deleted document back, so no retry
    // is offered — the back button is the way out.
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        {header}
        <View style={styles.centered}>
          <EmptyState
            icon="document-outline"
            title="Bu çalışma artık mevcut değil"
            description="Silinmiş ya da artık görüntülenemiyor olabilir."
          />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !assignment || !progress) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        {header}
        <View style={styles.centered}>
          <EmptyState icon="cloud-offline-outline" title={error ?? "Çalışma bilgileri yüklenemedi."} />
          <PrimaryButton label="Tekrar Dene" onPress={refresh} />
        </View>
      </SafeAreaView>
    );
  }

  const displayStatus = resolveAssignmentDisplayStatus(assignment.status, assignment.dueAt, Date.now());
  const statusWord = assignmentStatusLabel(displayStatus);
  const dueDate = formatDueDate(assignment.dueAt);
  const context = contextLine([
    classRoom?.name,
    assignment.subject,
    assignment.topic,
    assignment.gradeLevel ? `${assignment.gradeLevel}. sınıf` : null,
  ]);
  const counts = countAssignmentStatuses(progress.rows);
  const hasStudents = progress.totalStudents > 0;
  // No client write is permitted in an archived class, so the one action that
  // would end in one is not offered there.
  const canCreateFollowUp = followUp.length > 0 && classRoom?.status !== "archived";

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      {header}
      <ScrollView
        ref={scrollRef}
        style={styles.scroller}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* WHICH assignment — the title in full, its real status in words,
            and the context it was made for. */}
        <View
          style={styles.identity}
          accessible
          accessibilityLabel={`${assignment.title}. ${statusWord}.${context ? ` ${context}.` : ""}`}
        >
          <Text style={styles.assignmentTitle}>{assignment.title}</Text>
          <Badge label={statusWord} variant={STATUS_BADGE[displayStatus]} />
          {context ? <Text style={styles.context}>{context}</Text> : null}
        </View>

        <AssignmentDetailTabs selected={tab} onSelect={selectTab} />

        {tab === "overview" ? (
          <>
            {/* Only facts the document holds. */}
            <View style={styles.facts}>
              <Fact icon="calendar-outline" label="Son tarih" value={dueDate ?? "Son tarih yok"} />
              <Fact icon="document-text-outline" label="Soru sayısı" value={`${assignment.targetCount} soru`} />
              <Fact icon="people-outline" label="Hedef" value={`${progress.totalStudents} öğrenci`} />
              {assignment.description ? (
                <Text style={styles.description}>{assignment.description}</Text>
              ) : null}
            </View>

            <View style={styles.section}>
              <SectionHeader title="Yanıt Durumu" />
              {hasStudents ? (
                <>
                  <AssignmentResponseSummary
                    totalStudents={progress.totalStudents}
                    counts={counts}
                    hasDeadline={assignment.dueAt !== null}
                  />
                  <PrimaryButton
                    label={REVIEW_RESPONSES_LABEL}
                    onPress={() => selectTab("students")}
                    accessibilityHint="Bu çalışmadaki öğrenci yanıtlarını gösterir"
                  />
                </>
              ) : (
                <Text style={styles.muted}>Bu çalışma henüz bir öğrenciye atanmadı.</Text>
              )}
            </View>

            {outcomeInsights && outcomeInsights.effectiveness !== "insufficient_data" ? (
              <View style={styles.section}>
                <SectionHeader title="Bu Çalışmada Ne Oldu?" />
                <View style={styles.card}>
                  {outcomeGlyph ? (
                    <StatusLabel icon={outcomeGlyph.icon} tone={outcomeGlyph.tone} textStyle={styles.cardLine}>
                      {effectivenessLabel(outcomeInsights.effectiveness)}
                    </StatusLabel>
                  ) : (
                    <Text style={styles.cardLine}>{effectivenessLabel(outcomeInsights.effectiveness)}</Text>
                  )}
                  {outcomeInsights.topicOutcome.struggleRate !== null ? (
                    <Text style={styles.cardMuted}>
                      {`%${Math.round(outcomeInsights.topicOutcome.struggleRate * 100)} zorlanma oranı`}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {followUp.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader title="Takip Gerekenler" />
                <View style={styles.card}>
                  {followUp.map((entry: AssignmentFollowUpEntry) => (
                    <Text key={entry.studentUid} style={styles.cardLine}>
                      {entry.displayName} · {entry.reasons.map((reason) => FOLLOW_UP_REASON_LABEL[reason]).join(", ")}
                    </Text>
                  ))}
                  {/* Secondary on purpose: "Yanıtları İncele" is this screen's
                      one dominant action. */}
                  {canCreateFollowUp ? (
                    <PrimaryButton
                      label="Takip Ödevi Oluştur"
                      variant="secondary"
                      onPress={handleCreateFollowUp}
                      accessibilityHint="Bu öğrenciler için yeni bir çalışma hazırlar"
                    />
                  ) : null}
                </View>
              </View>
            ) : null}
          </>
        ) : null}

        {tab === "students" ? (
          <View style={styles.section}>
            <SectionHeader title={`Öğrenci Yanıtları (${progress.totalStudents})`} />
            {hasStudents ? (
              <View style={styles.list}>
                {/* The assignment's own target order, unchanged — never
                    re-sorted by progress. */}
                {progress.rows.map((row) => (
                  <AssignmentStudentRow
                    key={row.studentUid}
                    row={row}
                    targetCount={assignment.targetCount}
                    onOpen={openStudent}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.muted}>Bu çalışma henüz bir öğrenciye atanmadı.</Text>
            )}
          </View>
        ) : null}

        {tab === "questions" ? (
          <View style={styles.section}>
            <SectionHeader title={`Sorular (${assignment.questionIds.length})`} />
            {assignment.questionIds.length === 0 ? (
              <Text style={styles.muted}>Bu çalışmada soru yok.</Text>
            ) : questions.entries ? (
              <AssignmentQuestionList entries={questions.entries} />
            ) : (
              <View style={styles.list} accessible accessibilityLabel="Sorular yükleniyor">
                <LoadingSkeleton height={88} borderRadius={radius.lg} />
                <LoadingSkeleton height={88} borderRadius={radius.lg} />
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
      {/* Decorative: the label beside it names the fact. */}
      <Ionicons name={icon} size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
      <View style={styles.factText}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.factValue}>{value}</Text>
      </View>
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
    width: "100%",
    maxWidth: contentWidth.readable,
    alignSelf: "center",
  },
  // Stacked, the 44pt chevron tops-aligns with a title that wraps.
  headerStacked: {
    alignItems: "flex-start",
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
    minWidth: 0,
  },
  skeletonList: {
    padding: spacing.lg,
    gap: spacing.md,
    width: "100%",
    maxWidth: contentWidth.readable,
    alignSelf: "center",
  },
  scroller: {
    flex: 1,
    width: "100%",
    maxWidth: contentWidth.readable,
    alignSelf: "center",
  },
  content: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.lg,
  },
  identity: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.xs,
  },
  assignmentTitle: {
    ...typography.screenTitleSm,
    color: colors.textPrimary,
  },
  context: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  facts: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  // One fact per line, never a row of fixed-width tiles: the label and value
  // wrap in their own column at every text size.
  fact: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  factText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  factLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  factValue: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
  },
  section: {
    gap: spacing.sm,
  },
  list: {
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardLine: {
    ...typography.body,
    color: colors.textPrimary,
  },
  cardMuted: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  muted: {
    ...typography.body,
    color: colors.textTertiary,
  },
}));
