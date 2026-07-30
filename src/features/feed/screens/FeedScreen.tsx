import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
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
        keyExtractor={(item: Question) => item.id}
        renderItem={({ item }) => <FeedCard question={item} height={height} />}
        pagingEnabled
        snapToInterval={height}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<EmptyState height={height} />}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore) loadMore();
        }}
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
