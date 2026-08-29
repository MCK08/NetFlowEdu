import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
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
import { useStudentAssignments } from "@features/assignments/hooks/useStudentAssignments";
import { useAuth } from "@features/authentication";
import { useStudentClasses } from "@features/classes/hooks/useStudentClasses";
import { DailyFlowSection } from "@features/dailyFlow/components/DailyFlowSection";
import { buildStudentDailyFlow } from "@features/dailyFlow/services/buildStudentDailyFlow";
import { DailyFlowItem } from "@features/dailyFlow/services/dailyFlowTypes";
import { QuestionMetadataModal } from "@features/questions/components/QuestionMetadataModal";
import { CameraButton } from "@features/upload/components/CameraButton";
import { VisibilityPicker } from "@features/upload/components/VisibilityPicker";
import { useUpload } from "@features/upload/hooks/useUpload";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { FeedChannelBar } from "../components/FeedChannelBar";
import { FeedFilterSheet } from "../components/FeedFilterSheet";
import { LaunchFeedCard } from "../components/LaunchFeedCard";
import { useClassScopedQuestions } from "../hooks/useClassScopedQuestions";
import { useFeedPersonalizationSignals } from "../hooks/useFeedPersonalizationSignals";
import { useSocialFeed } from "../hooks/useSocialFeed";
import { selectStruggleQuestions } from "../services/channelSelection";
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
import { buildQuestionFeedRanking } from "../services/feedRanking";
import { Question } from "../types";

// Phase 50 — the student's launch surface.
//
// WHAT CHANGED FROM THE PRE-PHASE-50 FEED
//
// The previous implementation was a full-screen paged feed (pagingEnabled +
// snapToInterval = window height), which locks exactly one card to the
// viewport. Phase 50 §15 asks for the opposite: a natural continuous scroll
// where the next card peeks in, so the list below is a plain vertical
// FlatList of intrinsically-sized LaunchFeedCards. Upload, filtering,
// personalization and cursor pagination are all preserved unchanged — only
// the presentation and the new channel layer are new.
//
// READ COST (§24): "Sana Özel", "Keşfet" and "Zorlandıklarım" all read the
// SAME useSocialFeed pages (one shared fetch, filtered/reordered purely in
// memory). Only "Derslerim" adds reads, and only while it is the selected
// channel — see useClassScopedQuestions' own note.

// The web/tablet content column. Phone stays full-bleed; anything wider
// gets a centered reading column rather than cards stretched across a
// monitor (§33).
const MAX_CONTENT_WIDTH = 680;

function keyExtractor(item: Question) {
  return item.id;
}

export function FeedScreen() {
  const { width } = useWindowDimensions();
  const { firebaseUser, profile, role } = useAuth();
  const uid = firebaseUser?.uid;
  const organizationId = profile?.organizationId ?? null;

  const channels = useMemo(() => channelsForRole(role), [role]);
  const [channel, setChannel] = useState<FeedChannel | null>(null);
  // Narrowed through the role guard on every render, so a channel selected
  // as one role can never survive an account switch into another (§22).
  // `resolveChannelForRole` falls back to the role's own default.
  const activeChannel = resolveChannelForRole(channel, role);

  const [filter, setFilter] = useState<FeedFilter>(EMPTY_FEED_FILTER);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const {
    questions,
    isLoading,
    isLoadingMore,
    isRefreshing,
    error,
    hasMore,
    loadMore,
    refresh,
    prepend,
  } = useSocialFeed(uid);

  const {
    isUploading,
    isPickerOpen,
    openPicker,
    closePicker,
    captureWithVisibility,
    pendingImageUri,
    metadataError,
    cancelMetadata,
    submitMetadata,
  } = useUpload({ uid, organizationId, onUploaded: prepend });

  const { signalsByQuestionId, snapshot, refresh: refreshSignals } =
    useFeedPersonalizationSignals(uid);

  // Phase 53 — Daily Flow.
  //
  // READ COST: the learning half (weak topics, due count, history) comes out
  // of useFeedPersonalizationSignals' EXISTING single fetch — zero new
  // reads. useStudentAssignments is the one genuinely new source, and it is
  // required: an open assignment is the top of Phase 39's own priority
  // ladder, and there is no other place on this screen that assignment
  // state could be derived from. It is the same bounded read the Study Hub
  // already performs (one query + one submission doc per assignment
  // targeting this student), never per-class and never per-question.
  const { cards: assignmentCards, refresh: refreshAssignments } = useStudentAssignments(uid);

  const dailyFlowItems = useMemo(
    () =>
      buildStudentDailyFlow({
        assignmentCards,
        weakTopics: snapshot.weakTopics,
        dueCount: snapshot.dueCount,
        hasStudyHistory: snapshot.hasStudyHistory,
      }),
    [assignmentCards, snapshot],
  );

  // Fetched only while a channel that actually needs class content is
  // selected — a channel the student never opens costs nothing.
  //
  // "Zorlandıklarım" needs this too, not just "Derslerim": a student's
  // struggle evidence overwhelmingly sits on CLASS questions (that is what
  // their teacher assigns), and useSocialFeed only ever loads own + public
  // questions. Filtering the social pool alone produced an empty struggle
  // channel for a student with real, recorded struggles — reproduced against
  // the demo fixtures before this was widened.
  const needsClassQuestions = activeChannel === "my_classes" || activeChannel === "struggles";
  const { classes } = useStudentClasses(uid);
  const classIds = useMemo(() => classes.map((classRoom) => classRoom.id), [classes]);
  const {
    questions: classQuestions,
    isLoading: isLoadingClasses,
    refresh: refreshClasses,
  } = useClassScopedQuestions(classIds, needsClassQuestions);

  // §15/§33 — Daily Flow refreshes on the SAME focus trigger the feed's
  // personalization already used. No polling, no timer, no new lifecycle:
  // completing an assignment or recording an outcome elsewhere and coming
  // back re-derives both.
  useFocusEffect(
    useCallback(() => {
      refreshSignals();
      refreshAssignments();
    }, [refreshSignals, refreshAssignments]),
  );

  // The channel's own source list, before filters/ranking.
  const channelQuestions = useMemo(() => {
    if (activeChannel === "my_classes") return classQuestions;
    if (activeChannel === "struggles") {
      // Both pools, deduped by id — a struggled question can be a class
      // question, an own question, or a public one, and the channel must not
      // silently drop whichever pool it did not come from.
      const seen = new Set<string>();
      const pool: Question[] = [];
      for (const question of [...classQuestions, ...questions]) {
        if (seen.has(question.id)) continue;
        seen.add(question.id);
        pool.push(question);
      }
      return selectStruggleQuestions(pool, signalsByQuestionId);
    }
    return questions;
  }, [activeChannel, classQuestions, questions, signalsByQuestionId]);

  const filteredQuestions = useMemo(
    () => filterQuestions(channelQuestions, filter),
    [channelQuestions, filter],
  );

  // Personalized ordering applies to "Sana Özel" only. "Keşfet" deliberately
  // keeps the server's own newest-first order so it stays a genuinely
  // different view rather than a relabelled copy of the personalized one,
  // and the class/struggle channels are already scoped by their own rule.
  const recentlyShownIdsRef = useRef<Set<string>>(new Set());
  const visibleQuestions = useMemo(() => {
    if (activeChannel !== "for_you") return filteredQuestions;
    return buildQuestionFeedRanking({
      questions: filteredQuestions,
      signalsByQuestionId,
      recentlyShownIds: recentlyShownIdsRef.current,
    });
  }, [activeChannel, filteredQuestions, signalsByQuestionId]);

  const listRef = useRef<FlatList<Question>>(null);

  // §36 — changing channel or filters resets the feed to the top; nothing
  // else does. Scrolling is otherwise never reset by unrelated state.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [activeChannel, filter]);

  const openQuestion = useCallback((question: Question) => {
    router.push({
      pathname: "/(student)/question/[questionId]",
      params: { questionId: question.id },
    });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Question }) => (
      <LaunchFeedCard
        question={item}
        actionLabel="Cevapla"
        onPressAction={() => openQuestion(item)}
        onPressCard={() => openQuestion(item)}
      />
    ),
    [openQuestion],
  );

  const handleEndReached = useCallback(() => {
    // Only the shared social-feed channels page; the class channel loads its
    // own bounded set in one pass.
    if (activeChannel === "my_classes") return;
    if (hasMore) loadMore();
  }, [activeChannel, hasMore, loadMore]);

  const handleRefresh = useCallback(() => {
    if (activeChannel === "my_classes") {
      refreshClasses();
      return;
    }
    refresh();
  }, [activeChannel, refresh, refreshClasses]);

  const activeFilterCount = activeFeedFilterCount(filter);
  const descriptor = activeChannel ? channelDescriptor(activeChannel, role) : null;
  const isChannelLoading = needsClassQuestions ? isLoadingClasses || isLoading : isLoading;

  const contentWidthStyle = width > MAX_CONTENT_WIDTH ? { maxWidth: MAX_CONTENT_WIDTH } : null;

  // Every target maps to a route this app already had before Phase 53.
  const handleDailyFlowPress = useCallback((item: DailyFlowItem) => {
    switch (item.target.kind) {
      case "assignment":
        router.push({
          pathname: "/(student)/assignment/[assignmentId]",
          params: { assignmentId: item.target.assignmentId },
        });
        return;
      case "review_session":
        router.push("/(student)/study/review");
        return;
      case "adaptive_session":
        router.push("/(student)/study/adaptive");
        return;
      case "question":
        router.push({
          pathname: "/(student)/question/[questionId]",
          params: { questionId: item.target.questionId },
        });
        return;
      default:
        // student_performance / assignment_composer are teacher-only targets
        // and can never be produced by buildStudentDailyFlow.
        return;
    }
  }, []);

  const header = (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        {/* Phase 52 — compact on purpose: the feed is content-first,
            so the brand identifies the surface without competing
            with the first card. */}
        <BrandLockup size="compact" />
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
      </View>

      {/* Phase 53 §31 — Daily Flow belongs to the launch shell, above the
          channel bar, so it neither disappears nor duplicates as the
          student moves between Sana Özel / Keşfet / Derslerim /
          Zorlandıklarım. §32: it is also deliberately outside the feed
          filter, since a subject filter on the CONTENT feed must not hide
          a genuinely important assignment or due review. */}
      <DailyFlowSection
        title="Bugünkü Akışın"
        items={dailyFlowItems}
        emptyText={
          snapshot.hasStudyHistory
            ? "Şimdilik öncelikli bir adım yok. Keşfet'ten yeni sorularla devam edebilirsin."
            : "Keşfet'ten bir soru çözerek başlayabilirsin."
        }
        onPressItem={handleDailyFlowPress}
      />

      <FeedChannelBar
        channels={channels}
        activeChannel={activeChannel}
        onSelect={setChannel}
      />

      {/* Active filters, visible on the feed itself (§10). Each chip clears
          just its own field, so the student never has to open the sheet to
          undo one choice. */}
      {activeFilterCount > 0 ? (
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
          ) : error && questions.length === 0 ? (
            <View style={styles.centered}>
              <SharedEmptyState icon="cloud-offline-outline" title={error} />
              <PrimaryButton label="Tekrar Dene" onPress={refresh} />
            </View>
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
                    description="Farklı bir ders, sınıf veya konu deneyebilirsin."
                  />
                ) : (
                  <SharedEmptyState
                    icon="sparkles-outline"
                    title={descriptor?.emptyTitle ?? "Burada henüz içerik yok."}
                  />
                )
              }
              ListFooterComponent={
                error && questions.length > 0 ? (
                  <View style={styles.loadingMore}>
                    <Text style={styles.paginationErrorText}>{error}</Text>
                    <Pressable
                      onPress={loadMore}
                      accessibilityRole="button"
                      accessibilityLabel="Daha fazla soru yüklemeyi tekrar dene"
                    >
                      <Text style={styles.paginationRetryText}>Tekrar dene</Text>
                    </Pressable>
                  </View>
                ) : isLoadingMore ? (
                  <View style={styles.loadingMore}>
                    <ActivityIndicator color={colors.textSecondary} />
                  </View>
                ) : null
              }
            />
          )}
        </View>
      </View>

      <CameraButton onPress={openPicker} isLoading={isUploading} />

      <VisibilityPicker
        visible={isPickerOpen}
        onSelect={captureWithVisibility}
        onCancel={closePicker}
      />

      <QuestionMetadataModal
        visible={pendingImageUri !== null}
        imageUri={pendingImageUri}
        isUploading={isUploading}
        errorMessage={metadataError}
        onSubmit={submitMetadata}
        onCancel={cancelMetadata}
      />

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
    // Phase 51 — clears the floating camera button, which is absolutely
    // positioned at bottom:32 and 68pt tall. Without this the FAB sits ON TOP
    // of the last card's media and action, permanently occluding them: caught
    // on the iOS simulator, where the button covered the second card's own
    // placeholder text. 32 + 68 + a spacing.sm gap.
    paddingBottom: 32 + 68 + spacing.sm,
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
    gap: spacing.xs,
  },
  paginationErrorText: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },
  paginationRetryText: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
}));
