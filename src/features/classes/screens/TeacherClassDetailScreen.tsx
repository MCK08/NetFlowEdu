import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@features/authentication";
import { QuestionGridItem } from "@features/profile/components/QuestionGridItem";
import { Question } from "@/types/question";

import { ClassMemberRow } from "../components/ClassMemberRow";
import { useClassDetail } from "../hooks/useClassDetail";
import { useClassQuestions } from "../hooks/useClassQuestions";
import { useClassUpload } from "../hooks/useClassUpload";

interface TeacherClassDetailScreenProps {
  classId: string;
}

const GRID_COLUMNS = 3;

export function TeacherClassDetailScreen({ classId }: TeacherClassDetailScreenProps) {
  const { firebaseUser } = useAuth();
  const { width } = useWindowDimensions();
  const { classRoom, members, isLoading, isMutating, errorMessage, removeMember, regenerateCode } =
    useClassDetail(classId);
  const { questions, isLoadingMore, hasMore, loadMore, prepend } = useClassQuestions(classId);
  const { isUploading, capture } = useClassUpload({
    uid: firebaseUser?.uid,
    organizationId: classRoom?.organizationId ?? null,
    classId,
    onUploaded: prepend,
  });

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

            <View style={styles.codeRow}>
              <Text style={styles.codeLabel}>Sınıf Kodu</Text>
              <Text style={styles.code}>{classRoom.joinCode}</Text>
              <Pressable
                onPress={regenerateCode}
                disabled={isMutating}
                style={styles.regenerateButton}
                accessibilityRole="button"
                accessibilityLabel="Kodu yenile"
              >
                <Ionicons name="refresh" size={16} color="#3358D9" />
                <Text style={styles.regenerateText}>Yenile</Text>
              </Pressable>
            </View>

            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

            <Pressable
              onPress={capture}
              disabled={isUploading}
              style={[styles.uploadButton, isUploading ? styles.uploadButtonDisabled : null]}
              accessibilityRole="button"
              accessibilityLabel="Bu sınıfa soru ekle"
            >
              {isUploading ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Ionicons name="camera" size={18} color="white" />
                  <Text style={styles.uploadButtonText}>Sınıfa Soru Ekle</Text>
                </>
              )}
            </Pressable>

            <Text style={styles.sectionTitle}>Üyeler ({members.length})</Text>
            {members.map((member) => (
              <ClassMemberRow
                key={member.uid}
                member={member}
                canRemove={!isMutating}
                onRemove={removeMember}
              />
            ))}

            <Text style={styles.sectionTitle}>Sınıf Soruları</Text>
            {questions.length === 0 ? (
              <Text style={styles.emptyText}>Henüz bu sınıfa soru eklenmedi.</Text>
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
    gap: 12,
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
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  codeLabel: {
    fontSize: 13,
    color: "#8A8F98",
  },
  code: {
    fontSize: 16,
    fontWeight: "700",
    color: "black",
    letterSpacing: 2,
    flex: 1,
  },
  regenerateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 32,
  },
  regenerateText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3358D9",
  },
  error: {
    color: "#D92D20",
    fontSize: 13,
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: "#3358D9",
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  uploadButtonText: {
    color: "white",
    fontSize: 15,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "black",
    marginTop: 12,
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
