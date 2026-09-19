import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useAuth } from "@features/authentication";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

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

// Phase 111 — "Sınıflar": every class, and a way to add one.
//
// This screen used to be the teacher's home, so it carried the greeting, a
// three-number stats card and four shortcut tiles. Bugün is the home now: the
// greeting moved there, the stats were counts of the list right below them,
// and the tiles pointed at places that are now a tab (Profil) or live inside it
// (Arkadaşlar, Arkadaş Bul). What remains is the list itself — each class with
// its name, members and status (ClassCard) — and one action, "Yeni Sınıf".
// No per-class metric is added: one would need a read per class.
export function TeacherClassesScreen() {
  const { firebaseUser } = useAuth();
  const { classes, isLoading, isCreating, errorMessage, createClass, refresh } = useTeacherClasses(
    firebaseUser?.uid,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

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
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              Sınıflar
            </Text>
            {classes.length > 0 ? (
              <PrimaryButton label="Yeni Sınıf" onPress={() => setIsModalOpen(true)} variant="secondary" />
            ) : null}
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

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    gap: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
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
}));
