import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Question } from "@/types/question";

import { ClassFeedCard } from "../components/ClassFeedCard";
import { useClassFeed } from "../hooks/useClassFeed";
import { useStudentClassInfo } from "../hooks/useStudentClassInfo";
import {
  calculateActiveIndex,
  formatFeedPosition,
  isEndOfFeed,
} from "../services/classFeedPagination";
import { isRecoverableFeedError, mapClassFeedErrorToMessage } from "../services/classErrorMapper";

interface ClassFeedScreenProps {
  classId: string;
}

// Immersive, vertically paginated feed for ONE class.
//
// Lives in the (student) STACK, not inside (tabs) — so there is structurally
// no bottom tab bar over the controls. That is the architectural fix for
// "no button hidden behind the tab bar"; nothing here compensates for a tab
// bar with extra padding, because none is present.
export function ClassFeedScreen({ classId }: ClassFeedScreenProps) {
  const { height: windowHeight, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { classRoom } = useStudentClassInfo(classId);
  const {
    questions,
    isLoading,
    isLoadingMore,
    hasMore,
    errorCode,
    activeIndex,
    onActiveIndexChange,
    loadMore,
    retry,
  } = useClassFeed(classId);

  const listRef = useRef<FlatList<Question>>(null);

  // Every page is exactly the window height, which is what makes both
  // getItemLayout and calculateActiveIndex exact rather than approximate.
  const pageHeight = windowHeight;

  const className = classRoom?.name ?? "Sınıf";

  // Derived from scroll offset rather than from onViewableItemsChanged:
  // offset is exact for a full-screen paged list, and it cannot report a
  // half-visible neighbour as active during a fast swipe.
  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = calculateActiveIndex(
        event.nativeEvent.contentOffset.y,
        pageHeight,
        questions.length,
      );
      if (next !== activeIndex) onActiveIndexChange(next);
    },
    [pageHeight, questions.length, activeIndex, onActiveIndexChange],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<Question> | null | undefined, index: number) => ({
      length: pageHeight,
      offset: pageHeight * index,
      index,
    }),
    [pageHeight],
  );

  const keyExtractor = useCallback((item: Question) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: Question }) => (
      <ClassFeedCard
        question={item}
        className={className}
        height={pageHeight}
        topInset={insets.top}
        bottomInset={insets.bottom}
      />
    ),
    [className, pageHeight, insets.top, insets.bottom],
  );

  // A pagination failure also sets hasMore=false (to stop auto-retrying),
  // so "at the end" alone would claim the student has seen every question
  // when loading actually broke. The error banner below takes priority.
  const paginationFailed = errorCode !== null && questions.length > 0;

  const atEnd = useMemo(
    () =>
      !paginationFailed &&
      isEndOfFeed({ activeIndex, loadedCount: questions.length, hasMore }),
    [paginationFailed, activeIndex, questions.length, hasMore],
  );

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/(student)/class/[classId]", params: { classId } });
  }

  function restartFeed() {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    onActiveIndexChange(0);
  }

  // ---- loading -------------------------------------------------------
  if (isLoading) {
    return (
      <View style={styles.fullscreenCentered}>
        <ActivityIndicator color="white" size="large" />
        <Text style={styles.stateSubtitle}>Sorular yükleniyor...</Text>
      </View>
    );
  }

  // ---- error ---------------------------------------------------------
  if (errorCode && questions.length === 0) {
    const recoverable = isRecoverableFeedError(errorCode);
    return (
      <View style={styles.fullscreenCentered}>
        <Ionicons name="alert-circle-outline" size={44} color="#F97066" />
        <Text style={styles.stateTitle}>Sorular yüklenemedi</Text>
        <Text style={styles.stateSubtitle}>{mapClassFeedErrorToMessage(errorCode)}</Text>
        <View style={styles.stateActions}>
          {recoverable ? (
            <Pressable
              onPress={retry}
              style={styles.primaryAction}
              accessibilityRole="button"
              accessibilityLabel="Tekrar dene"
            >
              <Text style={styles.primaryActionText}>Tekrar dene</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={goBack}
            style={styles.secondaryAction}
            accessibilityRole="button"
            accessibilityLabel="Sınıfa dön"
          >
            <Text style={styles.secondaryActionText}>Sınıfa dön</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- empty ---------------------------------------------------------
  if (questions.length === 0) {
    return (
      <View style={styles.fullscreenCentered}>
        <Ionicons name="albums-outline" size={44} color="#8A8F98" />
        <Text style={styles.stateTitle}>Henüz soru yok</Text>
        <Text style={styles.stateSubtitle}>
          Öğretmenin bu sınıfta henüz soru paylaşmadı. Yeni sorular eklendiğinde burada görünecek.
        </Text>
        <View style={styles.stateActions}>
          <Pressable
            onPress={goBack}
            style={styles.primaryAction}
            accessibilityRole="button"
            accessibilityLabel="Sınıfa dön"
          >
            <Text style={styles.primaryActionText}>Sınıfa dön</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <FlatList
        ref={listRef}
        data={questions}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        // pagingEnabled + a full-window item height is what guarantees one
        // swipe == exactly one question, and that a card can never rest
        // half-way between two questions.
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        snapToAlignment="start"
        disableIntervalMomentum
        onMomentumScrollEnd={handleMomentumScrollEnd}
        // Keep only a small window of cards mounted around the active one.
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews
        style={{ width }}
      />

      {/* Header overlays the feed so the question keeps the full screen. */}
      <View style={[styles.header, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable
          onPress={goBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Geri"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color="white" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {className}
        </Text>
        <View style={styles.progressPill}>
          <Text style={styles.progressText}>
            {formatFeedPosition(activeIndex, questions.length)}
          </Text>
        </View>
      </View>

      {isLoadingMore ? (
        <View style={[styles.paginationSpinner, { bottom: insets.bottom + 96 }]} pointerEvents="none">
          <ActivityIndicator color="white" />
        </View>
      ) : null}

      {/* Pagination failed mid-feed: the already-loaded questions stay on
          screen and usable; only fetching MORE broke. Offered as a retry
          banner rather than silently stopping at a false "end of feed". */}
      {paginationFailed ? (
        <View style={[styles.endBanner, { bottom: insets.bottom + 96 }]}>
          <Text style={styles.endBannerTitle}>{mapClassFeedErrorToMessage(errorCode)}</Text>
          <View style={styles.endBannerActions}>
            {isRecoverableFeedError(errorCode) ? (
              <Pressable
                onPress={loadMore}
                style={styles.endBannerButton}
                accessibilityRole="button"
                accessibilityLabel="Daha fazla soru yüklemeyi tekrar dene"
              >
                <Text style={styles.endBannerButtonText}>Tekrar dene</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={goBack}
              style={styles.endBannerButton}
              accessibilityRole="button"
              accessibilityLabel="Sınıfa dön"
            >
              <Text style={styles.endBannerButtonText}>Sınıfa dön</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Explicit completion state — never an endless spinner. */}
      {atEnd ? (
        <View style={[styles.endBanner, { bottom: insets.bottom + 96 }]}>
          <Text style={styles.endBannerTitle}>Bu sınıftaki tüm soruları gördün</Text>
          <View style={styles.endBannerActions}>
            <Pressable
              onPress={restartFeed}
              style={styles.endBannerButton}
              accessibilityRole="button"
              accessibilityLabel="Baştan başla"
            >
              <Text style={styles.endBannerButtonText}>Baştan başla</Text>
            </Pressable>
            <Pressable
              onPress={goBack}
              style={styles.endBannerButton}
              accessibilityRole="button"
              accessibilityLabel="Sınıfa dön"
            >
              <Text style={styles.endBannerButtonText}>Sınıfa dön</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "#0B0B0F",
  },
  fullscreenCentered: {
    flex: 1,
    backgroundColor: "#0B0B0F",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  stateTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  stateSubtitle: {
    color: "#B4B8C0",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  stateActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  primaryAction: {
    minHeight: 46,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: {
    color: "#0B0B0F",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryAction: {
    minHeight: 46,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionText: {
    color: "white",
    fontSize: 15,
    fontWeight: "600",
  },
  header: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  progressPill: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  progressText: {
    color: "white",
    fontSize: 13,
    fontWeight: "700",
  },
  paginationSpinner: {
    position: "absolute",
    alignSelf: "center",
  },
  endBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  endBannerTitle: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  endBannerActions: {
    flexDirection: "row",
    gap: 12,
  },
  endBannerButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  endBannerButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
});
