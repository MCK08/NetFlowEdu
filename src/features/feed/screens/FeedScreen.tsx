import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

import { useAuth } from "@features/authentication";
import { CameraButton } from "@features/upload/components/CameraButton";
import { VisibilityPicker } from "@features/upload/components/VisibilityPicker";
import { useUpload } from "@features/upload/hooks/useUpload";

import { EmptyState } from "../components/EmptyState";
import { FeedCard } from "../components/FeedCard";
import { useSocialFeed } from "../hooks/useSocialFeed";
import { Question } from "../types";

export function FeedScreen() {
  const { height } = useWindowDimensions();
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
        <ActivityIndicator size="large" color="black" />
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
              <ActivityIndicator color="black" />
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
    backgroundColor: "white",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },
  loadingMore: {
    paddingVertical: 24,
  },
});
