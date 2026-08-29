import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandLockup } from "@components/ui/BrandMark";
import { EmptyState as SharedEmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useStudentAssignments } from "@features/assignments/hooks/useStudentAssignments";
import { useAuth } from "@features/authentication";
import { useStudentClasses } from "@features/classes/hooks/useStudentClasses";
import { calculateActiveIndex } from "@features/classes/services/classFeedPagination";
import { FeedItem } from "@features/classes/services/feedItems";
import { DailyFlowSheet } from "@features/dailyFlow/components/DailyFlowSheet";
import { buildStudentDailyFlow } from "@features/dailyFlow/services/buildStudentDailyFlow";
import { DailyFlowItem } from "@features/dailyFlow/services/dailyFlowTypes";
import { QuestionMetadataModal } from "@features/questions/components/QuestionMetadataModal";
import { RatingCard } from "@features/study/components/RatingCard";
import { useInterleavedStudyFeed } from "@features/study/hooks/useInterleavedStudyFeed";
import { CameraButton } from "@features/upload/components/CameraButton";
import { VisibilityPicker } from "@features/upload/components/VisibilityPicker";
import { useUpload } from "@features/upload/hooks/useUpload";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { EmptyState } from "../components/EmptyState";
import { FeedCard } from "../components/FeedCard";
import { FeedChannelBar } from "../components/FeedChannelBar";
import { FeedFilterSheet } from "../components/FeedFilterSheet";
import { useClassScopedQuestions } from "../hooks/useClassScopedQuestions";
import { useFeedPersonalizationSignals } from "../hooks/useFeedPersonalizationSignals";
import { useSocialFeed } from "../hooks/useSocialFeed";
import { selectStruggleQuestions } from "../services/channelSelection";
import {
  channelDescriptor,
  channelsForRole,
  FeedChannel,
  feedSessionKey,
  resolveChannelForRole,
} from "../services/feedChannels";
import {
  activeFeedFilterCount,
  EMPTY_FEED_FILTER,
  feedFilterKey,
  FeedFilter,
  filterQuestions,
  isFeedFilterActive,
} from "../services/feedFilters";
import { buildQuestionFeedRanking } from "../services/feedRanking";
import { Question } from "../types";

// Phase 54 — the student's immersive learning feed, restored.
//
// WHY THIS REVERSES PHASE 50 (FOR THIS SCREEN ONLY)
//
// Phase 50 replaced the one-page-per-viewport feed with a conventional
// vertically scrolling list of cards. That made the student home read as an
// ordinary social feed — several question cards stacked in one viewport —
// which is not the intended product. This restores the proven pre-Phase-50
// interaction:
//
//     [QUESTION A] → swipe → [RATING A] → swipe → [QUESTION B] → ...
//
// RECOVERED, NOT REINVENTED
//
// Every mechanism below already existed and still exists at HEAD; Phase 50
// only stopped calling it. The interleave engine (useInterleavedStudyFeed +
// feedItems.ts), the rating interstitial (RatingCard, which owns its own
// exactly-once write via useStudyQuestionState), the immersive card
// (FeedCard) and the offset→index helper (calculateActiveIndex) are all
// untouched by this phase and are used exactly as ClassFeedScreen — the
// sibling immersive surface that kept this model through Phases 50–53 —
// still uses them today.
//
// WHAT PHASE 51/52/53 KEPT
//
//  · Phase 51's camera-button clearance and its native-iOS hardening
//  · Phase 52's BrandLockup header
//  · Phase 53's Daily Flow intelligence and the outcomeHistory fix — Daily
//    Flow moved from an inline section to a header pill + sheet, because any
//    block above the pager would re-break the full-viewport page (see
//    DailyFlowSheet's own doc comment)
//  · Phase 50's channels and filters, as compact overlay chrome
//
// LAYOUT MODEL
//
// The list fills the whole area above the tab bar and the header/channel bar
// float over it as absolutely-positioned chrome. That is what keeps the page
// height exactly `windowHeight - tabBarHeight` — a single, deterministic
// number that getItemLayout, snapToInterval and calculateActiveIndex all
// agree on. Laying the header out in normal flow instead would make the page
// height depend on the header's measured height, which is the class of
// "magic height that only works on one iPhone" this phase rules out.

function keyExtractor(item: FeedItem) {
  return item.key;
}

// Filtered results are considered "thin" (worth eagerly fetching more of the
// underlying unfiltered pages for) below this count — a narrow filter on a
// big feed shouldn't look empty just because the next matching questions
// haven't been paged in yet.
const THIN_RESULT_THRESHOLD = 5;

// The web/tablet reading column. A full-bleed page is right on a phone; on a
// wide monitor an educational image stretched across 2000px is not.
const MAX_CONTENT_WIDTH = 680;

export function FeedScreen() {
  const { height: windowHeight, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Each page is exactly the space above the tab bar, never the full window:
  // otherwise the bar overlays the bottom of every page, hiding the card's
  // own action rail behind it.
  const tabBarHeight = useBottomTabBarHeight();
  const pageHeight = windowHeight - tabBarHeight;

  const { firebaseUser, profile, role } = useAuth();
  const uid = firebaseUser?.uid;
  const organizationId = profile?.organizationId ?? null;
  const isStudent = role === "student";

  const channels = useMemo(() => channelsForRole(role), [role]);
  const [channel, setChannel] = useState<FeedChannel | null>(null);
  const activeChannel = resolveChannelForRole(channel, role);

  const [filter, setFilter] = useState<FeedFilter>(EMPTY_FEED_FILTER);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isDailyFlowOpen, setIsDailyFlowOpen] = useState(false);

  const {
    questions,
    isLoading,
    isLoadingMore,
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

  const needsClassQuestions = activeChannel === "my_classes" || activeChannel === "struggles";
  const { classes } = useStudentClasses(uid);
  const classIds = useMemo(() => classes.map((classRoom) => classRoom.id), [classes]);
  const { questions: classQuestions, isLoading: isLoadingClasses } = useClassScopedQuestions(
    classIds,
    needsClassQuestions,
  );

  useFocusEffect(
    useCallback(() => {
      refreshSignals();
      refreshAssignments();
    }, [refreshSignals, refreshAssignments]),
  );

  // Phase 50's channel pools, unchanged — immersive paging is a presentation
  // change and must not alter which questions a channel contains.
  const channelQuestions = useMemo(() => {
    if (activeChannel === "my_classes") return classQuestions;
    if (activeChannel === "struggles") {
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

  // Phase 45/26 ranking, unchanged and still "Sana Özel" only.
  const recentlyShownIdsRef = useRef<Set<string>>(new Set());
  const rankedQuestions = useMemo(() => {
    if (activeChannel !== "for_you") return filteredQuestions;
    return buildQuestionFeedRanking({
      questions: filteredQuestions,
      signalsByQuestionId,
      recentlyShownIds: recentlyShownIdsRef.current,
    });
  }, [activeChannel, filteredQuestions, signalsByQuestionId]);

  useEffect(() => {
    if (!isFeedFilterActive(filter)) return;
    if (!hasMore || isLoadingMore) return;
    if (filteredQuestions.length >= THIN_RESULT_THRESHOLD) return;
    loadMore();
  }, [filter, filteredQuestions.length, hasMore, isLoadingMore, loadMore]);

  const listRef = useRef<FlatList<FeedItem>>(null);
  const scrollToIndex = useCallback(
    (index: number) => {
      listRef.current?.scrollToOffset({ offset: pageHeight * index, animated: true });
    },
    [pageHeight],
  );

  // THE RESTORED INTERLEAVE. `resetKey` combines the filter AND the channel:
  // both change which questions exist, and a reshow pair built for the old
  // pool must never leak into the new one.
  const sessionKey = feedSessionKey(activeChannel, feedFilterKey(filter));
  const { items, handleOutcomeRecorded } = useInterleavedStudyFeed({
    questions: rankedQuestions,
    isStudent,
    scrollToIndex,
    resetKey: sessionKey,
  });

  // Changing channel or filter starts a new session, so the pager returns to
  // the first page. Nothing else resets it.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [sessionKey]);

  // Bookkeeping only — feeds the session-local "already seen" set that
  // deprioritises (never hides) a question in later ranking passes. Never
  // gates rendering, navigation or rating.
  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = calculateActiveIndex(event.nativeEvent.contentOffset.y, pageHeight, items.length);
      const questionId = items[index]?.question.id;
      if (questionId) recentlyShownIdsRef.current.add(questionId);
    },
    [pageHeight, items],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: FeedItem; index: number }) => {
      if (item.type === "rating") {
        return (
          <RatingCard
            question={item.question}
            height={pageHeight}
            isStudent={isStudent}
            onOutcomeRecorded={(outcome, question) =>
              handleOutcomeRecorded(outcome, question, index, item.questionIndex)
            }
          />
        );
      }
      return <FeedCard question={item.question} height={pageHeight} />;
    },
    [pageHeight, isStudent, handleOutcomeRecorded],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<FeedItem> | null | undefined, index: number) => ({
      length: pageHeight,
      offset: pageHeight * index,
      index,
    }),
    [pageHeight],
  );

  const handleEndReached = useCallback(() => {
    if (activeChannel === "my_classes") return;
    if (hasMore) loadMore();
  }, [activeChannel, hasMore, loadMore]);

  const handleDailyFlowPress = useCallback((item: DailyFlowItem) => {
    setIsDailyFlowOpen(false);
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
        return;
    }
  }, []);

  const activeFilterCount = activeFeedFilterCount(filter);
  const descriptor = activeChannel ? channelDescriptor(activeChannel, role) : null;
  const isChannelLoading = needsClassQuestions ? isLoadingClasses || isLoading : isLoading;

  // Absolutely positioned chrome — see the layout note in this file's header
  // for why it floats rather than taking flow space.
  const chrome = (
    <View style={[styles.chrome, { top: insets.top }]} pointerEvents="box-none">
      <View style={styles.chromeRow}>
        <BrandLockup size="compact" />
        <View style={styles.chromeActions}>
          <Pressable
            onPress={() => setIsDailyFlowOpen(true)}
            style={styles.chromePill}
            accessibilityRole="button"
            accessibilityLabel="Bugünkü akışın"
          >
            <Ionicons name="sparkles-outline" size={14} color={colors.textInverse} />
            {dailyFlowItems.length > 0 ? (
              <View style={styles.chromeBadge}>
                <Text style={styles.chromeBadgeText}>{dailyFlowItems.length}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => setIsFilterSheetOpen(true)}
            style={styles.chromePill}
            accessibilityRole="button"
            accessibilityLabel="Filtrele"
          >
            <Ionicons name="options-outline" size={14} color={colors.textInverse} />
            {activeFilterCount > 0 ? (
              <View style={styles.chromeBadge}>
                <Text style={styles.chromeBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <FeedChannelBar channels={channels} activeChannel={activeChannel} onSelect={setChannel} />
    </View>
  );

  const sheets = (
    <>
      <DailyFlowSheet
        visible={isDailyFlowOpen}
        onClose={() => setIsDailyFlowOpen(false)}
        title="Bugünkü Akışın"
        items={dailyFlowItems}
        emptyText={
          snapshot.hasStudyHistory
            ? "Şimdilik öncelikli bir adım yok. Keşfet'ten yeni sorularla devam edebilirsin."
            : "Keşfet'ten bir soru çözerek başlayabilirsin."
        }
        onPressItem={handleDailyFlowPress}
      />
      <FeedFilterSheet
        visible={isFilterSheetOpen}
        filter={filter}
        onChange={setFilter}
        onClose={() => setIsFilterSheetOpen(false)}
      />
    </>
  );

  if (isChannelLoading) {
    return (
      <View style={styles.centered}>
        <LoadingSkeleton width="86%" height={pageHeight * 0.6} borderRadius={24} />
        {chrome}
        {sheets}
      </View>
    );
  }

  if (error && questions.length === 0) {
    return (
      <View style={styles.centered}>
        <SharedEmptyState icon="cloud-offline-outline" title={error} />
        <PrimaryButton label="Tekrar Dene" onPress={refresh} />
        {chrome}
        {sheets}
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.centerColumn}>
        <View style={[styles.column, width > MAX_CONTENT_WIDTH ? styles.columnCapped : null]}>
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            // pagingEnabled + a full-page item height is what guarantees one
            // learning moment at rest — the exact combination ClassFeedScreen
            // has used unchanged since Phase 19.2 and which Phase 51
            // validated on device.
            pagingEnabled
            snapToInterval={pageHeight}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            showsVerticalScrollIndicator={false}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            onEndReachedThreshold={0.5}
            onEndReached={handleEndReached}
            // Only a small window of full-page cards needs to stay mounted
            // around the visible one.
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            windowSize={3}
            removeClippedSubviews
            ListEmptyComponent={
              isFeedFilterActive(filter) ? (
                <SharedEmptyState
                  icon="filter-outline"
                  title="Bu filtreye uyan soru yok"
                  description="Farklı bir ders, sınıf veya konu deneyebilirsin."
                  style={{ width: "100%", height: pageHeight, backgroundColor: colors.background }}
                />
              ) : descriptor ? (
                <SharedEmptyState
                  icon="sparkles-outline"
                  title={descriptor.emptyTitle}
                  style={{ width: "100%", height: pageHeight, backgroundColor: colors.background }}
                />
              ) : (
                <EmptyState height={pageHeight} />
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
                  <ActivityIndicator color={colors.textPrimary} />
                </View>
              ) : null
            }
          />
        </View>
      </View>

      {chrome}

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

      {sheets}
    </View>
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
    backgroundColor: colors.background,
  },
  column: {
    flex: 1,
    width: "100%",
  },
  columnCapped: {
    maxWidth: MAX_CONTENT_WIDTH,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  chrome: {
    position: "absolute",
    left: 0,
    right: 0,
    gap: spacing.xxs,
    zIndex: 10,
  },
  chromeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  chromeActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  chromePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    // Deliberately a literal scrim rather than a theme token: this chrome
    // floats over an arbitrary full-bleed question photograph in BOTH
    // themes, so it needs a constant dark ground for contrast — the same
    // reasoning Phase 51 documented for ClassFeedScreen and ImageViewer.
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: radius.pill,
    // 36pt tall with the padding below — a comfortable target for an
    // icon-only control.
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 44,
    minHeight: 36,
    justifyContent: "center",
  },
  chromeBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  chromeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textInverse,
  },
  loadingMore: {
    paddingVertical: 24,
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
