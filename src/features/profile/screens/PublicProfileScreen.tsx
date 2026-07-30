import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ImageViewer } from "@components/ImageViewer";
import { Avatar } from "@components/ui/Avatar";
import { Card } from "@components/ui/Card";
import { EmptyState } from "@components/ui/EmptyState";
import { RoleBadge } from "@components/ui/RoleBadge";
import { StatTile } from "@components/ui/StatTile";
import { useAuth } from "@features/authentication";
import { FriendshipButton } from "@features/friends";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { resolvePublicIdentity } from "@utils/publicIdentity";

import { usePublicProfile } from "../hooks/usePublicProfile";
import { usePublicUserQuestions } from "../hooks/usePublicUserQuestions";

function formatDate(millis: number): string {
  if (!millis) return "-";
  return new Date(millis).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

interface PublicProfileScreenProps {
  userId: string;
}

export function PublicProfileScreen({ userId }: PublicProfileScreenProps) {
  const { profile, isLoading, errorMessage } = usePublicProfile(userId);
  const { questions, isLoading: questionsLoading } = usePublicUserQuestions(userId);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const { firebaseUser } = useAuth();
  const isOwnProfile = Boolean(firebaseUser) && firebaseUser?.uid === userId;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <Header />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="black" />
        </View>
      </SafeAreaView>
    );
  }

  if (errorMessage || !profile) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <Header />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{errorMessage ?? "Bu profil görüntülenemiyor."}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const identity = resolvePublicIdentity(profile);

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <Header />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarWrapper}>
          <Avatar photoURL={profile.photoURL} displayName={identity.primaryName} size="xl" />
        </View>

        <Text style={styles.username}>{identity.primaryName}</Text>
        {identity.usernameHandle ? (
          <Text style={styles.displayName}>{identity.usernameHandle}</Text>
        ) : null}

        <RoleBadge role={profile.role} />

        {!isOwnProfile ? <FriendshipButton ownUid={firebaseUser?.uid} otherUid={userId} /> : null}

        <View style={styles.statsRow}>
          <StatTile label="Puan" value={String(profile.totalPoints)} />
          <StatTile label="Haftalık" value={String(profile.weeklyPoints)} />
          <StatTile label="Soru" value={String(questions.length)} />
        </View>

        <Card style={styles.card}>
          {profile.organizationId ? <InfoRow label="Kurum" value={profile.organizationId} /> : null}
          <InfoRow label="Katılım Tarihi" value={formatDate(profile.createdAt)} />
        </Card>

        <View style={styles.gridSection}>
          <Text style={styles.sectionTitle}>Herkese Açık Sorular</Text>
          {questionsLoading ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : questions.length === 0 ? (
            <EmptyState icon="images-outline" title="Henüz herkese açık soru yok" />
          ) : (
            <View style={styles.grid}>
              {questions.map((question) => (
                <Pressable
                  key={question.id}
                  style={styles.gridItem}
                  onPress={() => setPreviewUri(question.imageUrl)}
                  accessibilityRole="button"
                  accessibilityLabel="Soru görselini büyüt"
                >
                  <Image source={{ uri: question.imageUrl }} style={styles.gridImage} contentFit="cover" />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <ImageViewer visible={previewUri !== null} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={() => router.back()}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Geri"
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.headerTitle}>Profil</Text>
    </View>
  );
}

const GRID_GAP = 4;
const GRID_ITEM_SIZE = "31.5%";

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    ...typography.subtitle,
    color: colors.textSecondary,
    textAlign: "center",
  },
  content: {
    padding: spacing.xl,
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
  statsRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
    marginTop: 4,
  },
  card: {
    width: "100%",
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
  gridSection: {
    width: "100%",
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },
  gridItem: {
    width: GRID_ITEM_SIZE,
    aspectRatio: 1,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surfaceMuted,
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
});
