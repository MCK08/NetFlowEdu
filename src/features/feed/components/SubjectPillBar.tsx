import { memo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

interface SubjectPillBarProps {
  /** The real subject list (the product's own taxonomy). */
  subjects: readonly string[];
  /** null means "Tümü". */
  selected: string | null;
  onSelect: (subject: string | null) => void;
}

export const ALL_SUBJECTS_LABEL = "Tümü";

// Phase 109 — the feed's first-level filter: "Tümü" and the subjects,
// one horizontal line. Selection is carried by fill AND weight AND the
// accessibility state, never colour alone.
function SubjectPillBarComponent({ subjects, selected, onSelect }: SubjectPillBarProps) {
  useThemeSubscription();
  const options: (string | null)[] = [null, ...subjects];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      alwaysBounceHorizontal={false}
      accessibilityRole="tablist"
    >
      {options.map((option) => {
        const isActive = option === selected;
        const label = option ?? ALL_SUBJECTS_LABEL;
        return (
          <Pressable
            key={label}
            onPress={() => onSelect(option)}
            style={[styles.pill, isActive ? styles.pillActive : null]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={option ? `${option} soruları` : "Tüm dersler"}
          >
            <Text style={[styles.label, isActive ? styles.labelActive : null]}>{label}</Text>
          </Pressable>
        );
      })}
      <View style={styles.tail} />
    </ScrollView>
  );
}

export const SubjectPillBar = memo(SubjectPillBarComponent);

const styles = themedStyles(() => ({
  content: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    alignItems: "center",
  },
  pill: {
    minHeight: minTouchTarget - spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.divider,
    justifyContent: "center",
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  label: {
    ...typography.caption,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  labelActive: {
    fontWeight: "700",
    color: colors.textInverse,
  },
  tail: {
    width: spacing.xs,
  },
}));
