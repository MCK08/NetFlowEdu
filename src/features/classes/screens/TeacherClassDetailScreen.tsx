import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ActivityIndicator, FlatList, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { AppBackButton } from "@components/ui/AppBackButton";
import { EmptyState } from "@components/ui/EmptyState";
import { useAuth } from "@features/authentication";
import { QuestionGridItem } from "@features/profile/components/QuestionGridItem";
import { useNavigationGuard } from "@hooks/useNavigationGuard";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
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
  // Prevents a double-tap from pushing the chat screen twice — same guard
  // already used by the student class detail screen's feed button.
  const guardedNavigate = useNavigationGuard();

  function openChat() {
    guardedNavigate("chat", () => {
      router.push({ pathname: "/(teacher)/class/[classId]/chat", params: { classId } });
    });
  }

  // Phase 101 — the complete Phase 73 Action Center for this class.
  function openActionCenter() {
    guardedNavigate("actions", () => {
      router.push({ pathname: "/(teacher)/class/[classId]/actions", params: { classId } });
    });
  }

  function openPerformance() {
    guardedNavigate("performance", () => {
      router.push({ pathname: "/(teacher)/class/[classId]/performance", params: { classId } });
    });
  }

  function openLearningStory() {
    guardedNavigate("learning-story", () => {
      router.push({
        pathname: "/(teacher)/class/[classId]/learning-story",
        params: { classId },
      });
    });
  }

  // Phase 97 — the class teacher's review queue for student answers that
  // automated review could not settle. Same restrained secondary shape as the
  // two buttons above; the server decides who may actually review.
  function openAnswerReviews() {
    guardedNavigate("answer-reviews", () => {
      router.push({
        pathname: "/(teacher)/class/[classId]/answer-reviews",
        params: { classId },
      });
    });
  }

  // Phase 98 — the sibling queue for comments the text layer could not settle.
  function openCommentReviews() {
    guardedNavigate("comment-reviews", () => {
      router.push({
        pathname: "/(teacher)/class/[classId]/comment-reviews",
        params: { classId },
      });
    });
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
            {/* Phase 104 (B2) — the same seven controls, now in the groups a
                teacher actually thinks in: the room's conversation, three ways
                of looking at the class, the two review queues, and adding
                content. Tight inside a group, a step wider between groups;
                no new cards, no new headings, nothing renamed or moved
                between groups. Identity (title, code) sits above them all. */}
            <View style={styles.identity}>
              <AppBackButton fallbackHref="/(teacher)/(tabs)/classes" style={styles.backButton} />

              <Text style={styles.title}>{classRoom.name}</Text>

              <View style={styles.codeRow}>
                {/* Phase 104 (B3/Dynamic Type) — one Text with the code nested
                    in it, so at large text the label wraps at its space and
                    the code stays one whole token instead of "DE / MO / 01";
                    the two were separate flex children before. Same read
                    order, same words. */}
                <Text style={styles.codeLabel}>
                  Sınıf Kodu <Text style={styles.code}>{classRoom.joinCode}</Text>
                </Text>
                <AnimatedPressable
                  onPress={regenerateCode}
                  disabled={isMutating}
                  style={styles.regenerateButton}
                  accessibilityRole="button"
                  accessibilityLabel="Kodu yenile"
                >
                  {/* Phase 104 (H3) — decorative; the button is labelled "Kodu yenile". */}
                  <Ionicons name="refresh" size={16} color={colors.primary} accessibilityElementsHidden />
                  <Text style={styles.regenerateText}>Yenile</Text>
                </AnimatedPressable>
              </View>

              {errorMessage ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {errorMessage}
                </Text>
              ) : null}
            </View>

            <AnimatedPressable
              onPress={openChat}
              style={styles.chatButton}
              accessibilityRole="button"
              accessibilityLabel="Sınıf sohbetini aç"
            >
              {/* Phase 104 (H3) — decorative; the button is labelled "Sınıf sohbetini aç". */}
              <Ionicons name="chatbubble-outline" size={18} color={colors.textInverse} accessibilityElementsHidden />
              <Text style={styles.chatButtonText}>Sınıf Sohbeti</Text>
            </AnimatedPressable>

            {/* Three ways of looking at the same class: what needs attention
                today, the numbers, and the story over them. */}
            <View style={styles.group}>
              {/* Phase 101 — the Phase 73 Action Center, one tap from the class.
                  Until now it was reachable only inside "Sınıf Performansı", a
                  name that reads as analytics rather than "what should I look at
                  today". Same restrained secondary shape as its neighbours, and
                  deliberately no count or badge: the class page never shouts
                  about students. */}
              <AnimatedPressable
                onPress={openActionCenter}
                style={styles.secondaryButton}
                accessibilityRole="button"
                accessibilityLabel="Bugün öne çıkanları aç"
                accessibilityHint="Bu sınıfta şu an öne çıkan takip, müdahale ve öğrenci aksiyonlarını görürsün"
              >
                <Ionicons name="today-outline" size={18} color={colors.primary} accessibilityElementsHidden />
                <Text style={styles.secondaryButtonText}>Bugün Öne Çıkanlar</Text>
              </AnimatedPressable>

              {/* Phase 27 — read-only class performance dashboard. */}
              <AnimatedPressable
                onPress={openPerformance}
                style={styles.secondaryButton}
                accessibilityRole="button"
                accessibilityLabel="Sınıf performansını görüntüle"
              >
                <Ionicons name="stats-chart-outline" size={18} color={colors.primary} accessibilityElementsHidden />
                <Text style={styles.secondaryButtonText}>Sınıf Performansı</Text>
              </AnimatedPressable>

              {/* Phase 56 — the class story sits next to Class Performance:
                  performance is the detail, this is the narrative over it. */}
              <AnimatedPressable
                onPress={openLearningStory}
                style={styles.secondaryButton}
                accessibilityRole="button"
                accessibilityLabel="Sınıfın ilerleme hikâyesini görüntüle"
              >
                <Ionicons name="trail-sign-outline" size={18} color={colors.primary} accessibilityElementsHidden />
                <Text style={styles.secondaryButtonText}>Sınıfın İlerleme Hikâyesi</Text>
              </AnimatedPressable>
            </View>

            {/* The two review queues — the same job on two kinds of content. */}
            <View style={styles.group}>
              <AnimatedPressable
                onPress={openAnswerReviews}
                style={styles.secondaryButton}
                accessibilityRole="button"
                accessibilityLabel="Yanıt incelemelerini aç"
                accessibilityHint="Otomatik incelemenin karar veremediği öğrenci yanıtlarını kontrol edersin"
              >
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} accessibilityElementsHidden />
                <Text style={styles.secondaryButtonText}>Yanıt İncelemeleri</Text>
              </AnimatedPressable>

              <AnimatedPressable
                onPress={openCommentReviews}
                style={styles.secondaryButton}
                accessibilityRole="button"
                accessibilityLabel="Yorum incelemelerini aç"
                accessibilityHint="Otomatik incelemenin karar veremediği öğrenci yorumlarını kontrol edersin"
              >
                <Ionicons name="chatbox-ellipses-outline" size={18} color={colors.primary} accessibilityElementsHidden />
                <Text style={styles.secondaryButtonText}>Yorum İncelemeleri</Text>
              </AnimatedPressable>
            </View>

            <AnimatedPressable
              onPress={capture}
              disabled={isUploading}
              style={styles.uploadButton}
              accessibilityRole="button"
              accessibilityLabel="Bu sınıfa soru ekle"
              // Phase 104 (B6) — the spinner alone says nothing to a screen reader.
              accessibilityState={{ busy: isUploading, disabled: isUploading }}
            >
              {isUploading ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <>
                  <Ionicons name="camera" size={18} color={colors.textInverse} accessibilityElementsHidden />
                  <Text style={styles.uploadButtonText}>Sınıfa Soru Ekle</Text>
                </>
              )}
            </AnimatedPressable>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Üyeler ({members.length})</Text>
              {members.map((member) => (
                <ClassMemberRow
                  key={member.uid}
                  member={member}
                  canRemove={!isMutating}
                  onRemove={removeMember}
                />
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sınıf Soruları</Text>
              {questions.length === 0 ? (
                <EmptyState icon="help-circle-outline" title="Henüz bu sınıfa soru eklenmedi" />
              ) : null}
            </View>
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
    // Phase 104 (B2) — the gap BETWEEN groups. Inside a group, `group` below
    // steps down to xs so related controls read as one cluster.
    gap: spacing.md,
  },
  identity: {
    gap: spacing.sm,
  },
  group: {
    gap: spacing.xs,
  },
  section: {
    gap: spacing.xs,
    marginTop: spacing.xs,
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
    // Phase 104 (B1) — the role the student sibling already uses (Wave A):
    // same 22pt, now with the 28pt line box a hand-written pair never had.
    ...typography.screenTitleSm,
    color: colors.textPrimary,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  codeLabel: {
    ...typography.caption,
    fontWeight: "400",
    // The nested code is cardTitle-sized; the outer line box must be tall
    // enough for it (the line box is what iOS clips to — see D11).
    lineHeight: typography.cardTitle.lineHeight,
    color: colors.textTertiary,
    flex: 1,
  },
  code: {
    // Phase 104 (B1) — a join code is a short machine token read aloud to a
    // room, not a heading: cardTitle's size and weight with the tracking kept.
    ...typography.cardTitle,
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  regenerateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    minHeight: 44,
    paddingHorizontal: spacing.xxs,
  },
  regenerateText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.primary,
  },
  error: {
    ...typography.caption,
    fontWeight: "400",
    color: colors.danger,
  },
  chatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    // Phase 104 (Dynamic Type) — a wrapped label used to take the whole row
    // and push the icon onto the border; the inset keeps both inside.
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  chatButtonText: {
    // Phase 104 (B1) — control label role; 15/600 is what this style already
    // was, now with a line box and a name (Wave A did the same on the
    // student's class detail).
    ...typography.button,
    color: colors.textInverse,
    flexShrink: 1,
    textAlign: "center",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    // Phase 104 (Dynamic Type) — a wrapped label used to take the whole row
    // and push the icon onto the border; the inset keeps both inside.
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.primary,
    flexShrink: 1,
    textAlign: "center",
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    // Phase 104 (Dynamic Type) — a wrapped label used to take the whole row
    // and push the icon onto the border; the inset keeps both inside.
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  uploadButtonText: {
    ...typography.button,
    color: colors.textInverse,
    flexShrink: 1,
    textAlign: "center",
  },
  sectionTitle: {
    // Phase 104 (B1) — the same section role the student sibling uses.
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  loadingMore: {
    paddingVertical: spacing.xl,
  },
}));
