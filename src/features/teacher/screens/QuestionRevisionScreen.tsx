import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SemanticDefinitionPicker } from "@features/questions/components/SemanticDefinitionPicker";
import { MAX_CHOICE_FEEDBACK_LENGTH } from "@features/questions/services/choiceFeedback";
import { MAX_HINT_LENGTH } from "@features/questions/services/questionHints";
import {
  feedbackEligibleLabels,
  hintDraftBoxes,
  MAX_QUESTION_DESCRIPTION_LENGTH,
  REMAP_TRUST_NOTE,
  REVISION_TRUST_NOTE,
} from "@features/questions/services/questionRevision";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { iconSize, inputFontSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import { CHOICE_LABELS } from "@/types/question";

import { useQuestionRevision } from "../hooks/useQuestionRevision";

// Phase 86 — revising one question the signed-in teacher authored.
//
// WHAT THIS SCREEN IS
//
// A calm authoring page for the CURRENT state of one question: its caption,
// options, correct answer, the note on each wrong option and the shared
// meaning that note points at, and its hints. It opens with zero writes,
// holds every change locally, and writes exactly once on an explicit save.
//
// WHAT IT REFUSES TO PRETEND
//
// It is not a version history — the app stores none, so none is shown. It
// does not touch what a learner already did: the trust note at the top is the
// one promise made here, and it is kept by construction (the payload cannot
// express a studyEvent, a definition, or an immutable field).
//
// READ-ONLY CONTEXT, ON PURPOSE
//
// Subject, topic, grade and the image are shown and not editable. Subject and
// topic are part of every shared meaning's identity (Phase 80/81), so moving a
// question's scope would be a semantic migration wearing an edit's clothes.
// The image is the create flow's native concern and is not reopened here.

interface QuestionRevisionScreenProps {
  classId: string;
  questionId: string;
}

/** The correct-answer toggle is a full touch target, level with the option field beside it. */
const CORRECT_TOGGLE_SIZE = minTouchTarget;

export function QuestionRevisionScreen({ classId, questionId }: QuestionRevisionScreenProps) {
  useThemeSubscription();
  const revision = useQuestionRevision({ classId, questionId });
  const {
    status,
    question,
    definitions,
    draft,
    updateDraft,
    validationError,
    saveError,
    isDirty,
    mappingChanged,
  } = revision;

  // Hint boxes are padded once per loaded question so an author sees the
  // whole ladder; blanks fall out again on save.
  const [hintBoxes, setHintBoxes] = useState<string[] | null>(null);
  useEffect(() => {
    if (draft && hintBoxes === null) setHintBoxes(hintDraftBoxes(draft.hints));
  }, [draft, hintBoxes]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/(teacher)/class/[classId]/semantic-vocabulary", params: { classId } });
  }, [classId]);

  // Saved → back to where the teacher came from; the studio refreshes on
  // focus, so the change is visible there rather than announced in a modal.
  useEffect(() => {
    if (status === "saved") goBack();
  }, [status, goBack]);

  const setHint = useCallback(
    (index: number, value: string) => {
      setHintBoxes((current) => {
        const next = (current ?? []).map((entry, i) => (i === index ? value : entry));
        updateDraft((d) => ({ ...d, hints: next }));
        return next;
      });
    },
    [updateDraft],
  );

  const header = (
    <View style={styles.header}>
      <Pressable
        onPress={goBack}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Geri"
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </Pressable>
      <View style={styles.headerText}>
        <Text style={styles.title} accessibilityRole="header">
          Soruyu düzenle
        </Text>
        <Text style={styles.subtitle}>Yalnızca kendi yazdığın sorunun güncel halini değiştirirsin.</Text>
      </View>
    </View>
  );

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator color={colors.textPrimary} accessibilityLabel="Soru yükleniyor" />
        </View>
      </SafeAreaView>
    );
  }

  if (status === "missing") {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        {header}
        <View style={styles.centered}>
          <EmptyState
            icon={revision.loadError ? "cloud-offline-outline" : "document-text-outline"}
            title={revision.loadError ?? "Soru bulunamadı"}
          />
          {revision.loadError ? <PrimaryButton label="Tekrar Dene" onPress={revision.retry} /> : null}
          <PrimaryButton label="Geri dön" variant="secondary" onPress={goBack} />
        </View>
      </SafeAreaView>
    );
  }

  if (status === "unauthorized" || !question || !draft) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        {header}
        <View style={styles.centered}>
          <EmptyState
            icon="lock-closed-outline"
            title="Bu soruyu yalnızca yazarı düzenleyebilir"
            description="Sınıftaki başka bir yazarın sorusunu inceleyebilirsin, ancak değiştiremezsin."
          />
          <PrimaryButton label="Geri dön" variant="secondary" onPress={goBack} />
        </View>
      </SafeAreaView>
    );
  }

  const eligible = feedbackEligibleLabels(draft);
  const hasAnyChoice = CHOICE_LABELS.some((label) => Boolean(draft.choices[label]?.trim()));
  const isSaving = status === "saving";
  const canSave = isDirty && !validationError && !isSaving;

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      {header}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* The one promise, said first. */}
          <View style={styles.trust} accessible accessibilityLabel={REVISION_TRUST_NOTE}>
            <Ionicons name="shield-checkmark-outline" size={iconSize.sm} color={colors.primary} />
            <Text style={styles.trustText}>{REVISION_TRUST_NOTE}</Text>
          </View>

          {/* Read-only context. Scope is identity for every shared meaning, so
              it is shown, not offered. */}
          <View
            style={styles.contextBlock}
            accessible
            accessibilityLabel={`${question.subject}, ${question.topic}, ${question.gradeLevel}. sınıf. Ders, konu ve seviye bu ekranda değiştirilemez.`}
          >
            <Text style={styles.contextLine}>
              {`${question.subject} · ${question.topic} · ${question.gradeLevel}. sınıf`}
            </Text>
            <Text style={styles.contextNote}>Ders, konu ve seviye bu ekranda değiştirilemez.</Text>
          </View>

          {question.imageUrl ? (
            <View style={styles.imageWrap}>
              <Image
                source={{ uri: question.imageUrl }}
                style={styles.image}
                contentFit="contain"
                accessibilityLabel="Soru görseli"
              />
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Soru metni</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={draft.description ?? ""}
            onChangeText={(value) => updateDraft((d) => ({ ...d, description: value }))}
            maxLength={MAX_QUESTION_DESCRIPTION_LENGTH}
            multiline
            placeholder="Soruya kısa bir açıklama ekleyebilirsin"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Soru metni"
            editable={!isSaving}
          />

          {hasAnyChoice ? (
            <>
              <Text style={styles.fieldLabel}>Şıklar</Text>
              {CHOICE_LABELS.map((label) => {
                const text = draft.choices[label] ?? "";
                const isPresent = Boolean(text.trim());
                const isCorrect = draft.correctChoice === label;
                const canExplain = eligible.includes(label);
                const note = draft.feedback[label];
                return (
                  <View key={label} style={styles.choiceGroup}>
                    <View style={styles.row}>
                      <Pressable
                        onPress={() => updateDraft((d) => ({ ...d, correctChoice: label }))}
                        disabled={!isPresent || isSaving}
                        style={[
                          styles.correctToggle,
                          isCorrect ? styles.correctToggleOn : null,
                          !isPresent ? styles.correctToggleOff : null,
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: isCorrect, disabled: !isPresent }}
                        // react-native-web drops accessibilityState.checked on
                        // a Pressable (same gap Phase 85 met with `expanded`),
                        // so the state is written to the DOM explicitly too.
                        aria-checked={isCorrect}
                        aria-disabled={!isPresent}
                        accessibilityLabel={`${label} şıkkı doğru cevap`}
                      >
                        <Text style={[styles.choiceLetter, isCorrect ? styles.choiceLetterOn : null]}>
                          {label}
                        </Text>
                      </Pressable>
                      <TextInput
                        style={[styles.input, styles.grow]}
                        value={text}
                        onChangeText={(value) =>
                          updateDraft((d) => ({ ...d, choices: { ...d.choices, [label]: value } }))
                        }
                        maxLength={200}
                        placeholder={`${label} şıkkı`}
                        placeholderTextColor={colors.textTertiary}
                        accessibilityLabel={`${label} şıkkının metni`}
                        editable={!isSaving}
                      />
                    </View>

                    {canExplain ? (
                      <View style={styles.feedbackBlock}>
                        <TextInput
                          style={styles.feedbackInput}
                          value={note?.text ?? ""}
                          onChangeText={(value) =>
                            updateDraft((d) => ({
                              ...d,
                              feedback: {
                                ...d.feedback,
                                [label]: {
                                  text: value,
                                  semanticDefinitionId: d.feedback[label]?.semanticDefinitionId ?? null,
                                  semanticLabel: d.feedback[label]?.semanticLabel ?? null,
                                  conceptKey: d.feedback[label]?.conceptKey ?? null,
                                },
                              },
                            }))
                          }
                          maxLength={MAX_CHOICE_FEEDBACK_LENGTH}
                          multiline
                          placeholder="Bu şık seçilirse gösterilecek geri bildirim (isteğe bağlı)"
                          placeholderTextColor={colors.textTertiary}
                          accessibilityLabel={`${label} şıkkı seçilirse gösterilecek geri bildirim`}
                          editable={!isSaving}
                        />
                        {(note?.text ?? "").trim().length > 0 ? (
                          // Phase 80 — the shared vocabulary is the ONLY semantic
                          // input here. Select-only: creating a definition belongs
                          // to the vocabulary studio, not to a question's editor.
                          <SemanticDefinitionPicker
                            definitions={definitions}
                            subject={question.subject}
                            topic={question.topic}
                            choiceLabel={label}
                            selectedId={note?.semanticDefinitionId ?? null}
                            onSelect={(definition) =>
                              updateDraft((d) => ({
                                ...d,
                                feedback: {
                                  ...d.feedback,
                                  [label]: {
                                    text: d.feedback[label]?.text ?? "",
                                    semanticDefinitionId: definition?.id ?? null,
                                    semanticLabel: definition?.label ?? null,
                                    // Choosing a shared meaning retires a legacy
                                    // private key; the sanitiser would anyway.
                                    conceptKey: definition ? null : (d.feedback[label]?.conceptKey ?? null),
                                  },
                                },
                              }))
                            }
                          />
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
              <Text style={styles.help}>
                Doğru cevabı seçmek için harfe dokun. Doğru cevaba geri bildirim ve etiket bağlanamaz; bir
                şık doğru cevap olursa o şıkkın notu kaldırılır.
              </Text>
            </>
          ) : null}

          <Text style={styles.fieldLabel}>İpuçları (isteğe bağlı)</Text>
          {(hintBoxes ?? hintDraftBoxes(draft.hints)).map((value, index) => (
            <View key={index} style={styles.row}>
              <Text style={styles.hintIndex}>{index + 1}</Text>
              <TextInput
                style={[styles.input, styles.grow]}
                value={value}
                onChangeText={(next) => setHint(index, next)}
                maxLength={MAX_HINT_LENGTH}
                multiline
                placeholder={`${index + 1}. ipucu`}
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel={`${index + 1}. ipucu`}
                editable={!isSaving}
              />
            </View>
          ))}

          {mappingChanged ? (
            <View style={styles.trust} accessible accessibilityLabel={REMAP_TRUST_NOTE}>
              <Ionicons name="git-compare-outline" size={iconSize.sm} color={colors.primary} />
              <Text style={styles.trustText}>{REMAP_TRUST_NOTE}</Text>
            </View>
          ) : null}

          {validationError || saveError ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {saveError ?? validationError}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <PrimaryButton
              label="Kaydet"
              onPress={() => {
                void revision.save();
              }}
              isLoading={isSaving}
              disabled={!canSave}
              accessibilityHint="Değişiklikler yalnızca yeni yanıtlar için geçerli olur"
            />
            <Pressable
              onPress={goBack}
              style={styles.cancel}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel="Vazgeç, değişiklikleri kaydetme"
            >
              <Text style={styles.cancelLabel}>Vazgeç</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: "100%" as const,
    maxWidth: contentWidth.readable,
    alignSelf: "center" as const,
  },
  backButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginLeft: -spacing.xs,
  },
  headerText: { flex: 1, gap: 2 },
  title: { ...typography.screenTitle, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
    width: "100%" as const,
    maxWidth: contentWidth.readable,
    alignSelf: "center" as const,
  },
  trust: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: spacing.xs,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  trustText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
  contextBlock: { gap: 2 },
  contextLine: { ...typography.bodyStrong, color: colors.textPrimary },
  contextNote: { ...typography.caption, color: colors.textTertiary },
  imageWrap: {
    width: "100%" as const,
    aspectRatio: 1.4,
    maxHeight: 260,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden" as const,
  },
  image: { width: "100%" as const, height: "100%" as const },
  fieldLabel: { ...typography.label, color: colors.textSecondary, marginTop: spacing.xs },
  input: {
    ...typography.body,
    fontSize: inputFontSize,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: minTouchTarget,
  },
  multiline: { minHeight: 72, textAlignVertical: "top" as const },
  grow: { flex: 1 },
  choiceGroup: { gap: spacing.xxs },
  row: { flexDirection: "row" as const, alignItems: "center" as const, gap: spacing.xs },
  correctToggle: {
    width: CORRECT_TOGGLE_SIZE,
    height: CORRECT_TOGGLE_SIZE,
    borderRadius: radius.pill,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  correctToggleOn: { borderColor: colors.success, backgroundColor: colors.successMuted },
  correctToggleOff: { opacity: 0.5 },
  choiceLetter: { ...typography.bodyStrong, color: colors.textSecondary },
  choiceLetterOn: { color: colors.success },
  feedbackBlock: { marginLeft: CORRECT_TOGGLE_SIZE + spacing.xs, gap: spacing.xxs },
  feedbackInput: {
    ...typography.body,
    fontSize: inputFontSize,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    // Three lines of a note fit without an inner scrollbar (web textareas do
    // not grow with their content).
    minHeight: 76,
    textAlignVertical: "top" as const,
  },
  hintIndex: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
    width: CORRECT_TOGGLE_SIZE,
    textAlign: "center" as const,
  },
  help: { ...typography.caption, color: colors.textTertiary },
  error: { ...typography.caption, color: colors.danger },
  actions: { gap: spacing.xs, marginTop: spacing.sm },
  cancel: { minHeight: minTouchTarget, alignItems: "center" as const, justifyContent: "center" as const },
  cancelLabel: { ...typography.bodyStrong, color: colors.textSecondary },
}));
