import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "@components/ui/Avatar";
import { Card } from "@components/ui/Card";
import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { RoleBadge } from "@components/ui/RoleBadge";
import { StatTile } from "@components/ui/StatTile";
import { useAuth } from "@features/authentication";
import { GoogleSignInButton } from "@features/authentication/components/GoogleSignInButton";
import { formatRequestBadge, useSocialMeta } from "@features/friends";
import { ROUTES } from "@constants/routes";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { resolvePublicIdentity } from "@utils/publicIdentity";

import { QuestionGridItem } from "../components/QuestionGridItem";
import { ArchiveMode, useQuestionArchive } from "../hooks/useQuestionArchive";
import { Question } from "@/types/question";

const STATUS_LABELS: Record<string, string> = {
  active: "Aktif",
  suspended: "Askıya Alındı",
};

const GRID_COLUMNS = 3;

function formatDate(millis: number): string {
  if (!millis) return "-";
  return new Date(millis).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function ProfileScreen() {
  const { profile, firebaseUser, signOut, knownAccounts, openAccountSwitcher, linkGoogleAccount } =
    useAuth();
  const { width } = useWindowDimensions();
  const tabBarHeight = useBottomTabBarHeight();
  const [mode, setMode] = useState<ArchiveMode>("own");
  const [linkError, setLinkError] = useState<string | null>(null);
  const providerIds = firebaseUser?.providerData.map((p) => p.providerId) ?? [];
  const isGoogleLinked = providerIds.includes("google.com");
  const isEmailLinked = providerIds.includes("password");
  const { questions, isLoading, isLoadingMore, hasMore, loadMore } = useQuestionArchive(
    firebaseUser?.uid,
    mode,
  );
  const socialMeta = useSocialMeta(firebaseUser?.uid);
  const incomingBadge = formatRequestBadge(socialMeta.incomingRequestCount);
  // Friends is a full tab for teachers ((teacher)/(tabs)/friends) but a
  // plain stack screen for students (no student tab-bar restructure per
  // spec section 2's "mevcut route'ları bozmadan") — Find Friends is a
  // stack screen for both, matching ROUTES' existing per-role path style.
  const isTeacher = profile?.role === "teacher";
  const friendsHref = isTeacher ? "/(teacher)/(tabs)/friends" : "/(student)/friends";
  const findFriendsHref = isTeacher ? "/(teacher)/find-friends" : "/(student)/find-friends";
  // ROUTES.editProfile is student-only ("/(student)/edit-profile") — a
  // teacher needs the sibling route under (teacher), same shared
  // EditProfileScreen, different group wrapper (spec section 3).
  const editProfileHref = isTeacher ? "/(teacher)/edit-profile" : ROUTES.editProfile;

  async function handleLogout() {
    await signOut();
    router.replace("/");
  }

  if (!profile) {
    return <SafeAreaView style={styles.flex} />;
  }

  const identity = resolvePublicIdentity(profile);
  const itemSize = width / GRID_COLUMNS;

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <FlatList
        data={questions}
        keyExtractor={(item: Question) => item.id}
        numColumns={GRID_COLUMNS}
        renderItem={({ item }) => <QuestionGridItem question={item} size={itemSize} />}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore) loadMore();
        }}
        ListHeaderComponent={
          <View style={styles.content}>
            <View style={styles.avatarWrapper}>
              <Avatar photoURL={profile.photoURL} displayName={identity.primaryName} size="xl" />
            </View>

            <Text style={styles.username}>{identity.primaryName}</Text>
            {identity.usernameHandle ? (
              <Text style={styles.displayName}>{identity.usernameHandle}</Text>
            ) : null}
            <RoleBadge role={profile.role} />

            <Card style={styles.card}>
              <InfoRow label="E-posta" value={profile.email} />
              <InfoRow label="Puan" value={String(profile.totalPoints)} />
              <InfoRow label="Haftalık Puan" value={String(profile.weeklyPoints)} />
              <InfoRow label="Kurum" value={profile.organizationId ?? "Yok"} />
              <InfoRow
                label="Hesap Durumu"
                value={STATUS_LABELS[profile.accountStatus] ?? profile.accountStatus}
              />
              <InfoRow label="Katılım Tarihi" value={formatDate(profile.createdAt)} />
            </Card>

            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>Hesaplar</Text>
              <InfoRow label="Kayıtlı Hesap Sayısı" value={String(knownAccounts.length)} />
              <InfoRow label="Google Bağlı" value={isGoogleLinked ? "Evet" : "Hayır"} />
              <InfoRow label="E-posta Bağlı" value={isEmailLinked ? "Evet" : "Hayır"} />
              <PrimaryButton
                label="Hesap Değiştir"
                onPress={openAccountSwitcher}
                variant="secondary"
              />
              {!isGoogleLinked ? (
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
              ) : null}
              {linkError ? <Text style={styles.errorText}>{linkError}</Text> : null}
            </Card>

            <View style={styles.friendStatsRow}>
              <StatTile value={socialMeta.friendCount} label="Arkadaş" />
              <View style={styles.friendStat}>
                <View style={styles.friendStatValueRow}>
                  <Text style={styles.friendStatValue}>{socialMeta.incomingRequestCount}</Text>
                  {incomingBadge ? (
                    <View style={styles.requestBadge}>
                      <Text style={styles.requestBadgeText}>{incomingBadge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.friendStatLabel}>Gelen İstek</Text>
              </View>
            </View>

            <View style={styles.buttonRow}>
              <View style={styles.buttonFlex}>
                <PrimaryButton
                  label="Arkadaşlarım"
                  onPress={() => router.push(friendsHref as never)}
                  variant="secondary"
                />
              </View>
              <View style={styles.buttonFlex}>
                <PrimaryButton
                  label="Arkadaş Bul"
                  onPress={() => router.push(findFriendsHref as never)}
                  variant="secondary"
                />
              </View>
            </View>

            <View style={styles.buttonRow}>
              <View style={styles.buttonFlex}>
                <PrimaryButton
                  label="Profili Düzenle"
                  onPress={() => router.push(editProfileHref as never)}
                  variant="secondary"
                />
              </View>
              <View style={styles.buttonFlex}>
                <PrimaryButton label="Çıkış Yap" onPress={handleLogout} variant="secondary" />
              </View>
            </View>

            <View style={styles.tabRow}>
              <Pressable
                style={[styles.tab, mode === "own" ? styles.tabActive : null]}
                onPress={() => setMode("own")}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === "own" }}
              >
                <Text style={[styles.tabText, mode === "own" ? styles.tabTextActive : null]}>
                  Sorularım
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tab, mode === "saved" ? styles.tabActive : null]}
                onPress={() => setMode("saved")}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === "saved" }}
              >
                <Text style={[styles.tabText, mode === "saved" ? styles.tabTextActive : null]}>
                  Kaydettiklerim
                </Text>
              </Pressable>
            </View>

            {isLoading ? (
              <View style={styles.gridSkeletonRow}>
                {[0, 1, 2].map((key) => (
                  <LoadingSkeleton key={key} width={itemSize - spacing.xs} height={itemSize - spacing.xs} borderRadius={radius.sm} />
                ))}
              </View>
            ) : null}
            {!isLoading && questions.length === 0 ? (
              <EmptyState
                icon="images-outline"
                title={mode === "own" ? "Henüz soru paylaşmadın" : "Henüz hiç soru kaydetmedin"}
              />
            ) : null}
          </View>
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator color={colors.textPrimary} />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.md,
    alignItems: "center",
  },
  avatarWrapper: {
    marginTop: spacing.xs,
  },
  username: {
    ...typography.title,
    color: colors.textPrimary,
  },
  displayName: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: -spacing.xs,
  },
  card: {
    width: "100%",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  infoLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  infoValue: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  friendStatsRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
  },
  friendStat: {
    alignItems: "center",
    gap: 2,
  },
  friendStatValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  friendStatValue: {
    ...typography.title,
    color: colors.textPrimary,
  },
  friendStatLabel: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  requestBadge: {
    backgroundColor: colors.danger,
    borderRadius: radius.pill,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  requestBadgeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: "700",
  },
  buttonRow: {
    flexDirection: "row",
    width: "100%",
    gap: spacing.sm,
  },
  buttonFlex: {
    flex: 1,
  },
  tabRow: {
    flexDirection: "row",
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    marginTop: spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: colors.textPrimary,
  },
  tabText: {
    ...typography.bodyStrong,
    color: colors.textTertiary,
  },
  tabTextActive: {
    color: colors.textPrimary,
  },
  gridSkeletonRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  loadingMore: {
    paddingVertical: spacing.xl,
  },
});
