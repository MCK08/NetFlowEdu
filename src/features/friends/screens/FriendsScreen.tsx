import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, ListRenderItemInfo, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Divider } from "@components/ui/Divider";
import { EmptyState } from "@components/ui/EmptyState";
import { IconButton } from "@components/ui/IconButton";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useAuth } from "@features/authentication";
import { useNavigationGuard } from "@hooks/useNavigationGuard";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { Friendship } from "@/types/friendship";

import { FriendRow } from "../components/FriendRow";
import { SocialSegment, SocialSegmentControl } from "../components/SocialSegmentControl";
import { useFriendsScreen } from "../hooks/useFriendsScreen";
import { getOtherParticipantId } from "../services/friendshipState";

type Segment = "friends" | "incoming" | "outgoing";

const SEGMENT_LABELS: Record<Segment, string> = {
  friends: "Arkadaşlar",
  incoming: "Gelen",
  outgoing: "Gönderilen",
};

const EMPTY_CONTENT: Record<Segment, { icon: keyof typeof Ionicons.glyphMap; title: string; description: string }> = {
  friends: {
    icon: "people-outline",
    title: "Henüz arkadaşın yok",
    description: "Arkadaş Bul ile sınıf arkadaşlarını ve öğretmenlerini ekleyebilirsin.",
  },
  incoming: {
    icon: "mail-open-outline",
    title: "Gelen istek yok",
    description: "Biri sana arkadaşlık isteği gönderdiğinde burada görünecek.",
  },
  outgoing: {
    icon: "paper-plane-outline",
    title: "Gönderilen istek yok",
    description: "Gönderdiğin ve henüz yanıtlanmayan istekler burada listelenir.",
  },
};

const SEGMENT_ORDER: Segment[] = ["friends", "incoming", "outgoing"];

function ListSkeleton() {
  return (
    <View style={styles.skeletonList} accessible accessibilityLabel="Liste yükleniyor">
      {[0, 1, 2, 3].map((key) => (
        <View key={key} style={styles.skeletonRow}>
          <LoadingSkeleton width={40} height={40} borderRadius={20} />
          <View style={styles.skeletonText}>
            <LoadingSkeleton width={150} height={14} borderRadius={radius.sm} />
            <LoadingSkeleton width={90} height={10} borderRadius={radius.sm} />
          </View>
        </View>
      ))}
    </View>
  );
}

interface FriendsScreenProps {
  // The student route pushes this as a stack screen (back button makes
  // sense); the teacher route mounts it as a TAB root — a back chevron on
  // a tab root has nothing to go back to.
  showBackButton?: boolean;
}

// Shared by both teacher and student route wrappers — the route file just
// renders this, with no role-specific branching beyond the header's back
// button and the role-correct public-profile path.
export function FriendsScreen({ showBackButton = true }: FriendsScreenProps) {
  const { firebaseUser, profile } = useAuth();
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
  } = useFriendsScreen(uid);
  const [segment, setSegment] = useState<Segment>("friends");

  // One guard for the whole screen, keyed per user, instead of one focus
  // listener per rendered row.
  const guardedNavigate = useNavigationGuard();
  const publicProfilePathname =
    profile?.role === "teacher" ? "/(teacher)/user/[userId]" : "/(student)/user/[userId]";

  const sectionByKey = useMemo(
    () => ({ friends, incoming, outgoing }),
    [friends, incoming, outgoing],
  );
  const active = sectionByKey[segment];

  const segments: SocialSegment<Segment>[] = useMemo(
    () =>
      SEGMENT_ORDER.map((key) => ({
        key,
        label: SEGMENT_LABELS[key],
        // Undefined while the section is still loading, so a badge never
        // claims "0" for a list that has not arrived.
        count: sectionByKey[key].isLoading ? undefined : sectionByKey[key].items.length,
      })),
    [sectionByKey],
  );

  const openProfile = useCallback(
    (otherUid: string) => {
      guardedNavigate(`profile-${otherUid}`, () => {
        router.push({ pathname: publicProfilePathname, params: { userId: otherUid } });
      });
    },
    [guardedNavigate, publicProfilePathname],
  );

  const keyExtractor = useCallback((item: Friendship) => item.id, []);

  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<Friendship>) => {
      if (!uid) return null;
      const otherUid = getOtherParticipantId(item, uid);
      const isBusy = actioningId === item.id;

      if (segment === "incoming") {
        return (
          <FriendRow
            uid={otherUid}
            variant="incoming"
            isBusy={isBusy}
            onOpenProfile={() => openProfile(otherUid)}
            onAccept={() => acceptIncoming(item, otherUid)}
            onDecline={() => declineIncoming(item, otherUid)}
          />
        );
      }
      if (segment === "outgoing") {
        return (
          <FriendRow
            uid={otherUid}
            variant="outgoing"
            isBusy={isBusy}
            onOpenProfile={() => openProfile(otherUid)}
            onDecline={() => cancelOutgoing(item, otherUid)}
          />
        );
      }
      return (
        <FriendRow
          uid={otherUid}
          variant="friend"
          isBusy={isBusy}
          onOpenProfile={() => openProfile(otherUid)}
        />
      );
    },
    [uid, segment, actioningId, openProfile, acceptIncoming, declineIncoming, cancelOutgoing],
  );

  const emptyContent = EMPTY_CONTENT[segment];

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.header}>
        {showBackButton ? (
          <IconButton
            icon="chevron-back"
            onPress={() => router.back()}
            accessibilityLabel="Geri"
            color={colors.textPrimary}
          />
        ) : (
          <View style={styles.headerSpacer} />
        )}
        <Text style={styles.title}>Arkadaşlar</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.segmentWrapper}>
        <SocialSegmentControl segments={segments} value={segment} onChange={setSegment} />
      </View>

      <Divider />

      {active.isLoading ? (
        <ListSkeleton />
      ) : active.errorMessage ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.textTertiary} />
          <Text style={styles.errorText}>{active.errorMessage}</Text>
          <PrimaryButton label="Tekrar Dene" onPress={() => retry(segment)} variant="secondary" />
        </View>
      ) : (
        <FlatList
          data={active.items}
          keyExtractor={keyExtractor}
          renderItem={renderRow}
          onEndReachedThreshold={0.5}
          onEndReached={() => loadMore(segment)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon={emptyContent.icon}
              title={emptyContent.title}
              description={emptyContent.description}
            />
          }
          ListFooterComponent={
            active.isLoadingMore ? (
              <ActivityIndicator color={colors.textTertiary} style={styles.loadingMore} />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  headerSpacer: {
    width: 44,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  segmentWrapper: {
    paddingBottom: spacing.sm,
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
  listContent: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  loadingMore: {
    paddingVertical: spacing.lg,
  },
  skeletonList: {
    paddingTop: spacing.sm,
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  skeletonText: {
    gap: spacing.xs,
  },
}));
