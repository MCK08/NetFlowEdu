import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  ListRenderItemInfo,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ImageViewer } from "@components/ImageViewer";
import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Divider } from "@components/ui/Divider";
import { EmptyState } from "@components/ui/EmptyState";
import { IconButton } from "@components/ui/IconButton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { useAuth } from "@features/authentication";
import { FriendshipButton } from "@features/friends";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { resolvePublicIdentity } from "@utils/publicIdentity";
import { Question } from "@/types/question";

import { ProfileHero } from "../components/ProfileHero";
import { ProfileLoadingSkeleton } from "../components/ProfileLoadingSkeleton";
import { ProfileStatsRow } from "../components/ProfileStatsRow";
import { usePublicProfile } from "../hooks/usePublicProfile";
import { usePublicUserQuestions } from "../hooks/usePublicUserQuestions";
import { publicProfileStats } from "../services/profileStats";

const GRID_COLUMNS = 3;
const GRID_GAP = 2;

interface PublicProfileScreenProps {
  userId: string;
}

export function PublicProfileScreen({ userId }: PublicProfileScreenProps) {
  const { profile, isLoading, errorMessage, isNotFound, retry } = usePublicProfile(userId);
  const { questions, isLoading: questionsLoading } = usePublicUserQuestions(userId);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const { firebaseUser } = useAuth();
  const { width } = useWindowDimensions();
  const isOwnProfile = Boolean(firebaseUser) && firebaseUser?.uid === userId;

  // Derived from the real viewport rather than a percentage, so three
  // columns line up exactly on every screen width.
  const itemSize = (width - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

  const stats = useMemo(
    () =>
      publicProfileStats({
        totalPoints: profile?.totalPoints,
        weeklyPoints: profile?.weeklyPoints,
        isLoading,
      }),
    [profile?.totalPoints, profile?.weeklyPoints, isLoading],
  );

  const keyExtractor = useCallback((item: Question) => item.id, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Question>) => (
      <AnimatedPressable
        style={[styles.gridItem, { width: itemSize, height: itemSize }]}
        onPress={() => setPreviewUri(item.imageUrl)}
        accessibilityRole="button"
        accessibilityLabel="Soru görselini büyüt"
      >
        <Image source={{ uri: item.imageUrl }} style={styles.gridImage} contentFit="cover" />
      </AnimatedPressable>
    ),
    [itemSize],
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <Header />
        <ProfileLoadingSkeleton gridItemSize={itemSize - GRID_GAP} />
      </SafeAreaView>
    );
  }

  // A genuinely missing profile and a failed read are now different
  // outcomes: only the latter offers a retry, because retrying a deleted
  // account can never succeed.
  if (errorMessage || !profile) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <Header />
        <View style={styles.centered}>
          <Ionicons
            name={isNotFound ? "person-remove-outline" : "cloud-offline-outline"}
            size={36}
            color={colors.textTertiary}
          />
          <Text style={styles.errorTitle}>
            {isNotFound ? "Profil bulunamadı" : "Profil yüklenemedi"}
          </Text>
          <Text style={styles.errorText}>{errorMessage ?? "Bu profil görüntülenemiyor."}</Text>
          {!isNotFound ? (
            <PrimaryButton label="Tekrar Dene" onPress={retry} variant="secondary" />
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const identity = resolvePublicIdentity(profile);

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <Header />

      {/* One virtualized surface. The previous version rendered every
          question inside a ScrollView via .map(), so a prolific user's
          whole grid was mounted at once. */}
      <FlatList
        data={questions}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <ProfileHero
              photoURL={profile.photoURL}
              primaryName={identity.primaryName}
              usernameHandle={identity.usernameHandle}
              role={profile.role}
            >
              <ProfileStatsRow stats={stats} />
              {!isOwnProfile ? (
                <FriendshipButton
                  ownUid={firebaseUser?.uid}
                  otherUid={userId}
                  isOwnProfile={isOwnProfile}
                />
              ) : null}
            </ProfileHero>

            <Divider style={styles.sectionDivider} />

            <View style={styles.sectionHeaderWrapper}>
              <SectionHeader title="Herkese Açık Sorular" />
            </View>
          </View>
        }
        ListEmptyComponent={
          questionsLoading ? null : (
            <EmptyState
              icon="images-outline"
              title="Henüz herkese açık soru yok"
              description="Bu kullanıcı henüz herkese açık bir soru paylaşmadı."
            />
          )
        }
      />

      <ImageViewer visible={previewUri !== null} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View>
      <View style={styles.header}>
        <IconButton
          icon="chevron-back"
          onPress={() => router.back()}
          accessibilityLabel="Geri"
          color={colors.textPrimary}
        />
        <Text style={styles.headerTitle}>Profil</Text>
        <View style={styles.headerSpacer} />
      </View>
      <Divider />
    </View>
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
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
  },
  headerTitle: {
    ...typography.subtitle,
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    flex: 1,
    textAlign: "center",
  },
  headerSpacer: {
    width: 44,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  errorTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    textAlign: "center",
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  headerBlock: {
    paddingBottom: spacing.xs,
  },
  sectionDivider: {
    marginTop: spacing.lg,
  },
  sectionHeaderWrapper: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  listContent: {
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  gridItem: {
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surfaceMuted,
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
});
