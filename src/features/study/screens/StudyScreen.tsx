import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { ROUTES } from "@constants/routes";
import { useAuth } from "@features/authentication";
import { useNavigationGuard } from "@hooks/useNavigationGuard";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { useStudentAssignments } from "@features/assignments/hooks/useStudentAssignments";

import { StudyOutcome } from "../domain/studyTypes";
import { AssignedWorkSection } from "../components/AssignedWorkSection";
import { DailyGoalEditor } from "../components/DailyGoalEditor";
import { DailyPracticePlanSection } from "../components/DailyPracticePlanSection";
import { StudyProgressCard } from "../components/StudyProgressCard";
import { StudyQueueCard } from "../components/StudyQueueCard";
import { SubjectBreakdownSection } from "../components/SubjectBreakdownSection";
import { WeakTopicsSection } from "../components/WeakTopicsSection";
import { useLearningInsights } from "../hooks/useLearningInsights";
import { useStudyQueue } from "../hooks/useStudyQueue";
import { TopicInsight } from "../services/learningInsights";
import { mapStudyErrorToMessage } from "../services/studyErrorMapper";
import { queueEmptyCopy } from "../services/studyPresentation";
import { recordStudyOutcome } from "../services/studyService";
import { ResolvedQueueEntry } from "../services/studyService";
import { resolveStudyStartTarget } from "../services/studyDueCheck";

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
  const { items, insights, plan, moment, refresh: refreshInsights } = useLearningInsights(uid, summary);
  const { cards: assignmentCards, refresh: refreshAssignments } = useStudentAssignments(uid);
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
      refreshInsights();
      refreshAssignments();
    }, [refresh, refreshInsights, refreshAssignments]),
  );

  const openAssignment = useCallback(
    (assignmentId: string) => {
      guardedNavigate(`assignment-${assignmentId}`, () =>
        router.push(`/(student)/assignment/${assignmentId}` as never),
      );
    },
    [guardedNavigate],
  );

  const startSession = useCallback(() => {
    guardedNavigate("review-session", () =>
      router.push(ROUTES.studentReviewSession as never),
    );
  }, [guardedNavigate]);

  // "Çalışmaya Başla" when there is nothing mandatory due (dueCount === 0)
  // but the daily plan still has recommendations (weak topics / goal fill).
  // This must open the same vertical-swipe StudySessionScreen the due path
  // uses — mode="adaptive" — not a single question's detail screen. Kept
  // distinct from handleOpen, which stays reserved for "open exactly one
  // named question" (a due-queue card, a weak-topic card): conflating the
  // two here is exactly the bug this fixes.
  const startAdaptiveSession = useCallback(() => {
    guardedNavigate("adaptive-session", () =>
      router.push(ROUTES.studentAdaptiveSession as never),
    );
  }, [guardedNavigate]);

  // The Daily Practice Plan card's own dueCount is a memoized snapshot
  // (useLearningInsights recomputes it only when `items`/summary change,
  // never on the clock alone) — it can under- or over-report due-ness by
  // however long this screen has sat idle. Re-checking against `items`
  // (the same data, zero new reads) with a genuinely fresh `now` at the
  // moment of the tap is what makes the routing decision trustworthy;
  // plan.dueCount itself is only ever used for what's DISPLAYED, never for
  // which screen opens.
  const handleStartPlan = useCallback(() => {
    const target = resolveStudyStartTarget({
      items,
      now: Date.now(),
      hasPlanItems: plan.planItems.length > 0,
    });
    // The stale display disagreed with the live check — self-correct it via
    // the same refresh the Hub already triggers elsewhere (focus, outcome
    // recorded), rather than leaving it wrong until the next natural
    // trigger. No new fetch: refreshInsights() already exists.
    if (target === "mandatory" && plan.dueCount === 0) {
      refreshInsights();
    }
    if (target === "mandatory") {
      startSession();
    } else if (target === "adaptive") {
      startAdaptiveSession();
    }
  }, [items, plan.planItems.length, plan.dueCount, refreshInsights, startSession, startAdaptiveSession]);

  const handleOpen = useCallback(
    (questionId: string) => {
      guardedNavigate(questionId, () =>
        router.push(`/(student)/question/${questionId}` as never),
      );
    },
    [guardedNavigate],
  );

  // A weak/strong topic card opens the same, already-existing Question
  // Detail route StudyQueueCard's own "open" action uses (handleOpen above)
  // — reusing it here rather than wiring a topic-filtered Feed keeps this
  // to the smallest safe navigation change: zero new routes, and zero risk
  // to Phase 21's Feed filter state (which lives only in FeedScreen).
  const handleSelectTopic = useCallback(
    (topic: TopicInsight) => handleOpen(topic.sampleQuestionId),
    [handleOpen],
  );

  const handleRefresh = useCallback(() => {
    refresh();
    refreshInsights();
  }, [refresh, refreshInsights]);

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
        // The outcome just recorded can change which topics are "weak"
        // (a struggled outcome) or "strong" (a fresh mastery) — re-derive
        // the Hub's insights from a fresh read rather than leaving them
        // stale until the next focus event.
        refreshInsights();
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
    [pending, dismiss, refreshInsights],
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
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Öğrenme Merkezi</Text>
            {/* Phase 25 §10 — one deterministic sentence, real trend data,
                no invented text. See learningMoment.ts. */}
            {moment ? <Text style={styles.moment}>{moment}</Text> : null}
            <AssignedWorkSection cards={assignmentCards} onOpen={openAssignment} />
            <DailyPracticePlanSection plan={plan} onStart={handleStartPlan} />
            <StudyProgressCard summary={summary} dueCount={insights.dueCount} />
            <DailyGoalEditor currentGoal={summary.dailyGoal} onSaved={handleRefresh} />
            {error ? (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            <WeakTopicsSection topics={insights.weakTopics} onSelectTopic={handleSelectTopic} />
            <SubjectBreakdownSection subjects={insights.subjectSummaries} />
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
  moment: {
    ...typography.body,
    color: colors.textSecondary,
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
