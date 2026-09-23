import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import { ActivityIndicator, FlatList, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { AppBackButton } from "@components/ui/AppBackButton";
import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { useAuth } from "@features/authentication";
import { QuestionGridItem } from "@features/profile/components/QuestionGridItem";
import { ClassAttentionPanel } from "@features/teacher/components/ClassAttentionPanel";
import { TeacherWorkRow } from "@features/teacher/components/TeacherWorkRow";
import { useClassAttention } from "@features/teacher/hooks/useClassAttention";
import { teacherStudentRoute } from "@features/teacher/services/actionCenterNavigation";
import { upcomingAssignments } from "@features/teacher/services/teacherToday";
import { useNavigationGuard } from "@hooks/useNavigationGuard";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget, stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { ClassMember } from "@/types/class";
import { Question } from "@/types/question";

import { ClassMemberRow } from "../components/ClassMemberRow";
import { TeacherClassIdentity } from "../components/TeacherClassIdentity";
import { useClassDetail } from "../hooks/useClassDetail";
import { useClassQuestions } from "../hooks/useClassQuestions";
import { useClassUpload } from "../hooks/useClassUpload";

interface TeacherClassDetailScreenProps {
  classId: string;
}

const GRID_COLUMNS = 3;

export const CLASS_ATTENTION_TITLE = "Dikkat Gerektirenler";
export const CLASS_WORK_TITLE = "Sınıf İşleri";
export const CLASS_STUDENTS_TITLE = "Öğrenciler";
export const CLASS_QUESTIONS_TITLE = "Sınıf Soruları";
export const CLASS_INSIGHT_TITLE = "Sınıfı İncele";

// Phase 123 — the teacher's class page, finally shaped like the job.
//
// It used to be identity followed by EIGHT full-width buttons — a menu of
// other screens, with the class's own content (who needs attention, what work
// is waiting, who is in the room) either buried under them or absent. The
// same destinations are all still here, in the order a teacher works in:
//
//   identity          which class, how many members, the code — and Share
//   birincil eylemler the two things done IN the room: sohbet, soru ekle
//   Dikkat Gerektirenler  the canonical action list's own first five
//   Sınıf İşleri      the work that is really waiting, and one way to add some
//   Öğrenciler        the roster, each row into that student's own screen
//   Sınıfı İncele     the deep readings, as quiet rows
//   Sınıf Soruları    the class's questions, the list's own body
//
// NOTHING NEW IS READ. The attention list (useClassAttention) already fetches
// this class's assignments for its own escalations, so "Sınıf İşleri" draws
// upcoming work from that same array through the SAME pure helper Bugün uses
// (upcomingAssignments). The review queues stay as rows without counts: a
// count would cost a query per queue on every open, and an invented one is
// worse than none.
//
// Every state on this page is the class document's own. An archived class —
// a status the type has always allowed and no client write can produce —
// keeps its readings and loses exactly the controls firestore.rules would
// refuse anyway.
export function TeacherClassDetailScreen({ classId }: TeacherClassDetailScreenProps) {
  useThemeSubscription();
  const { firebaseUser } = useAuth();
  const { width, fontScale } = useWindowDimensions();
  const { classRoom, members, isLoading, isMutating, errorMessage, removeMember, regenerateCode } =
    useClassDetail(classId);
  const { questions, isLoadingMore, hasMore, loadMore, prepend } = useClassQuestions(classId);
  // Phase 111 — this class's attention list, on the class page itself, so a
  // teacher sees who needs them without first choosing a lens. The SAME
  // composition the Action Center route runs (useClassAttention), for THIS
  // class only.
  const attention = useClassAttention(classId);
  const { isUploading, capture } = useClassUpload({
    uid: firebaseUser?.uid,
    organizationId: classRoom?.organizationId ?? null,
    classId,
    onUploaded: prepend,
  });
  // Prevents a double-tap from pushing the same screen twice — same guard
  // already used by the student class detail screen's feed button.
  const guardedNavigate = useNavigationGuard();

  const go = useCallback(
    (key: string, href: Parameters<typeof router.push>[0]) => guardedNavigate(key, () => router.push(href)),
    [guardedNavigate],
  );

  const openStudent = useCallback(
    (member: ClassMember) => {
      guardedNavigate(`student-${member.uid}`, () =>
        router.push(teacherStudentRoute(classId, member.uid, member.displayName ?? "")),
      );
    },
    [guardedNavigate, classId],
  );

  // The assignments the attention hook ALREADY holds, read through Bugün's
  // own pure helper. No second query, no second ordering rule.
  const upcoming = useMemo(
    () => upcomingAssignments(attention.assignments, Date.now()),
    [attention.assignments],
  );

  if (isLoading || !classRoom) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <View style={styles.loadingHeader}>
          <AppBackButton fallbackHref="/(teacher)/(tabs)/classes" style={styles.backButton} />
        </View>
        <View style={styles.loadingBody} accessible accessibilityLabel="Sınıf yükleniyor" accessibilityLiveRegion="polite">
          <LoadingSkeleton height={140} borderRadius={radius.xl} />
          <LoadingSkeleton height={88} borderRadius={radius.lg} />
          <LoadingSkeleton height={88} borderRadius={radius.lg} />
        </View>
      </SafeAreaView>
    );
  }

  const itemSize = width / GRID_COLUMNS;
  // No client write is permitted on an archived class, so no control that
  // would need one is drawn. The readings all stay.
  const isArchived = classRoom.status !== "active";
  const canWrite = !isArchived;
  const stackedActions = fontScale >= stackAtFontScale;
  const studentMembers = members.filter((member) => member.role !== "teacher");

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <FlatList
        data={questions}
        keyExtractor={(item: Question) => item.id}
        numColumns={GRID_COLUMNS}
        renderItem={({ item }) => (
          <QuestionGridItem question={item} size={itemSize} showPosterRoleBadge />
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore) loadMore();
        }}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <AppBackButton fallbackHref="/(teacher)/(tabs)/classes" style={styles.backButton} />

            <TeacherClassIdentity
              classRoom={classRoom}
              onRegenerateCode={canWrite ? regenerateCode : undefined}
              isMutating={isMutating}
            />

            {errorMessage ? (
              <Text style={styles.error} accessibilityRole="alert">
                {errorMessage}
              </Text>
            ) : null}

            {/* The two things a teacher does IN the room, side by side: the
                conversation and adding a question to it. Everything else on
                this page is a reading or a queue. */}
            {canWrite ? (
              <View style={[styles.actions, stackedActions ? styles.actionsStacked : null]}>
                <AnimatedPressable
                  onPress={() => go("chat", { pathname: "/(teacher)/class/[classId]/chat", params: { classId } })}
                  style={[styles.action, styles.actionPrimary]}
                  accessibilityRole="button"
                  accessibilityLabel="Sınıf sohbetini aç"
                >
                  {/* Decorative: the control is labelled in words. */}
                  <Ionicons name="chatbubble-outline" size={iconSize.sm} color={colors.textInverse} accessibilityElementsHidden />
                  <Text style={styles.actionPrimaryText}>Sınıf Sohbeti</Text>
                </AnimatedPressable>

                <AnimatedPressable
                  onPress={capture}
                  disabled={isUploading}
                  style={[styles.action, styles.actionSecondary]}
                  accessibilityRole="button"
                  accessibilityLabel="Bu sınıfa soru ekle"
                  accessibilityState={{ busy: isUploading, disabled: isUploading }}
                >
                  {isUploading ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="camera-outline" size={iconSize.sm} color={colors.primary} accessibilityElementsHidden />
                      <Text style={styles.actionSecondaryText}>Soru Ekle</Text>
                    </>
                  )}
                </AnimatedPressable>
              </View>
            ) : null}

            {/* Phase 111 — who needs attention in this class, before any lens.
                The Action Center's own first five, rows and wording — "Tümünü
                Gör" opens the complete list. Nothing is counted or ordered
                here. */}
            <View style={styles.block}>
              <SectionHeader title={CLASS_ATTENTION_TITLE} />
              <ClassAttentionPanel
                classId={classId}
                attention={attention}
                mode="summary"
                showHeader={false}
                onViewAll={() => go("actions", { pathname: "/(teacher)/class/[classId]/actions", params: { classId } })}
              />
            </View>

            {/* Real work only: assignments that are genuinely still due (from
                the array the attention hook already read), and the two review
                queues. A queue row carries no number — see this file's head. */}
            <View style={styles.block}>
              <SectionHeader title={CLASS_WORK_TITLE} />
              <View>
                {upcoming.map((assignment) => (
                  <TeacherWorkRow
                    key={assignment.id}
                    icon="clipboard-outline"
                    title={assignment.title}
                    detail={assignment.dueLabel}
                    onPress={() =>
                      go(`assignment-${assignment.id}`, {
                        pathname: "/(teacher)/class/[classId]/assignment/[assignmentId]",
                        params: { classId, assignmentId: assignment.id },
                      })
                    }
                    accessibilityHint="Çalışmanın ayrıntısını açar"
                  />
                ))}
                <TeacherWorkRow
                  icon="shield-checkmark-outline"
                  title="Yanıt İncelemeleri"
                  onPress={() =>
                    go("answer-reviews", {
                      pathname: "/(teacher)/class/[classId]/answer-reviews",
                      params: { classId },
                    })
                  }
                  accessibilityHint="Otomatik incelemenin karar veremediği öğrenci yanıtlarını açar"
                />
                <TeacherWorkRow
                  icon="chatbox-ellipses-outline"
                  title="Yorum İncelemeleri"
                  onPress={() =>
                    go("comment-reviews", {
                      pathname: "/(teacher)/class/[classId]/comment-reviews",
                      params: { classId },
                    })
                  }
                  accessibilityHint="Otomatik incelemenin karar veremediği öğrenci yorumlarını açar"
                />
              </View>
              {canWrite ? (
                <PrimaryButton
                  label="Yeni Çalışma Oluştur"
                  variant="secondary"
                  onPress={() =>
                    go("assignment-create", {
                      pathname: "/(teacher)/class/[classId]/assignment/create",
                      params: { classId },
                    })
                  }
                  accessibilityHint="Bu sınıf için yeni bir çalışma hazırlar"
                />
              ) : null}
            </View>

            <View style={styles.block}>
              <SectionHeader title={`${CLASS_STUDENTS_TITLE} (${studentMembers.length})`} />
              {members.length === 0 ? (
                <Text style={styles.quiet}>Öğrenciler sınıf koduyla katıldığında burada görünür.</Text>
              ) : (
                members.map((member) => (
                  <ClassMemberRow
                    key={member.uid}
                    member={member}
                    canRemove={canWrite && !isMutating}
                    onRemove={removeMember}
                    onOpen={member.role === "teacher" ? undefined : openStudent}
                  />
                ))
              )}
            </View>

            {/* The deep readings, as rows rather than a wall of buttons. Each
                one is a screen that already existed. */}
            <View style={styles.block}>
              <SectionHeader title={CLASS_INSIGHT_TITLE} />
              <View>
                <TeacherWorkRow
                  icon="today-outline"
                  title="Bugün Öne Çıkanlar"
                  detail="Takip, müdahale ve öğrenci aksiyonlarının tamamı"
                  onPress={() => go("actions", { pathname: "/(teacher)/class/[classId]/actions", params: { classId } })}
                  accessibilityHint="Bu sınıfın tüm aksiyon listesini açar"
                />
                <TeacherWorkRow
                  icon="stats-chart-outline"
                  title="Sınıf Performansı"
                  onPress={() =>
                    go("performance", { pathname: "/(teacher)/class/[classId]/performance", params: { classId } })
                  }
                  accessibilityHint="Sınıf performans ekranını açar"
                />
                <TeacherWorkRow
                  icon="trail-sign-outline"
                  title="Sınıfın İlerleme Hikâyesi"
                  onPress={() =>
                    go("learning-story", {
                      pathname: "/(teacher)/class/[classId]/learning-story",
                      params: { classId },
                    })
                  }
                  accessibilityHint="Sınıfın ilerleme hikâyesini açar"
                />
              </View>
            </View>

            <View style={styles.block}>
              <SectionHeader title={CLASS_QUESTIONS_TITLE} />
              {questions.length === 0 ? (
                <EmptyState icon="help-circle-outline" title="Henüz bu sınıfa soru eklenmedi" />
              ) : null}
            </View>
          </View>
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator color={colors.textPrimary} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    // The gap BETWEEN blocks; `block` below steps down so a heading and its
    // rows read as one thing.
    gap: spacing.lg,
  },
  block: {
    gap: spacing.sm,
  },
  loadingHeader: {
    paddingHorizontal: spacing.lg,
  },
  loadingBody: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  backButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    justifyContent: "center",
    marginLeft: -12,
    // Phase 103 — this header is a column, which stretches its children, and
    // IconButton centres its icon; without this the back chevron sat in the
    // middle of the row instead of at the leading edge.
    alignSelf: "flex-start",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionsStacked: {
    flexDirection: "column",
  },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 48,
    borderRadius: radius.md,
  },
  actionPrimary: {
    backgroundColor: colors.primary,
  },
  actionPrimaryText: {
    ...typography.button,
    color: colors.textInverse,
    flexShrink: 1,
    textAlign: "center",
  },
  actionSecondary: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  actionSecondaryText: {
    ...typography.button,
    color: colors.primary,
    flexShrink: 1,
    textAlign: "center",
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
  quiet: {
    ...typography.body,
    color: colors.textSecondary,
  },
  loadingMore: {
    paddingVertical: spacing.xl,
  },
}));
