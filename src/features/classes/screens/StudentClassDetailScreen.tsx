import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Alert, ActivityIndicator, FlatList, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { EmptyState } from "@components/ui/EmptyState";
import { AppBackButton } from "@components/ui/AppBackButton";
import { useAuth } from "@features/authentication";
import { QuestionMetadataModal } from "@features/questions/components/QuestionMetadataModal";
import { useClassSemanticDefinitions } from "@features/questions/hooks/useClassSemanticDefinitions";
import { QuestionGridItem } from "@features/profile/components/QuestionGridItem";
import { colors, darkColors } from "@theme/colors";
import { IMMERSIVE_FOREGROUND } from "@theme/immersive";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { getActiveTheme, themedStyles } from "@theme/themeRuntime";
import { Question } from "@/types/question";

import { ImageSourcePicker } from "../components/ImageSourcePicker";
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
  // Phase 80 — read-only access to the class's curated vocabulary, loaded only
  // while this student's composer is open. Selection lets their question join
  // the same verified meaning the teacher's questions use; creating one is not
  // offered here and is denied by firestore.rules regardless.
  const { definitions: semanticDefinitions } = useClassSemanticDefinitions(
    classId,
    pickedImageUri !== null,
  );
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
            <AppBackButton fallbackHref="/(student)/(tabs)/classes" style={styles.backButton} />

            <Text style={styles.title}>{classRoom.name}</Text>
            <Text style={styles.memberCount}>{classRoom.memberCount} üye</Text>

            <AnimatedPressable
              onPress={openChat}
              style={styles.chatButton}
              accessibilityRole="button"
              accessibilityLabel="Sınıf sohbetini aç"
            >
              {/* Phase 104 (H3) — decorative; the button is labelled
                  "Sınıf sohbetini aç". */}
              <Ionicons
                name="chatbubble-outline"
                size={18}
                color={colors.textInverse}
                accessibilityElementsHidden
              />
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
                  {/* Phase 104 (H3) — decorative; the button is labelled
                      "Soru paylaş". */}
                  <Ionicons
                    name="camera"
                    size={18}
                    color={colors.textInverse}
                    accessibilityElementsHidden
                  />
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
                {/* Phase 104 (H3) — decorative; the button is labelled
                    "Soru akışına gir". */}
                <Ionicons
                  name="play-circle"
                  size={20}
                  color={IMMERSIVE_FOREGROUND}
                  accessibilityElementsHidden
                />
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

      <QuestionMetadataModal
        visible={pickedImageUri !== null}
        imageUri={pickedImageUri}
        isUploading={isUploading}
        errorMessage={uploadErrorMessage}
        onSubmit={submitDetails}
        onCancel={cancelDetails}
        // Phase 80 — a student may SELECT from their class's curated
        // vocabulary but is given no way to add to it: `onCreateSemanticDefinition`
        // is deliberately omitted, and firestore.rules deny the write anyway.
        // Selecting is what lets a student's own class question join the same
        // verified meaning the teacher's questions use.
        semanticDefinitions={semanticDefinitions}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
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
    // Phase 103 — this header is a column, which stretches its children, and
    // IconButton centres its icon; without this the Phase 102 back chevron
    // sat in the middle of the row instead of at the leading edge.
    alignSelf: "flex-start",
  },
  title: {
    // Phase 104 (H1) — the role, not displayLg trimmed to fit. Same 22pt this
    // screen already chose, but with the 28pt line box the override never had
    // (it inherited displayLg's 34, which is the shape D11 came from).
    ...typography.screenTitleSm,
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
    // Phase 104 (H1) — control label role; 15/600 is what this style already
    // was, now with a line box and a name.
    ...typography.button,
    color: colors.textInverse,
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
  // Phase 104 (H1) — deliberately NOT migrated. 14/600 is a step quieter than
  // the other controls on purpose: leaving a class is destructive and sits
  // under a danger-bordered secondary button. Spreading `button` here and then
  // overriding back to 14 would add indirection and claim a token adoption
  // that changes nothing.
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
    // Phase 104 (H1) — control label role; metrics unchanged at 15/600.
    ...typography.button,
    color: colors.textInverse,
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
    // Phase 104 — discovered by Wave-A runtime QA, pre-existing since before
    // this phase: the fill was pinned to darkColors.background, which IS the
    // dark theme's page background. In light mode that reads as the intended
    // dark "way into the feed" pill; in dark mode the button dissolved into
    // the page and only its label floated there.
    //
    // The pinned pill is kept where it means something (light), and dark uses
    // the palette's own raised-container token — the same `surface` that Card,
    // ClassCard and StudentClassCard sit on — so the control still reads as a
    // control. getActiveTheme() is the APP's resolved theme (preference +
    // system, via ThemeProvider), not RN's device scheme, and themedStyles
    // re-runs this factory per resolved theme, so the switch is live.
    backgroundColor: getActiveTheme() === "dark" ? colors.surface : darkColors.background,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  feedButtonText: {
    // Phase 103 — the button is pinned dark in both themes, so its label is
    // the constant immersive white; `colors.textInverse` flips to near-black
    // in dark mode and hid "Soru Akışına Gir" against its own fill.
    //
    // Phase 104 (H1) — the control-label role, with the 700 kept on purpose:
    // this is the screen's primary way into the class feed and is meant to
    // read one step stronger than the chat/share controls above it. The role
    // supplies the size and line box; the weight stays a deliberate override.
    ...typography.button,
    color: IMMERSIVE_FOREGROUND,
    fontWeight: "700",
  },
  loadingMore: {
    paddingVertical: spacing.xl,
  },
}));
