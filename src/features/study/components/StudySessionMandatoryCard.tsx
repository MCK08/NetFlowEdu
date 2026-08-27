import { Image } from "expo-image";
import { memo } from "react";
import { ScrollView, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { StudyOutcome } from "../domain/studyTypes";
import { ResolvedQueueEntry } from "../services/studyService";
import { toHydratedStudyItem } from "../services/studyItemParser";
import { SESSION_IMAGE_MAX_HEIGHT_RATIO } from "../services/studySessionLayout";
import { StudyAnswerButton } from "./StudyAnswerButton";
import { StudyOutcomeCard } from "./StudyOutcomeCard";
import { StudyOutcomeControls } from "./StudyOutcomeControls";
import { StudyOutcomeSuccessFlourish } from "./StudyOutcomeSuccessFlourish";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface StudySessionMandatoryCardProps {
  entry: ResolvedQueueEntry;
  height: number;
  pendingOutcome: StudyOutcome | null;
  mutationError: string | null;
  justSucceeded: boolean;
  onSelectOutcome: (questionId: string, outcome: StudyOutcome) => void;
}

// Phase 28 — one page of the mandatory review session's vertical swipe
// feed. Deliberately CONTROLLED, not self-contained (unlike RatingCard):
// useReviewSession already owns the one true pendingOutcome/actionError/
// totals state for the whole session (its own idempotency/dedupe
// guarantees depend on staying the single source of truth), so this card
// only renders what that hook already computed — it never runs its own
// useStudyQuestionState, never calls recordStudyOutcome itself.
function StudySessionMandatoryCardComponent({
  entry,
  height,
  pendingOutcome,
  mutationError,
  justSucceeded,
  onSelectOutcome,
}: StudySessionMandatoryCardProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  const { item, question } = entry;

  if (!question) {
    return (
      <View style={[styles.page, { height }]}>
        <View style={styles.unavailable}>
          <Text style={styles.unavailableTitle}>Bu soruya artık erişilemiyor.</Text>
          <Text style={styles.unavailableDescription}>
            Soru silinmiş veya erişimin kaldırılmış olabilir.
          </Text>
        </View>
      </View>
    );
  }

  // Phase 37 — same structure as StudySessionAdaptiveCard's identical
  // fix (see that component's doc comment for the full root-cause story):
  // one ScrollView, one StudyOutcomeCard containing [capped image,
  // description, outcome controls] as ONE cohesive card, exactly mirroring
  // the Study Hub's own reference queue card instead of a flex-filled hero
  // image with a separate button box floating below it.
  const imageMaxHeight = Math.round(height * SESSION_IMAGE_MAX_HEIGHT_RATIO);

  return (
    <View style={[styles.page, { height }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <StudyOutcomeCard>
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
            item={toHydratedStudyItem(item)}
            isHydrating={false}
            pendingOutcome={pendingOutcome}
            onSelect={(outcome) => onSelectOutcome(item.questionId, outcome)}
            mutationError={mutationError}
            showLastOutcome={false}
          />
          <StudyOutcomeSuccessFlourish visible={justSucceeded} />
        </StudyOutcomeCard>
      </ScrollView>
    </View>
  );
}

export const StudySessionMandatoryCard = memo(StudySessionMandatoryCardComponent);

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
    // Taller than square — see StudySessionAdaptiveCard's identical style
    // for the full reasoning.
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
  unavailable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  unavailableTitle: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
    textAlign: "center",
  },
  unavailableDescription: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },
}));
