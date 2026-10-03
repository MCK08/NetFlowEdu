import { memo } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { minTouchTarget, stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

export type AssignmentDetailTab = "overview" | "students" | "questions";

export const ASSIGNMENT_DETAIL_TABS: readonly { value: AssignmentDetailTab; label: string }[] = [
  { value: "overview", label: "Genel Bakış" },
  { value: "students", label: "Öğrenciler" },
  { value: "questions", label: "Sorular" },
];

interface AssignmentDetailTabsProps {
  selected: AssignmentDetailTab;
  onSelect: (tab: AssignmentDetailTab) => void;
}

// Phase 128 — three views of ONE assignment, never three screens.
//
// The approved direction splits the detail into what it is (Genel Bakış), who
// has answered (Öğrenciler) and what was asked (Sorular). It is local state:
// switching reads nothing, keeps the route and the back stack exactly as they
// were, and the overview is where the screen always opens.
//
// Each segment is a real tab to assistive technology — role, selected state,
// and a 44pt target. Past the accessibility sizes three labels cannot share a
// row without "Öğrenciler" breaking inside itself, so they stack instead.
export const AssignmentDetailTabs = memo(function AssignmentDetailTabs({
  selected,
  onSelect,
}: AssignmentDetailTabsProps) {
  useThemeSubscription();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= stackAtFontScale;

  return (
    <View style={[styles.bar, stacked ? styles.barStacked : null]} accessibilityRole="tablist">
      {ASSIGNMENT_DETAIL_TABS.map((tab) => {
        const isSelected = tab.value === selected;
        return (
          <Pressable
            key={tab.value}
            onPress={() => onSelect(tab.value)}
            style={[styles.tab, stacked ? styles.tabStacked : null, isSelected ? styles.tabSelected : null]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={tab.label}
          >
            <Text style={[styles.label, isSelected ? styles.labelSelected : null]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = themedStyles(() => ({
  bar: {
    flexDirection: "row",
    gap: spacing.xxs,
    padding: spacing.xxs,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  barStacked: {
    flexDirection: "column",
  },
  tab: {
    flex: 1,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.md,
  },
  // Stacked, a tab is a full-width row rather than a third of one.
  tabStacked: {
    flex: 0,
    alignSelf: "stretch",
  },
  tabSelected: {
    backgroundColor: colors.surface,
  },
  label: {
    ...typography.button,
    color: colors.textSecondary,
    textAlign: "center",
  },
  labelSelected: {
    color: colors.primary,
  },
}));
