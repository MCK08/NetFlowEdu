import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Alert, ActivityIndicator, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { EmptyState } from "@components/ui/EmptyState";
import { useAuth } from "@features/authentication";
import { QuestionGridItem } from "@features/profile/components/QuestionGridItem";
import { colors, darkColors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { Question } from "@/types/question";

import { ImageSourcePicker } from "../components/ImageSourcePicker";
import { StudentQuestionDetailsModal } from "../components/StudentQuestionDetailsModal";
import { useClassQuestions } from "../hooks/useClassQuestions";
import { useLeaveClass } from "../hooks/useLeaveClass";
import { useStudentClassInfo } from "../hooks/useStudentClassInfo";
import { useStudentQuestionUpload } from "../hooks/useStudentQuestionUpload";
import { useNavigationGuard } from "@hooks/useNavigationGuard";

interface StudentClassDetailScreenProps {
  classId: string;
}

const GRID_COLUMNS = 3;

export function StudentClassDetailScreen({ classId }: StudentClassDetailScreenProps) {
  const { width } = useWindowDimensions();
  const { firebaseUser } = useAuth();
  const { classRoom, isLoading } = useStudentClassInfo(classId);
  const { questions, isLoadingMore, hasMore, loadMore, prepend } = useClassQuestions(classId);
  const { isLeaving, leave } = useLeaveClass();
  const {
    isSourcePickerOpen,
    pickedImageUri,
    isUploading,
    errorMessage: uploadErrorMessage,
    openComposer,
    cancelSourcePicker,
    selectImageSource,
    cancelDetails,
    submitDetails,
  } = useStudentQuestionUpload({
    uid: firebaseUser?.uid,
    organizationId: classRoom?.organizationId ?? null,
    classId,
    onUploaded: prepend,
  });
  // Prevents a double-tap from pushing the feed screen twice. Held until
  // this screen is focused again, not for a fixed cooldown.
  const guardedNavigate = useNavigationGuard();

  function openFeed() {
    guardedNavigate("feed", () => {
      router.push({ pathname: "/(student)/class/[classId]/feed", params: { classId } });
    });
  }

  function openChat() {
    guardedNavigate("chat", () => {
      router.push({ pathname: "/(student)/class/[classId]/chat", params: { classId } });
    });
  }

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
        <ActivityIndicator color={colors.textPrimary} />
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
        renderItem={({ item }) => (
          <QuestionGridItem question={item} size={itemSize} showPosterRoleBadge />
        )}
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
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </Pressable>

            <Text style={styles.title}>{classRoom.name}</Text>
            <Text style={styles.memberCount}>{classRoom.memberCount} üye</Text>

            <AnimatedPressable
              onPress={openChat}
              style={styles.chatButton}
              accessibilityRole="button"
              accessibilityLabel="Sınıf sohbetini aç"
            >
              <Ionicons name="chatbubble-outline" size={18} color={colors.textInverse} />
              <Text style={styles.chatButtonText}>Sınıf Sohbeti</Text>
            </AnimatedPressable>

            <AnimatedPressable
              onPress={confirmLeave}
              disabled={isLeaving}
              style={styles.leaveButton}
              accessibilityRole="button"
              accessibilityLabel="Sınıftan ayrıl"
            >
              <Text style={styles.leaveButtonText}>{isLeaving ? "Ayrılıyor..." : "Sınıftan Ayrıl"}</Text>
            </AnimatedPressable>

            <AnimatedPressable
              onPress={openComposer}
              disabled={isUploading}
              style={[styles.shareButton, isUploading ? styles.shareButtonDisabled : null]}
              accessibilityRole="button"
              accessibilityLabel="Soru paylaş"
            >
              {isUploading ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <>
                  <Ionicons name="camera" size={18} color={colors.textInverse} />
                  <Text style={styles.shareButtonText}>Soru Paylaş</Text>
                </>
              )}
            </AnimatedPressable>

            <Text style={styles.sectionTitle}>Sınıf Soruları</Text>
            {questions.length === 0 ? (
              <EmptyState icon="help-circle-outline" title="Bu sınıfta henüz soru yok" />
            ) : (
              <AnimatedPressable
                onPress={openFeed}
                style={styles.feedButton}
                accessibilityRole="button"
                accessibilityLabel="Soru akışına gir"
              >
                <Ionicons name="play-circle" size={20} color={colors.textInverse} />
                <Text style={styles.feedButtonText}>Soru Akışına Gir</Text>
              </AnimatedPressable>
            )}
          </View>
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator color={colors.textPrimary} />
            </View>
          ) : null
        }
      />

      <ImageSourcePicker
        visible={isSourcePickerOpen}
        onSelect={selectImageSource}
        onCancel={cancelSourcePicker}
      />

      <StudentQuestionDetailsModal
        visible={pickedImageUri !== null}
        imageUri={pickedImageUri}
        isUploading={isUploading}
        errorMessage={uploadErrorMessage}
        onSubmit={submitDetails}
        onCancel={cancelDetails}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    marginLeft: -12,
  },
  title: {
    ...typography.displayLg,
    fontSize: 22,
    color: colors.textPrimary,
  },
  memberCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    marginTop: spacing.xs,
  },
  chatButtonText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: "600",
  },
  leaveButton: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  leaveButtonText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "600",
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    marginTop: spacing.xs,
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  shareButtonText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: "600",
  },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  feedButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 50,
    borderRadius: radius.lg,
    backgroundColor: darkColors.background,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  feedButtonText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: "700",
  },
  loadingMore: {
    paddingVertical: spacing.xl,
  },
});
