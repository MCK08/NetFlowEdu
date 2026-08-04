import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useAuth } from "@features/authentication";
import { NotificationBellButton } from "@features/notifications";
import { ROUTES } from "@constants/routes";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { JoinClassModal } from "../components/JoinClassModal";
import { StudentClassCard } from "../components/StudentClassCard";
import { useStudentClasses } from "../hooks/useStudentClasses";
import { ClassRoom } from "@/types/class";

function ClassListSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2].map((key) => (
        <LoadingSkeleton key={key} height={76} borderRadius={16} />
      ))}
    </View>
  );
}

function keyExtractor(item: ClassRoom) {
  return item.id;
}

function renderItem({ item }: { item: ClassRoom }) {
  return <StudentClassCard classRoom={item} />;
}

function Separator() {
  return <View style={styles.separator} />;
}

export function StudentClassesScreen() {
  const { firebaseUser } = useAuth();
  const { classes, isLoading, isJoining, errorMessage, joinByCode } = useStudentClasses(
    firebaseUser?.uid,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleJoin = useCallback(
    async (code: string) => {
      const success = await joinByCode(code);
      if (success) setIsModalOpen(false);
    },
    [joinByCode],
  );

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <FlatList
        data={classes}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.title}>Sınıflarım</Text>
              <NotificationBellButton
                uid={firebaseUser?.uid}
                route={ROUTES.studentNotifications}
              />
            </View>
            <PrimaryButton label="Sınıfa Katıl" onPress={() => setIsModalOpen(true)} />
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <ClassListSkeleton />
          ) : (
            <EmptyState
              icon="school-outline"
              title="Henüz bir sınıfa katılmadın"
              description="Öğretmeninden aldığın kodla katılabilirsin."
            />
          )
        }
      />

      <JoinClassModal
        visible={isModalOpen}
        isJoining={isJoining}
        errorMessage={errorMessage}
        onSubmit={handleJoin}
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
  header: {
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    ...typography.displayLg,
    fontSize: 26,
    color: colors.textPrimary,
  },
  separator: {
    height: spacing.sm,
  },
  skeletonList: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
