import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useAuth } from "@features/authentication";
import { useClassAssignments } from "@features/assignments/hooks/useClassAssignments";
import { useClassSemanticDefinitions } from "@features/questions/hooks/useClassSemanticDefinitions";
import type { SemanticDefinitionInput } from "@features/questions/services/semanticDefinition";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { ClassTopicComposerModals } from "../components/ClassTopicComposerModals";
import { TeacherActionCenterSection } from "../components/TeacherActionCenterSection";
import { useClassActionCenter } from "../hooks/useClassActionCenter";
import { useClassPerformance } from "../hooks/useClassPerformance";
import { useClassTopicComposer } from "../hooks/useClassTopicComposer";
import {
  actionCenterComposerContext,
  teacherStudentHref,
} from "../services/actionCenterNavigation";
import {
  ACTION_CENTER_FULL_LIST_NOTE,
  ACTION_CENTER_OUTCOMES_UNAVAILABLE,
  ACTION_CENTER_TITLE,
  TeacherActionCenterItem,
} from "../services/teacherActionCenter";

// Phase 101 — "Bugün Öne Çıkanlar", complete.
//
// WHAT THIS IS
//
// The Phase 73 Action Center with nothing cut off. Sınıf Performansı shows its
// first five actions; this shows every one, in the same order, with the same
// rows, the same copy and the same buttons, because it is built by the same
// hook from the same builder. It is reachable directly from the class page.
//
// WHAT THIS IS NOT
//
// A second priority system, or a second dashboard. No heatmap, no semantic
// cohorts, no hotspot or student lists, no monitor section: those answer
// different questions and already live on Sınıf Performansı. Nothing here
// ranks, scores or classifies — ordering is the builder's fixed action-type
// precedence, and nothing on this screen writes. The only write path is the
// explicit question composer "Müdahale Hazırla" opens, which is the exact one
// Sınıf Performansı opens.
//
// COST
//
// Reached by a normal navigation, so it mounts fresh and runs the SAME bounded
// reads the Action Center has always needed: useClassPerformance's roster and
// per-member items, useClassAssignments' one query, and Phase 73's at most
// MAX_INSPECTED_ASSIGNMENTS submission queries. Plus the composer's one class
// document read. It loads none of Sınıf Performansı's semantic cohort evidence,
// and the shared vocabulary only once the composer is actually opened.

interface TeacherActionCenterScreenProps {
  classId: string;
}

export function TeacherActionCenterScreen({ classId }: TeacherActionCenterScreenProps) {
  useThemeSubscription();
  const { firebaseUser } = useAuth();

  const {
    cards,
    attentionCards,
    topicHotspots,
    studentEvidence,
    isLoading,
    error,
    refresh,
  } = useClassPerformance(classId);
  const {
    assignments,
    isLoading: isLoadingAssignments,
    error: assignmentsError,
  } = useClassAssignments(classId);

  const actionCenter = useClassActionCenter({
    classId,
    topicHotspots,
    attentionCards,
    assignments,
    studentEvidence,
  });

  const topicComposer = useClassTopicComposer({
    classId,
    uid: firebaseUser?.uid,
    onUploaded: refresh,
  });
  // Phase 80's original posture: the vocabulary is read only while the
  // composer is open. Sınıf Performansı loads it on first paint solely because
  // its cohort section needs it; this screen has no cohort section.
  const { definitions: semanticDefinitions, create: createSemanticDefinition } =
    useClassSemanticDefinitions(classId, topicComposer.isOpen);

  const handleCreateSemanticDefinition = useCallback(
    (input: SemanticDefinitionInput) =>
      firebaseUser ? createSemanticDefinition(firebaseUser.uid, input) : Promise.resolve(null),
    [createSemanticDefinition, firebaseUser],
  );

  function openStudent(studentUid: string) {
    router.push(teacherStudentHref(classId, studentUid, cards));
  }

  function handlePrepareIntervention(item: TeacherActionCenterItem) {
    const context = actionCenterComposerContext(item);
    if (context) topicComposer.openForTopic(context.subject, context.topic, context.gradeLevel);
  }

  // Escalations and follow-ups come from intervention outcomes, which need the
  // assignments. Showing the list before both settle would present a partial
  // list as the complete one, and then insert rows above what the teacher is
  // already reading.
  const isLoadingList = isLoading || isLoadingAssignments || actionCenter.isLoadingOutcomes;
  const outcomesMissing = Boolean(actionCenter.outcomesError || assignmentsError);

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Geri"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            {ACTION_CENTER_TITLE}
          </Text>
          <Text style={styles.subtitle}>{ACTION_CENTER_FULL_LIST_NOTE}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {isLoadingList ? (
          <View
            style={styles.skeletons}
            accessible
            accessibilityLabel="Aksiyonlar yükleniyor"
            accessibilityLiveRegion="polite"
            aria-live="polite"
          >
            <LoadingSkeleton height={96} borderRadius={16} />
            <LoadingSkeleton height={96} borderRadius={16} />
            <LoadingSkeleton height={96} borderRadius={16} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <EmptyState icon="cloud-offline-outline" title={error} />
            <PrimaryButton label="Tekrar Dene" onPress={refresh} />
          </View>
        ) : cards.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Bu sınıfta henüz öğrenci yok"
            description="Öğrenciler sınıf koduyla katıldığında aksiyonlar burada görünecek."
          />
        ) : (
          <>
            {outcomesMissing ? (
              <View
                style={styles.notice}
                accessible
                accessibilityLabel={ACTION_CENTER_OUTCOMES_UNAVAILABLE}
                accessibilityLiveRegion="polite"
                aria-live="polite"
              >
                <Ionicons
                  name="information-circle-outline"
                  size={iconSize.sm}
                  color={colors.textSecondary}
                />
                <Text style={styles.noticeText}>{ACTION_CENTER_OUTCOMES_UNAVAILABLE}</Text>
              </View>
            ) : null}
            <TeacherActionCenterSection
              items={actionCenter.items}
              showHeader={false}
              onOpenStudent={openStudent}
              onPrepareIntervention={handlePrepareIntervention}
            />
          </>
        )}
      </ScrollView>

      <ClassTopicComposerModals
        state={topicComposer}
        semanticDefinitions={semanticDefinitions}
        onCreateSemanticDefinition={handleCreateSemanticDefinition}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    width: "100%" as const,
    maxWidth: contentWidth.readable,
    alignSelf: "center" as const,
  },
  backButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  headerText: { flex: 1, gap: 2, paddingTop: spacing.xxs },
  title: { ...typography.screenTitle, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
    width: "100%" as const,
    maxWidth: contentWidth.readable,
    alignSelf: "center" as const,
  },
  centered: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  skeletons: { gap: spacing.sm },
  notice: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  noticeText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
}));
