import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import type { ClassRoom } from "@/types/class";

import { StudentClassCard } from "./StudentClassCard";

export const CLASS_SWITCHER_TITLE = "Sınıfların";

interface ClassSwitcherSheetProps {
  visible: boolean;
  /** The student's joined classes, exactly as useStudentClasses returns them.
   *  Never a catalogue of classes they are not in. */
  classes: readonly ClassRoom[];
  selectedClassId: string | null;
  onSelect: (classId: string) => void;
  onCancel: () => void;
}

// Phase 118 — switching between the classes a student has already joined.
//
// This is the list the Sınıf tab used to BE. Showing it as the whole tab meant
// a student in one class — which is most of them — got a screen containing a
// single card, with everything real one tap behind it. It is a picker now, and
// only opens when there is more than one class to pick.
//
// It lists joined classes only: there is no class discovery in this product
// and this sheet does not invent one. The active/archived split is the class
// document's own `status`, the same one the list always grouped by.
export function ClassSwitcherSheet({
  visible,
  classes,
  selectedClassId,
  onSelect,
  onCancel,
}: ClassSwitcherSheetProps) {
  useThemeSubscription();
  const active = classes.filter((room) => room.status !== "archived");
  const archived = classes.filter((room) => room.status === "archived");

  function renderGroup(title: string, rooms: readonly ClassRoom[]) {
    if (rooms.length === 0) return null;
    return (
      <View style={styles.group}>
        <Text style={styles.groupTitle} accessibilityRole="header">
          {title}
        </Text>
        {rooms.map((room) => (
          <StudentClassCard
            key={room.id}
            classRoom={room}
            selected={room.id === selectedClassId}
            onPress={() => onSelect(room.id)}
          />
        ))}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title} accessibilityRole="header">
            {CLASS_SWITCHER_TITLE}
          </Text>
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {renderGroup("Aktif Sınıflarım", active)}
            {renderGroup("Geçmiş Sınıflar", archived)}
          </ScrollView>
          <Pressable onPress={onCancel} style={styles.cancelButton} accessibilityRole="button">
            <Text style={styles.cancelText}>Vazgeç</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
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
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.xxs,
  },
  group: {
    gap: spacing.xs,
  },
  groupTitle: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  cancelButton: {
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    ...typography.button,
    color: colors.textSecondary,
  },
}));
