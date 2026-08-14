import { Image } from "expo-image";
import { memo, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { duration } from "@theme/animation";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Question } from "@/types/question";

import { StudyOutcome } from "../domain/studyTypes";
import { REVIEW_ADVANCE_DELAY_MS } from "../services/studyPresentation";
import { SESSION_CONTROLS_MAX_HEIGHT_RATIO } from "../services/studySessionLayout";
import { useStudyQuestionState } from "../hooks/useStudyQuestionState";
import { StudyOutcomeControls } from "./StudyOutcomeControls";
import { StudyOutcomeSuccessFlourish } from "./StudyOutcomeSuccessFlourish";

interface StudySessionAdaptiveCardProps {
  question: Question;
  height: number;
  onOutcomeRecorded: (outcome: StudyOutcome, question: Question) => void;
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
    const succeeded = await study.submit(outcome);
    if (!succeeded) return;
    setShowFlourish(true);
    dismissTimeoutRef.current = setTimeout(() => {
      dismissTimeoutRef.current = null;
      onOutcomeRecorded(outcome, question);
    }, REVIEW_ADVANCE_DELAY_MS);
  }

  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withTiming(1, { duration: duration.normal });
  }, [opacity]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.card, { height }, fadeStyle]}>
      <View style={styles.imageWrap}>
        <Image
          source={{ uri: question.imageUrl }}
          style={styles.image}
          contentFit="contain"
          transition={150}
          accessibilityIgnoresInvertColors
          accessibilityLabel="Soru görseli"
        />
      </View>

      {/* The image already shrinks to fit via imageWrap's flex: 1 — this
          ScrollView is the safety net for the OTHER direction: a
          pathologically long description (or a future added field) that
          would otherwise push "Tekrar Et"/"Zorlandım"/"Çözdüm" past the
          bottom of the fixed-height card with no way back to them. Capped
          at a fraction of the card's own height so the image can never be
          crushed to nothing by it; when content fits (the normal case) this
          renders and behaves exactly like a plain View — nothing scrolls,
          nothing about today's layout changes. */}
      <ScrollView
        style={[styles.controlsScroll, { maxHeight: Math.round(height * SESSION_CONTROLS_MAX_HEIGHT_RATIO) }]}
        contentContainerStyle={styles.controlsContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
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
      </ScrollView>
    </Animated.View>
  );
}

export const StudySessionAdaptiveCard = memo(StudySessionAdaptiveCardComponent);

const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: colors.background,
  },
  imageWrap: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
  },
  image: {
    flex: 1,
  },
  controlsScroll: {
    flexGrow: 0,
  },
  controlsContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
