import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Alert, ActivityIndicator, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { QuestionGridItem } from "@features/profile/components/QuestionGridItem";
import { Question } from "@/types/question";

import { useClassQuestions } from "../hooks/useClassQuestions";
import { useLeaveClass } from "../hooks/useLeaveClass";
import { useStudentClassInfo } from "../hooks/useStudentClassInfo";

interface StudentClassDetailScreenProps {
  classId: string;
}

const GRID_COLUMNS = 3;

export function StudentClassDetailScreen({ classId }: StudentClassDetailScreenProps) {
  const { width } = useWindowDimensions();
  const { classRoom, isLoading } = useStudentClassInfo(classId);
  const { questions, isLoadingMore, hasMore, loadMore } = useClassQuestions(classId);
  const { isLeaving, leave } = useLeaveClass();

  function confirmLeave() {
    Alert.alert("Sınıftan ayrıl", "Bu sınıftan ayrılmak istediğinize emin misiniz?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Ayrıl",
        style: "destructive",
        onPress: async () => {
          const success = await leave(classId);
          if (success) router.back();
        },
      },
    ]);
  }

  if (isLoading || !classRoom) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color="black" />
      </SafeAreaView>
    );
  }

  const itemSize = width / GRID_COLUMNS;

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <FlatList
        data={questions}
        keyExtractor={(item: Question) => item.id}
        numColumns={GRID_COLUMNS}
        renderItem={({ item }) => <QuestionGridItem question={item} size={itemSize} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore) loadMore();
        }}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Geri"
            >
              <Ionicons name="chevron-back" size={24} color="black" />
            </Pressable>

            <Text style={styles.title}>{classRoom.name}</Text>
            <Text style={styles.memberCount}>{classRoom.memberCount} üye</Text>

            <Pressable
              onPress={confirmLeave}
              disabled={isLeaving}
              style={styles.leaveButton}
              accessibilityRole="button"
              accessibilityLabel="Sınıftan ayrıl"
            >
              <Text style={styles.leaveButtonText}>{isLeaving ? "Ayrılıyor..." : "Sınıftan Ayrıl"}</Text>
            </Pressable>

            <Text style={styles.sectionTitle}>Sınıf Soruları</Text>
            {questions.length === 0 ? (
              <Text style={styles.emptyText}>Bu sınıfta henüz soru yok.</Text>
            ) : null}
          </View>
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator color="black" />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "white",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },
  listContent: {
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 20,
    gap: 8,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    marginLeft: -12,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "black",
  },
  memberCount: {
    fontSize: 13,
    color: "#5B5F66",
  },
  leaveButton: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D92D20",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  leaveButtonText: {
    color: "#D92D20",
    fontSize: 14,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "black",
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: "#8A8F98",
    marginTop: 8,
    marginBottom: 12,
  },
  loadingMore: {
    paddingVertical: 24,
  },
});
