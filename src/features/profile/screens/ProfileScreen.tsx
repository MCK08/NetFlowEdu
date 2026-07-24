import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
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

import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useAuth } from "@features/authentication";
import { ROUTES } from "@constants/routes";
import { resolvePublicIdentity } from "@utils/publicIdentity";

import { QuestionGridItem } from "../components/QuestionGridItem";
import { ArchiveMode, useQuestionArchive } from "../hooks/useQuestionArchive";
import { Question } from "@/types/question";

const ROLE_LABELS: Record<string, string> = {
  student: "Öğrenci",
  teacher: "Öğretmen",
  organization_admin: "Kurum Yöneticisi",
  platform_admin: "Platform Yöneticisi",
};

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
  const { profile, firebaseUser, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const tabBarHeight = useBottomTabBarHeight();
  const [mode, setMode] = useState<ArchiveMode>("own");
  const { questions, isLoading, isLoadingMore, hasMore, loadMore } = useQuestionArchive(
    firebaseUser?.uid,
    mode,
  );

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
              {profile.photoURL ? (
                <Image source={{ uri: profile.photoURL }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={40} color="#8A8F98" />
                </View>
              )}
            </View>

            <Text style={styles.username}>{identity.primaryName}</Text>
            {identity.usernameHandle ? (
              <Text style={styles.displayName}>{identity.usernameHandle}</Text>
            ) : null}

            <View style={styles.card}>
              <InfoRow label="Rol" value={ROLE_LABELS[profile.role] ?? profile.role} />
              <InfoRow label="E-posta" value={profile.email} />
              <InfoRow label="Puan" value={String(profile.totalPoints)} />
              <InfoRow label="Haftalık Puan" value={String(profile.weeklyPoints)} />
              <InfoRow label="Kurum" value={profile.organizationId ?? "Yok"} />
              <InfoRow
                label="Hesap Durumu"
                value={STATUS_LABELS[profile.accountStatus] ?? profile.accountStatus}
              />
              <InfoRow label="Katılım Tarihi" value={formatDate(profile.createdAt)} />
            </View>

            <View style={styles.buttonRow}>
              <View style={styles.buttonFlex}>
                <PrimaryButton
                  label="Profili Düzenle"
                  onPress={() => router.push(ROUTES.editProfile)}
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

            {isLoading ? <ActivityIndicator color="black" style={styles.loading} /> : null}
            {!isLoading && questions.length === 0 ? (
              <Text style={styles.emptyText}>
                {mode === "own" ? "Henüz soru paylaşmadın." : "Henüz hiç soru kaydetmedin."}
              </Text>
            ) : null}
          </View>
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator color="black" />
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
    backgroundColor: "white",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
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
  buttonRow: {
    flexDirection: "row",
    width: "100%",
    gap: 12,
  },
  buttonFlex: {
    flex: 1,
  },
  tabRow: {
    flexDirection: "row",
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: "#EDEEF0",
    marginTop: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "black",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8A8F98",
  },
  tabTextActive: {
    color: "black",
  },
  loading: {
    marginVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    color: "#8A8F98",
    textAlign: "center",
    marginVertical: 24,
  },
  loadingMore: {
    paddingVertical: 24,
  },
});
