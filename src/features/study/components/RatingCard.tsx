import { Image } from "expo-image";
import { memo, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { colors } from "@theme/colors";
import { duration } from "@theme/animation";
import { radius } from "@theme/radius";
import { shadows } from "@theme/shadows";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { Question } from "@/types/question";

import { StudyOutcome } from "../domain/studyTypes";
import { REVIEW_ADVANCE_DELAY_MS } from "../services/studyPresentation";
import { useStudyQuestionState } from "../hooks/useStudyQuestionState";
import { StudyOutcomeControls } from "./StudyOutcomeControls";
import { StudyOutcomeSuccessFlourish } from "./StudyOutcomeSuccessFlourish";
import { useThemeSubscription } from "@theme/ThemeProvider";

const VISIBLE_OUTCOMES = ["struggled", "solved"] as const;
// Spec: ~15-20px blur on the backdrop.
const BACKDROP_BLUR_RADIUS = 18;

interface RatingCardProps {
  question: Question;
  height: number;
  isStudent: boolean;
  // Fires once the mutation is CONFIRMED successful and the brief success
  // flourish has finished — the parent screen's job at that point is
  // purely mechanical: splice a reshow pair if this was "struggled", and
  // scroll to this card's own index + 1. No timers or pending state live
  // above this component; the card owns its own full lifecycle.
  onOutcomeRecorded: (outcome: StudyOutcome, question: Question) => void;
}

// Phase 19.2 — the interstitial rating "screen" as a real feed item (see
// feedItems.ts's module doc for the full architecture). Self-contained: it
// hydrates and mutates its OWN study state for its OWN `question` prop —
// there is no shared "which question is being rated" state anywhere above
// it, which is what makes this immune to the swipe-timing races the
// overlay-based Phase 19 and 19.1 revisions had.
function RatingCardComponent({ question, height, isStudent, onOutcomeRecorded }: RatingCardProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  const study = useStudyQuestionState({ questionId: question.id, enabled: isStudent });
  const [showFlourish, setShowFlourish] = useState(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    };
  }, []);

  async function handleSelect(outcome: StudyOutcome) {
    const succeeded = (await study.submit(outcome)) !== null;
    // A failed write already surfaces via study.mutationError under the
    // buttons — stay put so the student can see the error and retry,
    // rather than advancing past a review that was never actually saved.
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
      {/* Same question's own image, blurred — visual continuity with the
          card the student just left (this literally IS that question,
          one item later in the feed), per the "arkadaki soru kalacak"
          product intent. */}
      <Image
        source={{ uri: question.imageUrl }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        blurRadius={BACKDROP_BLUR_RADIUS}
        accessibilityIgnoresInvertColors
      />
      {/* Cool-toned ("buz mavisi") dark tint on top of the blur, for
          legibility and the iOS-glass feel the spec asks for. */}
      <View style={styles.tint} />

      <View style={styles.centerWrap}>
        <View style={[styles.glassCard, shadows.lg]}>
          <Text style={styles.sparkle}>✨</Text>
          <StudyOutcomeControls
            item={study.item}
            isHydrating={study.isHydrating}
            hydrationError={study.hydrationError}
            pendingOutcome={study.pendingOutcome}
            onSelect={handleSelect}
            mutationError={study.mutationError}
            showLastOutcome={false}
            visibleOutcomes={VISIBLE_OUTCOMES}
          />
          <Text style={styles.subtitle}>Cevabın çalışma planını geliştirmek için kullanılacak.</Text>
          <StudyOutcomeSuccessFlourish visible={showFlourish} />
        </View>
      </View>
    </Animated.View>
  );
}

export const RatingCard = memo(RatingCardComponent);

const styles = themedStyles(() => ({
  card: {
    width: "100%",
    backgroundColor: colors.textPrimary,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    // A cool, icy tint rather than pure black — "buz mavisi / beyaz glass
    // effect" from the spec, kept dark enough for the white card to read
    // as elevated above it.
    backgroundColor: "rgba(15, 26, 46, 0.45)",
  },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  glassCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    // iOS HIG "glass" card: translucent white over the blurred backdrop
    // rather than a fully opaque sheet, plus a hairline light border for
    // the frosted-edge look.
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
  },
  sparkle: {
    fontSize: 28,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
}));
