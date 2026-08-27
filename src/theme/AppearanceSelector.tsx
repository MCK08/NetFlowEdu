// Phase 49 — the user-facing appearance control.
//
// One shared component rather than one per role: ProfileScreen is already
// shared by the (student) and (teacher) tab groups, so implementing it here
// covers both without duplicating the choice or letting them drift.
//
// Built from the same Card/SectionHeader primitives the rest of the Profile
// screen uses, so this reads as an existing section rather than a new
// settings surface.

import { Pressable, Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { SectionHeader } from "@components/ui/SectionHeader";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { typography } from "@theme/typography";

import { useTheme } from "./ThemeProvider";
import { ThemePreference } from "./themePreference";

// Order matters: "Sistem" first because it is the default and the least
// committal choice.
const OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Sistem" },
  { value: "light", label: "Açık" },
  { value: "dark", label: "Koyu" },
] as const;

export function AppearanceSelector() {
  const { preference, setPreference } = useTheme();

  return (
    <Card>
      <SectionHeader title="Görünüm" />
      <View style={styles.row} accessibilityRole="radiogroup">
        {OPTIONS.map((option) => {
          // Checked against the stored PREFERENCE, not the resolved theme —
          // otherwise "Sistem" would never look selected on a light device
          // (it would highlight "Açık" instead) and the user could not tell
          // which mode they are actually in.
          const isSelected = preference === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setPreference(option.value)}
              style={[styles.option, isSelected ? styles.optionSelected : null]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`Görünüm: ${option.label}`}
            >
              <Text style={isSelected ? styles.labelSelected : styles.label}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = themedStyles(() => ({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  option: {
    flex: 1,
    minHeight: 44, // keeps the touch target at the platform minimum
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  label: {
    ...typography.body,
    color: colors.textSecondary,
  },
  labelSelected: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
}));
