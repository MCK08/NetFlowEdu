import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import {
  findDuplicateLabel,
  MAX_SEMANTIC_DESCRIPTION_LENGTH,
  MAX_SEMANTIC_LABEL_LENGTH,
  selectableDefinitions,
  SemanticDefinition,
  SemanticDefinitionInput,
} from "../services/semanticDefinition";

// Phase 80 — choosing a SHARED instructional label for one wrong option.
//
// WHAT THE TEACHER IS ACTUALLY DOING
//
// Pointing at the same definition someone else pointed at. That act — not a
// matching word, not a similar phrase — is the entire basis on which two
// questions may later be treated as carrying the same meaning. Everything
// here exists to make that act quick and to keep it deliberate.
//
// WHY IT DOES NOT LOOK LIKE A FOREIGN-KEY PICKER
//
// No ids, no paths, no "select a record". A teacher sees their own words in a
// short list of chips, taps one, and carries on authoring. The id exists and
// is doing all the work, and the teacher never meets it.
//
// WHY DUPLICATES ARE WARNED ABOUT AND NEVER MERGED
//
// Two definitions may legitimately read alike, and the product has no basis
// for deciding they are the same idea — that judgement is exactly what this
// whole phase refuses to make on an author's behalf. So a near-match surfaces
// a sentence and nothing else: no auto-select, no merge, no similarity score.

interface SemanticDefinitionPickerProps {
  /** The class's vocabulary, already loaded once by the composer. */
  definitions: readonly SemanticDefinition[];
  /** The question's own scope. A definition belongs to a subject and topic,
   *  and offering one from elsewhere invites the sloppy reuse that would make
   *  the shared identity meaningless. */
  subject: string;
  topic: string;
  selectedId: string | null;
  onSelect: (definition: SemanticDefinition | null) => void;
  /** Absent for an author who may SELECT from the vocabulary but not add to
   *  it. Students authoring a class question are exactly that case: the rules
   *  let them read their class's definitions, while creating and retiring one
   *  stays with the teacher who curates it. */
  onCreate?: (input: SemanticDefinitionInput) => Promise<SemanticDefinition | null>;
  /** Names the option this picker belongs to, for screen readers. */
  choiceLabel: string;
}

export function SemanticDefinitionPicker({
  definitions,
  subject,
  topic,
  selectedId,
  onSelect,
  onCreate,
  choiceLabel,
}: SemanticDefinitionPickerProps) {
  useThemeSubscription();
  const [isCreating, setIsCreating] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const options = useMemo(
    () => selectableDefinitions(definitions, subject, topic),
    [definitions, subject, topic],
  );

  // The currently referenced definition may be archived — it stays visible on
  // the question that already points at it, because archiving retires a label
  // from NEW selection without invalidating existing work.
  const selected = useMemo(
    () => definitions.find((definition) => definition.id === selectedId) ?? null,
    [definitions, selectedId],
  );

  const duplicate = useMemo(
    () => (draftLabel.trim() ? findDuplicateLabel(definitions, draftLabel, subject, topic) : null),
    [definitions, draftLabel, subject, topic],
  );

  // A definition inherits the question's scope rather than asking for it
  // again, so it cannot be created outside the scope it will be used in.
  const canCreate =
    Boolean(onCreate) && draftLabel.trim().length > 0 && Boolean(subject.trim() && topic.trim());

  async function handleCreate() {
    if (!canCreate || isSaving || !onCreate) return;
    setIsSaving(true);
    try {
      const created = await onCreate({
        label: draftLabel,
        description: draftNote,
        subject,
        topic,
      });
      if (created) {
        onSelect(created);
        setDraftLabel("");
        setDraftNote("");
        setIsCreating(false);
      }
    } finally {
      setIsSaving(false);
    }
  }

  // Nothing to offer: no vocabulary yet and no ability to start one. Rendering
  // an empty picker would be a control that cannot do anything.
  if (options.length === 0 && !onCreate && !selected) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.help}>
        Ortak etiket (isteğe bağlı). Aynı öğrenme noktasını temsil eden farklı sorularda aynı
        etiketi yeniden seç.
      </Text>

      <View style={styles.chipRow}>
        {options.map((definition) => {
          const isSelected = definition.id === selectedId;
          return (
            <Pressable
              key={definition.id}
              onPress={() => onSelect(isSelected ? null : definition)}
              style={[styles.chip, isSelected ? styles.chipSelected : null]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${choiceLabel} şıkkı için ortak etiket: ${definition.label}${
                isSelected ? ", seçili" : ""
              }`}
            >
              {isSelected ? (
                <Ionicons
                  name="checkmark"
                  size={iconSize.xs}
                  color={colors.textInverse}
                  accessibilityElementsHidden
                />
              ) : null}
              <Text style={[styles.chipText, isSelected ? styles.chipTextSelected : null]}>
                {definition.label}
              </Text>
            </Pressable>
          );
        })}

        {/* An archived definition this question already references. Shown so
            the association is visible and removable, never offered as a new
            choice — which is the whole difference between archiving and
            deleting. */}
        {selected && selected.archived ? (
          <Pressable
            onPress={() => onSelect(null)}
            style={[styles.chip, styles.chipSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected: true }}
            accessibilityLabel={`${choiceLabel} şıkkı için ortak etiket: ${selected.label}, arşivlenmiş, seçili`}
          >
            <Ionicons
              name="archive-outline"
              size={iconSize.xs}
              color={colors.textInverse}
              accessibilityElementsHidden
            />
            <Text style={[styles.chipText, styles.chipTextSelected]}>
              {selected.label} (arşivlenmiş)
            </Text>
          </Pressable>
        ) : null}

        {onCreate && !isCreating ? (
          <Pressable
            onPress={() => setIsCreating(true)}
            style={[styles.chip, styles.chipAdd]}
            accessibilityRole="button"
            accessibilityLabel={`${choiceLabel} şıkkı için yeni ortak etiket oluştur`}
          >
            <Ionicons
              name="add"
              size={iconSize.xs}
              color={colors.primary}
              accessibilityElementsHidden
            />
            <Text style={[styles.chipText, styles.chipTextAdd]}>Yeni etiket</Text>
          </Pressable>
        ) : null}
      </View>

      {onCreate && isCreating ? (
        <View style={styles.createBlock}>
          <TextInput
            style={styles.input}
            placeholder="Etiket adı, örn. İşaret aktarımı"
            placeholderTextColor={colors.textTertiary}
            value={draftLabel}
            onChangeText={setDraftLabel}
            maxLength={MAX_SEMANTIC_LABEL_LENGTH}
            accessibilityLabel="Yeni ortak etiket adı"
          />
          <TextInput
            style={styles.input}
            placeholder="Diğer öğretmenler için kısa not (isteğe bağlı)"
            placeholderTextColor={colors.textTertiary}
            value={draftNote}
            onChangeText={setDraftNote}
            maxLength={MAX_SEMANTIC_DESCRIPTION_LENGTH}
            multiline
            accessibilityLabel="Yeni ortak etiket için açıklama"
          />

          {/* A warning, never a block and never a merge. */}
          {duplicate ? (
            <Text style={styles.duplicate} accessibilityRole="alert">
              Bu konuda “{duplicate.label}” adlı bir ortak etiket zaten var. Aynı öğrenme
              noktasıysa mevcut etiketi seçmek daha iyi olur.
            </Text>
          ) : null}

          <View style={styles.createActions}>
            <Pressable
              onPress={handleCreate}
              disabled={!canCreate || isSaving}
              style={[styles.createButton, !canCreate || isSaving ? styles.createDisabled : null]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canCreate || isSaving }}
              accessibilityLabel="Ortak etiketi kaydet"
            >
              <Text style={styles.createButtonText}>Kaydet</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setIsCreating(false);
                setDraftLabel("");
                setDraftNote("");
              }}
              style={styles.cancelButton}
              accessibilityRole="button"
              accessibilityLabel="Yeni etiket oluşturmayı iptal et"
            >
              <Text style={styles.cancelText}>Vazgeç</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  container: {
    gap: spacing.xs,
  },
  help: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipAdd: {
    borderStyle: "dashed",
    borderColor: colors.primary,
    backgroundColor: "transparent",
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: colors.textInverse,
  },
  chipTextAdd: {
    color: colors.primary,
  },
  createBlock: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
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
  duplicate: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  createActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  createButton: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  createDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: "600",
  },
  cancelButton: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  cancelText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
}));
