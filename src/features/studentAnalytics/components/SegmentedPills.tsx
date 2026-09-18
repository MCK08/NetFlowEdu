import { Pressable, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

interface SegmentedPillsProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labelFor: (value: T) => string;
  /** What the group chooses, for assistive technology ("Dönem", "Arşiv filtresi"). */
  accessibilityLabel: string;
}

// Phase 107 — the compact choice control for the range and archive filters.
//
// Radio semantics, because exactly one option is always in force. The pills
// wrap rather than shrink, so at a large text size a Turkish label moves to
// the next line instead of being cut to "Tekrar Bek…". Selection is carried
// by the filled pill AND by the accessibility state, never by colour alone.
export function SegmentedPills<T extends string>({
  options,
  value,
  onChange,
  labelFor,
  accessibilityLabel,
}: SegmentedPillsProps<T>) {
  useThemeSubscription();
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={labelFor(option)}
            style={[styles.pill, selected ? styles.pillSelected : styles.pillIdle]}
          >
            <Text style={[styles.label, selected ? styles.labelSelected : null]}>{labelFor(option)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  pill: {
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  pillIdle: {
    backgroundColor: colors.surface,
    borderColor: colors.divider,
  },
  pillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
  labelSelected: {
    color: colors.textInverse,
  },
}));
