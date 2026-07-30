import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { useAuth } from "@features/authentication";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
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
  friends: "Henüz arkadaşın yok",
  incoming: "Gelen istek yok",
  outgoing: "Gönderilen istek yok",
};

const EMPTY_ICONS: Record<Segment, keyof typeof Ionicons.glyphMap> = {
  friends: "people-outline",
  incoming: "mail-open-outline",
  outgoing: "paper-plane-outline",
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
        <ActivityIndicator color={colors.textPrimary} style={styles.loading} />
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
          ListEmptyComponent={<EmptyState icon={EMPTY_ICONS[segment]} title={EMPTY_MESSAGES[segment]} />}
          ListFooterComponent={
            active.isLoadingMore ? (
              <ActivityIndicator color={colors.textPrimary} style={styles.loadingMore} />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    fontSize: 28,
    color: colors.textPrimary,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  segmentRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
  segmentTextActive: {
    color: colors.textInverse,
  },
  loading: {
    marginTop: spacing.xxxl,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  retryText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  loadingMore: {
    paddingVertical: spacing.lg,
  },
});
