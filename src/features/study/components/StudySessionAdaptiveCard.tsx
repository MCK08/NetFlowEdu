import { Image } from "expo-image";
import { memo, useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { duration } from "@theme/animation";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Question } from "@/types/question";

import { StudyOutcome } from "../domain/studyTypes";
import { REVIEW_ADVANCE_DELAY_MS } from "../services/studyPresentation";
import { SESSION_IMAGE_MAX_HEIGHT_RATIO } from "../services/studySessionLayout";
import { useStudyQuestionState } from "../hooks/useStudyQuestionState";
import { StudyAnswerButton } from "./StudyAnswerButton";
import { StudyOutcomeCard } from "./StudyOutcomeCard";
import { StudyOutcomeControls } from "./StudyOutcomeControls";
import { StudyOutcomeSuccessFlourish } from "./StudyOutcomeSuccessFlourish";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface StudySessionAdaptiveCardProps {
  question: Question;
  height: number;
  // Phase 68 — the confirmed operationId is passed through because the
  // adaptive session's completion contract and its receipt are both keyed on
  // it. It exists only because the write already succeeded, so the screen
  // cannot mistake an attempt for an outcome.
  onOutcomeRecorded: (outcome: StudyOutcome, question: Question, operationId: string) => void;
  // Mirrors PhotoAnswerForm's onUploadingChange (Phase 24): this card's
  // useStudyQuestionState is entirely self-contained, so the screen has no
  // other way to know a submission is in flight for the visible card —
  // needed for StudySessionScreen's exit guard (studySessionExitGuard.ts).
  onSubmittingChange?: (isSubmitting: boolean) => void;
}

// Phase 28 — one page of the ADAPTIVE (free/"Çalışmaya Devam Et") study
// session's vertical swipe feed. Self-contained, same reasoning as
// RatingCard: each adaptive question is its own independent study action,
// not part of one shared queue/pagination state the way the mandatory
// session's due queue is — so it owns its own useStudyQuestionState
// exactly like RatingCard already does for the main Feed's rating card.
// The only real difference from RatingCard is layout: the question image
// is fully visible here (this IS the question, not an interstitial after
// one), with the outcome controls directly underneath.
function StudySessionAdaptiveCardComponent({
  question,
  height,
  onOutcomeRecorded,
  onSubmittingChange,
}: StudySessionAdaptiveCardProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  const study = useStudyQuestionState({ questionId: question.id, enabled: true });
  const [showFlourish, setShowFlourish] = useState(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    };
  }, []);

  // pendingOutcome is non-null for exactly the network round-trip
  // (useStudyQuestionState's submit sets it before the await, clears it in
  // `finally`) — the same "in flight" window AnswerScreen's isUploading
  // guards for photo/drawing submissions.
  useEffect(() => {
    onSubmittingChange?.(study.pendingOutcome !== null);
  }, [study.pendingOutcome, onSubmittingChange]);

  async function handleSelect(outcome: StudyOutcome) {
    const operationId = await study.submit(outcome);
    if (!operationId) return;
    setShowFlourish(true);
    dismissTimeoutRef.current = setTimeout(() => {
      dismissTimeoutRef.current = null;
      onOutcomeRecorded(outcome, question, operationId);
    }, REVIEW_ADVANCE_DELAY_MS);
  }

  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withTiming(1, { duration: duration.normal });
  }, [opacity]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // Phase 37 — root cause of the photo dominating the screen: imageWrap
  // used flex: 1 inside this fixed-height page, so it filled EVERY pixel
  // the (usually much smaller) outcome section didn't need — a portrait
  // photo in a box that tall reads as "the whole screen is the photo",
  // exactly the reported screenshot. The Study Hub's own queue card
  // (StudyQueueCard, the reference design) never does this: its image is a
  // small, bounded box INSIDE the same card as the outcome controls, not a
  // separate flex-filled hero above them. This mirrors that structure
  // exactly: one ScrollView (the whole page can scroll, per the design
  // audit — "fotoğraf yüksekliği içeriğin doğal bir parçası olmalı"), one
  // StudyOutcomeCard containing the image (capped height, never flex-fills
  // leftover space) then the description then the outcome controls, read as
  // one cohesive card exactly like StudyQueueCard's own [image, meta,
  // controls] structure — not an image floating above a separate button box.
  const imageMaxHeight = Math.round(height * SESSION_IMAGE_MAX_HEIGHT_RATIO);

  return (
    <Animated.View style={[styles.page, { height }, fadeStyle]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <StudyOutcomeCard>
          {/* contentFit="contain" + a capped, NON-flex box: the photo is
              never cropped or stretched (its own aspect ratio always wins
              inside this box) and never allowed to balloon past a sane
              share of the screen either. */}
          <View style={[styles.imageWrap, { maxHeight: imageMaxHeight }]}>
            <Image
              source={{ uri: question.imageUrl }}
              style={styles.image}
              contentFit="contain"
              transition={150}
              accessibilityIgnoresInvertColors
              accessibilityLabel="Soru görseli"
            />
          </View>
          <StudyAnswerButton questionId={question.id} visibility={question.visibility} />
          {question.description ? <Text style={styles.description}>{question.description}</Text> : null}
          <StudyOutcomeControls
            item={study.item}
            isHydrating={study.isHydrating}
            hydrationError={study.hydrationError}
            pendingOutcome={study.pendingOutcome}
            onSelect={handleSelect}
            mutationError={study.mutationError}
            showLastOutcome={false}
          />
          <StudyOutcomeSuccessFlourish visible={showFlourish} />
        </StudyOutcomeCard>
      </ScrollView>
    </Animated.View>
  );
}

export const StudySessionAdaptiveCard = memo(StudySessionAdaptiveCardComponent);

const styles = themedStyles(() => ({
  page: {
    width: "100%",
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
  },
  imageWrap: {
    width: "100%",
    // Taller than square (most question photos — handwritten work shot
    // portrait, like a notebook page — are themselves taller than wide);
    // contentFit="contain" on the Image always shows the real photo
    // un-cropped regardless, this just gives it more natural room before
    // the maxHeight cap above ever has to letterbox it.
    aspectRatio: 0.78,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
  },
}));
