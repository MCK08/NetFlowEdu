import { Ionicons } from "@expo/vector-icons";
import { router, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  LayoutChangeEvent,
  Platform,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomActionSheet } from "@components/ui/BottomActionSheet";
import { EmptyState } from "@components/ui/EmptyState";
import { IconButton } from "@components/ui/IconButton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { AppBackButton } from "@components/ui/AppBackButton";
import { ROUTES } from "@constants/routes";
import { useBackNavigation } from "@hooks/useBackNavigation";
import { useClassRoom } from "@features/classes/hooks/useClassRoom";
import { formatFeedPosition } from "@features/classes/services/classFeedPagination";
import { useAuth } from "@features/authentication";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { minTouchTarget, stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { Question } from "@/types/question";

import { AssignmentSessionContext } from "@features/assignments/components/AssignmentSessionContext";
import { useAssignmentSession } from "@features/assignments/hooks/useAssignmentSession";
import { computeAssignmentProgress } from "@features/assignments/services/assignmentProgress";
import { resolveAssignmentSessionCompletion } from "@features/assignments/services/assignmentSessionCompletion";
import {
  ASSIGNMENT_COMPLETE_TITLE,
  ASSIGNMENT_EMPTY_TITLE,
  ASSIGNMENT_INFO_LABEL,
  ASSIGNMENT_START_LABEL,
  assignmentCompletionLine,
  assignmentProgressAccessibilityLabel,
  assignmentSessionProgressLabel,
  buildAssignmentSessionIdentity,
  RETURN_TO_STUDY_LABEL,
  shouldOpenOnAssignmentIntro,
} from "@features/assignments/services/assignmentSessionPresentation";

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
  resolveSessionHeaderHeight,
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

// Phase 129 — the two assignment states a student can reach from a stale
// link. Exported so the copy is pinned in one place.
export const ASSIGNMENT_UNAVAILABLE_TITLE = "Bu çalışma şu an açık değil";
export const ASSIGNMENT_GONE_TITLE = "Bu çalışma artık mevcut değil";

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
  const { height: windowHeight, fontScale } = useWindowDimensions();
  // Phase 130 — at the accessibility text sizes the header's title moves onto
  // its own line (the app's one stacking threshold), and the header's real
  // height is measured so the cards below can follow it. See
  // resolveSessionHeaderHeight for why the default size is left exactly as it was.
  const isHeaderStacked = fontScale >= stackAtFontScale;
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState<number | null>(null);
  const handleHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    setMeasuredHeaderHeight((previous) =>
      previous !== null && Math.abs(previous - next) < 0.5 ? previous : next,
    );
  }, []);
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
  const headerHeight = resolveSessionHeaderHeight({
    insetsTop: insets.top,
    reservedHeight: HEADER_HEIGHT,
    designedHeight: HEADER_DESIGNED_HEIGHT,
    measuredHeight: measuredHeaderHeight,
  });
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

  const goBack = useBackNavigation(ROUTES.studentStudy);
  // Phase 130 — "Çalış'a Dön" goes to Çalış, wherever the assignment was
  // opened from (the class page, Akış, a plan step). dismissTo returns to the
  // tab screen the student stack already holds; navigate to a different route
  // in this stack would push a second copy of the tabs on top of the finished
  // session, leaving it one swipe back.
  const returnToStudy = useCallback(() => router.dismissTo(ROUTES.studentStudy as never), []);

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
  // Phase 129 — an assignment that was deleted, or that this student was never
  // sent (a draft) or that was withdrawn (archived), opened from a stale link.
  // Neither is "no valid questions", and neither is an error worth retrying.
  const isAssignmentGone = isAssignmentMode && assignmentSession.notFound;
  const isAssignmentUnavailable = isAssignmentMode && assignmentSession.unavailable;

  // Phase 130 — which assignment this is. useAssignmentSession only hands the
  // document over once it is confirmed delivered, so a closed or deleted one
  // has no identity and reads no class.
  const deliveredAssignment = isAssignmentMode ? assignmentSession.assignment : null;
  // The class's name, for "10. sınıf · Demo Sınıfı": one get of the class
  // document (Phase 126's useClassRoom), never a listener, and only while the
  // introduction or "Çalışma bilgileri" can still show it — a finished or an
  // empty assignment reads nothing. Until it resolves, or when it cannot (a
  // student since removed from the class), the line simply has no class name.
  const assignmentClass = useClassRoom(
    deliveredAssignment && !isAssignmentComplete && !isAssignmentEmpty ? deliveredAssignment.classId : undefined,
  );
  const assignmentIdentity = deliveredAssignment
    ? buildAssignmentSessionIdentity({
        assignment: deliveredAssignment,
        className: assignmentClass?.name ?? null,
        now: Date.now(),
      })
    : null;
  // An assignment with nothing recorded opens on its introduction; "Başla"
  // only leaves it. Nothing is written by either, so the session's progress,
  // its order and its resume are exactly what they were.
  const [isAssignmentIntroDismissed, setIsAssignmentIntroDismissed] = useState(false);
  const showAssignmentIntro =
    assignmentIdentity !== null &&
    assignmentProgress !== null &&
    !isAssignmentIntroDismissed &&
    !isAssignmentComplete &&
    !isAssignmentEmpty &&
    shouldOpenOnAssignmentIntro(assignmentProgress);
  // The questions are on screen: the only state whose header carries the
  // assignment's progress and its "Çalışma bilgileri".
  const isSolvingAssignment =
    assignmentIdentity !== null &&
    !assignmentSession.isLoading &&
    !assignmentSession.error &&
    !isAssignmentComplete &&
    !isAssignmentEmpty &&
    !showAssignmentIntro;
  const [isAssignmentInfoOpen, setIsAssignmentInfoOpen] = useState(false);

  const headerProgress =
    mode === "mandatory" && !isMandatoryComplete ? (
      <Text style={styles.headerProgress}>{formatFeedPosition(mandatory.index, mandatory.total)}</Text>
    ) : mode === "adaptive" && !isAdaptiveComplete && !isAdaptiveEmpty ? (
      // Phase 68 — a real fraction, now that the denominator is fixed for
      // the life of the session. Before the plan was frozen this could only
      // ever be a shrinking count of cards left, which is why it was one.
      <Text style={styles.headerProgress}>
        {adaptive.completion.confirmedCount} / {adaptive.completion.answerableCount}
      </Text>
    ) : isSolvingAssignment && assignmentProgress ? (
      // Phase 130 — read as a sentence, never as "2 bölü 5".
      <Text
        style={styles.headerProgress}
        accessibilityLabel={assignmentProgressAccessibilityLabel(assignmentProgress)}
      >
        {assignmentProgress.completedCount} / {assignmentProgress.targetCount}
      </Text>
    ) : null;
  // Phase 130 — the assignment's title, its deadline and the teacher's
  // instruction stay one tap away for the whole session, not only before the
  // first question.
  const headerInfo = isSolvingAssignment ? (
    <IconButton
      icon="information-circle-outline"
      onPress={() => setIsAssignmentInfoOpen(true)}
      accessibilityLabel={ASSIGNMENT_INFO_LABEL}
      color={colors.textSecondary}
    />
  ) : null;
  // "Çalışma" is the student's word for an assignment everywhere else in the
  // app; "Ödev" is retired.
  const headerTitle = (
    <Text style={[styles.headerTitle, isHeaderStacked ? styles.headerTitleStacked : null]} accessibilityRole="header">
      {mode === "mandatory" ? "Tekrar" : "Çalışma"}
    </Text>
  );

  // One row of controls in every size; at the accessibility sizes the title
  // leaves it for its own full-width line underneath.
  const header = (
    <View onLayout={handleHeaderLayout} style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
      <View style={styles.headerRow}>
        <AppBackButton fallbackHref={ROUTES.studentStudy} onPress={goBack} size="lg" style={styles.backButton} />
        {isHeaderStacked ? <View style={styles.headerSpacer} /> : headerTitle}
        {headerProgress}
        {headerInfo}
      </View>
      {isHeaderStacked ? headerTitle : null}
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

  // Phase 129 — permanent: no retry, only the way back.
  if (isAssignmentGone) {
    return (
      <View style={styles.flex}>
        {header}
        <View style={styles.centered}>
          <EmptyState icon="document-outline" title={ASSIGNMENT_GONE_TITLE} />
          <PrimaryButton label="Geri Dön" onPress={goBack} />
        </View>
      </View>
    );
  }

  // Phase 129 — not this student's to solve: no card, no submission, no
  // progress. The teacher has not sent it, or has withdrawn it.
  if (isAssignmentUnavailable) {
    return (
      <View style={styles.flex}>
        {header}
        <View style={styles.centered}>
          <EmptyState icon="lock-closed-outline" title={ASSIGNMENT_UNAVAILABLE_TITLE} />
          <PrimaryButton label="Geri Dön" onPress={goBack} />
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
          <EmptyState icon="document-text-outline" title={ASSIGNMENT_EMPTY_TITLE} />
          <PrimaryButton label="Geri Dön" onPress={goBack} />
        </View>
      </View>
    );
  }

  // Phase 130 — the WHOLE assignment is done, not this visit: an assignment
  // can be finished across several days, so everything here comes from the
  // submission (the canonical count) and the assignment itself. There is no
  // summary of this visit's outcomes, no score and no percentage — a question
  // counts as complete whatever the student recorded for it.
  if (isAssignmentComplete) {
    return (
      <View style={styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.completionContent,
            { paddingTop: headerHeight + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Decorative: the title says it. */}
          <Ionicons
            name="checkmark-done-circle-outline"
            size={56}
            color={colors.success}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={styles.completionTitle} accessibilityRole="header">
            {ASSIGNMENT_COMPLETE_TITLE}
          </Text>
          {assignmentIdentity ? (
            <View style={styles.completionIdentity}>
              <Text style={styles.completionAssignmentTitle}>{assignmentIdentity.title}</Text>
              {assignmentIdentity.subjectLine ? (
                <Text style={styles.completionSubtitle}>{assignmentIdentity.subjectLine}</Text>
              ) : null}
            </View>
          ) : null}
          {assignmentProgress ? (
            <Text style={styles.completionSubtitle}>{assignmentCompletionLine(assignmentProgress)}</Text>
          ) : null}
          {/* Stated plainly rather than quietly rounded away: the student
              finished everything they could open, and the shortfall against
              the teacher's count is not work they skipped. */}
          {assignmentCompletion && assignmentCompletion.unavailableCount > 0 ? (
            <Text style={styles.completionHint}>
              {assignmentCompletion.unavailableCount} soru artık görüntülenemiyor, bu yüzden çalışmanın
              tamamı bu kadar.
            </Text>
          ) : null}
          <PrimaryButton label={RETURN_TO_STUDY_LABEL} onPress={returnToStudy} />
        </ScrollView>
        {header}
      </View>
    );
  }

  // Phase 130 — an assignment the student has not started opens on what it
  // is: its title, what it covers, its deadline, how many questions it has and
  // the teacher's own note. A separate state of this same screen, not a page
  // in the list, so the swipe geometry, the question order and the resume
  // position are untouched; a started assignment never comes back here.
  if (showAssignmentIntro && assignmentIdentity && assignmentProgress) {
    return (
      <View style={styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.introContent, { paddingTop: headerHeight + spacing.lg }]}
          showsVerticalScrollIndicator={false}
        >
          <AssignmentSessionContext
            identity={assignmentIdentity}
            progressLabel={assignmentSessionProgressLabel(assignmentProgress)}
          />
        </ScrollView>
        <View style={[styles.introFooter, { paddingBottom: insets.bottom + spacing.md }]}>
          <PrimaryButton
            label={ASSIGNMENT_START_LABEL}
            onPress={() => setIsAssignmentIntroDismissed(true)}
            accessibilityHint="İlk soruyu açar"
          />
        </View>
        {header}
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
      {isSolvingAssignment && assignmentIdentity && assignmentProgress ? (
        <BottomActionSheet visible={isAssignmentInfoOpen} onClose={() => setIsAssignmentInfoOpen(false)}>
          <View style={styles.infoSheet}>
            {/* Bounded and scrollable: the teacher's note can be 300
                characters, and at the largest text size that is taller than
                the screen. */}
            <ScrollView style={{ maxHeight: Math.round(windowHeight * 0.6) }} showsVerticalScrollIndicator={false}>
              <AssignmentSessionContext
                identity={assignmentIdentity}
                progressLabel={assignmentSessionProgressLabel(assignmentProgress)}
              />
            </ScrollView>
            <PrimaryButton label="Kapat" variant="secondary" onPress={() => setIsAssignmentInfoOpen(false)} />
          </View>
        </BottomActionSheet>
      ) : null}
    </View>
  );
}

const HEADER_HEIGHT = 48;
// What the header actually draws below the safe-area inset at the default text
// size: its 44pt back button inside 8pt of padding above and below. See
// resolveSessionHeaderHeight.
const HEADER_DESIGNED_HEIGHT = spacing.xs * 2 + minTouchTarget;

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
  // Phase 130 — a column holding the row of controls, so that at the
  // accessibility sizes the title can take the full width beneath them and
  // never break mid-word in the space left between a back button and a
  // progress pill. At the default size the row is its only child, laid out
  // exactly as the header itself used to be.
  header: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  headerSpacer: {
    flex: 1,
  },
  backButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
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
  // In the stacked column `flex: 1` would mean a zero flex-basis in an
  // auto-height parent; the title sizes to its own text instead.
  headerTitleStacked: {
    flex: 0,
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
  // Centred when it fits, scrollable when the largest text size makes it
  // taller than the screen — the CTA can never end up out of reach.
  completionContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  completionIdentity: {
    alignItems: "center",
    gap: spacing.xxs,
  },
  completionAssignmentTitle: {
    ...typography.cardTitle,
    color: colors.textPrimary,
    textAlign: "center",
  },
  introContent: {
    width: "100%",
    maxWidth: contentWidth.readable,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  // Pinned under the scroll, so "Başla" is reachable without scrolling past a
  // long teacher's note.
  introFooter: {
    width: "100%",
    maxWidth: contentWidth.readable,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  infoSheet: {
    gap: spacing.lg,
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
