import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useAuth } from "@features/authentication";
import { ROUTES } from "@constants/routes";

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
  const { profile, signOut } = useAuth();

  async function handleLogout() {
    await signOut();
    router.replace("/");
  }

  if (!profile) {
    return <SafeAreaView style={styles.flex} />;
  }

  const displayHandle = profile.username ?? profile.displayName ?? "Kullanıcı";

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
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

        <Text style={styles.username}>@{displayHandle}</Text>
        <Text style={styles.displayName}>{profile.displayName}</Text>

        <View style={styles.card}>
          <InfoRow label="Rol" value={ROLE_LABELS[profile.role] ?? profile.role} />
          <InfoRow label="E-posta" value={profile.email} />
          <InfoRow label="Puan" value={String(profile.totalPoints)} />
          <InfoRow label="Haftalık Puan" value={String(profile.weeklyPoints)} />
          <InfoRow label="Kurum" value={profile.organizationId ?? "Yok"} />
          <InfoRow label="Hesap Durumu" value={STATUS_LABELS[profile.accountStatus] ?? profile.accountStatus} />
          <InfoRow label="Katılım Tarihi" value={formatDate(profile.createdAt)} />
        </View>

        <PrimaryButton
          label="Profili Düzenle"
          onPress={() => router.push(ROUTES.editProfile)}
          variant="secondary"
        />
        <PrimaryButton label="Çıkış Yap" onPress={handleLogout} variant="secondary" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "white",
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
});
