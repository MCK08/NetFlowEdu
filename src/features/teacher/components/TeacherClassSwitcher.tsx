import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget, stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import type { ClassRoom } from "@/types/class";

export const TEACHER_CLASS_LABEL = "Seçili sınıf";

interface TeacherClassSwitcherProps {
  classes: readonly ClassRoom[];
  selectedClassId: string;
  onSelect: (classId: string) => void;
}

// Phase 111 — which class "Bugün" and "Aksiyonlar" are about.
//
// Phase 119 — the selected class reads as a statement, not as a row of pills.
// The pills were a radio group whose selected item had to be found among the
// others, and with more than three classes they wrapped into a block taller
// than the action it was introducing. The class a teacher is acting on is now
// named once, plainly, under the label that says what it is; choosing another
// is a picker that opens on demand.
//
// Drawn with no control when there is only one active class: a picker that
// can only re-pick what is already picked is not a choice. The list it offers
// is the caller's own active-class list — never a query of its own.
export function TeacherClassSwitcher({ classes, selectedClassId, onSelect }: TeacherClassSwitcherProps) {
  useThemeSubscription();
  const { fontScale } = useWindowDimensions();
  const [isOpen, setIsOpen] = useState(false);
  const selected = classes.find((classRoom) => classRoom.id === selectedClassId);
  const canSwitch = classes.length >= 2;
  const stacked = fontScale >= stackAtFontScale;

  if (!selected) return null;

  const body = (
    <>
      <Text style={styles.name}>{selected.name}</Text>
      {canSwitch ? (
        /* Decorative: the control's own label says it changes class. */
        <Ionicons
          name="chevron-down"
          size={iconSize.sm}
          color={colors.textTertiary}
          accessibilityElementsHidden
        />
      ) : null}
    </>
  );

  return (
    <View style={styles.block}>
      <Text style={styles.label}>{TEACHER_CLASS_LABEL}</Text>

      {canSwitch ? (
        <Pressable
          onPress={() => setIsOpen(true)}
          style={[styles.card, stacked ? styles.cardStacked : null]}
          accessibilityRole="button"
          accessibilityLabel={`${TEACHER_CLASS_LABEL}: ${selected.name}`}
          accessibilityHint="Başka bir sınıf seçmek için sınıflarını açar"
        >
          {body}
        </Pressable>
      ) : (
        <View
          style={[styles.card, stacked ? styles.cardStacked : null]}
          accessible
          accessibilityLabel={`${TEACHER_CLASS_LABEL}: ${selected.name}`}
        >
          {body}
        </View>
      )}

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              Sınıf seç
            </Text>
            <ScrollView contentContainerStyle={styles.sheetList} showsVerticalScrollIndicator={false}>
              {classes.map((classRoom) => {
                const isSelected = classRoom.id === selectedClassId;
                return (
                  <Pressable
                    key={classRoom.id}
                    onPress={() => {
                      onSelect(classRoom.id);
                      setIsOpen(false);
                    }}
                    style={[styles.option, isSelected ? styles.optionSelected : null]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={classRoom.name}
                  >
                    <Text style={styles.optionText}>{classRoom.name}</Text>
                    {/* Selection is a mark AND the accessibility state, never
                        the border alone. */}
                    {isSelected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={iconSize.md}
                        color={colors.primary}
                        accessibilityElementsHidden
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => setIsOpen(false)} style={styles.cancel} accessibilityRole="button">
              <Text style={styles.cancelText}>Vazgeç</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = themedStyles(() => ({
  block: {
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  // Past the accessibility text sizes a long class name and its chevron stop
  // sharing a row; the name takes the width and the mark sits under it.
  cardStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  name: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    padding: spacing.lg,
  },
  sheet: {
    maxHeight: "80%",
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sheetTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  sheetList: {
    gap: spacing.xs,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  optionSelected: {
    borderColor: colors.primary,
  },
  optionText: {
    ...typography.body,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  cancel: {
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    ...typography.button,
    color: colors.textSecondary,
  },
}));
