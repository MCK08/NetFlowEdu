import { Ionicons } from "@expo/vector-icons";
import { router, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, Text, useWindowDimensions, View } from "react-native";
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
import { themedStyles } from "@theme/themeRuntime";
import { Question } from "@/types/question";

import { useAssignmentSession } from "@features/assignments/hooks/useAssignmentSession";
import { computeAssignmentProgress } from "@features/assignments/services/assignmentProgress";
import { resolveAssignmentSessionCompletion } from "@features/assignments/services/assignmentSessionCompletion";

import { StudySessionAdaptiveCard } from "../components/StudySessionAdaptiveCard";
import { StudySessionMandatoryCard } from "../components/StudySessionMandatoryCard";
import { SessionReflectionCard } from "../components/SessionReflectionCard";
import { buildSessionReflection } from "../services/sessionReflection";
import { resolveAdaptiveResumeIndex } from "../services/adaptiveSessionCompletion";
import { useAdaptiveStudySession } from "../hooks/useAdaptiveStudySession";
import { useReviewSession } from "../hooks/useReviewSession";
import { useStudyQueue } from "../hooks/useStudyQueue";
import { ResolvedQueueEntry } from "../services/studyService";
import {
  computeSessionCardHeight,
  computeSessionItemContentOffset,
  computeSessionScrollOffset,
  computeSessionSnapOffsets,
  resolveSessionInitialNumToRender,
  shouldAnimateSessionScroll,
} from "../services/studySessionLayout";
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

// Module-level: the platform cannot change while the app is running, so this
// is a constant, not per-render state. See shouldAnimateSessionScroll for the
// measured reason web opts out of the animated scroll.
const animateSessionScroll = shouldAnimateSessionScroll(Platform.OS);

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
  const { height: windowHeight } = useWindowDimensions();
  // Phase 35 — the RAW window height used to be passed straight through as
  // each card's own height (`pageHeight`), which is taller than what's
  // actually visible: the header floats on top (position: absolute) and a
  // ListHeaderComponent spacer of the same height pushes real content down
  // by that much, and the bottom safe-area inset (home indicator) was never
  // subtracted at all. A card sized to the full raw window therefore always
  // extends past both the top (behind the header) and the bottom (under the
  // home indicator) of what the student can actually see or reach — exactly
  // the "Zorlandım"/"Çözdüm" buttons falling off-screen bug. `cardHeight` is
  // the true visible budget between the header and the safe bottom edge;
  // every card, and every offset computed against it, uses this instead.
  const headerHeight = insets.top + HEADER_HEIGHT;
  const cardHeight = computeSessionCardHeight({ windowHeight, headerHeight, insetsBottom: insets.bottom });

  // snapToInterval alone snaps at multiples of ONE fixed interval measured
  // from offset 0 — it has no way to represent "the header spacer is a
  // different height than every card after it". With snapToInterval set to
  // cardHeight, every snap point would land cardHeight*N from the top, which
  // is headerHeight short of where item N actually starts once the header
  // spacer's own height differs from cardHeight (it always does — the
  // header is a small strip, not a full page). snapToOffsets is the correct
  // FlatList API for this: an explicit list of real scroll-stop positions,
  // so swiping always lands exactly on a card's top, never partway between
  // the header and the first card.
  const mandatorySnapOffsets = useMemo(
    () => computeSessionSnapOffsets(mandatory.entries.length, cardHeight),
    [mandatory.entries.length, cardHeight],
  );
  const swipeSnapOffsets = useMemo(
    () => computeSessionSnapOffsets(swipeQuestions.length, cardHeight),
    [swipeQuestions.length, cardHeight],
  );

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
    listRef.current?.scrollToOffset({
      offset: computeSessionScrollOffset(mandatory.index, cardHeight),
      animated: animateSessionScroll,
    });
  }, [mode, mandatory.index, mandatory.isComplete, cardHeight]);

  const handleMandatoryEndReached = useCallback(() => {
    if (mandatory.hasMore) mandatory.retryPagination();
  }, [mandatory]);

  // Phase 66 — the session's own summary, derived from the receipts it
  // confirmed. Memoized on the receipt array, which stops changing once the
  // session completes, so the visible summary describes THAT session and
  // cannot be rewritten by anything that loads afterwards.
  //
  // Phase 67 — withheld until the persisted session has been consulted, so a
  // resumed session can never render its count from a provisionally empty
  // list and then correct itself upward. Completion itself does not depend on
  // receipts (it is decided by the queue), so nothing else waits on this.
  const sessionReflection = useMemo(
    () => buildSessionReflection(mandatory.isSessionHydrated ? mandatory.receipts : []),
    [mandatory.isSessionHydrated, mandatory.receipts],
  );

  const isMandatoryComplete = mode === "mandatory" && mandatory.isComplete;

  // Phase 68 — a real completion boundary, replacing `questions.length === 0`.
  //
  // That old test read as "the session ran out of cards", but the adaptive
  // list is a live plan capped by `dailyGoal - reviewedToday`, and
  // `reviewedToday` arrives on a listener — so it actually fired when the
  // DAILY GOAL was reached, and never fired at all when the plan was shorter
  // than the goal was far away (three items, a goal of ten: the student swiped
  // past the last card into nothing). Completion now means every planned entry
  // this session froze at its start has one confirmed outcome. See
  // adaptiveSessionCompletion.ts.
  const isAdaptiveComplete = mode === "adaptive" && adaptive.isComplete;
  // Genuinely nothing to practise — distinct from completion, which would
  // otherwise congratulate the student for finishing nothing.
  const isAdaptiveEmpty =
    mode === "adaptive" &&
    !adaptive.isLoading &&
    !isAdaptiveComplete &&
    adaptive.completion.answerableCount === 0;

  // Phase 68 — the adaptive session's own summary, built by Phase 66's
  // builder from the receipts this session confirmed. Withheld until the
  // persisted session has been consulted, so a resumed session never renders
  // a provisionally empty count and then corrects itself upward.
  const adaptiveReflection = useMemo(
    () => buildSessionReflection(adaptive.isSessionHydrated ? adaptive.receipts : []),
    [adaptive.isSessionHydrated, adaptive.receipts],
  );

  // Phase 68 — a RESUMED adaptive session opens on the first card that still
  // needs an answer, rather than back at the top on work already confirmed.
  //
  // Expressed as initialScrollIndex rather than an imperative scroll: the list
  // is not mounted until the session has hydrated and its questions resolved
  // (swipeIsLoading covers both), so the right starting card is already known
  // at first render, and letting FlatList place it avoids scrolling against a
  // list that has not been laid out yet. React ignores the prop after mount,
  // which is exactly right — from then on the card's own auto-advance owns
  // the position.
  const adaptiveInitialIndex = useMemo(
    () =>
      mode === "adaptive"
        ? resolveAdaptiveResumeIndex({
            resolvableQuestionIds: adaptive.questions.map((question) => question.id),
            receipts: adaptive.receipts,
          })
        : 0,
    [mode, adaptive.questions, adaptive.receipts],
  );

  function leaveAdaptiveCompletion() {
    adaptive.acknowledgeCompletion();
    goBack();
  }

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
  // Phase 38 — completion is decided against what the student can ACTUALLY
  // answer, not against the teacher's targetCount alone. An assignment whose
  // snapshot names a since-deleted question could otherwise never reach
  // completedCount >= targetCount, leaving the student stuck at (say) "2/4"
  // at the end of the list with no completion screen — reproduced against
  // the emulator, see assignmentSessionCompletion.ts.
  const assignmentCompletion = isAssignmentMode
    ? resolveAssignmentSessionCompletion({
        resolvableQuestionIds: assignmentSession.questions.map((question) => question.id),
        completedQuestionIds: assignmentSession.submission?.completedQuestionIds ?? [],
        targetCount: assignmentSession.targetCount,
      })
    : null;
  const isAssignmentComplete =
    isAssignmentMode && !assignmentSession.isLoading && (assignmentCompletion?.isComplete ?? false);
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
      ) : mode === "adaptive" && !isAdaptiveComplete && !isAdaptiveEmpty ? (
        // Phase 68 — a real fraction, now that the denominator is fixed for
        // the life of the session. Before the plan was frozen this could only
        // ever be a shrinking count of cards left, which is why it was one.
        <Text style={styles.headerProgress}>
          {adaptive.completion.confirmedCount} / {adaptive.completion.answerableCount}
        </Text>
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
            {/* Phase 68 — keyed on whether a session actually COMPLETED, not
                on whether the queue is currently empty. Those came apart the
                moment the completion screen became refreshable: after a
                reload the finished session's queue is legitimately empty, and
                the old test then told a student who had just finished their
                reviews that none were due. */}
            <Text style={styles.completionTitle}>
              {mandatory.isComplete ? "Bugünkü tekrarların tamamlandı 🎉" : "Şu an tekrar bekleyen soru yok"}
            </Text>
            {/* Phase 66 — what actually happened, in the order it happened.
                Replaces a flat "N reviewed · M correct" line, which could not
                say anything about topics or sequence and silently dropped
                "Tekrar Çalıştım" outcomes from the count entirely. */}
            <SessionReflectionCard reflection={sessionReflection} />
            <Text style={styles.completionHint}>
              İstersen şimdi eksik olduğun konular üzerinde çalışabilirsin.
            </Text>
            {/* Phase 68 — leaving acknowledges the completed session, so its
                stored snapshot is dropped and the next visit starts fresh
                instead of reopening this summary. The snapshot exists only so
                a refresh ON this screen keeps it. */}
            <PrimaryButton
              label="Çalışmaya Devam Et"
              onPress={() => {
                mandatory.acknowledgeCompletion();
                router.replace(ROUTES.studentAdaptiveSession as never);
              }}
            />
            <PrimaryButton
              label="Öğrenme Merkezine Dön"
              variant="secondary"
              onPress={() => {
                mandatory.acknowledgeCompletion();
                goBack();
              }}
            />
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
              height={cardHeight}
              pendingOutcome={index === mandatory.index ? mandatory.pendingOutcome : null}
              mutationError={index === mandatory.index ? mandatory.actionError : null}
              justSucceeded={index === mandatory.index && mandatory.justSucceededOutcome !== null}
              onSelectOutcome={(questionId, outcome) => mandatory.submitOutcome(questionId, outcome)}
            />
          )}
          getItemLayout={(_, index) => ({
            length: cardHeight,
            offset: computeSessionItemContentOffset(index, headerHeight, cardHeight),
            index,
          })}
          snapToOffsets={mandatorySnapOffsets}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.5}
          onEndReached={handleMandatoryEndReached}
          initialNumToRender={resolveSessionInitialNumToRender(Platform.OS, mandatory.entries.length)}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews
          ListHeaderComponent={<View style={{ height: headerHeight }} />}
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

  if (isAdaptiveEmpty) {
    return (
      <View style={styles.flex}>
        {header}
        <View style={styles.centered}>
          <EmptyState icon="sparkles-outline" title="Şu an çalışılacak soru yok" />
          <PrimaryButton label="Öğrenme Merkezine Dön" onPress={goBack} />
        </View>
      </View>
    );
  }

  if (isAdaptiveComplete) {
    return (
      <View style={styles.flex}>
        {header}
        <View style={styles.centered}>
          <Ionicons name="sparkles-outline" size={56} color={colors.primary} />
          <Text style={styles.completionTitle}>Çalışma tamamlandı 🎉</Text>
          {/* Phase 68 — the SAME Phase 66 reflection the review session shows,
              built by the same builder from the same kind of receipt. It
              replaces a "Bugün N soru çözdün" line that came from the daily
              summary rather than from this session, and so described the day
              rather than the work just finished. */}
          <SessionReflectionCard reflection={adaptiveReflection} />
          {/* Stated plainly rather than quietly rounded away, exactly as the
              assignment session does: the student finished everything they
              could open. */}
          {adaptive.completion.unavailableCount > 0 ? (
            <Text style={styles.completionHint}>
              {adaptive.completion.unavailableCount} soru artık görüntülenemiyor, bu yüzden bu
              çalışma bu kadar.
            </Text>
          ) : null}
          <PrimaryButton label="Öğrenme Merkezine Dön" onPress={leaveAdaptiveCompletion} />
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
          {/* Stated plainly rather than quietly rounded away: the student
              finished everything they could open, and the shortfall against
              the teacher's count is not work they skipped. */}
          {assignmentCompletion && assignmentCompletion.unavailableCount > 0 ? (
            <Text style={styles.completionHint}>
              {assignmentCompletion.unavailableCount} soru artık görüntülenemiyor, bu yüzden ödevin
              tamamı bu kadar.
            </Text>
          ) : null}
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
            height={cardHeight}
            onOutcomeRecorded={(outcome, question, operationId) => {
              // recordStudyOutcome has ALREADY succeeded by the time this
              // fires (see StudySessionAdaptiveCard's own doc comment) —
              // recording assignment progress here never changes, delays,
              // or gates that outcome; it's a parallel, independent,
              // idempotent write (see useAssignmentSession.recordProgress).
              // The outcome is passed through so it can be frozen onto the
              // submission (Phase 31 — see questionOutcomes doc comment in
              // assignmentTypes.ts); it never feeds back into scheduling.
              if (isAssignmentMode) assignmentSession.recordProgress(question.id, outcome);
              // Phase 68 — the adaptive session's own confirmed receipt. The
              // operationId only exists because recordStudyOutcome already
              // resolved, so this can never record work the server refused.
              else adaptive.confirmOutcome(question, outcome, operationId);
              listRef.current?.scrollToOffset({
                offset: computeSessionScrollOffset(index + 1, cardHeight),
                animated: animateSessionScroll,
              });
            }}
            onSubmittingChange={(submitting) => handleSwipeSubmittingChange(item.id, submitting)}
          />
        )}
        getItemLayout={(_, index) => ({
          length: cardHeight,
          offset: computeSessionItemContentOffset(index, headerHeight, cardHeight),
          index,
        })}
        snapToOffsets={swipeSnapOffsets}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        initialNumToRender={resolveSessionInitialNumToRender(Platform.OS, swipeQuestions.length)}
        initialScrollIndex={isAssignmentMode ? undefined : adaptiveInitialIndex}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews
        ListHeaderComponent={<View style={{ height: headerHeight }} />}
      />
      {header}
    </View>
  );
}

const HEADER_HEIGHT = 48;

const styles = themedStyles(() => ({
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
}));
