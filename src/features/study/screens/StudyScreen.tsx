import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { ROUTES } from "@constants/routes";
import { useAuth } from "@features/authentication";
import { useNavigationGuard } from "@hooks/useNavigationGuard";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { StudyOutcome } from "../domain/studyTypes";
import { DailyGoalEditor } from "../components/DailyGoalEditor";
import { StudyProgressCard } from "../components/StudyProgressCard";
import { StudyQueueCard } from "../components/StudyQueueCard";
import { useStudyQueue } from "../hooks/useStudyQueue";
import { mapStudyErrorToMessage } from "../services/studyErrorMapper";
import { queueEmptyCopy } from "../services/studyPresentation";
import { recordStudyOutcome } from "../services/studyService";
import { ResolvedQueueEntry } from "../services/studyService";

function keyExtractor(entry: ResolvedQueueEntry) {
  return entry.item.questionId;
}

function QueueSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2].map((key) => (
        <LoadingSkeleton key={key} height={260} borderRadius={16} />
      ))}
    </View>
  );
}

// The student's daily review session. Student-only by construction — it is
// mounted exclusively from the (student) route group, and the backend
// callable independently rejects any non-student caller.
export function StudyScreen() {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  const { entries, summary, isLoading, isRefreshing, error, refresh, dismiss } = useStudyQueue(uid);
  const guardedNavigate = useNavigationGuard();

  // Per-card busy/error state, keyed by questionId — a failure on one card
  // must never blank out the whole session.
  const [pending, setPending] = useState<Record<string, StudyOutcome>>({});
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  // Re-fetches the due queue whenever this tab regains focus — which is
  // exactly what happens on returning from a review session, so the counts
  // and the list reflect the work just done without a full reload. The
  // summary (streak/goal/mastered) is already live via its own single
  // listener, so no second listener is added here.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const startSession = useCallback(() => {
    guardedNavigate("review-session", () =>
      router.push(ROUTES.studentReviewSession as never),
    );
  }, [guardedNavigate]);

  const handleOpen = useCallback(
    (questionId: string) => {
      guardedNavigate(questionId, () =>
        router.push(`/(student)/question/${questionId}` as never),
      );
    },
    [guardedNavigate],
  );

  const handleOutcome = useCallback(
    async (questionId: string, outcome: StudyOutcome) => {
      // Ref-free double-tap guard: a card already in flight is ignored.
      if (pending[questionId]) return;
      setPending((prev) => ({ ...prev, [questionId]: outcome }));
      setCardErrors((prev) => {
        if (!prev[questionId]) return prev;
        const next = { ...prev };
        delete next[questionId];
        return next;
      });

      try {
        await recordStudyOutcome(questionId, outcome);
        // Server has rescheduled it; drop it from this session's working set.
        dismiss(questionId);
      } catch (err) {
        setCardErrors((prev) => ({ ...prev, [questionId]: mapStudyErrorToMessage(err) }));
      } finally {
        setPending((prev) => {
          const next = { ...prev };
          delete next[questionId];
          return next;
        });
      }
    },
    [pending, dismiss],
  );

  const renderItem = useCallback(
    ({ item }: { item: ResolvedQueueEntry }) => (
      <StudyQueueCard
        entry={item}
        onOpen={handleOpen}
        onSelectOutcome={(outcome) => handleOutcome(item.item.questionId, outcome)}
        pendingOutcome={pending[item.item.questionId] ?? null}
        error={cardErrors[item.item.questionId] ?? null}
      />
    ),
    [handleOpen, handleOutcome, pending, cardErrors],
  );

  const emptyCopy = queueEmptyCopy(summary.totalUniqueQuestions > 0);

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <FlatList
        data={entries}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Çalış</Text>
            <StudyProgressCard summary={summary} dueCount={entries.length} />
            <DailyGoalEditor currentGoal={summary.dailyGoal} onSaved={refresh} />
            {entries.length > 0 ? (
              <PrimaryButton
                label="Tekrara Başla"
                onPress={startSession}
                accessibilityHint="Tekrar oturumunu açar"
              />
            ) : null}
            {error ? (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <QueueSkeleton />
          ) : error ? null : (
            <EmptyState
              icon="school-outline"
              title={emptyCopy.title}
              description={emptyCopy.description}
            />
          )
        }
      />
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    gap: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  title: {
    ...typography.displayLg,
    fontSize: 26,
    color: colors.textPrimary,
  },
  separator: {
    height: spacing.md,
  },
  skeletonList: {
    gap: spacing.md,
  },
  errorBanner: {
    backgroundColor: colors.dangerMuted,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
  },
});
