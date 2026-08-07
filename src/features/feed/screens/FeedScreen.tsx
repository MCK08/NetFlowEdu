import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState as SharedEmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useAuth } from "@features/authentication";
import { FeedItem } from "@features/classes/services/feedItems";
import { QuestionMetadataModal } from "@features/questions/components/QuestionMetadataModal";
import { RatingCard } from "@features/study/components/RatingCard";
import { useInterleavedStudyFeed } from "@features/study/hooks/useInterleavedStudyFeed";
import { CameraButton } from "@features/upload/components/CameraButton";
import { VisibilityPicker } from "@features/upload/components/VisibilityPicker";
import { useUpload } from "@features/upload/hooks/useUpload";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { EmptyState } from "../components/EmptyState";
import { FeedCard } from "../components/FeedCard";
import { FeedFilterSheet } from "../components/FeedFilterSheet";
import { useSocialFeed } from "../hooks/useSocialFeed";
import {
  activeFeedFilterCount,
  EMPTY_FEED_FILTER,
  feedFilterKey,
  FeedFilter,
  filterQuestions,
  isFeedFilterActive,
} from "../services/feedFilters";

function keyExtractor(item: FeedItem) {
  return item.key;
}

// Filtered results are considered "thin" (worth eagerly fetching more of
// the underlying unfiltered pages for) below this count — purely a UX
// nicety so a narrow filter on a big feed doesn't look empty just because
// the next few matching questions haven't been paged in yet.
const THIN_RESULT_THRESHOLD = 5;

export function FeedScreen() {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Each card pages to exactly the space above the tab bar, not the full
  // window height — otherwise the tab bar overlays the bottom ~50-80px of
  // every card (where the action rail, including Save, lives), hiding it
  // behind the bar instead of scrolling fully clear of it.
  const tabBarHeight = useBottomTabBarHeight();
  const height = windowHeight - tabBarHeight;
  const { firebaseUser, profile, role } = useAuth();
  const uid = firebaseUser?.uid;
  const organizationId = profile?.organizationId ?? null;
  const isStudent = role === "student";

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
  } = useUpload({
    uid,
    organizationId,
    onUploaded: prepend,
  });

  // Phase 21 — Ders/Sınıf/Konu filtering. Purely client-side over the
  // already-fetched `questions` (see feedFilters.ts's own doc comment for
  // why: avoiding a Firestore composite-index explosion for up to 8
  // subject/grade/topic combinations). useSocialFeed's fetch/cursor logic
  // below is completely untouched by this — filtering only narrows what
  // gets handed to the interleaved feed.
  const [filter, setFilter] = useState<FeedFilter>(EMPTY_FEED_FILTER);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const filteredQuestions = useMemo(() => filterQuestions(questions, filter), [questions, filter]);
  const filterKey = feedFilterKey(filter);

  // A narrow filter can leave very few (or zero) already-loaded questions
  // matching even though the server has more pages — keep pulling pages in
  // automatically while that's true, exactly the same loadMore() pagination
  // path onEndReached already uses (never a second fetch mechanism).
  useEffect(() => {
    if (!isFeedFilterActive(filter)) return;
    if (!hasMore || isLoadingMore) return;
    if (filteredQuestions.length >= THIN_RESULT_THRESHOLD) return;
    loadMore();
  }, [filter, filteredQuestions.length, hasMore, isLoadingMore, loadMore]);

  const listRef = useRef<FlatList<FeedItem>>(null);
  const scrollToIndex = useCallback(
    (index: number) => {
      listRef.current?.scrollToOffset({ offset: height * index, animated: true });
    },
    [height],
  );

  // Phase 19.2 — the rating "screen" is a real feed item now (see
  // feedItems.ts / useInterleavedStudyFeed's doc comments), not an overlay
  // layered on top of a question card. Shared verbatim with
  // ClassFeedScreen — one implementation, so the two surfaces cannot
  // silently drift. `resetKey: filterKey` (Phase 21) starts a fresh session
  // whenever the active filter changes, so a reshow pair from before the
  // filter switch can never leak into the newly filtered feed.
  const { items, handleOutcomeRecorded } = useInterleavedStudyFeed({
    questions: filteredQuestions,
    isStudent,
    scrollToIndex,
    resetKey: filterKey,
  });

  const renderItem = useCallback(
    ({ item, index }: { item: FeedItem; index: number }) => {
      if (item.type === "rating") {
        return (
          <RatingCard
            question={item.question}
            height={height}
            isStudent={isStudent}
            onOutcomeRecorded={(outcome, question) =>
              handleOutcomeRecorded(outcome, question, index, item.questionIndex)
            }
          />
        );
      }
      return <FeedCard question={item.question} height={height} />;
    },
    [height, isStudent, handleOutcomeRecorded],
  );
  const getItemLayout = useCallback(
    (_: ArrayLike<FeedItem> | null | undefined, index: number) => ({
      length: height,
      offset: height * index,
      index,
    }),
    [height],
  );
  const handleEndReached = useCallback(() => {
    if (hasMore) loadMore();
  }, [hasMore, loadMore]);

  const activeFilterCount = activeFeedFilterCount(filter);

  const filterBar = (
    <View
      style={[styles.filterBar, { top: insets.top + spacing.sm, left: insets.left + spacing.md }]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={() => setIsFilterSheetOpen(true)}
        style={styles.filterButton}
        accessibilityRole="button"
        accessibilityLabel="Filtreler"
      >
        <Ionicons name="options-outline" size={16} color={colors.textInverse} />
        <Text style={styles.filterButtonText}>Filtreler</Text>
        {activeFilterCount > 0 ? (
          <View style={styles.filterCountBadge}>
            <Text style={styles.filterCountText}>{activeFilterCount}</Text>
          </View>
        ) : null}
      </Pressable>
      {activeFilterCount > 0 ? (
        <Pressable
          onPress={() => setFilter(EMPTY_FEED_FILTER)}
          style={styles.clearFilterButton}
          accessibilityRole="button"
          accessibilityLabel="Filtreleri temizle"
        >
          <Text style={styles.clearFilterText}>Temizle</Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <LoadingSkeleton width="86%" height={height * 0.6} borderRadius={24} />
      </View>
    );
  }

  // Initial-load failure, distinct from a genuinely empty feed: reuses the
  // same EmptyState + PrimaryButton "Tekrar Dene" pattern ReviewSessionScreen
  // already uses for its own load error, rather than a new component.
  if (error && questions.length === 0) {
    return (
      <View style={styles.centered}>
        <SharedEmptyState icon="cloud-offline-outline" title={error} />
        <PrimaryButton label="Tekrar Dene" onPress={refresh} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        pagingEnabled
        snapToInterval={height}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isFeedFilterActive(filter) ? (
            <SharedEmptyState
              icon="filter-outline"
              title="Bu filtreye uyan soru yok"
              description="Farklı bir ders, sınıf veya konu deneyebilirsin."
              style={{ width: "100%", height, backgroundColor: colors.background }}
            />
          ) : (
            <EmptyState height={height} />
          )
        }
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        onEndReachedThreshold={0.5}
        onEndReached={handleEndReached}
        // Same reasoning as ClassFeedScreen's identical paged-list tuning:
        // only a small window of full-screen cards needs to stay mounted
        // around the visible one.
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews
        ListFooterComponent={
          // Already-loaded questions stay on screen and usable — a
          // pagination failure only stops further auto-fetching, offered
          // as a small retry row rather than silently going nowhere.
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

      {filterBar}

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
    backgroundColor: colors.background,
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
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
  filterBar: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  filterButtonText: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textInverse,
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
  clearFilterButton: {
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  clearFilterText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textInverse,
  },
});
