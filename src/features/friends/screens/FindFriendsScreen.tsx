import { router } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, FlatList, ListRenderItemInfo, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Divider } from "@components/ui/Divider";
import { EmptyState } from "@components/ui/EmptyState";
import { IconButton } from "@components/ui/IconButton";
import { SearchInput } from "@components/ui/SearchInput";
import { useAuth } from "@features/authentication";
import { useNavigationGuard } from "@hooks/useNavigationGuard";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { PublicProfile } from "@/types/publicProfile";
import { resolvePublicIdentity } from "@utils/publicIdentity";

import { SocialUserRow } from "../components/SocialUserRow";
import { useFriendSearch } from "../hooks/useFriendSearch";

// Shared by both teacher and student route wrappers.
//
// The search itself is untouched: same useFriendSearch hook, same debounce,
// same prefix query, same 20-result cap, same self-exclusion. What changed
// is that every distinct state (idle / searching / results / no results /
// failure) now has its own explicit presentation instead of collapsing
// into one list with an ambiguous empty component.
export function FindFriendsScreen() {
  const { firebaseUser, profile: ownProfile } = useAuth();
  const { queryText, setQueryText, results, isLoading, errorMessage } = useFriendSearch(
    firebaseUser?.uid,
  );
  const publicProfilePathname =
    ownProfile?.role === "teacher" ? "/(teacher)/user/[userId]" : "/(student)/user/[userId]";
  const guardedNavigate = useNavigationGuard();

  const hasQuery = queryText.trim().length > 0;

  const openProfile = useCallback(
    (userId: string) => {
      guardedNavigate(`profile-${userId}`, () => {
        router.push({ pathname: publicProfilePathname, params: { userId } });
      });
    },
    [guardedNavigate, publicProfilePathname],
  );

  const keyExtractor = useCallback((item: PublicProfile) => item.uid, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<PublicProfile>) => {
      const identity = resolvePublicIdentity(item);
      const roleSuffix = item.role === "teacher" ? ", Öğretmen" : ", Öğrenci";
      return (
        <SocialUserRow
          primaryName={identity.primaryName}
          usernameHandle={identity.usernameHandle}
          photoURL={item.photoURL}
          role={item.role}
          onPress={() => openProfile(item.uid)}
          accessibilityLabel={`${identity.primaryName}${roleSuffix}`}
        />
      );
    },
    [openProfile],
  );

  function renderBody() {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.textTertiary} />
          <Text style={styles.hintText}>Aranıyor...</Text>
        </View>
      );
    }

    if (errorMessage) {
      return (
        <View style={styles.centered}>
          <EmptyState icon="cloud-offline-outline" title="Arama yapılamadı" description={errorMessage} />
        </View>
      );
    }

    return (
      <FlatList
        data={results}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        // Lets a result be tapped while the keyboard is still open, instead
        // of the first tap only dismissing it.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          hasQuery ? (
            <EmptyState
              icon="search-outline"
              title="Sonuç bulunamadı"
              description="Kullanıcı adını tam yazdığından emin ol."
            />
          ) : (
            <EmptyState
              icon="person-add-outline"
              title="Arkadaş bul"
              description="Aramak için bir kullanıcı adı yazmaya başla."
            />
          )
        }
      />
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <IconButton
          icon="chevron-back"
          onPress={() => router.back()}
          accessibilityLabel="Geri"
          color={colors.textPrimary}
        />
        <Text style={styles.title}>Arkadaş Bul</Text>
        <View style={styles.headerSpacer} />
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

      <Divider />

      {renderBody()}
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "center",
  },
  headerSpacer: {
    width: 44,
  },
  searchWrapper: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
  },
  hintText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  listContent: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
}));
