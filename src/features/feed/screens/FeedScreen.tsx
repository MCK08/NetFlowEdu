import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ImageViewer } from "@components/ImageViewer";
import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useStudentAssignments } from "@features/assignments/hooks/useStudentAssignments";
import { useAuth } from "@features/authentication";
import { useStudentClasses } from "@features/classes/hooks/useStudentClasses";
import { calculateActiveIndex } from "@features/classes/services/classFeedPagination";
import { FeedItem } from "@features/classes/services/feedItems";
import { QuestionMetadataModal } from "@features/questions/components/QuestionMetadataModal";
import { QUESTION_SUBJECTS } from "@features/questions/data/questionTaxonomy";
import { hasMultipleChoice } from "@features/questions/services/multipleChoice";
import { RatingCard } from "@features/study/components/RatingCard";
import { StudyOutcome } from "@features/study/domain/studyTypes";
import { useInterleavedStudyFeed } from "@features/study/hooks/useInterleavedStudyFeed";
import { EMPTY_SUMMARY, StudySummary, subscribeToStudySummary } from "@features/study/services/studyService";
import { VisibilityPicker } from "@features/upload/components/VisibilityPicker";
import { useUpload } from "@features/upload/hooks/useUpload";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

import { FeedFilterSheet } from "../components/FeedFilterSheet";
import { QuestionFeedPage } from "../components/QuestionFeedPage";
import { FeedScopeBar } from "../components/FeedScopeBar";
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
import { assignedQuestionIds, composeFeedOrder, withAssignmentSignals } from "../services/feedComposition";
import {
  activeFeedFilterCount,
  EMPTY_FEED_FILTER,
  feedFilterKey,
  FeedFilter,
  filterQuestions,
  isFeedFilterActive,
} from "../services/feedFilters";
import { parseFeedLaunch } from "../services/feedLaunch";
import { buildQuestionFeedRanking } from "../services/feedRanking";
import { Question } from "../types";

// Phase 109 — "TikTok ama soru": the student's home is one question at a
// time, answered where it stands.
//
// WHAT IS KEPT FROM PHASE 54
//
// The pager itself: a FlatList of full-height pages with paging, snapping,
// a three-page render window and getItemLayout; the [Question, Rating]
// interleave (useInterleavedStudyFeed + feedItems.ts) with its
// second-chance reshow; Phase 50's channels and Phase 21's filters as the
// pool/narrowing layer; Phase 26's ranking. None of those is rebuilt.
//
// WHAT CHANGES
//
//  · The page is QuestionFeedPage: image, words, choices, hint, actions —
//    the same MultipleChoiceAnswer / QuestionHintLadder / AnswerScreen
//    QuestionDetailScreen uses, so answering happens in the feed through
//    the one existing engine. A multiple-choice question therefore gets no
//    rating page after it (its own bridge already recorded the outcome);
//    an open-ended question keeps its rating page.
//  · The surface follows the theme (near-black navy in dark, the calm
//    canvas in light) instead of the pinned immersive scrim, because the
//    page now holds themed controls, not a photograph with text over it.
//  · The chrome is in normal flow: a minimal header, one row of subject
//    pills, then the question. The page height is the pager's own measured
//    height (onLayout), one number the layout, snapping and index math all
//    share — never a guessed constant.
//  · Sources (channels), topic, type and grade live behind ONE filter
//    control. Çalış launches this screen with a filter context through the
//    tab's route params (feedLaunch.ts); there is no second practice feed.

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

export const FEED_TITLE = "Soru Akışı";
export const FEED_FILTER_EMPTY_TITLE = "Bu filtreyle eşleşen soru bulunamadı.";

/** Only an open-ended question is followed by a rating page: a
 *  multiple-choice answer is already the recorded outcome. */
function ratingPolicy(question: Question): boolean {
  return !hasMultipleChoice(question.choices);
}

export function FeedScreen() {
  useThemeSubscription();
  const { width } = useWindowDimensions();
  const { firebaseUser, profile, role } = useAuth();
  const uid = firebaseUser?.uid;
  const organizationId = profile?.organizationId ?? null;
  const isStudent = role === "student";

  const channels = useMemo(() => channelsForRole(role), [role]);
  const [channel, setChannel] = useState<FeedChannel | null>(null);
  const activeChannel = resolveChannelForRole(channel, role);

  const [filter, setFilter] = useState<FeedFilter>(EMPTY_FEED_FILTER);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  // A launch from Çalış: applied once per nonce, never on a plain revisit.
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const launch = parseFeedLaunch(params, role);
  const appliedLaunchRef = useRef<string | null>(null);
  useEffect(() => {
    if (!launch || appliedLaunchRef.current === launch.nonce) return;
    appliedLaunchRef.current = launch.nonce;
    setFilter(launch.context.filter);
    setChannel(launch.context.channel);
  }, [launch]);

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

  const { signalsByQuestionId, refresh: refreshSignals } = useFeedPersonalizationSignals(uid);
  const { cards: assignmentCards, refresh: refreshAssignments } = useStudentAssignments(uid);

  // The daily goal's real numbers, from the summary listener the Hub already
  // holds — the only "progress" this screen shows, and only when a goal exists.
  const [summary, setSummary] = useState<StudySummary>(EMPTY_SUMMARY);
  useEffect(() => {
    if (!uid || !isStudent) {
      setSummary(EMPTY_SUMMARY);
      return;
    }
    return subscribeToStudySummary(uid, setSummary);
  }, [uid, isStudent]);

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

  // Phase 50's channel pools, unchanged — the page is a presentation change
  // and must not alter which questions a channel contains.
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

  // Phase 26 ranking on "Sana Özel", with Phase 109's assignment signal and
  // the spreading pass on top. Every other channel keeps its pool order.
  const recentlyShownIdsRef = useRef<Set<string>>(new Set());
  const signals = useMemo(
    () => withAssignmentSignals(signalsByQuestionId, assignedQuestionIds(assignmentCards)),
    [signalsByQuestionId, assignmentCards],
  );
  const rankedQuestions = useMemo(() => {
    if (activeChannel !== "for_you") return filteredQuestions;
    const ranked = buildQuestionFeedRanking({
      questions: filteredQuestions,
      signalsByQuestionId: signals,
      recentlyShownIds: recentlyShownIdsRef.current,
    });
    return composeFeedOrder(ranked, signals);
  }, [activeChannel, filteredQuestions, signals]);

  useEffect(() => {
    if (!isFeedFilterActive(filter)) return;
    if (!hasMore || isLoadingMore) return;
    if (filteredQuestions.length >= THIN_RESULT_THRESHOLD) return;
    loadMore();
  }, [filter, filteredQuestions.length, hasMore, isLoadingMore, loadMore]);

  // The pager's page height is its own measured height: header and pills
  // are in flow above it, the tab bar below it.
  const [pageHeight, setPageHeight] = useState(0);
  const handlePagerLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    setPageHeight((prev) => (prev === next ? prev : next));
  }, []);

  const listRef = useRef<FlatList<FeedItem>>(null);
  const scrollToIndex = useCallback(
    (index: number) => {
      listRef.current?.scrollToOffset({ offset: pageHeight * index, animated: true });
    },
    [pageHeight],
  );

  const sessionKey = feedSessionKey(activeChannel, feedFilterKey(filter));
  const { items, handleOutcomeRecorded, handleInlineOutcome } = useInterleavedStudyFeed({
    questions: rankedQuestions,
    isStudent,
    scrollToIndex,
    resetKey: sessionKey,
    ratingPolicy,
  });

  // Changing channel or filter starts a new session, so the pager returns to
  // the first page. Nothing else resets it.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [sessionKey]);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageHeight <= 0) return;
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
      return (
        <QuestionFeedPage
          question={item.question}
          height={pageHeight}
          isStudent={isStudent}
          onOutcomeRecorded={(outcome: StudyOutcome, question: Question) =>
            handleInlineOutcome(outcome, question, index, item.questionIndex)
          }
          onPressImage={setPreviewUri}
          onNext={() => scrollToIndex(index + 1)}
          hasNext={index + 1 < items.length}
        />
      );
    },
    [pageHeight, isStudent, handleOutcomeRecorded, handleInlineOutcome, scrollToIndex, items.length],
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

  const selectSubject = useCallback((subject: string | null) => {
    setFilter((prev) => ({ ...prev, subject, topic: null }));
  }, []);
  const clearFilters = useCallback(() => {
    setFilter(EMPTY_FEED_FILTER);
    setChannel(null);
  }, []);

  const activeFilterCount = activeFeedFilterCount(filter) + (activeChannel && activeChannel !== "for_you" ? 1 : 0);
  const descriptor = activeChannel ? channelDescriptor(activeChannel, role) : null;
  const isChannelLoading = needsClassQuestions ? isLoadingClasses || isLoading : isLoading;
  const goalCaption =
    isStudent && summary.dailyGoal > 0 ? `Bugünkü hedef ${summary.reviewedToday} / ${summary.dailyGoal}` : null;

  const header = (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <View style={styles.identity}>
          <Text style={styles.title}>{FEED_TITLE}</Text>
          {goalCaption ? <Text style={styles.subtitle}>{goalCaption}</Text> : null}
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={openPicker}
            disabled={isUploading}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Soru yükle"
            accessibilityState={{ disabled: isUploading }}
          >
            {isUploading ? (
              <ActivityIndicator color={colors.textSecondary} />
            ) : (
              <Ionicons name="camera-outline" size={iconSize.md} color={colors.textSecondary} accessibilityElementsHidden />
            )}
          </Pressable>
          <Pressable
            onPress={() => setIsFilterSheetOpen(true)}
            style={[styles.iconButton, activeFilterCount > 0 ? styles.iconButtonActive : null]}
            accessibilityRole="button"
            accessibilityLabel={activeFilterCount > 0 ? `Filtrele, ${activeFilterCount} filtre etkin` : "Filtrele"}
          >
            <Ionicons
              name="options-outline"
              size={iconSize.md}
              color={activeFilterCount > 0 ? colors.primary : colors.textSecondary}
              accessibilityElementsHidden
            />
            {activeFilterCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>
      {/* Phase 116 — channel AND subject in one reachable line. "Derslerim"
          used to cost three taps through the filter sheet. */}
      <FeedScopeBar
        channels={channels}
        activeChannel={activeChannel}
        onSelectChannel={setChannel}
        subjects={QUESTION_SUBJECTS}
        selectedSubject={filter.subject}
        onSelectSubject={selectSubject}
      />
    </View>
  );

  const sheets = (
    <>
      <FeedFilterSheet
        visible={isFilterSheetOpen}
        filter={filter}
        onChange={setFilter}
        onClose={() => setIsFilterSheetOpen(false)}
        channels={channels}
        activeChannel={activeChannel}
        onSelectChannel={setChannel}
      />
      <VisibilityPicker visible={isPickerOpen} onSelect={captureWithVisibility} onCancel={closePicker} />
      <QuestionMetadataModal
        visible={pendingImageUri !== null}
        imageUri={pendingImageUri}
        isUploading={isUploading}
        errorMessage={metadataError}
        onSubmit={submitMetadata}
        onCancel={cancelMetadata}
      />
      <ImageViewer visible={previewUri !== null} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </>
  );

  const emptyState = isFeedFilterActive(filter) || (activeChannel && activeChannel !== "for_you") ? (
    <View style={[styles.pageState, { height: pageHeight }]}>
      <EmptyState
        icon="filter-outline"
        title={FEED_FILTER_EMPTY_TITLE}
        description={descriptor && activeChannel !== "for_you" ? descriptor.emptyTitle : "Farklı bir ders, konu veya soru türü deneyebilirsin."}
      />
      <PrimaryButton label="Filtreleri Temizle" onPress={clearFilters} variant="secondary" />
    </View>
  ) : (
    <View style={[styles.pageState, { height: pageHeight }]}>
      <EmptyState
        icon="sparkles-outline"
        title={descriptor?.emptyTitle ?? "Şu anda gösterilecek soru yok."}
        description="Sınıfına katıldığında ve sorular paylaşıldığında burada görünürler."
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      {header}
      <View style={styles.pager} onLayout={handlePagerLayout}>
        {pageHeight > 0 && isChannelLoading ? (
          <View style={styles.centered}>
            <LoadingSkeleton width="90%" height={pageHeight * 0.55} borderRadius={radius.xl} />
          </View>
        ) : null}

        {pageHeight > 0 && !isChannelLoading && error && questions.length === 0 ? (
          <View style={styles.centered}>
            <EmptyState icon="cloud-offline-outline" title={error} description="Bağlantını kontrol edip tekrar deneyebilirsin." />
            <PrimaryButton label="Tekrar Dene" onPress={refresh} />
          </View>
        ) : null}

        {pageHeight > 0 && !isChannelLoading && !(error && questions.length === 0) ? (
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
              ListEmptyComponent={emptyState}
              ListFooterComponent={
                error && questions.length > 0 ? (
                  <View style={styles.loadingMore}>
                    <Text style={styles.paginationErrorText}>{error}</Text>
                    <Pressable
                      onPress={loadMore}
                      accessibilityRole="button"
                      accessibilityLabel="Daha fazla soru yüklemeyi tekrar dene"
                      style={styles.retry}
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
          </View>
        ) : null}
      </View>

      {sheets}
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  iconButton: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonActive: {
    backgroundColor: colors.primaryMuted,
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    ...typography.label,
    color: colors.textInverse,
  },
  pager: {
    flex: 1,
    alignItems: "center",
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
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  pageState: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  loadingMore: {
    paddingVertical: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  retry: {
    minHeight: minTouchTarget,
    justifyContent: "center",
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
