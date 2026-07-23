import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ImageViewer } from "@components/ImageViewer";

import { usePublicProfile } from "../hooks/usePublicProfile";
import { usePublicUserQuestions } from "../hooks/usePublicUserQuestions";

const ROLE_LABELS: Record<string, string> = {
  student: "Öğrenci",
  teacher: "Öğretmen",
  organization_admin: "Kurum Yöneticisi",
  platform_admin: "Platform Yöneticisi",
};

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

  const handle = profile.username || profile.displayName || "Kullanıcı";

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <Header />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarWrapper}>
          {profile.photoURL ? (
            <Image source={{ uri: profile.photoURL }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={40} color="#8A8F98" />
            </View>
          )}
        </View>

        <Text style={styles.username}>@{handle}</Text>
        {profile.displayName ? <Text style={styles.displayName}>{profile.displayName}</Text> : null}

        <View style={styles.badge}>
          <Text style={styles.badgeText}>{ROLE_LABELS[profile.role] ?? profile.role}</Text>
        </View>

        <View style={styles.statsRow}>
          <Stat label="Puan" value={String(profile.totalPoints)} />
          <Stat label="Haftalık" value={String(profile.weeklyPoints)} />
          <Stat label="Soru" value={String(questions.length)} />
        </View>

        <View style={styles.card}>
          {profile.organizationId ? <InfoRow label="Kurum" value={profile.organizationId} /> : null}
          <InfoRow label="Katılım Tarihi" value={formatDate(profile.createdAt)} />
        </View>

        <View style={styles.gridSection}>
          <Text style={styles.sectionTitle}>Herkese Açık Sorular</Text>
          {questionsLoading ? (
            <ActivityIndicator color="black" />
          ) : questions.length === 0 ? (
            <Text style={styles.emptyText}>Henüz herkese açık soru yok.</Text>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
        <Ionicons name="chevron-back" size={26} color="black" />
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
    backgroundColor: "white",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "black",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 15,
    color: "#5B5F66",
    textAlign: "center",
  },
  content: {
    padding: 24,
    gap: 16,
    alignItems: "center",
  },
  avatarWrapper: {
    marginTop: 8,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#F2F2F2",
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#F2F2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  username: {
    fontSize: 18,
    fontWeight: "700",
    color: "black",
  },
  displayName: {
    fontSize: 14,
    color: "#5B5F66",
    marginTop: -8,
  },
  badge: {
    backgroundColor: "#F2F2F2",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5B5F66",
  },
  statsRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
    marginTop: 4,
  },
  stat: {
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "black",
  },
  statLabel: {
    fontSize: 12,
    color: "#8A8F98",
  },
  card: {
    width: "100%",
    backgroundColor: "#F7F7F8",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  infoLabel: {
    fontSize: 14,
    color: "#5B5F66",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "black",
  },
  gridSection: {
    width: "100%",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "black",
  },
  emptyText: {
    fontSize: 14,
    color: "#8A8F98",
    textAlign: "center",
    paddingVertical: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },
  gridItem: {
    width: GRID_ITEM_SIZE,
    aspectRatio: 1,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#F2F2F2",
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
});
