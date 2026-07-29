import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@features/authentication";
import { PublicProfile } from "@/types/publicProfile";
import { resolvePublicIdentity } from "@utils/publicIdentity";

import { useFriendSearch } from "../hooks/useFriendSearch";

const ROLE_LABELS: Record<string, string> = {
  student: "Öğrenci",
  teacher: "Öğretmen",
};

// Shared by both teacher and student route wrappers (spec section 9).
export function FindFriendsScreen() {
  const { firebaseUser, profile: ownProfile } = useAuth();
  const { queryText, setQueryText, results, isLoading, errorMessage } = useFriendSearch(
    firebaseUser?.uid,
  );
  const publicProfilePathname =
    ownProfile?.role === "teacher" ? "/(teacher)/user/[userId]" : "/(student)/user/[userId]";

  function renderItem({ item }: { item: PublicProfile }) {
    const identity = resolvePublicIdentity(item);
    return (
      <Pressable
        style={styles.row}
        onPress={() => router.push({ pathname: publicProfilePathname, params: { userId: item.uid } })}
        accessibilityRole="button"
      >
        {item.photoURL ? (
          <Image source={{ uri: item.photoURL }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={20} color="#8A8F98" />
          </View>
        )}
        <View style={styles.textColumn}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {identity.primaryName}
            </Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{ROLE_LABELS[item.role] ?? item.role}</Text>
            </View>
          </View>
          {identity.usernameHandle ? (
            <Text style={styles.handle} numberOfLines={1}>
              {identity.usernameHandle}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
          <Text style={styles.backText}>{"‹"}</Text>
        </Pressable>
        <Text style={styles.title}>Arkadaş Bul</Text>
        <View style={styles.backButton} />
      </View>

      <TextInput
        style={styles.input}
        placeholder="Kullanıcı adına göre ara..."
        placeholderTextColor="#8A8F98"
        value={queryText}
        onChangeText={setQueryText}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {isLoading ? (
        <ActivityIndicator color="black" style={styles.loading} />
      ) : errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.uid}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            queryText.trim().length > 0 ? (
              <Text style={styles.emptyText}>Sonuç bulunamadı.</Text>
            ) : (
              <Text style={styles.emptyText}>Aramak için kullanıcı adı yazmaya başla.</Text>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "white",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    fontSize: 28,
    color: "black",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "black",
  },
  input: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D0D5DD",
    paddingHorizontal: 14,
    fontSize: 15,
    color: "black",
  },
  loading: {
    marginTop: 40,
  },
  errorText: {
    fontSize: 14,
    color: "#D92D20",
    textAlign: "center",
    marginTop: 24,
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyText: {
    fontSize: 14,
    color: "#8A8F98",
    textAlign: "center",
    marginTop: 40,
    paddingHorizontal: 24,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F2F2F2",
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F2F2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: "black",
    flexShrink: 1,
  },
  handle: {
    fontSize: 13,
    color: "#8A8F98",
  },
  badge: {
    backgroundColor: "#F2F2F2",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#5B5F66",
  },
});
