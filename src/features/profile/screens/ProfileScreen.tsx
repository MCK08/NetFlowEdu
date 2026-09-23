import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { IconButton } from "@components/ui/IconButton";
import { useAuth } from "@features/authentication";
import { useSocialMeta } from "@features/friends";
import { ANALYTICS_ROUTES } from "@features/studentAnalytics/routes";
import { PLAN_ROUTES } from "@features/studyPlan/routes";
import { useNavigationGuard } from "@hooks/useNavigationGuard";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { resolvePublicIdentity } from "@utils/publicIdentity";
import { Question } from "@/types/question";

import { ProfileIdentityCard } from "../components/ProfileIdentityCard";
import { ProfileLearningSummary } from "../components/ProfileLearningSummary";
import { ProfileLoadingSkeleton } from "../components/ProfileLoadingSkeleton";
import { ProfileMenuGroup, ProfileMenuItem } from "../components/ProfileMenuGroup";
import { QuestionGridItem } from "../components/QuestionGridItem";
import { ArchiveMode, useQuestionArchive } from "../hooks/useQuestionArchive";
import { profileRoutesFor } from "../routes";

const GRID_COLUMNS = 3;

export const LEARNING_GROUP_TITLE = "Öğrenme";
export const ACCOUNT_GROUP_TITLE = "Hesap";

const ARCHIVE_TABS: { key: ArchiveMode; label: string }[] = [
  { key: "own", label: "Sorularım" },
  { key: "saved", label: "Kaydettiklerim" },
];

const EMPTY_CONTENT: Record<ArchiveMode, { title: string; description: string }> = {
  own: {
    title: "Henüz soru paylaşmadın",
    description: "Paylaştığın sorular burada arşivlenir.",
  },
  saved: {
    title: "Henüz hiç soru kaydetmedin",
    description: "Kaydettiğin sorulara buradan hızlıca dönebilirsin.",
  },
};

export function ProfileScreen() {
  const { profile, firebaseUser, openAccountSwitcher } = useAuth();
  const { width } = useWindowDimensions();
  const tabBarHeight = useBottomTabBarHeight();
  const [mode, setMode] = useState<ArchiveMode>("own");
  const { questions, isLoading, isLoadingMore, hasMore, loadMore } = useQuestionArchive(
    firebaseUser?.uid,
    mode,
  );
  // expo-router's push() does not deduplicate; the profile's destinations
  // previously used raw pushes, so a double-tap stacked the same screen
  // twice.
  const guardedNavigate = useNavigationGuard();
  // Phase 103/114 — the live counters that used to be a three-cell stat row
  // above the fold. They are a reason to OPEN Arkadaşlarım, not a statistic
  // about the student, so they now describe that row instead of decorating
  // the header. Same listener, same one-document cost, same status
  // semantics: a listener that has not answered yet says nothing rather
  // than claiming a confident 0.
  const socialMeta = useSocialMeta(firebaseUser?.uid);

  const isTeacher = profile?.role === "teacher";
  // One resolver for every role-specific destination on this screen — see
  // ../routes.ts, which also documents why the teacher's Friends must stay
  // "/(teacher)/friends" and never the removed tab path.
  const routes = profileRoutesFor(profile?.role);

  const itemSize = width / GRID_COLUMNS;

  // Phase 114 — the learning group. Every row is an existing screen with
  // real content behind it; none of them is a summary of another.
  const learningItems = useMemo<ProfileMenuItem[]>(
    () => [
      {
        key: "analytics",
        icon: "stats-chart-outline",
        title: "Kişisel Analiz",
        description: "Güçlü yönlerini gör, sonraki adımlarını planla",
        onPress: () => go("analytics", ANALYTICS_ROUTES.overview),
      },
      {
        key: "progress",
        icon: "map-outline",
        title: "İlerleme Haritam",
        description: "Konulardaki gelişimini keşfet",
        onPress: () => go("progress", PLAN_ROUTES.progress),
      },
      {
        key: "plan-settings",
        icon: "calendar-outline",
        title: "Çalışma Ayarları",
        description: "Hedeflerini ve tercihlerini düzenle",
        onPress: () => go("plan-settings", PLAN_ROUTES.settings),
      },
    ],
    // `go` closes over the guard, which is stable for the screen's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const friendsDescription = useMemo(() => {
    if (socialMeta.status !== "ready") return "Arkadaşlarını ve isteklerini yönet";
    const friends = `${socialMeta.friendCount} arkadaş`;
    return socialMeta.incomingRequestCount > 0
      ? `${friends} · ${socialMeta.incomingRequestCount} yeni istek`
      : friends;
  }, [socialMeta.status, socialMeta.friendCount, socialMeta.incomingRequestCount]);

  const accountItems = useMemo<ProfileMenuItem[]>(
    () => [
      // Phase 122 — "Hesap ve Profil" is not offered to a TEACHER, because
      // the identity card directly above it is already that destination:
      // same route, and the card's own spoken label ends "Hesap ve profil
      // bilgilerini düzenle". Two adjacent controls opening one screen is
      // the redundancy this phase was asked to remove, and Ayarlar keeps a
      // third way in ("Profil Bilgileri") for anyone who looks there.
      //
      // The student keeps it: Phase 114 put it there deliberately and this
      // phase does not redesign the student's Profil.
      ...(isTeacher
        ? []
        : [
            {
              key: "edit-profile",
              icon: "person-outline" as const,
              title: "Hesap ve Profil",
              description: "Ad, kullanıcı adı, profil fotoğrafı",
              onPress: () => go("edit-profile", routes.editProfile),
            },
          ]),
      {
        key: "friends",
        icon: "people-outline",
        title: "Arkadaşlarım",
        description: friendsDescription,
        onPress: () => go("friends", routes.friends),
      },
      {
        key: "find-friends",
        icon: "person-add-outline",
        title: "Arkadaş Bul",
        description: "Kullanıcı adına göre ara ve ekle",
        onPress: () => go("find-friends", routes.findFriends),
      },
      {
        key: "switch-account",
        icon: "swap-horizontal-outline",
        title: "Hesap Değiştir",
        description: "Bu cihazdaki diğer hesaplarına geç",
        onPress: openAccountSwitcher,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isTeacher, routes.editProfile, routes.friends, routes.findFriends, openAccountSwitcher, friendsDescription],
  );

  const keyExtractor = useCallback((item: Question) => item.id, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Question>) => (
      <QuestionGridItem question={item} size={itemSize} />
    ),
    [itemSize],
  );

  function go(key: string, href: string) {
    guardedNavigate(key, () => router.push(href as never));
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <ProfileLoadingSkeleton gridItemSize={itemSize - spacing.xxs} showActionBar />
      </SafeAreaView>
    );
  }

  const identity = resolvePublicIdentity(profile);

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <FlatList
        data={questions}
        keyExtractor={keyExtractor}
        numColumns={GRID_COLUMNS}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.xl }}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore) loadMore();
        }}
        ListHeaderComponent={
          <View>
            {/* PHASE 114 — Profil's order is: who you are, how your
                learning is going, where you can go, and only then the
                account itself. Preferences and Çıkış Yap moved behind the
                gear (SettingsScreen); nothing was deleted, and the screen
                stopped being a stack of equally loud cards. */}
            <View style={styles.screenHeader}>
              <Text style={styles.screenTitle}>Profil</Text>
              <IconButton
                icon="settings-outline"
                onPress={() => go("settings", routes.settings)}
                accessibilityLabel="Ayarlar"
                color={colors.textSecondary}
              />
            </View>

            <View style={styles.block}>
              <ProfileIdentityCard
                photoURL={profile.photoURL}
                primaryName={identity.primaryName}
                usernameHandle={identity.usernameHandle}
                role={profile.role}
                onPress={() => go("edit-profile", routes.editProfile)}
              />
            </View>

            {/* Students only: a teacher has no study items of their own, and
                inventing a teacher "learning summary" would be fiction. */}
            {!isTeacher ? (
              <View style={styles.block}>
                <ProfileLearningSummary uid={firebaseUser?.uid} />
              </View>
            ) : null}

            {!isTeacher ? (
              <View style={styles.block}>
                <ProfileMenuGroup title={LEARNING_GROUP_TITLE} items={learningItems} />
              </View>
            ) : null}

            {/* Phase 122 — the groups are named, the way Ayarlar's already
                are. Unlabelled, two cards of rows asked the reader to infer
                what each was for from the rows inside it. */}
            <View style={styles.block}>
              <ProfileMenuGroup title={ACCOUNT_GROUP_TITLE} items={accountItems} />
            </View>

            <View style={styles.tabRow}>
              {ARCHIVE_TABS.map((tab) => {
                const selected = mode === tab.key;
                return (
                  <Text
                    key={tab.key}
                    onPress={() => setMode(tab.key)}
                    style={[styles.tab, selected ? styles.tabActive : null]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                );
              })}
            </View>

            {isLoading ? (
              <View style={styles.gridSkeletonRow}>
                {[0, 1, 2].map((key) => (
                  <View
                    key={key}
                    style={[styles.gridSkeletonCell, { width: itemSize - spacing.xxs, height: itemSize - spacing.xxs }]}
                  />
                ))}
              </View>
            ) : null}
            {!isLoading && questions.length === 0 ? (
              <EmptyState
                icon="images-outline"
                title={EMPTY_CONTENT[mode].title}
                description={EMPTY_CONTENT[mode].description}
              />
            ) : null}
          </View>
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator color={colors.textTertiary} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // PHASE 114 — one rhythm for the whole screen.
  //
  // Phase 104 tuned five different margins to tell equally weighted cards
  // apart. With the page down to four blocks that distinction is carried by
  // the grouping itself, so every block simply gets the same gap and the
  // screen reads without anyone having to remember which wrapper is which.
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  screenTitle: {
    ...typography.screenTitle,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  block: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    marginTop: spacing.sm,
  },
  tab: {
    ...typography.bodyStrong,
    flex: 1,
    paddingVertical: spacing.sm,
    textAlign: "center",
    color: colors.textTertiary,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    color: colors.textPrimary,
    borderBottomColor: colors.primary,
  },
  gridSkeletonRow: {
    flexDirection: "row",
    gap: spacing.xxs,
    marginTop: spacing.xxs,
    paddingHorizontal: spacing.xxs,
  },
  gridSkeletonCell: {
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  loadingMore: {
    paddingVertical: spacing.xl,
  },
}));
