import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { ChoiceLabel, QuestionChoices } from "@/types/question";

import { CHOICE_LABELS, evaluateChoice } from "../services/multipleChoice";

interface MultipleChoiceAnswerProps {
  choices: QuestionChoices;
  correctChoice: ChoiceLabel | null;
}

// Phase 21 — QuestionDetailScreen's optional multiple-choice answer UI.
// Rendered ONLY when the question actually has `choices` (QuestionDetailScreen
// itself decides that — see its own doc comment); every question without
// them renders completely unchanged, which is why this component doesn't
// need to handle the "no choices" case at all.
//
// Deliberately local UI state, nothing more: picking an option here never
// touches useStudyQuestionState/recordStudyOutcome/the review scheduler —
// this is "was this specific answer right", not "how did studying this
// question go" (that's RatingCard's job, in a completely different part of
// the app, and the two must never be confused).
export function MultipleChoiceAnswer({ choices, correctChoice }: MultipleChoiceAnswerProps) {
  const [selected, setSelected] = useState<ChoiceLabel | null>(null);

  const options = CHOICE_LABELS.filter((label) => Boolean(choices[label]));
  const evaluation = selected ? evaluateChoice(correctChoice, selected) : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Şıklar</Text>

      {options.map((label) => {
        const text = choices[label];
        const isSelected = selected === label;
        const isCorrectOption = correctChoice === label;
        // Once an answer has been picked, highlight the correct option too
        // (even if it wasn't the one picked) — "Doğru cevap: B" needs to be
        // visually anchored to the actual B row, not just stated in text.
        const showAsCorrect = selected !== null && isCorrectOption;
        const showAsWrongPick = isSelected && evaluation === "incorrect";

        return (
          <Pressable
            key={label}
            onPress={() => {
              if (selected === null) setSelected(label);
            }}
            disabled={selected !== null}
            style={[
              styles.option,
              showAsCorrect ? styles.optionCorrect : null,
              showAsWrongPick ? styles.optionWrong : null,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: selected !== null }}
            accessibilityLabel={`${label} şıkkı: ${text}`}
          >
            <Text style={styles.optionLetter}>{label}</Text>
            <Text style={styles.optionText}>{text}</Text>
          </Pressable>
        );
      })}

      {evaluation === "correct" ? (
        <View style={[styles.resultBanner, styles.resultBannerCorrect]}>
          <Text style={styles.resultTextCorrect}>✓ Doğru</Text>
        </View>
      ) : null}

      {evaluation === "incorrect" ? (
        <View style={[styles.resultBanner, styles.resultBannerWrong]}>
          <Text style={styles.resultTextWrong}>✕ Yanlış</Text>
          {correctChoice ? (
            <Text style={styles.resultCorrectAnswer}>
              Doğru cevap: {correctChoice}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  optionCorrect: {
    borderColor: colors.success,
    backgroundColor: colors.successMuted,
  },
  optionWrong: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerMuted,
  },
  optionLetter: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
    width: 22,
    textAlign: "center",
  },
  optionText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  resultBanner: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xxs,
  },
  resultBannerCorrect: {
    backgroundColor: colors.successMuted,
  },
  resultBannerWrong: {
    backgroundColor: colors.dangerMuted,
  },
  resultTextCorrect: {
    ...typography.bodyStrong,
    color: colors.success,
  },
  resultTextWrong: {
    ...typography.bodyStrong,
    color: colors.danger,
  },
  resultCorrectAnswer: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
