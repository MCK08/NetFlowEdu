import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandLockup } from "@components/ui/BrandMark";
import { EmptyState as SharedEmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useAuth } from "@features/authentication";
import { useTeacherClasses } from "@features/classes/hooks/useTeacherClasses";
import { DailyFlowSection } from "@features/dailyFlow/components/DailyFlowSection";
import { buildTeacherDailyFlow } from "@features/dailyFlow/services/buildTeacherDailyFlow";
import { DailyFlowItem } from "@features/dailyFlow/services/dailyFlowTypes";
import { useClassPerformance } from "@features/teacher/hooks/useClassPerformance";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { FeedChannelBar } from "../components/FeedChannelBar";
import { FeedFilterSheet } from "../components/FeedFilterSheet";
import { LaunchFeedCard } from "../components/LaunchFeedCard";
import { StudentSignalCard } from "../components/StudentSignalCard";
import { useClassScopedQuestions } from "../hooks/useClassScopedQuestions";
import { useSocialFeed } from "../hooks/useSocialFeed";
import { selectOwnQuestions } from "../services/channelSelection";
import {
  channelDescriptor,
  channelsForRole,
  FeedChannel,
  resolveChannelForRole,
} from "../services/feedChannels";
import {
  activeFeedFilterCount,
  EMPTY_FEED_FILTER,
  FeedFilter,
  filterQuestions,
  isFeedFilterActive,
} from "../services/feedFilters";
import { Question } from "../types";

// Phase 50 — the teacher's launch surface.
//
// A DISCOVERY / ACTION ENTRY POINT, NOT A SECOND DASHBOARD (§19)
//
// Every card here leads INTO an existing screen (question detail, the
// assignment composer, Student Performance). Nothing on this screen
// computes a statistic of its own, and Class Performance / Teacher
// Dashboard remain exactly where they were — this feed never replaces or
// duplicates them.
//
// READ COST (§24/§41): channels are lazy. "Keşfet"/"İçeriklerim" share the
// one useSocialFeed fetch; "Sınıfım" and "Öğrenci Sinyalleri" only fetch
// while selected. "Öğrenci Sinyalleri" reuses useClassPerformance — the
// same already-aggregated per-class load the Class Performance screen
// itself uses — and never issues a per-card student query.

const MAX_CONTENT_WIDTH = 680;

function keyExtractor(item: Question) {
  return item.id;
}

export function TeacherFeedScreen() {
  const { width } = useWindowDimensions();
  const { firebaseUser, role } = useAuth();
  const uid = firebaseUser?.uid;

  const channels = useMemo(() => channelsForRole(role), [role]);
  const [channel, setChannel] = useState<FeedChannel | null>(null);
  const activeChannel = resolveChannelForRole(channel, role);

  const [filter, setFilter] = useState<FeedFilter>(EMPTY_FEED_FILTER);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const { questions, isLoading, isLoadingMore, isRefreshing, error, hasMore, loadMore, refresh } =
    useSocialFeed(uid);

  const { classes } = useTeacherClasses(uid);
  const classIds = useMemo(() => classes.map((classRoom) => classRoom.id), [classes]);
  const {
    questions: classQuestions,
    isLoading: isLoadingClasses,
    refresh: refreshClasses,
  } = useClassScopedQuestions(classIds, activeChannel === "my_class");

  // KNOWN LIMITATION (documented, not hidden): signals are loaded for the
  // teacher's FIRST class only. useClassPerformance is a per-class hook and
  // fanning it out across every class would multiply its own per-student
  // reads by the class count — exactly the fan-out §24/§41 forbid. The full
  // multi-class picture stays one tap away in Class Performance.
  // Phase 53 — Daily Flow needs this class's aggregated signals on every
  // teacher feed open, not only while the signals channel is selected, so
  // the load is no longer gated on the channel.
  //
  // READ COST: this is the SAME single per-class aggregate the Class
  // Performance screen and the signals channel already perform (one members
  // query + one class-sourced studyItems read per student), now paid once on
  // feed open instead of once on channel open. It is still scoped to ONE
  // class — the teacher's first — exactly as Phase 50 established. No
  // fan-out across classes was added, and no per-student intervention
  // effectiveness read was added; see buildTeacherDailyFlow's own note on
  // why Phase 47's verdicts stay in Student Performance.
  const signalClassId = classIds[0];
  const { attentionCards, topicHotspots, isLoading: isLoadingSignals } =
    useClassPerformance(signalClassId);

  const dailyFlowItems = useMemo(
    () =>
      buildTeacherDailyFlow({
        attentionCards,
        topicHotspots,
        classId: signalClassId ?? null,
      }),
    [attentionCards, topicHotspots, signalClassId],
  );

  // Only students there is actually something to DO about — the exact same
  // needs_attention/watch rule buildTeacherActionSummary already applies to
  // the dashboard's action list, reused rather than re-derived. A student
  // who is progressing or strong is not a signal to act on, and one with
  // insufficient data must never be presented as one either; all three stay
  // fully visible in Class Performance, which this channel links into.
  const signalCards = useMemo(
    () =>
      attentionCards.filter(
        (card) =>
          card.insight.category === "needs_attention" || card.insight.category === "watch",
      ),
    [attentionCards],
  );

  const channelQuestions = useMemo(() => {
    if (activeChannel === "my_class") return classQuestions;
    if (activeChannel === "my_content") return selectOwnQuestions(questions, uid);
    return questions;
  }, [activeChannel, classQuestions, questions, uid]);

  const visibleQuestions = useMemo(
    () => filterQuestions(channelQuestions, filter),
    [channelQuestions, filter],
  );

  const listRef = useRef<FlatList<Question>>(null);
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [activeChannel, filter]);

  // "Ödevde Kullan" — opens the EXISTING assignment composer prefilled from
  // the question's own real metadata. No assignment is created here and no
  // assignment semantics change (§18); the teacher still confirms and
  // publishes in the composer exactly as before. gradeLevel is passed only
  // when the question actually has one — never defaulted (§9).
  //
  // This is the teacher card's ONLY navigation target. Question detail lives
  // at a (student)-group route with no teacher-group equivalent, and pushing
  // across groups from the teacher stack is not a path this phase verified —
  // so rather than ship an action that might strand a teacher in the wrong
  // navigator, the card simply does not offer one when it cannot compose.
  const openAssignmentComposer = useCallback(
    (question: Question) => {
      const classId = question.classId ?? classIds[0];
      if (!classId) return;
      const params: { classId: string } & Record<string, string> = { classId };
      if (question.subject) params.subject = question.subject;
      if (question.topic) params.topic = question.topic;
      if (question.gradeLevel) params.gradeLevel = question.gradeLevel;
      router.push({
        pathname: "/(teacher)/class/[classId]/assignment/create",
        params,
      });
    },
    [classIds],
  );

  const openStudent = useCallback(
    (studentUid: string) => {
      const classId = signalClassId ?? classIds[0];
      if (!classId) return;
      router.push({
        pathname: "/(teacher)/class/[classId]/student/[studentId]",
        params: { classId, studentId: studentUid },
      });
    },
    [classIds, signalClassId],
  );

  // Every target maps to a route this app already had before Phase 53.
  const handleDailyFlowPress = useCallback(
    (item: DailyFlowItem) => {
      if (item.target.kind === "student_performance") {
        openStudent(item.target.studentUid);
        return;
      }
      if (item.target.kind === "assignment_composer") {
        const params: { classId: string } & Record<string, string> = {
          classId: item.target.classId,
          subject: item.target.subject,
          topic: item.target.topic,
        };
        // Phase 43's rule, preserved: an unresolvable grade is omitted, not
        // defaulted — a confidently-wrong grade silently changes which
        // questions the composer selects.
        if (item.target.gradeLevel) params.gradeLevel = item.target.gradeLevel;
        router.push({ pathname: "/(teacher)/class/[classId]/assignment/create", params });
      }
    },
    [openStudent],
  );

  const canCompose = classIds.length > 0;
  const renderItem = useCallback(
    ({ item }: { item: Question }) => (
      <LaunchFeedCard
        question={item}
        // "Ödevde Kullan" is only offered where it can actually land: it
        // needs a class to compose against. A teacher with no class yet gets
        // a card with no action rather than a button that goes nowhere.
        actionLabel={canCompose ? "Ödevde Kullan" : null}
        onPressAction={() => openAssignmentComposer(item)}
        onPressCard={() => {
          if (canCompose) openAssignmentComposer(item);
        }}
      />
    ),
    [canCompose, openAssignmentComposer],
  );

  const handleEndReached = useCallback(() => {
    if (activeChannel === "my_class" || activeChannel === "student_signals") return;
    if (hasMore) loadMore();
  }, [activeChannel, hasMore, loadMore]);

  const handleRefresh = useCallback(() => {
    if (activeChannel === "my_class") {
      refreshClasses();
      return;
    }
    refresh();
  }, [activeChannel, refresh, refreshClasses]);

  const activeFilterCount = activeFeedFilterCount(filter);
  const descriptor = activeChannel ? channelDescriptor(activeChannel, role) : null;
  const isSignalsChannel = activeChannel === "student_signals";
  const isChannelLoading = isSignalsChannel
    ? isLoadingSignals
    : activeChannel === "my_class"
      ? isLoadingClasses
      : isLoading;

  const contentWidthStyle = width > MAX_CONTENT_WIDTH ? { maxWidth: MAX_CONTENT_WIDTH } : null;

  const header = (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        {/* Phase 52 — compact on purpose: the feed is content-first,
            so the brand identifies the surface without competing
            with the first card. */}
        <BrandLockup size="compact" />
        {/* The signals channel is not a question list, so a question filter
            would do nothing there — hidden rather than shown-and-inert. */}
        {!isSignalsChannel ? (
          <Pressable
            onPress={() => setIsFilterSheetOpen(true)}
            style={styles.filterButton}
            accessibilityRole="button"
            accessibilityLabel="Filtrele"
          >
            <Ionicons name="options-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.filterButtonText}>Filtrele</Text>
            {activeFilterCount > 0 ? (
              <View style={styles.filterCountBadge}>
                <Text style={styles.filterCountText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>

      {/* Phase 53 §31 — part of the launch shell, above the channel bar, so
          it neither disappears nor duplicates across teacher channels. */}
      <DailyFlowSection
        title="Bugün Sınıfında"
        items={dailyFlowItems}
        emptyText={
          canCompose
            ? "Şu anda acil bir öğrenci sinyali görünmüyor."
            : "Bir sınıf oluşturduğunda öğrenci sinyalleri burada görünecek."
        }
        onPressItem={handleDailyFlowPress}
      />

      <FeedChannelBar channels={channels} activeChannel={activeChannel} onSelect={setChannel} />

      {activeFilterCount > 0 && !isSignalsChannel ? (
        <View style={styles.activeFilterRow}>
          {filter.subject ? (
            <Pressable
              onPress={() => setFilter({ ...filter, subject: null })}
              style={styles.activeFilterChip}
              accessibilityRole="button"
              accessibilityLabel={`${filter.subject} filtresini kaldır`}
            >
              <Text style={styles.activeFilterText}>{filter.subject}</Text>
              <Ionicons name="close" size={12} color={colors.primary} />
            </Pressable>
          ) : null}
          {filter.topic ? (
            <Pressable
              onPress={() => setFilter({ ...filter, topic: null })}
              style={styles.activeFilterChip}
              accessibilityRole="button"
              accessibilityLabel={`${filter.topic} filtresini kaldır`}
            >
              <Text style={styles.activeFilterText}>{filter.topic}</Text>
              <Ionicons name="close" size={12} color={colors.primary} />
            </Pressable>
          ) : null}
          {filter.gradeLevel ? (
            <Pressable
              onPress={() => setFilter({ ...filter, gradeLevel: null })}
              style={styles.activeFilterChip}
              accessibilityRole="button"
              accessibilityLabel={`${filter.gradeLevel}. sınıf filtresini kaldır`}
            >
              <Text style={styles.activeFilterText}>{filter.gradeLevel}. sınıf</Text>
              <Ionicons name="close" size={12} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.centerColumn}>
        <View style={[styles.column, contentWidthStyle]}>
          {header}

          {isChannelLoading ? (
            <View style={styles.skeletonList}>
              <LoadingSkeleton height={280} borderRadius={16} />
              <LoadingSkeleton height={280} borderRadius={16} />
            </View>
          ) : error && questions.length === 0 && !isSignalsChannel ? (
            <View style={styles.centered}>
              <SharedEmptyState icon="cloud-offline-outline" title={error} />
              <PrimaryButton label="Tekrar Dene" onPress={refresh} />
            </View>
          ) : isSignalsChannel ? (
            <FlatList
              data={signalCards}
              keyExtractor={(item) => item.studentUid}
              renderItem={({ item }) => (
                <StudentSignalCard
                  displayName={item.displayName}
                  reason={item.insight.reasons[0] ?? ""}
                  onPress={() => openStudent(item.studentUid)}
                />
              )}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <SharedEmptyState
                  icon="checkmark-circle-outline"
                  title={descriptor?.emptyTitle ?? "Şu anda dikkat gerektiren bir sinyal yok."}
                />
              }
            />
          ) : (
            <FlatList
              ref={listRef}
              data={visibleQuestions}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
              }
              onEndReachedThreshold={0.6}
              onEndReached={handleEndReached}
              initialNumToRender={4}
              maxToRenderPerBatch={6}
              windowSize={7}
              removeClippedSubviews
              ListEmptyComponent={
                isFeedFilterActive(filter) ? (
                  <SharedEmptyState
                    icon="filter-outline"
                    title="Bu filtreye uyan soru yok"
                    description="Farklı bir ders, sınıf veya konu deneyebilirsiniz."
                  />
                ) : (
                  <SharedEmptyState
                    icon="sparkles-outline"
                    title={descriptor?.emptyTitle ?? "Burada henüz içerik yok."}
                  />
                )
              }
              ListFooterComponent={
                isLoadingMore ? (
                  <View style={styles.loadingMore}>
                    <ActivityIndicator color={colors.textSecondary} />
                  </View>
                ) : null
              }
            />
          )}
        </View>
      </View>

      <FeedFilterSheet
        visible={isFilterSheetOpen}
        filter={filter}
        onChange={setFilter}
        onClose={() => setIsFilterSheetOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerColumn: {
    flex: 1,
    alignItems: "center",
  },
  column: {
    flex: 1,
    width: "100%",
  },
  header: {
    gap: spacing.xxs,
    paddingTop: spacing.xs,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxs,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 36,
  },
  filterButtonText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  filterCountBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textInverse,
  },
  activeFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  activeFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    backgroundColor: colors.primaryMuted,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  activeFilterText: {
    ...typography.label,
    color: colors.primary,
  },
  listContent: {
    padding: spacing.md,
    paddingTop: spacing.xs,
    gap: spacing.md,
  },
  skeletonList: {
    padding: spacing.md,
    gap: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  loadingMore: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
}));
