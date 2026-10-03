import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo, useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { AssignmentQuestionEntry } from "../hooks/useAssignmentQuestions";

// The same fallback words the answer-review queue uses for a question that is
// an image with no written prompt — which is what most questions here are.
export const IMAGE_ONLY_QUESTION_LABEL = "Görsel soru";
export const MISSING_QUESTION_LABEL = "Bu soru artık görüntülenemiyor";

const THUMBNAIL = 64;

interface QuestionRowProps {
  index: number;
  entry: AssignmentQuestionEntry;
  stacked: boolean;
}

// Phase 128 — what was asked, in the order it was assigned.
//
// A question in this product is an image, with an optional written prompt
// (`description`) — there is no question-text field and no difficulty field,
// so neither is shown or guessed. Each row is the assigned position, the
// image, and the prompt when the teacher wrote one. A question deleted or no
// longer readable since the assignment was made still occupies its position:
// the assignment's id list is a snapshot, and quietly closing the gap would
// renumber every question after it.
//
// Preview only. Nothing here is graded, timed or compared, and no row opens
// anything — this is the teacher checking content, not solving it.
const QuestionRow = memo(function QuestionRow({ index, entry, stacked }: QuestionRowProps) {
  useThemeSubscription();
  const [imageFailed, setImageFailed] = useState(false);
  const question = entry.question;
  const prompt = question ? question.description?.trim() || IMAGE_ONLY_QUESTION_LABEL : MISSING_QUESTION_LABEL;
  const position = `${index + 1}. soru`;

  return (
    <View
      style={[styles.row, stacked ? styles.rowStacked : null]}
      accessible
      accessibilityLabel={`${position}. ${prompt}`}
    >
      <View style={styles.index}>
        <Text style={styles.indexText}>{index + 1}</Text>
      </View>
      {question && !imageFailed ? (
        <Image
          source={{ uri: question.imageUrl }}
          style={styles.thumbnail}
          contentFit="cover"
          transition={150}
          onError={() => setImageFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailFallback]}>
          <Ionicons
            name={question ? "image-outline" : "help-circle-outline"}
            size={iconSize.md}
            color={colors.textTertiary}
            accessibilityElementsHidden
          />
        </View>
      )}
      <Text style={[styles.prompt, stacked ? styles.promptStacked : null, question ? null : styles.promptMissing]}>
        {prompt}
      </Text>
    </View>
  );
});

interface AssignmentQuestionListProps {
  entries: readonly AssignmentQuestionEntry[];
}

export const AssignmentQuestionList = memo(function AssignmentQuestionList({ entries }: AssignmentQuestionListProps) {
  useThemeSubscription();
  const { fontScale } = useWindowDimensions();
  // Past the accessibility sizes a prompt beside a 64pt image has a third of
  // the width to wrap into; it goes under the image instead.
  const stacked = fontScale >= stackAtFontScale;

  return (
    <View style={styles.list}>
      {entries.map((entry, index) => (
        <QuestionRow key={`${entry.questionId}-${index}`} index={index} entry={entry} stacked={stacked} />
      ))}
    </View>
  );
});

const styles = themedStyles(() => ({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  rowStacked: {
    flexDirection: "column",
  },
  // Grows with the digit rather than clipping it: a minimum, never a height.
  index: {
    minWidth: 28,
    minHeight: 28,
    paddingHorizontal: spacing.xxs,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryMuted,
  },
  indexText: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.primary,
  },
  thumbnail: {
    width: THUMBNAIL,
    height: THUMBNAIL,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  thumbnailFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  prompt: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  // Stacked, `flex: 1` would give the text a zero flex-basis inside a column
  // that is sized BY its children — it would collapse to nothing. The column's
  // own width is the measure instead.
  promptStacked: {
    flex: 0,
    alignSelf: "stretch",
  },
  promptMissing: {
    color: colors.textTertiary,
  },
}));
