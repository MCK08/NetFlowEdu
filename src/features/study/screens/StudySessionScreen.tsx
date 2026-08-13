import { Ionicons } from "@expo/vector-icons";
import { router, useNavigation } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { ROUTES } from "@constants/routes";
import { formatFeedPosition } from "@features/classes/services/classFeedPagination";
import { useAuth } from "@features/authentication";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { Question } from "@/types/question";

import { useAssignmentSession } from "@features/assignments/hooks/useAssignmentSession";
import { computeAssignmentProgress } from "@features/assignments/services/assignmentProgress";

import { StudySessionAdaptiveCard } from "../components/StudySessionAdaptiveCard";
import { StudySessionMandatoryCard } from "../components/StudySessionMandatoryCard";
import { useAdaptiveStudySession } from "../hooks/useAdaptiveStudySession";
import { useReviewSession } from "../hooks/useReviewSession";
import { useStudyQueue } from "../hooks/useStudyQueue";
import { ResolvedQueueEntry } from "../services/studyService";
import {
  resolveStudySessionExitGuard,
  StudySessionExitGuardResult,
} from "../services/studySessionExitGuard";

// "assignment" (Phase 29) renders through the exact same swipe-card UI as
// "adaptive" (StudySessionAdaptiveCard, same recordStudyOutcome path via
// useStudyQuestionState) — the only difference is WHICH question list feeds
// it (a teacher's assignment snapshot instead of the adaptive plan) and
// that completing a question ALSO records assignment progress alongside
// the normal outcome. Nothing about scheduling/mastery/recordStudyOutcome
// changes for this mode — see useAssignmentSession's own doc comment.
export type StudySessionMode = "mandatory" | "adaptive" | "assignment";

interface StudySessionScreenProps {
  mode: StudySessionMode;
  // Required when mode === "assignment", ignored otherwise.
  assignmentId?: string;
}

function mandatoryKeyExtractor(entry: ResolvedQueueEntry) {
  return entry.item.questionId;
}

function adaptiveKeyExtractor(question: Question) {
  return question.id;
}

// Phase 28 — replaces the single-card ScrollView ReviewSessionScreen used
// to be with a real vertical swipe feed, one question per full-screen page,
// reusing the exact same paging tuning FeedScreen/ClassFeedScreen already
// established (pagingEnabled + snapToInterval + the same small
// initialNumToRender/windowSize window). §15's whole point: the student
// always knows where they are, how many are left, and can always leave —
// never "opened a question and can't get out".
//
// The MANDATORY round's data/outcome/pagination is entirely
// useReviewSession's (unmodified authoritative logic, see its own doc
// comment) — this screen only renders `entries` as pages instead of one
// `current` card. The ADAPTIVE round (post-completion "Çalışmaya Devam
// Et") is useAdaptiveStudySession, itself a thin resolver over
// buildAdaptivePracticePlan's already-ranked output. Neither mode
// recomputes priority, mastery, recency, or scheduling — reviewScheduler.ts
// and recordStudyOutcome.ts are untouched.
export function StudySessionScreen({ mode, assignmentId }: StudySessionScreenProps) {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const isAssignmentMode = mode === "assignment";

  const mandatory = useReviewSession(mode === "mandatory" ? uid : undefined);
  const { summary } = useStudyQueue(mode === "adaptive" ? uid : undefined);
  const adaptive = useAdaptiveStudySession(mode === "adaptive" ? uid : undefined, summary);
  const assignmentSession = useAssignmentSession(
    isAssignmentMode ? assignmentId : undefined,
    isAssignmentMode ? uid : undefined,
  );

  // Unified so the loading/error/FlatList rendering below (shared by both
  // swipe modes) never needs to branch on `mode` itself — only the DATA
  // SOURCE differs.
  const swipeQuestions = isAssignmentMode ? assignmentSession.questions : adaptive.questions;
  const swipeIsLoading = isAssignmentMode ? assignmentSession.isLoading : adaptive.isLoading;
  const swipeError = isAssignmentMode ? assignmentSession.error : adaptive.error;
  const swipeRefresh = isAssignmentMode ? assignmentSession.refresh : adaptive.refresh;

  const listRef = useRef<FlatList<ResolvedQueueEntry | Question>>(null);
  // A real height, not the window's full height minus anything — this is
  // its own stack screen (see app/(student)/study/session.tsx), with no
  // tab bar to dodge, unlike FeedScreen.
  const { height: pageHeight } = useWindowDimensions();

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace(ROUTES.studentStudy as never);
  }

  // Swipe cards (adaptive AND assignment — both render StudySessionAdaptiveCard)
  // are self-contained (each owns its own useStudyQuestionState, see that
  // component's own doc comment) — the screen has no other visibility into
  // whether the currently visible card has a submission in flight, so each
  // rendered card reports its own state here. A Set (not a single boolean)
  // because windowSize keeps up to 3 cards mounted at once; only cleared
  // for a given question when THAT question's own card reports settled.
  const swipeSubmittingIdsRef = useRef<Set<string>>(new Set());
  const [isSwipeCardSubmitting, setIsSwipeCardSubmitting] = useState(false);
  const handleSwipeSubmittingChange = useCallback((questionId: string, submitting: boolean) => {
    if (submitting) swipeSubmittingIdsRef.current.add(questionId);
    else swipeSubmittingIdsRef.current.delete(questionId);
    setIsSwipeCardSubmitting(swipeSubmittingIdsRef.current.size > 0);
  }, []);

  // Read inside the beforeRemove listener below, which is registered once
  // and would otherwise close over stale values — same pattern as
  // AnswerScreen's exitGuardRef.
  const exitGuardRef = useRef<StudySessionExitGuardResult>({ blocked: false, message: "" });
  useEffect(() => {
    const isSubmitting = mode === "mandatory" ? mandatory.isSubmitting : isSwipeCardSubmitting;
    exitGuardRef.current = resolveStudySessionExitGuard({ isSubmitting });
  }, [mode, mandatory.isSubmitting, isSwipeCardSubmitting]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (!exitGuardRef.current.blocked) return;

      event.preventDefault();
      Alert.alert("Emin misin?", exitGuardRef.current.message, [
        { text: "İptal", style: "cancel" },
        {
          text: "Çık",
          style: "destructive",
          onPress: () => navigation.dispatch(event.data.action),
        },
      ]);
    });
    return unsubscribe;
  }, [navigation]);

  // Keeps the FlatList in sync with useReviewSession's own idea of "the
  // current card" (advances automatically after an outcome, or after a
  // page loads) — the user can still swipe freely between already-loaded
  // cards; this only re-centers the list when the SESSION's own state
  // moves on, the same relationship useInterleavedStudyFeed's
  // scrollToIndex has with RatingCard's auto-advance.
  useEffect(() => {
    if (mode !== "mandatory" || mandatory.isComplete) return;
    listRef.current?.scrollToOffset({ offset: pageHeight * mandatory.index, animated: true });
  }, [mode, mandatory.index, mandatory.isComplete, pageHeight]);

  const handleMandatoryEndReached = useCallback(() => {
    if (mandatory.hasMore) mandatory.retryPagination();
  }, [mandatory]);

  const isMandatoryComplete = mode === "mandatory" && mandatory.isComplete;
  const isAdaptiveDone =
    mode === "adaptive" && !adaptive.isLoading && adaptive.questions.length === 0;

  // Assignment "done" is progress-based (completedCount >= targetCount via
  // the shared, tested computeAssignmentProgress), NOT list-exhaustion —
  // unlike the adaptive plan, an assignment's question list is a fixed
  // snapshot that never shrinks as items are completed, so "ran out of
  // cards" is never the right completion signal here. A separate "empty"
  // state covers the genuinely different case of zero resolvable questions
  // (e.g. every question in the assignment was since deleted).
  const assignmentProgress = isAssignmentMode
    ? computeAssignmentProgress(assignmentSession.submission, assignmentSession.targetCount)
    : null;
  const isAssignmentComplete =
    isAssignmentMode && !assignmentSession.isLoading && (assignmentProgress?.isComplete ?? false);
  const isAssignmentEmpty =
    isAssignmentMode &&
    !assignmentSession.isLoading &&
    assignmentSession.questions.length === 0 &&
    !isAssignmentComplete;

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
      <Pressable
        onPress={goBack}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Geri"
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.headerTitle}>
        {mode === "mandatory" ? "Tekrar" : isAssignmentMode ? "Ödev" : "Çalışma"}
      </Text>
      {mode === "mandatory" && !isMandatoryComplete ? (
        <Text style={styles.headerProgress}>
          {formatFeedPosition(mandatory.index, mandatory.total)}
        </Text>
      ) : mode === "adaptive" && !isAdaptiveDone ? (
        <Text style={styles.headerProgress}>{adaptive.questions.length} soru</Text>
      ) : isAssignmentMode && assignmentProgress && !isAssignmentComplete && !isAssignmentEmpty ? (
        <Text style={styles.headerProgress}>
          {assignmentProgress.completedCount} / {assignmentProgress.targetCount}
        </Text>
      ) : null}
    </View>
  );

  if (mode === "mandatory") {
    if (mandatory.isLoading) {
      return (
        <View style={styles.flex}>
          {header}
          <View style={styles.centered}>
            <ActivityIndicator color={colors.textPrimary} />
          </View>
        </View>
      );
    }

    if (mandatory.loadError) {
      return (
        <View style={styles.flex}>
          {header}
          <View style={styles.centered}>
            <EmptyState icon="cloud-offline-outline" title={mandatory.loadError} />
            <PrimaryButton label="Tekrar Dene" onPress={mandatory.retry} />
          </View>
        </View>
      );
    }

    if (mandatory.isComplete || mandatory.total === 0) {
      return (
        <View style={styles.flex}>
          {header}
          <View style={styles.centered}>
            <Ionicons name="checkmark-done-circle-outline" size={56} color={colors.success} />
            <Text style={styles.completionTitle}>
              {mandatory.total === 0 ? "Şu an tekrar bekleyen soru yok" : "Bugünkü tekrarların tamamlandı 🎉"}
            </Text>
            {mandatory.totals.reviewed > 0 ? (
              <Text style={styles.completionSubtitle}>
                {mandatory.totals.reviewed} soru tekrar edildi · {mandatory.totals.solved} doğru
                {mandatory.totals.struggled > 0 ? ` · ${mandatory.totals.struggled} zorlanılan` : ""}
              </Text>
            ) : null}
            <Text style={styles.completionHint}>
              İstersen şimdi eksik olduğun konular üzerinde çalışabilirsin.
            </Text>
            <PrimaryButton
              label="Çalışmaya Devam Et"
              onPress={() => router.replace(ROUTES.studentAdaptiveSession as never)}
            />
            <PrimaryButton label="Öğrenme Merkezine Dön" variant="secondary" onPress={goBack} />
          </View>
        </View>
      );
    }

    return (
      <View style={styles.flex}>
        <FlatList
          ref={listRef as never}
          data={mandatory.entries}
          keyExtractor={mandatoryKeyExtractor}
          renderItem={({ item, index }) => (
            <StudySessionMandatoryCard
              entry={item}
              height={pageHeight}
              pendingOutcome={index === mandatory.index ? mandatory.pendingOutcome : null}
              mutationError={index === mandatory.index ? mandatory.actionError : null}
              justSucceeded={index === mandatory.index && mandatory.justSucceededOutcome !== null}
              onSelectOutcome={(questionId, outcome) => mandatory.submitOutcome(questionId, outcome)}
            />
          )}
          getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
          pagingEnabled
          snapToInterval={pageHeight}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.5}
          onEndReached={handleMandatoryEndReached}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews
          ListHeaderComponent={<View style={{ height: insets.top + HEADER_HEIGHT }} />}
        />
        {header}
      </View>
    );
  }

  // ---- adaptive / assignment mode (shared swipe UI) ----
  if (swipeIsLoading) {
    return (
      <View style={styles.flex}>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator color={colors.textPrimary} />
        </View>
      </View>
    );
  }

  if (swipeError) {
    return (
      <View style={styles.flex}>
        {header}
        <View style={styles.centered}>
          <EmptyState icon="cloud-offline-outline" title={swipeError} />
          <PrimaryButton label="Tekrar Dene" onPress={swipeRefresh} />
        </View>
      </View>
    );
  }

  if (isAdaptiveDone) {
    return (
      <View style={styles.flex}>
        {header}
        <View style={styles.centered}>
          <Ionicons name="sparkles-outline" size={56} color={colors.primary} />
          <Text style={styles.completionTitle}>Çalışma tamamlandı 🎉</Text>
          <Text style={styles.completionSubtitle}>
            {summary.reviewedToday > 0
              ? `Bugün ${summary.reviewedToday} soru çözdün.`
              : "—"}
          </Text>
          <PrimaryButton label="Öğrenme Merkezine Dön" onPress={goBack} />
        </View>
      </View>
    );
  }

  if (isAssignmentEmpty) {
    return (
      <View style={styles.flex}>
        {header}
        <View style={styles.centered}>
          <EmptyState icon="document-text-outline" title="Bu ödevde artık geçerli soru yok" />
          <PrimaryButton label="Öğrenme Merkezine Dön" onPress={goBack} />
        </View>
      </View>
    );
  }

  if (isAssignmentComplete) {
    return (
      <View style={styles.flex}>
        {header}
        <View style={styles.centered}>
          <Ionicons name="checkmark-done-circle-outline" size={56} color={colors.success} />
          <Text style={styles.completionTitle}>Ödev tamamlandı 🎉</Text>
          <Text style={styles.completionSubtitle}>
            {assignmentProgress?.completedCount ?? 0} / {assignmentProgress?.targetCount ?? 0} soru çözüldü.
          </Text>
          <PrimaryButton label="Öğrenme Merkezine Dön" onPress={goBack} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <FlatList
        ref={listRef as never}
        data={swipeQuestions}
        keyExtractor={adaptiveKeyExtractor}
        renderItem={({ item, index }) => (
          <StudySessionAdaptiveCard
            question={item}
            height={pageHeight}
            onOutcomeRecorded={(_outcome, question) => {
              // recordStudyOutcome has ALREADY succeeded by the time this
              // fires (see StudySessionAdaptiveCard's own doc comment) —
              // recording assignment progress here never changes, delays,
              // or gates that outcome; it's a parallel, independent,
              // idempotent write (see useAssignmentSession.recordProgress).
              if (isAssignmentMode) assignmentSession.recordProgress(question.id);
              listRef.current?.scrollToOffset({ offset: pageHeight * (index + 1), animated: true });
            }}
            onSubmittingChange={(submitting) => handleSwipeSubmittingChange(item.id, submitting)}
          />
        )}
        getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
        pagingEnabled
        snapToInterval={pageHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews
        ListHeaderComponent={<View style={{ height: insets.top + HEADER_HEIGHT }} />}
      />
      {header}
    </View>
  );
}

const HEADER_HEIGHT = 48;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  header: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  backButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -spacing.sm,
  },
  headerTitle: {
    ...typography.title,
    fontSize: 18,
    color: colors.textPrimary,
    flex: 1,
  },
  headerProgress: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.textSecondary,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  completionTitle: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: "center",
  },
  completionSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  completionHint: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },
});
