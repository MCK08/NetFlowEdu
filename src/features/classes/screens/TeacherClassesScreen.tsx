import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { useAuth } from "@features/authentication";
import { useSignOut } from "@features/authentication/hooks/useSignOut";
import {
  deriveTeacherDashboardStats,
  resolveGreeting,
  TeacherDashboardHeader,
  TeacherQuickActions,
  TeacherStatsCard,
} from "@features/teacher";
import { useNavigationGuard } from "@hooks/useNavigationGuard";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { resolvePublicIdentity } from "@utils/publicIdentity";

import { ClassCard } from "../components/ClassCard";
import { CreateClassModal } from "../components/CreateClassModal";
import { useTeacherClasses } from "../hooks/useTeacherClasses";
import { ClassRoom } from "@/types/class";

function ClassListSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2].map((key) => (
        <LoadingSkeleton key={key} height={112} borderRadius={radius.xl} />
      ))}
    </View>
  );
}

function keyExtractor(item: ClassRoom) {
  return item.id;
}

function renderItem({ item }: { item: ClassRoom }) {
  return <ClassCard classRoom={item} />;
}

function Separator() {
  return <View style={styles.separator} />;
}

export function TeacherClassesScreen() {
  const { firebaseUser, profile } = useAuth();
  const { signOut, isSigningOut } = useSignOut();
  const { classes, isLoading, isCreating, errorMessage, createClass, refresh } = useTeacherClasses(
    firebaseUser?.uid,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  // expo-router's push() does not deduplicate, so an unguarded double-tap
  // on a quick action stacks the same screen twice — same primitive the
  // student feed and class screens already use.
  const guardedNavigate = useNavigationGuard();

  // Recomputed only when the class list identity actually changes, not on
  // every render (e.g. while the create-class modal's own state updates).
  const stats = useMemo(() => deriveTeacherDashboardStats(classes), [classes]);
  const greeting = useMemo(() => resolveGreeting(new Date()), []);

  const identity = resolvePublicIdentity(profile);

  // The hook reuses one `errorMessage` for both "the class list failed to
  // load" and "createClass failed". The modal already renders the latter
  // while it is open, so the banner below is scoped to the case the old
  // screen showed nothing at all for: loading failed and there is not a
  // single class to fall back on.
  const showLoadError = !isLoading && !isModalOpen && classes.length === 0 && errorMessage !== null;

  async function handleCreate(name: string) {
    const success = await createClass(name);
    if (success) setIsModalOpen(false);
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <FlatList
        data={classes}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <TeacherDashboardHeader
              greeting={greeting}
              displayName={identity.primaryName}
              photoURL={profile?.photoURL ?? null}
              onSignOut={signOut}
              isSigningOut={isSigningOut}
              notificationUid={firebaseUser?.uid}
            />

            <TeacherStatsCard stats={stats} isLoading={isLoading} />

            <View style={styles.quickActions}>
              <TeacherQuickActions
                onCreateClass={() => setIsModalOpen(true)}
                onOpenFriends={() =>
                  guardedNavigate("friends", () => router.push("/(teacher)/(tabs)/friends"))
                }
                onFindFriends={() =>
                  guardedNavigate("find-friends", () => router.push("/(teacher)/find-friends"))
                }
                onOpenProfile={() =>
                  guardedNavigate("profile", () => router.push("/(teacher)/(tabs)/profile"))
                }
              />
            </View>

            <SectionHeader title="Sınıflarım" />
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <ClassListSkeleton />
          ) : showLoadError ? (
            <View style={styles.errorPanel}>
              <Ionicons name="cloud-offline-outline" size={32} color={colors.textTertiary} />
              <Text style={styles.errorText}>{errorMessage}</Text>
              <PrimaryButton label="Tekrar Dene" onPress={refresh} variant="secondary" />
            </View>
          ) : (
            <View style={styles.emptyPanel}>
              <EmptyState
                icon="school-outline"
                title="Henüz bir sınıfın yok"
                description="İlk sınıfını oluştur, öğrencilerin katılım koduyla katılsın."
              />
              <PrimaryButton label="İlk Sınıfını Oluştur" onPress={() => setIsModalOpen(true)} />
            </View>
          )
        }
      />

      <CreateClassModal
        visible={isModalOpen}
        isCreating={isCreating}
        errorMessage={errorMessage}
        onSubmit={handleCreate}
        onCancel={() => setIsModalOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  quickActions: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  separator: {
    height: spacing.sm,
  },
  skeletonList: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  emptyPanel: {
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  errorPanel: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
