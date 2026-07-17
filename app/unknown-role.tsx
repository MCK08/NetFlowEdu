import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useAuth } from "@features/authentication";

// Reached only when an authenticated, verified user's role doesn't match
// any known dashboard — e.g. a profile write got corrupted, or a role was
// deleted server-side. Fails closed: no dashboard is guessed, the only way
// out is signing out.
export default function UnknownRoleScreen() {
  const { profileError, signOut } = useAuth();

  async function handleLogout() {
    await signOut();
    router.replace("/");
  }

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.content}>
        <Text style={styles.title}>Hesap Sorunu</Text>
        <Text style={styles.message}>
          {profileError ??
            "Hesabınızla ilgili bir sorun oluştu. Lütfen daha sonra tekrar deneyin veya destek ekibiyle iletişime geçin."}
        </Text>
        <PrimaryButton label="Çıkış Yap" onPress={handleLogout} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  message: {
    fontSize: 15,
    textAlign: "center",
    opacity: 0.8,
    marginBottom: 12,
  },
});
