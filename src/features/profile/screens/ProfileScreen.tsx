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

import { ActionTile } from "@components/ui/ActionTile";
import { Card } from "@components/ui/Card";
import { Divider } from "@components/ui/Divider";
import { EmptyState } from "@components/ui/EmptyState";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { useAuth } from "@features/authentication";
import { GoogleSignInButton } from "@features/authentication/components/GoogleSignInButton";
import { useSocialMeta } from "@features/friends";
import { useNavigationGuard } from "@hooks/useNavigationGuard";
import { ROUTES } from "@constants/routes";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { resolvePublicIdentity } from "@utils/publicIdentity";
import { Question } from "@/types/question";

import { ProfileHero } from "../components/ProfileHero";
import { ProfileLoadingSkeleton } from "../components/ProfileLoadingSkeleton";
import { ProfileStatsRow } from "../components/ProfileStatsRow";
import { QuestionGridItem } from "../components/QuestionGridItem";
import { ArchiveMode, useQuestionArchive } from "../hooks/useQuestionArchive";
import { ownProfileStats } from "../services/profileStats";

const GRID_COLUMNS = 3;

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
  const { profile, firebaseUser, signOut, knownAccounts, openAccountSwitcher, linkGoogleAccount } =
    useAuth();
  const { width } = useWindowDimensions();
  const tabBarHeight = useBottomTabBarHeight();
  const [mode, setMode] = useState<ArchiveMode>("own");
  const [linkError, setLinkError] = useState<string | null>(null);
  const providerIds = firebaseUser?.providerData.map((p) => p.providerId) ?? [];
  const isGoogleLinked = providerIds.includes("google.com");
  const { questions, isLoading, isLoadingMore, hasMore, loadMore } = useQuestionArchive(
    firebaseUser?.uid,
    mode,
  );
  const socialMeta = useSocialMeta(firebaseUser?.uid);
  // expo-router's push() does not deduplicate; the profile's four
  // destinations previously used raw pushes, so a double-tap stacked the
  // same screen twice.
  const guardedNavigate = useNavigationGuard();

  const isTeacher = profile?.role === "teacher";
  // Friends is a full tab for teachers ((teacher)/(tabs)/friends) but a
  // plain stack screen for students; Find Friends and Edit Profile are
  // stack screens for both, one per role group.
  const friendsHref = isTeacher ? "/(teacher)/(tabs)/friends" : "/(student)/friends";
  const findFriendsHref = isTeacher ? "/(teacher)/find-friends" : "/(student)/find-friends";
  const editProfileHref = isTeacher ? "/(teacher)/edit-profile" : ROUTES.editProfile;

  const itemSize = width / GRID_COLUMNS;

  const stats = useMemo(
    () =>
      ownProfileStats({
        friendCount: socialMeta.friendCount,
        incomingRequestCount: socialMeta.incomingRequestCount,
        totalPoints: profile?.totalPoints,
        // socialMeta starts at all-zero before its listener delivers the
        // first snapshot; updatedAt is 0 only in that pre-load state, so
        // the counters render as skeletons instead of a confident "0".
        isSocialMetaLoading: socialMeta.updatedAt === 0,
      }),
    [socialMeta, profile?.totalPoints],
  );

  const keyExtractor = useCallback((item: Question) => item.id, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Question>) => (
      <QuestionGridItem question={item} size={itemSize} />
    ),
    [itemSize],
  );

  async function handleLogout() {
    await signOut();
    router.replace("/");
  }

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
            <ProfileHero
              photoURL={profile.photoURL}
              primaryName={identity.primaryName}
              usernameHandle={identity.usernameHandle}
              role={profile.role}
            >
              <ProfileStatsRow stats={stats} />
            </ProfileHero>

            {/* Primary management action first, at full width — the old
                screen buried "Profili Düzenle" in a 2x2 grid of identical
                secondary buttons that also contained logout. */}
            <View style={styles.primaryActionWrapper}>
              <PrimaryButton
                label="Profili Düzenle"
                onPress={() => go("edit-profile", editProfileHref)}
              />
            </View>

            <View style={styles.quickActions}>
              <ActionTile
                icon="people-outline"
                label="Arkadaşlarım"
                onPress={() => go("friends", friendsHref)}
                style={styles.quickActionTile}
              />
              <ActionTile
                icon="person-add-outline"
                label="Arkadaş Bul"
                onPress={() => go("find-friends", findFriendsHref)}
                style={styles.quickActionTile}
              />
              <ActionTile
                icon="swap-horizontal-outline"
                label="Hesap Değiştir"
                onPress={openAccountSwitcher}
                style={styles.quickActionTile}
              />
            </View>

            <View style={styles.sectionWrapper}>
              <Card>
                <SectionHeader title="Hesap" />
                <InfoRow label="E-posta" value={profile.email} />
                <InfoRow label="Kayıtlı hesap" value={String(knownAccounts.length)} />
                <InfoRow label="Google bağlı" value={isGoogleLinked ? "Evet" : "Hayır"} />
                {!isGoogleLinked ? (
                  <View style={styles.linkButtonWrapper}>
                    <GoogleSignInButton
                      onIdToken={async (idToken) => {
                        setLinkError(null);
                        try {
                          await linkGoogleAccount(idToken);
                        } catch (error) {
                          setLinkError(
                            error instanceof Error ? error.message : "Google hesabı bağlanamadı.",
                          );
                        }
                      }}
                      onError={setLinkError}
                      label="Google Hesabını Bağla"
                    />
                  </View>
                ) : null}
                {linkError ? (
                  <Text style={styles.errorText} accessibilityRole="alert">
                    {linkError}
                  </Text>
                ) : null}
              </Card>
            </View>

            {/* Destructive action, visually separated below its own divider
                and never competing with the primary actions above. */}
            <Divider style={styles.logoutDivider} />
            <View style={styles.logoutWrapper}>
              <PrimaryButton label="Çıkış Yap" onPress={handleLogout} variant="secondary" />
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  primaryActionWrapper: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  quickActions: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  quickActionTile: {
    flex: 1,
    minWidth: 0,
  },
  sectionWrapper: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  linkButtonWrapper: {
    marginTop: spacing.xs,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 2,
  },
  infoLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  infoValue: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.xxs,
  },
  logoutDivider: {
    marginTop: spacing.lg,
  },
  logoutWrapper: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    marginTop: spacing.lg,
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
});
