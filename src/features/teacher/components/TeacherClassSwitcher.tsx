import { Text, View } from "react-native";

import { SegmentedPills } from "@features/studentAnalytics/components/SegmentedPills";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import type { ClassRoom } from "@/types/class";

interface TeacherClassSwitcherProps {
  classes: readonly ClassRoom[];
  selectedClassId: string;
  onSelect: (classId: string) => void;
}

// Phase 111 — which class "Bugün" and "Aksiyonlar" are about.
//
// Drawn only when there is a real choice (two or more active classes). The
// product's existing radio-group pills: one class is always selected, the
// selection is announced, and long class names wrap instead of truncating.
export function TeacherClassSwitcher({ classes, selectedClassId, onSelect }: TeacherClassSwitcherProps) {
  useThemeSubscription();
  if (classes.length < 2) return null;
  const names = new Map(classes.map((classRoom) => [classRoom.id, classRoom.name]));
  return (
    <View style={styles.block}>
      <Text style={styles.label}>Sınıf</Text>
      <SegmentedPills
        options={classes.map((classRoom) => classRoom.id)}
        value={selectedClassId}
        onChange={onSelect}
        labelFor={(classId) => names.get(classId) ?? "Sınıf"}
        accessibilityLabel="Gösterilen sınıf"
      />
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
}));
