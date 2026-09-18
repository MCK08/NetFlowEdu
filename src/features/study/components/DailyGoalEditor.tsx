import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { FormError } from "@components/ui/FormError";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, inputFontSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { mapStudyErrorToMessage } from "../services/studyErrorMapper";
import { DAILY_GOAL_PRESETS, validateDailyGoal } from "../services/dailyGoalValidation";
import { setStudyDailyGoal } from "../services/studyService";

interface DailyGoalEditorProps {
  currentGoal: number;
  // Lets the dashboard update its progress bar the instant the server
  // confirms, without waiting for the summary listener to round-trip.
  onSaved?: (goal: number) => void;
}

// Inline daily-goal editor. Uses the existing PrimaryButton / FormError
// primitives and a plain TextInput — no form library added.
export function DailyGoalEditor({ currentGoal, onSaved }: DailyGoalEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(String(currentGoal));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const lockRef = useRef(false);

  const save = useCallback(
    async (rawValue: string) => {
      if (lockRef.current) return;
      const validation = validateDailyGoal(rawValue);
      if (!validation.valid) {
        setError(validation.message);
        return;
      }

      lockRef.current = true;
      setIsSaving(true);
      setError(null);
      try {
        const result = await setStudyDailyGoal(validation.value);
        onSaved?.(result.dailyGoal);
        setIsOpen(false);
      } catch (err) {
        // Rolls the draft back to the value that is actually in effect, so
        // the field never displays a goal the server rejected.
        setDraft(String(currentGoal));
        setError(mapStudyErrorToMessage(err));
      } finally {
        lockRef.current = false;
        setIsSaving(false);
      }
    },
    [currentGoal, onSaved],
  );

  if (!isOpen) {
    return (
      <AnimatedPressable
        onPress={() => {
          setDraft(String(currentGoal));
          setError(null);
          setIsOpen(true);
        }}
        style={styles.trigger}
        accessibilityRole="button"
        accessibilityLabel={`Günlük hedefi değiştir, şu an ${currentGoal}`}
        accessibilityHint="Günlük tekrar hedefini düzenlemeni sağlar"
      >
        {/* Phase 106 — a quiet navigation row at the foot of the goal
            surface: the words, the current value, a chevron. It must not
            compete with "Çalışmaya Başla", so it is text on the surface,
            never a button. */}
        <Text style={styles.triggerText}>Hedefi değiştir</Text>
        <Text style={styles.triggerValue}>{currentGoal} soru</Text>
        <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
      </AnimatedPressable>
    );
  }

  return (
    <View style={styles.editor}>
      <Text style={styles.label}>Günlük hedef</Text>

      <View style={styles.presetRow}>
        {DAILY_GOAL_PRESETS.map((preset) => {
          const isSelected = draft === String(preset);
          return (
            <AnimatedPressable
              key={preset}
              onPress={() => setDraft(String(preset))}
              disabled={isSaving}
              style={[styles.preset, isSelected ? styles.presetSelected : null]}
              accessibilityRole="button"
              accessibilityLabel={`${preset} soru`}
              accessibilityState={{ selected: isSelected, disabled: isSaving }}
            >
              <Text style={[styles.presetText, isSelected ? styles.presetTextSelected : null]}>
                {preset}
              </Text>
            </AnimatedPressable>
          );
        })}

        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={(value) => {
            setDraft(value);
            if (error) setError(null);
          }}
          keyboardType="number-pad"
          maxLength={3}
          editable={!isSaving}
          returnKeyType="done"
          onSubmitEditing={() => save(draft)}
          accessibilityLabel="Özel günlük hedef"
          placeholder="Özel"
          placeholderTextColor={colors.textTertiary}
        />
      </View>

      <FormError message={error} />

      <View style={styles.actions}>
        <PrimaryButton label="Kaydet" onPress={() => save(draft)} isLoading={isSaving} />
        <PrimaryButton
          label="Vazgeç"
          onPress={() => {
            setDraft(String(currentGoal));
            setError(null);
            setIsOpen(false);
          }}
          variant="secondary"
          disabled={isSaving}
        />
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  trigger: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  triggerText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flex: 1,
  },
  triggerValue: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  editor: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  label: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    // Wraps rather than overflowing on a narrow phone.
    flexWrap: "wrap",
  },
  preset: {
    minWidth: 52,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  presetSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  presetText: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
  presetTextSelected: {
    color: colors.primary,
  },
  input: {
    flex: 1,
    minWidth: 72,
    minHeight: minTouchTarget,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    fontSize: inputFontSize,
    color: colors.textPrimary,
  },
  actions: {
    gap: spacing.xs,
  },
}));
