import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { PrimaryButton } from "@components/ui/PrimaryButton";
import {
  MAX_SEMANTIC_DESCRIPTION_LENGTH,
  MAX_SEMANTIC_LABEL_LENGTH,
} from "@features/questions/services/semanticDefinition";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import { joinSpokenLabel } from "@utils/spokenLabel";
import { Question } from "@/types/question";

import { SemanticDefinitionEvidence } from "../services/semanticDefinitionEvidence";
import { EvidenceLoadState, SemanticDefinitionEvidenceSection } from "./SemanticDefinitionEvidenceSection";
import {
  ARCHIVED_EXPLANATION,
  coverageStatusLabel,
  coverageUsageLine,
  duplicateLabelNote,
  SemanticDefinitionCoverage,
} from "../services/semanticDefinitionCoverage";

// Phase 82 — one shared label, and what a teacher may safely do to it.
//
// THE TWO SENTENCES THIS SURFACE EXISTS TO MAKE TRUE
//
// "Renaming this changes what it is called, not what it means." and
// "Archiving this stops it being offered again; it does not remove it from
// anywhere it is already used." Both are stated in the UI, because a teacher
// deciding whether to press a button should not have to infer the blast radius
// from the button's name.
//
// What is NOT here: delete, merge, a scope editor, and any control that would
// re-point existing references. The first two do not exist in the product at
// all; the last two would silently rewrite history, which is the one thing this
// whole line of phases refuses to do.

interface SemanticDefinitionDetailProps {
  entry: SemanticDefinitionCoverage;
  isBounded: boolean;
  // Phase 83 — the verified learning evidence around this definition, rendered
  // between the authored usage and the actions. Supplied by the screen so the
  // detail stays presentational and the class evidence index is loaded once
  // for the whole route, never per definition.
  evidence: SemanticDefinitionEvidence;
  evidenceLoadState: EvidenceLoadState;
  examinedStudentCount: number;
  onRetryEvidence: () => void;
  onOpenStudent: (studentUid: string) => void;
  onOpenClassPattern?: () => void;
  onRename: (definitionId: string, label: string, description: string | null) => Promise<boolean>;
  onSetArchived: (definitionId: string, archived: boolean) => Promise<void>;
  /** The class questions this screen already loaded, so a usage list costs no
   *  extra read. Keyed by id. */
  questionsById: ReadonlyMap<string, Question>;
  /** Mobile only — the detail is a pushed surface there and needs a way back. */
  onClose?: () => void;
}

export const SemanticDefinitionDetail = memo(function SemanticDefinitionDetail({
  entry,
  isBounded,
  onRename,
  onSetArchived,
  questionsById,
  onClose,
  evidence,
  evidenceLoadState,
  examinedStudentCount,
  onRetryEvidence,
  onOpenStudent,
  onOpenClassPattern,
}: SemanticDefinitionDetailProps) {
  useThemeSubscription();
  const { definition } = entry;

  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(definition.label);
  const [description, setDescription] = useState(definition.description ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  // Switching to another definition must never carry the previous one's unsaved
  // draft into it — that would let a teacher rename B with text they typed for A.
  useEffect(() => {
    setIsEditing(false);
    setLabel(definition.label);
    setDescription(definition.description ?? "");
  }, [definition.id, definition.label, definition.description]);

  const beginEdit = useCallback(() => setIsEditing(true), []);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setLabel(definition.label);
    setDescription(definition.description ?? "");
  }, [definition.label, definition.description]);

  const save = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const ok = await onRename(definition.id, label, description.trim() || null);
      if (ok) setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }, [definition.id, description, isSaving, label, onRename]);

  const toggleArchived = useCallback(async () => {
    if (isArchiving) return;
    setIsArchiving(true);
    try {
      await onSetArchived(definition.id, !definition.archived);
    } finally {
      setIsArchiving(false);
    }
  }, [definition.archived, definition.id, isArchiving, onSetArchived]);

  const usage = coverageUsageLine(entry, isBounded);
  const duplicate = duplicateLabelNote(entry);
  const canSave = label.trim().length > 0 && !isSaving;

  return (
    <View style={styles.panel}>
      {onClose ? (
        <Pressable
          onPress={onClose}
          style={styles.backRow}
          accessibilityRole="button"
          accessibilityLabel="Etiket listesine dön"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={iconSize.sm} color={colors.primary} />
          <Text style={styles.backLabel}>Etiketler</Text>
        </Pressable>
      ) : null}

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {isEditing ? (
          <View style={styles.editBlock}>
            <Text style={styles.fieldLabel}>Etiket adı</Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              maxLength={MAX_SEMANTIC_LABEL_LENGTH}
              style={styles.input}
              placeholder="Örn. İşaret aktarımı"
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel="Etiket adı"
              autoFocus
            />
            <Text style={styles.fieldLabel}>Açıklama (isteğe bağlı)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              maxLength={MAX_SEMANTIC_DESCRIPTION_LENGTH}
              style={[styles.input, styles.multiline]}
              multiline
              placeholder="Bu etiketin hangi durumda kullanıldığını diğer yazarlara anlatın."
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel="Açıklama"
            />
            {/* Said before the button is pressed, not after. */}
            <Text style={styles.safetyNote}>
              Ad değişikliği yalnızca görünen adı değiştirir. Etiketin kimliği aynı kalır; geçmiş
              kayıtlar ve bu etiketi kullanan sorular olduğu gibi korunur.
            </Text>
            <View style={styles.editActions}>
              <PrimaryButton label="Kaydet" onPress={save} isLoading={isSaving} disabled={!canSave} />
              <Pressable
                onPress={cancelEdit}
                style={styles.secondaryAction}
                accessibilityRole="button"
                accessibilityLabel="Düzenlemeyi iptal et"
              >
                <Text style={styles.secondaryActionLabel}>İptal</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.title}>{definition.label}</Text>
            <Text style={styles.scope}>{`${definition.subject} · ${definition.topic}`}</Text>

            <View style={styles.statusRow}>
              <Ionicons
                name={definition.archived ? "archive-outline" : "pricetag-outline"}
                size={iconSize.xs}
                color={colors.textSecondary}
              />
              <Text style={styles.statusText}>{coverageStatusLabel(entry)}</Text>
            </View>

            {definition.description ? (
              <Text style={styles.description}>{definition.description}</Text>
            ) : null}

            <View style={styles.factBlock}>
              <Text style={styles.usage}>{usage}</Text>
              {duplicate ? (
                <View style={styles.noteRow}>
                  <Ionicons name="copy-outline" size={iconSize.xs} color={colors.textSecondary} />
                  <Text style={styles.note}>{duplicate}</Text>
                </View>
              ) : null}
              {definition.archived ? (
                <View style={styles.noteRow}>
                  <Ionicons name="information-circle-outline" size={iconSize.xs} color={colors.textSecondary} />
                  <Text style={styles.note}>{ARCHIVED_EXPLANATION}</Text>
                </View>
              ) : null}
            </View>

            {/* The questions themselves, read-only.
                There is no teacher question-detail route in this app — the
                Phase 15 audit established that deliberately, and a teacher
                tapping a question notification is still told so rather than
                pushed at the student route. Rather than invent one here, or
                rebuild a question viewer, this lists the real questions the
                teacher already loaded: enough to recognise which ones carry the
                label, and nothing about anyone's answers. */}
            {entry.questionIds.length > 0 ? (
              <View style={styles.questionBlock}>
                <Text style={styles.questionHeading}>Kullanıldığı sorular</Text>
                {entry.questionIds.map((questionId, index) => {
                  const question = questionsById.get(questionId) ?? null;
                  const text = question?.description?.trim();
                  return (
                    <View
                      key={questionId}
                      style={styles.questionRow}
                      accessibilityLabel={joinSpokenLabel([
                        `${index + 1}. soru`,
                        text || null,
                      ])}
                    >
                      <Ionicons
                        name="document-text-outline"
                        size={iconSize.sm}
                        color={colors.textSecondary}
                      />
                      <Text style={styles.questionText} numberOfLines={2}>
                        {text || `${index + 1}. soru`}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Phase 83 — what this definition has actually shown up as in
                real learning. Placed after the authored usage and before the
                management actions: identity and context first, then evidence,
                then what a teacher can do. */}
            <SemanticDefinitionEvidenceSection
              evidence={evidence}
              coverageQuestionCount={entry.questionCount}
              loadState={evidenceLoadState}
              examinedStudentCount={examinedStudentCount}
              onRetry={onRetryEvidence}
              onOpenStudent={onOpenStudent}
              onOpenClassPattern={onOpenClassPattern}
            />

            <View style={styles.actions}>
              <Pressable
                onPress={beginEdit}
                style={styles.action}
                accessibilityRole="button"
                accessibilityLabel="Etiketi düzenle"
              >
                <Ionicons name="create-outline" size={iconSize.sm} color={colors.primary} />
                <Text style={styles.actionLabel}>Düzenle</Text>
              </Pressable>

              <Pressable
                onPress={toggleArchived}
                style={styles.action}
                accessibilityRole="button"
                accessibilityLabel={
                  definition.archived
                    ? "Etiketi yeniden kullanıma aç"
                    : "Etiketi arşivle. Yeni sorularda seçilemez olur, mevcut kullanımlar korunur."
                }
                accessibilityState={{ busy: isArchiving }}
              >
                <Ionicons
                  name={definition.archived ? "refresh-outline" : "archive-outline"}
                  size={iconSize.sm}
                  color={colors.primary}
                />
                <Text style={styles.actionLabel}>
                  {definition.archived ? "Yeniden kullanıma aç" : "Arşivle"}
                </Text>
              </Pressable>
            </View>

            {!definition.archived ? (
              <Text style={styles.safetyNote}>
                Arşivlenen etiket yeni sorularda seçilemez. Bu etiketi kullanan sorular ve geçmiş
                kayıtlar değişmez.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
});

const styles = themedStyles(() => ({
  panel: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden" as const,
  },
  backRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    minHeight: minTouchTarget,
  },
  backLabel: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  content: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  scope: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  statusRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  statusText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  factBlock: {
    gap: spacing.xxs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  usage: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  noteRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: spacing.xxs,
  },
  note: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  questionBlock: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.xxs,
  },
  questionHeading: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: "uppercase" as const,
  },
  questionRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xs,
    minHeight: minTouchTarget,
  },
  questionText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  actions: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  action: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    minHeight: minTouchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryMuted,
  },
  actionLabel: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  safetyNote: {
    ...typography.caption,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  editBlock: {
    gap: spacing.xs,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.textSecondary,
    textTransform: "uppercase" as const,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: minTouchTarget,
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: "top" as const,
  },
  editActions: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  secondaryAction: {
    minHeight: minTouchTarget,
    justifyContent: "center" as const,
    paddingHorizontal: spacing.sm,
  },
  secondaryActionLabel: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
}));
