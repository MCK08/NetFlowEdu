import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useAuth } from "@features/authentication";

import { ClassCard } from "../components/ClassCard";
import { CreateClassModal } from "../components/CreateClassModal";
import { useTeacherClasses } from "../hooks/useTeacherClasses";
import { ClassRoom } from "@/types/class";

export function TeacherClassesScreen() {
  const { firebaseUser, signOut } = useAuth();
  const { classes, isLoading, isCreating, errorMessage, createClass } = useTeacherClasses(
    firebaseUser?.uid,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  async function handleLogout() {
    await signOut();
    router.replace("/");
  }

  async function handleCreate(name: string) {
    const success = await createClass(name);
    if (success) setIsModalOpen(false);
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <FlatList
        data={classes}
        keyExtractor={(item: ClassRoom) => item.id}
        renderItem={({ item }) => <ClassCard classRoom={item} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Sınıflarım</Text>
              <PrimaryButton label="Çıkış Yap" onPress={handleLogout} variant="secondary" />
            </View>
            <PrimaryButton label="Yeni Sınıf" onPress={() => setIsModalOpen(true)} />
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color="black" style={styles.loading} />
          ) : (
            <Text style={styles.emptyText}>Henüz bir sınıfın yok. "Yeni Sınıf" ile başla.</Text>
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
