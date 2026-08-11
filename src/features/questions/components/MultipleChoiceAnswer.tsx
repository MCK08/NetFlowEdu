import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { ChoiceLabel, QuestionChoices } from "@/types/question";

import {
  createOnceGuard,
  mcResultToStudyOutcome,
  shouldReportMcOutcome,
} from "@features/study/services/multipleChoiceStudyBridge";
import { recordStudyOutcome } from "@features/study/services/studyService";

import { CHOICE_LABELS, evaluateChoice } from "../services/multipleChoice";

interface MultipleChoiceAnswerProps {
  choices: QuestionChoices;
  correctChoice: ChoiceLabel | null;
  // Phase 25 §13 — both optional and additive. Only when BOTH are provided
  // does picking an option also record a StudyOutcome (via the EXISTING
  // recordStudyOutcome — no new scheduler, no new write path); omitting
  // either (e.g. a teacher viewing their own posted question, where
  // isStudent is false, or any older call site that doesn't pass them at
  // all) keeps this component's behavior byte-identical to before this
  // phase: local Doğru/Yanlış UI only, no backend effect whatsoever.
  questionId?: string;
  isStudent?: boolean;
}

// Phase 21 — QuestionDetailScreen's optional multiple-choice answer UI.
// Rendered ONLY when the question actually has `choices` (QuestionDetailScreen
// itself decides that — see its own doc comment); every question without
// them renders completely unchanged, which is why this component doesn't
// need to handle the "no choices" case at all.
//
// Deliberately local UI state for the Doğru/Yanlış display itself — picking
// an option never touches useStudyQuestionState or RatingCard, and never
// invents a second scheduler. Phase 25 adds exactly one thing: reporting
// the SAME evaluation this component already shows on screen to the
// EXISTING recordStudyOutcome, via multipleChoiceStudyBridge.ts's pure
// correct/incorrect -> solved/struggled mapping — "was this answer right"
// and "how did studying this question go" are still conceptually distinct
// questions, but a right/wrong MC answer is now also a real, honest
// learning signal instead of a UI event nobody downstream ever sees.
export function MultipleChoiceAnswer({
  choices,
  correctChoice,
  questionId,
  isStudent,
}: MultipleChoiceAnswerProps) {
  const [selected, setSelected] = useState<ChoiceLabel | null>(null);
  // Guards against the exact same UI interaction recording an outcome
  // twice — e.g. a fast double-tap landing before `selected` state has
  // re-rendered the Pressable's own `disabled`. A ref (stable across
  // re-renders, correct synchronously) holding the same OnceGuard
  // primitive multipleChoiceStudyBridge.test.ts exercises directly.
  const guardRef = useRef(createOnceGuard());

  const options = CHOICE_LABELS.filter((label) => Boolean(choices[label]));
  const evaluation = selected ? evaluateChoice(correctChoice, selected) : null;

  function handleSelect(label: ChoiceLabel) {
    if (selected !== null) return;
    setSelected(label);

    if (!questionId || !shouldReportMcOutcome(questionId, isStudent)) return;
    if (!guardRef.current.shouldProceed()) return;

    const outcome = mcResultToStudyOutcome(evaluateChoice(correctChoice, label));
    // Fire-and-forget: this is a bonus learning signal alongside the
    // already-shown Doğru/Yanlış result, not the primary action — a
    // network failure here must never block or alter what the student
    // already sees on screen (same posture as StudyScreen's
    // refreshInsights() being best-effort after a recorded outcome).
    recordStudyOutcome(questionId, outcome).catch((err) => {
      if (__DEV__) console.log("[MC_STUDY_BRIDGE] recordStudyOutcome failed", err);
    });
  }

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
            onPress={() => handleSelect(label)}
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
