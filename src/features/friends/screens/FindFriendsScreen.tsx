import { router } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Avatar } from "@components/ui/Avatar";
import { EmptyState } from "@components/ui/EmptyState";
import { RoleBadge } from "@components/ui/RoleBadge";
import { SearchInput } from "@components/ui/SearchInput";
import { useAuth } from "@features/authentication";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { PublicProfile } from "@/types/publicProfile";
import { resolvePublicIdentity } from "@utils/publicIdentity";

import { useFriendSearch } from "../hooks/useFriendSearch";

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
        <Avatar photoURL={item.photoURL} displayName={identity.primaryName} size="md" />
        <View style={styles.textColumn}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {identity.primaryName}
            </Text>
            <RoleBadge role={item.role} />
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

      <View style={styles.searchWrapper}>
        <SearchInput
          placeholder="Kullanıcı adına göre ara..."
          value={queryText}
          onChangeText={setQueryText}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.textPrimary} style={styles.loading} />
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
              <EmptyState icon="search-outline" title="Sonuç bulunamadı" />
            ) : (
              <EmptyState
                icon="person-add-outline"
                title="Arkadaş bul"
                description="Aramak için kullanıcı adı yazmaya başla."
              />
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
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    fontSize: 28,
    color: colors.textPrimary,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  searchWrapper: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  loading: {
    marginTop: spacing.xxxl,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: "center",
    marginTop: spacing.xl,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  name: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  handle: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
