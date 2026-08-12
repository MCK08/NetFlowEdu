import { Image } from "expo-image";
import { memo, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { duration } from "@theme/animation";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Question } from "@/types/question";

import { StudyOutcome } from "../domain/studyTypes";
import { REVIEW_ADVANCE_DELAY_MS } from "../services/studyPresentation";
import { useStudyQuestionState } from "../hooks/useStudyQuestionState";
import { StudyOutcomeControls } from "./StudyOutcomeControls";
import { StudyOutcomeSuccessFlourish } from "./StudyOutcomeSuccessFlourish";

interface StudySessionAdaptiveCardProps {
  question: Question;
  height: number;
  onOutcomeRecorded: (outcome: StudyOutcome, question: Question) => void;
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
}: StudySessionAdaptiveCardProps) {
  const study = useStudyQuestionState({ questionId: question.id, enabled: true });
  const [showFlourish, setShowFlourish] = useState(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    };
  }, []);

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

      <View style={styles.controlsWrap}>
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
      </View>
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
  controlsWrap: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
