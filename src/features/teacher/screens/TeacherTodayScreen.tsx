import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { useAuth } from "@features/authentication";
import { useSignOut } from "@features/authentication/hooks/useSignOut";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import { resolvePublicIdentity } from "@utils/publicIdentity";

import { ClassAttentionPanel } from "../components/ClassAttentionPanel";
import { TeacherClassSwitcher } from "../components/TeacherClassSwitcher";
import { TeacherDashboardHeader } from "../components/TeacherDashboardHeader";
import { TeacherWorkRow } from "../components/TeacherWorkRow";
import { useTeacherToday } from "../context/TeacherTodayContext";
import { useAnswerReviewQueue } from "../hooks/useAnswerReviewQueue";
import { useCommentReviewQueue } from "../hooks/useCommentReviewQueue";
import { resolveGreeting } from "../services/teacherDashboardStats";
import { buildTodaySummary, reviewPendingLabel, upcomingAssignments } from "../services/teacherToday";

// Phase 111 — "Bugün", the teacher's home.
//
// It answers one question — what needs me today — and then gets out of the
// way. No metric grid, no chart above the actions:
//
//   who you are        the existing greeting header (bell, sign-out)
//   which class        a switcher, only when there is a choice
//   one sentence       counted from the canonical action list, never filler
//   Bugün Öne Çıkanlar the Action Center's first five, with its own rows
//   Sınıf İşleri       reviews and due work that are REALLY waiting, and the
//                      one way to create new work
//   Soru Akışı         the discovery feed, one quiet row away
//
// Every row leads into a screen that already existed. Nothing here writes,
// scores or re-ranks: the list is the Action Center's, in its own order.
export function TeacherTodayScreen() {
  useThemeSubscription();
  const { firebaseUser, profile } = useAuth();
  const { signOut, isSigningOut } = useSignOut();
  const today = useTeacherToday();
  const { attention, selectedClass, activeClasses } = today;
  const classId = selectedClass?.id;

  const answers = useAnswerReviewQueue(classId);
  const comments = useCommentReviewQueue(classId);

  const greeting = useMemo(() => resolveGreeting(new Date()), []);
  const identity = resolvePublicIdentity(profile);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // The class list is one cheap query: re-read it whenever the tab comes back
  // into view, so a class created on Sınıflar appears here. The attention
  // list itself only reloads on an explicit pull — it is the expensive part.
  const { refreshClasses } = today;
  // The provider already read the list on mount; only a RETURN to this tab
  // needs a fresh read.
  const hasFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (hasFocusedRef.current) refreshClasses();
      hasFocusedRef.current = true;
    }, [refreshClasses]),
  );

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refreshClasses(), attention.refresh(), answers.refresh(), comments.refresh()]);
    setIsRefreshing(false);
  }, [refreshClasses, attention, answers, comments]);

  const summary = useMemo(() => buildTodaySummary(attention.items), [attention.items]);
  const upcoming = useMemo(() => upcomingAssignments(attention.assignments, Date.now()), [attention.assignments]);
  const answersLabel = reviewPendingLabel(answers.items.length, answers.hasMore, "yanıt");
  const commentsLabel = reviewPendingLabel(comments.items.length, comments.hasMore, "yorum");
  const showSummary = !attention.isLoadingList && !attention.error && attention.studentCount > 0;

  const openActions = () => router.navigate("/(teacher)/(tabs)/actions" as never);
  const openClasses = () => router.navigate("/(teacher)/(tabs)/classes" as never);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshAll} tintColor={colors.primary} />}
      >
        <View style={styles.column}>
          <TeacherDashboardHeader
            greeting={greeting}
            displayName={identity.primaryName}
            photoURL={profile?.photoURL ?? null}
            onSignOut={signOut}
            isSigningOut={isSigningOut}
            notificationUid={firebaseUser?.uid}
          />

          {today.isLoadingClasses && activeClasses.length === 0 ? (
            <LoadingSkeleton height={120} borderRadius={radius.xl} />
          ) : !selectedClass ? (
            <View style={styles.block}>
              <EmptyState
                icon="school-outline"
                title={today.classesError ?? "Henüz aktif bir sınıfın yok"}
                description="Bir sınıf oluşturduğunda öğrencilerin ve günlük işlerin burada görünür."
              />
              <PrimaryButton label="Sınıflara Git" onPress={openClasses} />
            </View>
          ) : (
            <>
              <TeacherClassSwitcher
                classes={activeClasses}
                selectedClassId={selectedClass.id}
                onSelect={today.selectClass}
              />

              <View style={styles.summary}>
                <Text style={styles.className}>{selectedClass.name}</Text>
                {showSummary ? <Text style={styles.sentence}>{summary.sentence}</Text> : null}
              </View>

              <ClassAttentionPanel classId={selectedClass.id} attention={attention} mode="summary" onViewAll={openActions} />

              <View style={styles.block}>
                <SectionHeader title="Sınıf İşleri" />
                <View>
                  {answersLabel ? (
                    <TeacherWorkRow
                      icon="chatbubbles-outline"
                      title={answersLabel}
                      onPress={() =>
                        router.push({
                          pathname: "/(teacher)/class/[classId]/answer-reviews",
                          params: { classId: selectedClass.id },
                        })
                      }
                      accessibilityHint="Yanıt incelemelerini açar"
                    />
                  ) : null}
                  {commentsLabel ? (
                    <TeacherWorkRow
                      icon="chatbox-ellipses-outline"
                      title={commentsLabel}
                      onPress={() =>
                        router.push({
                          pathname: "/(teacher)/class/[classId]/comment-reviews",
                          params: { classId: selectedClass.id },
                        })
                      }
                      accessibilityHint="Yorum incelemelerini açar"
                    />
                  ) : null}
                  {upcoming.map((assignment) => (
                    <TeacherWorkRow
                      key={assignment.id}
                      icon="clipboard-outline"
                      title={assignment.title}
                      detail={assignment.dueLabel}
                      onPress={() =>
                        router.push({
                          pathname: "/(teacher)/class/[classId]/assignment/[assignmentId]",
                          params: { classId: selectedClass.id, assignmentId: assignment.id },
                        })
                      }
                      accessibilityHint="Çalışmanın ayrıntısını açar"
                    />
                  ))}
                </View>
                <PrimaryButton
                  label="Yeni Çalışma Oluştur"
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: "/(teacher)/class/[classId]/assignment/create",
                      params: { classId: selectedClass.id },
                    })
                  }
                  accessibilityHint="Bu sınıf için yeni bir çalışma hazırlar"
                />
              </View>
            </>
          )}

          <View style={styles.block}>
            <TeacherWorkRow
              icon="compass-outline"
              title="Soru Akışı"
              detail="Keşfet, içeriklerini gör ve soruları çalışmada kullan"
              onPress={() => router.push("/(teacher)/feed" as never)}
              accessibilityHint="Soru akışını açar"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    alignItems: "center",
  },
  column: {
    width: "100%",
    maxWidth: contentWidth.readable,
    gap: spacing.lg,
  },
  block: {
    gap: spacing.sm,
  },
  summary: {
    gap: spacing.xxs,
  },
  className: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.primary,
  },
  sentence: {
    ...typography.title,
    color: colors.textPrimary,
  },
}));
