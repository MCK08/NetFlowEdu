import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useAuth } from "@features/authentication";
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

export function StudentClassesScreen() {
  const { firebaseUser } = useAuth();
  const { classes, isLoading, isJoining, errorMessage, joinByCode } = useStudentClasses(
    firebaseUser?.uid,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  async function handleJoin(code: string) {
    const success = await joinByCode(code);
    if (success) setIsModalOpen(false);
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <FlatList
        data={classes}
        keyExtractor={(item: ClassRoom) => item.id}
        renderItem={({ item }) => <StudentClassCard classRoom={item} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Sınıflarım</Text>
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
