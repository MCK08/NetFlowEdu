import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { Checkbox } from "@components/ui/Checkbox";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { ChoiceLabel, QuestionChoiceFeedback, QuestionChoices } from "@/types/question";

import { GRADE_LEVELS, getTopicsForSubject, QUESTION_SUBJECTS } from "../data/questionTaxonomy";
import { buildChoicesPayload, CHOICE_LABELS } from "../services/multipleChoice";
import { MAX_HINT_LENGTH, MAX_QUESTION_HINTS, sanitizeHints } from "../services/questionHints";
import {
  MAX_CHOICE_FEEDBACK_LENGTH,
  MAX_CONCEPT_KEY_LENGTH,
  sanitizeChoiceFeedback,
} from "../services/choiceFeedback";

const MAX_DESCRIPTION_LENGTH = 300;

export interface QuestionMetadataDetails {
  subject: string;
  gradeLevel: string;
  topic: string;
  description: string | null;
  choices: QuestionChoices | null;
  correctChoice: ChoiceLabel | null;
  // Phase 72 — author-written, gentlest first. Empty when none were added.
  hints: string[];
  // Phase 77 — optional author-written feedback per wrong choice.
  choiceFeedback: QuestionChoiceFeedback | null;
}

interface QuestionMetadataModalProps {
  visible: boolean;
  imageUri: string | null;
  isUploading: boolean;
  errorMessage: string | null;
  onSubmit: (details: QuestionMetadataDetails) => void;
  onCancel: () => void;
  // Optional suggested starting values — e.g. the Teacher Action Center
  // opening this prefilled from a topic hotspot the teacher just tapped.
  // A SUGGESTION, never a lock: still rendered as the same editable chip
  // rows below, and silently ignored (falls back to the original default)
  // if the value isn't one of the real, current taxonomy options — never
  // renders a selected chip that doesn't actually exist.
  initialSubject?: string;
  initialGradeLevel?: string;
  initialTopic?: string;
}

// Phase 21's "yeni soru oluşturma ekranı" — shown after an image has
// already been picked (see ImageSourcePicker / useUpload's
// captureWithVisibility), same "no camera/gallery launch races a Modal"
// precondition CreateClassModal/StudentQuestionDetailsModal's original
// version already documented. Reused verbatim by BOTH the student class
// composer (StudentClassDetailScreen) and the main Akış tab's upload flow
// (FeedScreen) — one form, not two parallel ones, per this phase's own
// "aynı kavram zaten varsa paralel sistem oluşturma" instruction.
export function QuestionMetadataModal({
  visible,
  imageUri,
  isUploading,
  errorMessage,
  onSubmit,
  onCancel,
  initialSubject,
  initialGradeLevel,
  initialTopic,
}: QuestionMetadataModalProps) {
  const [subject, setSubject] = useState<string>(QUESTION_SUBJECTS[0]);
  const [gradeLevel, setGradeLevel] = useState<string>(GRADE_LEVELS[0]);
  const [topic, setTopic] = useState<string>(getTopicsForSubject(QUESTION_SUBJECTS[0])[0] ?? "");
  const [description, setDescription] = useState("");
  const [mcEnabled, setMcEnabled] = useState(false);
  const [choiceDrafts, setChoiceDrafts] = useState<Partial<Record<ChoiceLabel, string>>>({});
  const [correctChoice, setCorrectChoice] = useState<ChoiceLabel | null>(null);
  const [hintsEnabled, setHintsEnabled] = useState(false);
  // Phase 77 — one draft per option, keyed by the SAME stable ChoiceLabel the
  // option itself uses, so an author's note stays attached to the row they
  // typed it under no matter how the text is later edited.
  const [feedbackDrafts, setFeedbackDrafts] = useState<Partial<Record<ChoiceLabel, string>>>({});
  const [conceptDrafts, setConceptDrafts] = useState<Partial<Record<ChoiceLabel, string>>>({});
  // One draft per rung. Blank boxes are dropped on save, so an author who
  // fills 1 and 3 still publishes a contiguous two-step ladder.
  const [hintDrafts, setHintDrafts] = useState<string[]>(
    Array.from({ length: MAX_QUESTION_HINTS }, () => ""),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  // Resets the whole form each time a fresh image is picked, not on every
  // re-render — visible flips true→false→true across separate uploads. A
  // valid initial* suggestion wins over the plain first-option default;
  // an invalid/stale one (not in the current real taxonomy) is ignored.
  useEffect(() => {
    if (visible) {
      const subjectOptions: readonly string[] = QUESTION_SUBJECTS;
      const firstSubject =
        initialSubject && subjectOptions.includes(initialSubject) ? initialSubject : QUESTION_SUBJECTS[0];
      setSubject(firstSubject);

      const gradeOptions: readonly string[] = GRADE_LEVELS;
      setGradeLevel(
        initialGradeLevel && gradeOptions.includes(initialGradeLevel) ? initialGradeLevel : GRADE_LEVELS[0],
      );

      const topicOptionsForSubject = getTopicsForSubject(firstSubject);
      setTopic(
        initialTopic && topicOptionsForSubject.includes(initialTopic)
          ? initialTopic
          : topicOptionsForSubject[0] ?? "",
      );

      setDescription("");
      setMcEnabled(false);
      setChoiceDrafts({});
      setCorrectChoice(null);
      // Phase 77 fix — the hint drafts were left out of this reset, so text
      // typed for one question reappeared, already filled in, on the NEXT
      // upload. An author who did not scroll down would have published
      // another question's hints without ever seeing them.
      setHintsEnabled(false);
      setHintDrafts(Array.from({ length: MAX_QUESTION_HINTS }, () => ""));
      setFeedbackDrafts({});
      setConceptDrafts({});
      setValidationError(null);
    }
  }, [visible, initialSubject, initialGradeLevel, initialTopic]);

  const topicOptions = getTopicsForSubject(subject);

  function handleSubjectChange(next: string) {
    setSubject(next);
    // The previously selected topic may not exist for the new subject —
    // fall back to that subject's own first option rather than leaving a
    // stale/invalid topic silently selected.
    const nextTopics = getTopicsForSubject(next);
    if (!nextTopics.includes(topic)) setTopic(nextTopics[0] ?? "");
  }

  function handleHintTextChange(index: number, value: string) {
    setHintDrafts((current) => current.map((entry, i) => (i === index ? value : entry)));
  }

  function handleChoiceTextChange(label: ChoiceLabel, value: string) {
    setChoiceDrafts((prev) => ({ ...prev, [label]: value }));
  }

  function handleFeedbackTextChange(label: ChoiceLabel, value: string) {
    setFeedbackDrafts((prev) => ({ ...prev, [label]: value }));
  }

  function handleConceptKeyChange(label: ChoiceLabel, value: string) {
    setConceptDrafts((prev) => ({ ...prev, [label]: value }));
  }

  function handleSubmit() {
    if (!subject) {
      setValidationError("Lütfen bir ders seçin.");
      return;
    }
    if (!gradeLevel) {
      setValidationError("Lütfen bir sınıf seviyesi seçin.");
      return;
    }
    if (!topic) {
      setValidationError("Lütfen bir konu seçin.");
      return;
    }

    let choices: QuestionChoices | null = null;
    let finalCorrectChoice: ChoiceLabel | null = null;
    if (mcEnabled) {
      const payload = buildChoicesPayload(choiceDrafts, correctChoice);
      if (!payload.choices) {
        setValidationError("Çoktan seçmeli için en az 2 şık doldurmalısınız.");
        return;
      }
      if (!payload.correctChoice) {
        setValidationError("Lütfen doğru cevabı seçin.");
        return;
      }
      choices = payload.choices;
      finalCorrectChoice = payload.correctChoice;
    }

    setValidationError(null);
    const hints = hintsEnabled ? sanitizeHints(hintDrafts) : [];

    // Sanitized against the options actually being saved, so a note left
    // behind on a choice the author later blanked — or on the one they marked
    // correct — is dropped rather than persisted where it could resurface
    // attached to different text.
    const choiceFeedback = sanitizeChoiceFeedback(
      Object.fromEntries(
        CHOICE_LABELS.map((label) => [
          label,
          { text: feedbackDrafts[label] ?? "", conceptKey: conceptDrafts[label] ?? "" },
        ]),
      ) as Partial<Record<ChoiceLabel, unknown>>,
      choices,
      finalCorrectChoice,
    );

    onSubmit({
      subject,
      gradeLevel,
      topic,
      description: description.trim().length > 0 ? description.trim() : null,
      choices,
      correctChoice: finalCorrectChoice,
      hints,
      choiceFeedback,
    });
  }

  const displayError = validationError ?? errorMessage;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Soru Paylaş</Text>

            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.preview} contentFit="cover" />
            ) : null}

            <Text style={styles.label}>Ders</Text>
            <ChipRow options={QUESTION_SUBJECTS} selected={subject} onSelect={handleSubjectChange} />

            <Text style={styles.label}>Sınıf Seviyesi</Text>
            <ChipRow options={GRADE_LEVELS} selected={gradeLevel} onSelect={setGradeLevel} />

            <Text style={styles.label}>Konu</Text>
            <ChipRow options={topicOptions} selected={topic} onSelect={setTopic} />

            <Text style={styles.label}>Açıklama (isteğe bağlı)</Text>
            <TextInput
              style={styles.input}
              placeholder="Sorunla ilgili kısa bir not ekle..."
              placeholderTextColor={colors.textTertiary}
              value={description}
              onChangeText={setDescription}
              maxLength={MAX_DESCRIPTION_LENGTH}
              multiline
            />

            <View style={styles.mcSection}>
              <Checkbox label="Şık ekle (çoktan seçmeli)" checked={mcEnabled} onToggle={setMcEnabled} />

              {mcEnabled ? (
                <View style={styles.mcFields}>
                  {CHOICE_LABELS.map((label) => {
                    const choiceText = (choiceDrafts[label] ?? "").trim();
                    // Phase 77 — feedback is offered only where it can mean
                    // something: an option that exists, and is not the one
                    // marked correct. That is progressive disclosure doing
                    // real work rather than hiding fields — five choices plus
                    // three hints plus five always-open notes would turn the
                    // composer into a worksheet, and a note on the right
                    // answer has no moment at which to appear.
                    const canExplain = choiceText.length > 0 && correctChoice !== label;
                    const feedbackText = feedbackDrafts[label] ?? "";
                    return (
                      <View key={label} style={styles.choiceGroup}>
                        <View style={styles.choiceRow}>
                          <Text style={styles.choiceLetter}>{label}</Text>
                          <TextInput
                            style={styles.choiceInput}
                            placeholder={`${label} şıkkı`}
                            placeholderTextColor={colors.textTertiary}
                            value={choiceDrafts[label] ?? ""}
                            onChangeText={(value) => handleChoiceTextChange(label, value)}
                            maxLength={200}
                            accessibilityLabel={`${label} şıkkının metni`}
                          />
                        </View>

                        {canExplain ? (
                          <View style={styles.feedbackBlock}>
                            <TextInput
                              style={styles.feedbackInput}
                              placeholder="Bu şık seçilirse gösterilecek geri bildirim (isteğe bağlı)"
                              placeholderTextColor={colors.textTertiary}
                              value={feedbackText}
                              onChangeText={(value) => handleFeedbackTextChange(label, value)}
                              maxLength={MAX_CHOICE_FEEDBACK_LENGTH}
                              multiline
                              accessibilityLabel={`${label} şıkkı seçilirse gösterilecek geri bildirim`}
                            />
                            {feedbackText.trim().length > 0 ? (
                              <TextInput
                                style={styles.conceptInput}
                                placeholder="Hata etiketi (isteğe bağlı, öğrenciye gösterilmez)"
                                placeholderTextColor={colors.textTertiary}
                                value={conceptDrafts[label] ?? ""}
                                onChangeText={(value) => handleConceptKeyChange(label, value)}
                                maxLength={MAX_CONCEPT_KEY_LENGTH}
                                autoCapitalize="none"
                                accessibilityLabel={`${label} şıkkı için hata etiketi, öğrenciye gösterilmez`}
                              />
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}

                  <Text style={styles.hintHelp}>
                    Geri bildirim, öğrenci o şıkkı seçtikten sonra gösterilir. Neyi yeniden
                    gözden geçirmesi gerektiğini yaz; cevabı doğrudan verme.
                  </Text>

                  <Text style={styles.label}>Doğru cevap</Text>
                  <View style={styles.correctChoiceRow}>
                    {CHOICE_LABELS.map((label) => {
                      const selected = correctChoice === label;
                      return (
                        <Pressable
                          key={label}
                          onPress={() => setCorrectChoice(label)}
                          style={[styles.correctChoiceButton, selected ? styles.correctChoiceButtonSelected : null]}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`Doğru cevap ${label}`}
                        >
                          <Text
                            style={[
                              styles.correctChoiceButtonText,
                              selected ? styles.correctChoiceButtonTextSelected : null,
                            ]}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.mcSection}>
              <Checkbox
                label="İpucu ekle (isteğe bağlı)"
                checked={hintsEnabled}
                onToggle={setHintsEnabled}
              />

              {hintsEnabled ? (
                <View style={styles.mcFields}>
                  <Text style={styles.hintHelp}>
                    Öğrenci takıldığında sırayla gösterilir. İpuçlarını doğrudan cevabı vermeden
                    adım adım yaz.
                  </Text>
                  {hintDrafts.map((value, index) => (
                    <View key={index} style={styles.choiceRow}>
                      <Text style={styles.choiceLetter}>{index + 1}</Text>
                      <TextInput
                        style={styles.choiceInput}
                        placeholder={`${index + 1}. ipucu`}
                        placeholderTextColor={colors.textTertiary}
                        value={value}
                        onChangeText={(next) => handleHintTextChange(index, next)}
                        maxLength={MAX_HINT_LENGTH}
                        multiline
                      />
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {displayError ? <Text style={styles.error}>{displayError}</Text> : null}

            <PrimaryButton label="Paylaş" onPress={handleSubmit} isLoading={isUploading} />
            <Pressable onPress={onCancel} style={styles.cancelButton} disabled={isUploading}>
              <Text style={styles.cancelText}>Vazgeç</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ChipRow({
  options,
  selected,
  onSelect,
}: {
  options: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const isSelected = option === selected;
        return (
          <Pressable
            key={option}
            onPress={() => onSelect(option)}
            style={[styles.chip, isSelected ? styles.chipSelected : null]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={option}
          >
            <Text style={[styles.chipText, isSelected ? styles.chipTextSelected : null]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    maxHeight: "88%",
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  preview: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: spacing.xxs,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  chipTextSelected: {
    color: colors.textInverse,
  },
  input: {
    minHeight: 70,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlignVertical: "top",
  },
  mcSection: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  mcFields: {
    gap: spacing.xs,
  },
  hintHelp: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  choiceLetter: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
    width: 20,
    textAlign: "center",
  },
  choiceInput: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
  },
  choiceGroup: {
    gap: spacing.xxs,
  },
  feedbackBlock: {
    // Indented to sit visually beneath its own option letter, so the
    // relationship between a note and the choice it explains is structural
    // rather than something the author has to remember.
    marginLeft: spacing.lg,
    gap: spacing.xxs,
  },
  feedbackInput: {
    ...typography.caption,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 44,
  },
  conceptInput: {
    ...typography.caption,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 44,
  },
  correctChoiceRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  correctChoiceButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  correctChoiceButtonSelected: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  correctChoiceButtonText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  correctChoiceButtonTextSelected: {
    color: colors.textInverse,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  cancelButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textSecondary,
  },
}));
