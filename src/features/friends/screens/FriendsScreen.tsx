import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@features/authentication";
import { Friendship } from "@/types/friendship";

import { FriendRow } from "../components/FriendRow";
import { useFriendsScreen } from "../hooks/useFriendsScreen";
import { getOtherParticipantId } from "../services/friendshipState";

type Segment = "friends" | "incoming" | "outgoing";

const SEGMENT_LABELS: Record<Segment, string> = {
  friends: "Arkadaşlar",
  incoming: "Gelen İstekler",
  outgoing: "Gönderilen İstekler",
};

const EMPTY_MESSAGES: Record<Segment, string> = {
  friends: "Henüz arkadaşın yok.",
  incoming: "Gelen istek yok.",
  outgoing: "Gönderilen istek yok.",
};

interface FriendsScreenProps {
  // The student route pushes this as a stack screen (back button makes
  // sense); the teacher route mounts it as a TAB root (spec section 2) —
  // a "‹" back chevron on a tab root has nothing to go back to. Defaults
  // to true so every existing call site keeps its current behavior.
  showBackButton?: boolean;
}

// Shared by both teacher and student route wrappers (spec section 11) —
// the route file just renders this, no role-specific branching beyond the
// header's back button.
export function FriendsScreen({ showBackButton = true }: FriendsScreenProps) {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  const {
    friends,
    incoming,
    outgoing,
    actioningId,
    loadMore,
    retry,
    acceptIncoming,
    declineIncoming,
    cancelOutgoing,
    removeExistingFriend,
  } = useFriendsScreen(uid);
  const [segment, setSegment] = useState<Segment>("friends");

  const sectionByKey = { friends, incoming, outgoing };
  const active = sectionByKey[segment];

  function renderRow({ item }: { item: Friendship }) {
    if (!uid) return null;
    const otherUid = getOtherParticipantId(item, uid);
    const isBusy = actioningId === item.id;

    if (segment === "friends") {
      return (
        <FriendRow
          uid={otherUid}
          variant="friend"
          isBusy={isBusy}
          onCancel={() => removeExistingFriend(item, otherUid)}
        />
      );
    }
    if (segment === "incoming") {
      return (
        <FriendRow
          uid={otherUid}
          variant="incoming"
          isBusy={isBusy}
          onAccept={() => acceptIncoming(item, otherUid)}
          onDecline={() => declineIncoming(item, otherUid)}
        />
      );
    }
    return (
      <FriendRow
        uid={otherUid}
        variant="outgoing"
        isBusy={isBusy}
        onCancel={() => cancelOutgoing(item, otherUid)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.header}>
        {showBackButton ? (
          <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
            <Text style={styles.backText}>{"‹"}</Text>
          </Pressable>
        ) : (
          <View style={styles.backButton} />
        )}
        <Text style={styles.title}>Arkadaşlar</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.segmentRow}>
        {(Object.keys(SEGMENT_LABELS) as Segment[]).map((key) => (
          <Pressable
            key={key}
            onPress={() => setSegment(key)}
            style={[styles.segment, segment === key ? styles.segmentActive : null]}
            accessibilityRole="button"
            accessibilityState={{ selected: segment === key }}
          >
            <Text style={[styles.segmentText, segment === key ? styles.segmentTextActive : null]}>
              {SEGMENT_LABELS[key]}
              {sectionByKey[key].items.length > 0 ? ` (${sectionByKey[key].items.length})` : ""}
            </Text>
          </Pressable>
        ))}
      </View>

      {active.isLoading ? (
        <ActivityIndicator color="black" style={styles.loading} />
      ) : active.errorMessage ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{active.errorMessage}</Text>
          <Pressable onPress={() => retry(segment)} style={styles.retryButton} accessibilityRole="button">
            <Text style={styles.retryText}>Tekrar Dene</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={active.items}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          onEndReachedThreshold={0.5}
          onEndReached={() => loadMore(segment)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>{EMPTY_MESSAGES[segment]}</Text>}
          ListFooterComponent={
            active.isLoadingMore ? <ActivityIndicator color="black" style={styles.loadingMore} /> : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "white",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    fontSize: 28,
    color: "black",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "black",
  },
  segmentRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F7F7F8",
    alignItems: "center",
  },
  segmentActive: {
    backgroundColor: "#3358D9",
  },
  segmentText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5B5F66",
    textAlign: "center",
  },
  segmentTextActive: {
    color: "white",
  },
  loading: {
    marginTop: 40,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 14,
    color: "#5B5F66",
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F2F2F2",
  },
  retryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "black",
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyText: {
    fontSize: 14,
    color: "#8A8F98",
    textAlign: "center",
    marginTop: 40,
  },
  loadingMore: {
    paddingVertical: 20,
  },
});
