import { useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useAuth } from "@features/authentication";

import { JoinClassModal } from "../components/JoinClassModal";
import { StudentClassCard } from "../components/StudentClassCard";
import { useStudentClasses } from "../hooks/useStudentClasses";
import { ClassRoom } from "@/types/class";

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
            <ActivityIndicator color="black" style={styles.loading} />
          ) : (
            <Text style={styles.emptyText}>
              Henüz bir sınıfa katılmadın. Öğretmeninden aldığın kodla katılabilirsin.
            </Text>
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
    backgroundColor: "white",
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  header: {
    gap: 16,
    paddingTop: 16,
    paddingBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "black",
  },
  separator: {
    height: 12,
  },
  loading: {
    marginTop: 40,
  },
  emptyText: {
    fontSize: 14,
    color: "#8A8F98",
    textAlign: "center",
    marginTop: 40,
    paddingHorizontal: 32,
  },
});
