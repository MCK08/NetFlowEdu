import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback } from "react";
import { Text, View } from "react-native";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useAuth } from "@features/authentication";
import { useClassSemanticDefinitions } from "@features/questions/hooks/useClassSemanticDefinitions";
import type { SemanticDefinitionInput } from "@features/questions/services/semanticDefinition";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import type { ClassAttention } from "../hooks/useClassAttention";
import { useClassTopicComposer } from "../hooks/useClassTopicComposer";
import { actionCenterComposerContext, teacherStudentHref } from "../services/actionCenterNavigation";
import { ACTION_CENTER_OUTCOMES_UNAVAILABLE, TeacherActionCenterItem } from "../services/teacherActionCenter";
import { ClassTopicComposerModals } from "./ClassTopicComposerModals";
import { TeacherActionCenterSection } from "./TeacherActionCenterSection";
import { TeacherTodayActions } from "./TeacherTodayActions";

interface ClassAttentionPanelProps {
  classId: string;
  attention: ClassAttention;
  /** "summary": the first five, with "Tümünü Gör" when more exist.
   *  "full": the complete list, in the same order.
   *  "today": the same first five, drawn as Bugün draws them — the leading
   *  item as the day's priority card, the rest as compact rows. Same list,
   *  same order, one presentation. */
  mode: "summary" | "full" | "today";
  /** Where "Tümünü Gör" leads — only used in summary mode. */
  onViewAll?: () => void;
  /** The canonical "Bugün Öne Çıkanlar" heading; hidden when the screen
   *  already names the list itself. */
  showHeader?: boolean;
}

// Phase 111 — the Action Center's list, placed wherever a teacher needs it.
//
// Bugün, Aksiyonlar and the class page all show the same list, so its states
// live here once: loading (never a partial list presented as whole), a real
// error with a retry, an honest "no students yet", the notice when
// intervention outcomes could not be read, the canonical rows, and the one
// write path — "Müdahale Hazırla" opens the SAME question composer the Action
// Center route opens. Nothing here orders, scores or filters the list.
export function ClassAttentionPanel({ classId, attention, mode, onViewAll, showHeader = true }: ClassAttentionPanelProps) {
  useThemeSubscription();
  const { firebaseUser } = useAuth();

  const topicComposer = useClassTopicComposer({
    classId,
    uid: firebaseUser?.uid,
    onUploaded: () => {
      attention.refresh();
    },
  });
  // Read only while the composer is open, exactly as the Action Center route
  // does — the shared vocabulary is not a cost of merely viewing the list.
  const { definitions: semanticDefinitions, create: createSemanticDefinition } = useClassSemanticDefinitions(
    classId,
    topicComposer.isOpen,
  );

  const handleCreateSemanticDefinition = useCallback(
    (input: SemanticDefinitionInput) =>
      firebaseUser ? createSemanticDefinition(firebaseUser.uid, input) : Promise.resolve(null),
    [createSemanticDefinition, firebaseUser],
  );

  const openStudent = useCallback(
    (studentUid: string) => {
      router.push(teacherStudentHref(classId, studentUid, attention.cards));
    },
    [classId, attention.cards],
  );

  const prepareIntervention = useCallback(
    (item: TeacherActionCenterItem) => {
      const context = actionCenterComposerContext(item);
      if (context) topicComposer.openForTopic(context.subject, context.topic, context.gradeLevel);
    },
    [topicComposer],
  );

  const items = mode === "full" ? attention.items : attention.summary.items;
  const viewAll =
    mode !== "full" && attention.summary.hasMore && onViewAll
      ? { totalCount: attention.summary.totalCount, onPress: onViewAll }
      : null;

  return (
    <View style={styles.panel}>
      {attention.isLoadingList ? (
        <View
          style={styles.skeletons}
          accessible
          accessibilityLabel="Aksiyonlar yükleniyor"
          accessibilityLiveRegion="polite"
          aria-live="polite"
        >
          <LoadingSkeleton height={88} borderRadius={radius.xl} />
          <LoadingSkeleton height={88} borderRadius={radius.xl} />
        </View>
      ) : attention.error ? (
        <View style={styles.centered}>
          <EmptyState icon="cloud-offline-outline" title={attention.error} />
          <PrimaryButton label="Tekrar Dene" onPress={() => attention.refresh()} variant="secondary" />
        </View>
      ) : attention.studentCount === 0 ? (
        <EmptyState
          icon="people-outline"
          title="Bu sınıfta henüz öğrenci yok"
          description="Öğrenciler sınıf koduyla katıldığında aksiyonlar burada görünecek."
        />
      ) : (
        <>
          {attention.outcomesMissing ? (
            <View
              style={styles.notice}
              accessible
              accessibilityLabel={ACTION_CENTER_OUTCOMES_UNAVAILABLE}
              accessibilityLiveRegion="polite"
              aria-live="polite"
            >
              <Ionicons name="information-circle-outline" size={iconSize.sm} color={colors.textSecondary} accessibilityElementsHidden />
              <Text style={styles.noticeText}>{ACTION_CENTER_OUTCOMES_UNAVAILABLE}</Text>
            </View>
          ) : null}
          {mode === "today" ? (
            <TeacherTodayActions
              items={items}
              viewAll={viewAll}
              onOpenStudent={openStudent}
              onPrepareIntervention={prepareIntervention}
            />
          ) : (
            <TeacherActionCenterSection
              items={items}
              showHeader={showHeader}
              viewAll={viewAll}
              onOpenStudent={openStudent}
              onPrepareIntervention={prepareIntervention}
            />
          )}
        </>
      )}

      <ClassTopicComposerModals
        state={topicComposer}
        semanticDefinitions={semanticDefinitions}
        onCreateSemanticDefinition={handleCreateSemanticDefinition}
      />
    </View>
  );
}

const styles = themedStyles(() => ({
  panel: {
    gap: spacing.sm,
  },
  skeletons: {
    gap: spacing.sm,
  },
  centered: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  noticeText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
}));
