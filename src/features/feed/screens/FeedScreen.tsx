import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { useAuth } from "@features/authentication";
import { CameraButton } from "@features/upload/components/CameraButton";
import { VisibilityPicker } from "@features/upload/components/VisibilityPicker";
import { useUpload } from "@features/upload/hooks/useUpload";
import { colors } from "@theme/colors";

import { EmptyState } from "../components/EmptyState";
import { FeedCard } from "../components/FeedCard";
import { useSocialFeed } from "../hooks/useSocialFeed";
import { Question } from "../types";

function keyExtractor(item: Question) {
  return item.id;
}

export function FeedScreen() {
  const { height: windowHeight } = useWindowDimensions();
  // Each card pages to exactly the space above the tab bar, not the full
  // window height — otherwise the tab bar overlays the bottom ~50-80px of
  // every card (where the action rail, including Save, lives), hiding it
  // behind the bar instead of scrolling fully clear of it.
  const tabBarHeight = useBottomTabBarHeight();
  const height = windowHeight - tabBarHeight;
  const { firebaseUser, profile } = useAuth();
  const uid = firebaseUser?.uid;
  const organizationId = profile?.organizationId ?? null;

  const { questions, isLoading, isLoadingMore, isRefreshing, hasMore, loadMore, refresh, prepend } =
    useSocialFeed(uid);
  const { isUploading, isPickerOpen, openPicker, closePicker, captureWithVisibility } = useUpload({
    uid,
    organizationId,
    onUploaded: prepend,
  });

  // Stable across renders as long as `height` itself doesn't change
  // (window rotation aside) — without this, FeedCard's own memo() was
  // defeated by a new renderItem closure on every FeedScreen render.
  const renderItem = useCallback(
    ({ item }: { item: Question }) => <FeedCard question={item} height={height} />,
    [height],
  );
  const getItemLayout = useCallback(
    (_: ArrayLike<Question> | null | undefined, index: number) => ({
      length: height,
      offset: height * index,
      index,
    }),
    [height],
  );
  const handleEndReached = useCallback(() => {
    if (hasMore) loadMore();
  }, [hasMore, loadMore]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <LoadingSkeleton width="86%" height={height * 0.6} borderRadius={24} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <FlatList
        data={questions}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        pagingEnabled
        snapToInterval={height}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<EmptyState height={height} />}
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
          isLoadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator color={colors.textPrimary} />
            </View>
          ) : null
        }
      />

      <CameraButton onPress={openPicker} isLoading={isUploading} />

      <VisibilityPicker
        visible={isPickerOpen}
        onSelect={captureWithVisibility}
        onCancel={closePicker}
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
  },
  loadingMore: {
    paddingVertical: 24,
  },
});
