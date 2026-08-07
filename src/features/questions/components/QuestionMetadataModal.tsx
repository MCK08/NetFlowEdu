import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Checkbox } from "@components/ui/Checkbox";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { ChoiceLabel, QuestionChoices } from "@/types/question";

import { GRADE_LEVELS, getTopicsForSubject, QUESTION_SUBJECTS } from "../data/questionTaxonomy";
import { buildChoicesPayload, CHOICE_LABELS } from "../services/multipleChoice";

const MAX_DESCRIPTION_LENGTH = 300;

export interface QuestionMetadataDetails {
  subject: string;
  gradeLevel: string;
  topic: string;
  description: string | null;
  choices: QuestionChoices | null;
  correctChoice: ChoiceLabel | null;
}

interface QuestionMetadataModalProps {
  visible: boolean;
  imageUri: string | null;
  isUploading: boolean;
  errorMessage: string | null;
  onSubmit: (details: QuestionMetadataDetails) => void;
  onCancel: () => void;
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
}: QuestionMetadataModalProps) {
  const [subject, setSubject] = useState<string>(QUESTION_SUBJECTS[0]);
  const [gradeLevel, setGradeLevel] = useState<string>(GRADE_LEVELS[0]);
  const [topic, setTopic] = useState<string>(getTopicsForSubject(QUESTION_SUBJECTS[0])[0] ?? "");
  const [description, setDescription] = useState("");
  const [mcEnabled, setMcEnabled] = useState(false);
  const [choiceDrafts, setChoiceDrafts] = useState<Partial<Record<ChoiceLabel, string>>>({});
  const [correctChoice, setCorrectChoice] = useState<ChoiceLabel | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Resets the whole form each time a fresh image is picked, not on every
  // re-render — visible flips true→false→true across separate uploads.
  useEffect(() => {
    if (visible) {
      const firstSubject = QUESTION_SUBJECTS[0];
      setSubject(firstSubject);
      setGradeLevel(GRADE_LEVELS[0]);
      setTopic(getTopicsForSubject(firstSubject)[0] ?? "");
      setDescription("");
      setMcEnabled(false);
      setChoiceDrafts({});
      setCorrectChoice(null);
      setValidationError(null);
    }
  }, [visible]);

  const topicOptions = getTopicsForSubject(subject);

  function handleSubjectChange(next: string) {
    setSubject(next);
    // The previously selected topic may not exist for the new subject —
    // fall back to that subject's own first option rather than leaving a
    // stale/invalid topic silently selected.
    const nextTopics = getTopicsForSubject(next);
    if (!nextTopics.includes(topic)) setTopic(nextTopics[0] ?? "");
  }

  function handleChoiceTextChange(label: ChoiceLabel, value: string) {
    setChoiceDrafts((prev) => ({ ...prev, [label]: value }));
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
    onSubmit({
      subject,
      gradeLevel,
      topic,
      description: description.trim().length > 0 ? description.trim() : null,
      choices,
      correctChoice: finalCorrectChoice,
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
                  {CHOICE_LABELS.map((label) => (
                    <View key={label} style={styles.choiceRow}>
                      <Text style={styles.choiceLetter}>{label}</Text>
                      <TextInput
                        style={styles.choiceInput}
                        placeholder={`${label} şıkkı`}
                        placeholderTextColor={colors.textTertiary}
                        value={choiceDrafts[label] ?? ""}
                        onChangeText={(value) => handleChoiceTextChange(label, value)}
                        maxLength={200}
                      />
                    </View>
                  ))}

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

const styles = StyleSheet.create({
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
});
