import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View, useWindowDimensions } from "react-native";

import { useAuth } from "@features/authentication";
import { CameraButton } from "@features/upload/components/CameraButton";
import { useUpload } from "@features/upload/hooks/useUpload";

import { EmptyState } from "../components/EmptyState";
import { FeedCard } from "../components/FeedCard";
import { useFeed } from "../hooks/useFeed";
import { Question } from "../types";

export function FeedScreen() {
  const { height } = useWindowDimensions();
  const { firebaseUser, profile } = useAuth();
  const uid = firebaseUser?.uid;
  const organizationId = profile?.organizationId ?? null;
  const ownerHandle = profile?.username ?? profile?.displayName ?? "kullanici";
  const ownerPhotoURL = profile?.photoURL ?? null;

  const { questions, isLoading, isRefreshing, refresh, prepend } = useFeed(uid);
  const { capture, isUploading } = useUpload({ uid, organizationId, onUploaded: prepend });

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
        renderItem={({ item }) => (
          <FeedCard
            question={item}
            height={height}
            ownerHandle={ownerHandle}
            ownerPhotoURL={ownerPhotoURL}
          />
        )}
        pagingEnabled
        snapToInterval={height}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<EmptyState height={height} />}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
      />

      <CameraButton onPress={capture} isLoading={isUploading} />
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
});
