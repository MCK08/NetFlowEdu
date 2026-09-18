import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Alert, ActivityIndicator, FlatList, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { AppBackButton } from "@components/ui/AppBackButton";
import { Avatar } from "@components/ui/Avatar";
import { Badge } from "@components/ui/Badge";
import { EmptyState } from "@components/ui/EmptyState";
import { useAuth } from "@features/authentication";
import { QuestionMetadataModal } from "@features/questions/components/QuestionMetadataModal";
import { useClassSemanticDefinitions } from "@features/questions/hooks/useClassSemanticDefinitions";
import { colors, darkColors } from "@theme/colors";
import { IMMERSIVE_FOREGROUND } from "@theme/immersive";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget, stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { getActiveTheme, themedStyles } from "@theme/themeRuntime";
import { Question } from "@/types/question";

import { ClassQuestionTile } from "../components/ClassQuestionTile";
import { ImageSourcePicker } from "../components/ImageSourcePicker";
import { useClassQuestions } from "../hooks/useClassQuestions";
import { useLeaveClass } from "../hooks/useLeaveClass";
import { useStudentClassInfo } from "../hooks/useStudentClassInfo";
import { useStudentQuestionUpload } from "../hooks/useStudentQuestionUpload";
import { useNavigationGuard } from "@hooks/useNavigationGuard";

interface StudentClassDetailScreenProps {
  classId: string;
}

// Phase 106 — two columns of real question previews (image, role, topic,
// counts) instead of three bare squares; see ClassQuestionTile.
const GRID_COLUMNS = 2;
const GRID_GAP = spacing.sm;

export function StudentClassDetailScreen({ classId }: StudentClassDetailScreenProps) {
  const { width, fontScale } = useWindowDimensions();
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

  // Two tiles across, inside the page's own horizontal inset, with one gutter
  // between them. Computed from the real window so the columns are exact on
  // every phone width.
  const tileWidth = (width - spacing.lg * 2 - GRID_GAP) / GRID_COLUMNS;
  // At the accessibility text sizes the two quick actions stack — a half-width
  // tile cannot hold "Sınıf Sohbeti" at ~200% without breaking the word.
  const stackedActions = fontScale >= stackAtFontScale;
  const isArchived = classRoom.status === "archived";

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <FlatList
        data={questions}
        keyExtractor={(item: Question) => item.id}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item }) => <ClassQuestionTile question={item} width={tileWidth} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore) loadMore();
        }}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Phase 106 — the class's identity as a hero, then its two
                primary actions as a balanced pair, then the way into the feed
                as a quieter dark entry, then the questions. Every function
                the screen had is still here; what changed is the hierarchy:
                a class page used to be a column of five full-width buttons. */}
            <AppBackButton fallbackHref="/(student)/(tabs)/classes" style={styles.backButton} />

            <View style={styles.hero}>
              <Avatar displayName={classRoom.name} size="xl" />
              <Text style={styles.title}>{classRoom.name}</Text>
              <View style={styles.heroMeta}>
                <Text style={styles.memberCount}>{classRoom.memberCount} üye</Text>
                {/* The class document's own status, as a word: "Aktif" while
                    it runs, "Arşivlendi" once the teacher closes it. */}
                <Badge label={isArchived ? "Arşivlendi" : "Aktif"} variant={isArchived ? "neutral" : "primary"} />
              </View>
            </View>

            <View style={stackedActions ? styles.actionsStacked : styles.actions}>
              <AnimatedPressable
                onPress={openChat}
                style={styles.chatButton}
                accessibilityRole="button"
                accessibilityLabel="Sınıf sohbetini aç"
              >
                {/* Phase 104 (H3) — decorative; the button is labelled
                    "Sınıf sohbetini aç". */}
                <View style={styles.actionIcon}>
                  <Ionicons
                    name="chatbubble-outline"
                    size={iconSize.md}
                    color={colors.primary}
                    accessibilityElementsHidden
                  />
                </View>
                <Text style={styles.chatButtonText}>Sınıf Sohbeti</Text>
              </AnimatedPressable>

              <AnimatedPressable
                onPress={openComposer}
                disabled={isUploading}
                style={[styles.shareButton, isUploading ? styles.shareButtonDisabled : null]}
                accessibilityRole="button"
                accessibilityLabel="Soru paylaş"
                // Phase 104 (B6) — the spinner alone says nothing to a screen reader.
                accessibilityState={{ busy: isUploading, disabled: isUploading }}
              >
                <View style={styles.actionIcon}>
                  {isUploading ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    /* Phase 104 (H3) — decorative; the button is labelled
                       "Soru paylaş". */
                    <Ionicons
                      name="camera"
                      size={iconSize.md}
                      color={colors.primary}
                      accessibilityElementsHidden
                    />
                  )}
                </View>
                <Text style={styles.shareButtonText}>Soru Paylaş</Text>
              </AnimatedPressable>
            </View>

            {questions.length > 0 ? (
              <AnimatedPressable
                onPress={openFeed}
                style={styles.feedButton}
                accessibilityRole="button"
                accessibilityLabel="Soru akışına gir"
                accessibilityHint="Sınıfın sorularını akışta tek tek açar"
              >
                {/* Phase 104 (H3) — decorative; the button is labelled
                    "Soru akışına gir". */}
                <View style={styles.feedIcon}>
                  <Ionicons
                    name="play-circle"
                    size={iconSize.md}
                    color={IMMERSIVE_FOREGROUND}
                    accessibilityElementsHidden
                  />
                </View>
                <View style={styles.feedText}>
                  <Text style={styles.feedButtonText}>Soru Akışına Gir</Text>
                  <Text style={styles.feedButtonDetail}>Sınıfın sorularını akışta çöz</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={iconSize.sm}
                  color={IMMERSIVE_FOREGROUND}
                  accessibilityElementsHidden
                />
              </AnimatedPressable>
            ) : null}

            <Text style={styles.sectionTitle}>Sınıf Soruları</Text>
            {questions.length === 0 ? (
              <EmptyState icon="help-circle-outline" title="Bu sınıfta henüz soru yok" />
            ) : null}
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {isLoadingMore ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator color={colors.textPrimary} />
              </View>
            ) : null}
            {/* Phase 104 (B2) — leaving the class is the one destructive,
                rarely-used action on this screen. It used to sit BETWEEN the
                two primary tasks (chat and share), which gave a red control the
                same rank as the things a student comes here to do. It now
                closes the page, after the class's questions — the same
                "utility last" order the Profil screen settled on in Wave A.
                Same button, same copy, same confirmation. */}
            <AnimatedPressable
              onPress={confirmLeave}
              disabled={isLeaving}
              style={styles.leaveButton}
              accessibilityRole="button"
              accessibilityLabel="Sınıftan ayrıl"
              accessibilityState={{ busy: isLeaving, disabled: isLeaving }}
            >
              <Text style={styles.leaveButtonText}>{isLeaving ? "Ayrılıyor..." : "Sınıftan Ayrıl"}</Text>
            </AnimatedPressable>
          </View>
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
    // Phase 106 — the gap BETWEEN the hero, the action pair, the feed entry
    // and the questions; the pair and the hero step down inside.
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  gridRow: {
    paddingHorizontal: spacing.lg,
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
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
  hero: {
    alignItems: "center",
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  heroMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  title: {
    // Phase 104 (H1) — the role, not displayLg trimmed to fit. Same 22pt this
    // screen already chose, but with the 28pt line box the override never had
    // (it inherited displayLg's 34, which is the shape D11 came from).
    ...typography.screenTitleSm,
    color: colors.textPrimary,
    textAlign: "center",
  },
  memberCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  actionsStacked: {
    gap: spacing.sm,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryMuted,
  },
  chatButton: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    // Phase 104 (Dynamic Type) — a wrapped label used to take the whole row
    // and push the icon onto the border; the inset keeps both inside.
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: minTouchTarget,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  chatButtonText: {
    // Phase 104 (H1) — control label role; 15/600 is what this style already
    // was, now with a line box and a name.
    ...typography.button,
    color: colors.textPrimary,
    flexShrink: 1,
    textAlign: "center",
  },
  shareButton: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    // Phase 104 (Dynamic Type) — a wrapped label used to take the whole row
    // and push the icon onto the border; the inset keeps both inside.
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: minTouchTarget,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  shareButtonText: {
    // Phase 104 (H1) — control label role; metrics unchanged at 15/600.
    ...typography.button,
    color: colors.textPrimary,
    flexShrink: 1,
    textAlign: "center",
  },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  feedButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    // Phase 104 (Dynamic Type) — a wrapped label used to take the whole row
    // and push the icon onto the border; the inset keeps both inside.
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 50,
    borderRadius: radius.xl,
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
  },
  feedIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: darkColors.surfaceMuted,
  },
  feedText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  feedButtonText: {
    // Phase 103 — the button is pinned dark in both themes, so its label is
    // the constant immersive white; `colors.textInverse` flips to near-black
    // in dark mode and hid "Soru Akışına Gir" against its own fill.
    //
    // Phase 104 (H1) — the control-label role, with the 700 kept on purpose:
    // this is the screen's way into the class feed and is meant to read one
    // step stronger than the chat/share tiles above it. The role supplies the
    // size and line box; the weight stays a deliberate override.
    ...typography.button,
    color: IMMERSIVE_FOREGROUND,
    fontWeight: "700",
    flexShrink: 1,
  },
  feedButtonDetail: {
    ...typography.caption,
    color: darkColors.textSecondary,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  // Phase 106 — the destructive action stays last and quiet: an outline in
  // the danger colour, the same restrained 14/600 label (Wave A lock), the
  // same confirmation. It closes the page; nothing above it competes with
  // it and it competes with nothing.
  leaveButton: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
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
  loadingMore: {
    paddingVertical: spacing.xl,
  },
}));
