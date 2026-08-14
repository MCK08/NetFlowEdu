import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Badge } from "@components/ui/Badge";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { StudyOutcome } from "../domain/studyTypes";
import { ResolvedQueueEntry } from "../services/studyService";
import { studyStatusLabel } from "../services/studyPresentation";
import { toHydratedStudyItem } from "../services/studyItemParser";
import { StudyOutcomeCard } from "./StudyOutcomeCard";
import { StudyOutcomeControls } from "./StudyOutcomeControls";

interface StudyQueueCardProps {
  entry: ResolvedQueueEntry;
  onOpen: (questionId: string) => void;
  onSelectOutcome: (outcome: StudyOutcome) => void;
  pendingOutcome: StudyOutcome | null;
  error?: string | null;
}

// One review card. When the underlying question is gone (deleted, or the
// student lost class access — resolveQueueEntries returns question: null
// for both) the card degrades to an explicit, non-crashing notice instead
// of disappearing silently or rendering a broken image.
export const StudyQueueCard = memo(function StudyQueueCard({
  entry,
  onOpen,
  onSelectOutcome,
  pendingOutcome,
  error,
}: StudyQueueCardProps) {
  const { item, question } = entry;

  if (!question) {
    return (
      <StudyOutcomeCard style={styles.unavailableCard}>
        <Ionicons name="alert-circle-outline" size={20} color={colors.textTertiary} />
        <View style={styles.unavailableText}>
          <Text style={styles.unavailableTitle}>Bu soru artık görüntülenemiyor</Text>
          <Text style={styles.unavailableDescription}>
            Soru silinmiş veya erişimin kaldırılmış olabilir.
          </Text>
        </View>
      </StudyOutcomeCard>
    );
  }

  return (
    <StudyOutcomeCard>
      <AnimatedPressable
        onPress={() => onOpen(question.id)}
        style={styles.preview}
        accessibilityRole="button"
        accessibilityLabel="Soruyu aç"
        accessibilityHint="Sorunun tüm ayrıntılarını ve cevapları açar"
      >
        <Image
          source={{ uri: question.imageUrl }}
          style={styles.image}
          contentFit="cover"
          transition={150}
          accessibilityIgnoresInvertColors
        />
        <View style={styles.previewMeta}>
          <Badge label={studyStatusLabel(item.status)} variant="primary" />
          {question.subject ? (
            <Text style={styles.subject} numberOfLines={1}>
              {question.subject}
            </Text>
          ) : null}
        </View>
      </AnimatedPressable>

      {/* One control, one wording. This card previously asked "Bu soruyu
          şimdi nasıl çözdün?" while every other surface asked "Bu soruyu
          nasıl çözdün?" — the same question phrased two ways. */}
      <StudyOutcomeControls
        item={toHydratedStudyItem(item)}
        isHydrating={false}
        pendingOutcome={pendingOutcome}
        onSelect={onSelectOutcome}
        mutationError={error}
        showLastOutcome={false}
      />
    </StudyOutcomeCard>
  );
});

const styles = StyleSheet.create({
  preview: {
    gap: spacing.xs,
  },
  image: {
    width: "100%",
    height: 180,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  previewMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  subject: {
    ...typography.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
  unavailableCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surface,
  },
  unavailableText: {
    flex: 1,
    gap: 2,
  },
  unavailableTitle: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
  unavailableDescription: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
