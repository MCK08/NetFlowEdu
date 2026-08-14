import { Image } from "expo-image";
import { memo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { StudyOutcome } from "../domain/studyTypes";
import { ResolvedQueueEntry } from "../services/studyService";
import { toHydratedStudyItem } from "../services/studyItemParser";
import { SESSION_CONTROLS_MAX_HEIGHT_RATIO } from "../services/studySessionLayout";
import { StudyOutcomeCard } from "./StudyOutcomeCard";
import { StudyOutcomeControls } from "./StudyOutcomeControls";
import { StudyOutcomeSuccessFlourish } from "./StudyOutcomeSuccessFlourish";

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
  const { item, question } = entry;

  if (!question) {
    return (
      <View style={[styles.card, { height }]}>
        <View style={styles.unavailable}>
          <Text style={styles.unavailableTitle}>Bu soruya artık erişilemiyor.</Text>
          <Text style={styles.unavailableDescription}>
            Soru silinmiş veya erişimin kaldırılmış olabilir.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { height }]}>
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

      {/* Same reasoning as StudySessionAdaptiveCard's identical block: the
          image already shrinks to fit via imageWrap's flex: 1; this
          ScrollView guarantees the outcome buttons stay reachable even if
          the description is pathologically long, capped so the image can
          never be crushed to nothing by it. Behaves like a plain View
          (nothing scrolls) whenever content already fits. StudyOutcomeCard
          is the same "master" design as the Study Hub's own queue card —
          see that component's doc comment. */}
      <ScrollView
        style={[styles.controlsScroll, { maxHeight: Math.round(height * SESSION_CONTROLS_MAX_HEIGHT_RATIO) }]}
        contentContainerStyle={styles.controlsContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <StudyOutcomeCard>
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
});
