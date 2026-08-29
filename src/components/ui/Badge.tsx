import { memo } from "react";
import { Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

export type BadgeVariant = "neutral" | "primary" | "danger" | "success";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

// Phase 52 — a FUNCTION, not a module-scope constant. Read at import
// time this map froze on whichever palette happened to be active when
// the module first loaded, so it kept rendering light values in dark
// mode. Same freeze Phase 49/51 fixed for StyleSheet.create, in a
// plain object that the codemod never looked at.
function variantColors(): Record<BadgeVariant, { background: string; text: string }> {
  return {
    neutral: { background: colors.surfaceMuted, text: colors.textSecondary },
    primary: { background: colors.primaryMuted, text: colors.primary },
    danger: { background: colors.dangerMuted, text: colors.danger },
    success: { background: colors.successMuted, text: colors.success },
  };
}

// Small pill label — the generic primitive RoleBadge (and any future
// status/count label) builds on, instead of each screen re-implementing
// its own "rounded background + small bold text" View.
export const Badge = memo(function Badge({ label, variant = "neutral" }: BadgeProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  const palette = variantColors()[variant];
  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <Text style={[styles.text, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
});

const styles = themedStyles(() => ({
  container: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  text: {
    ...typography.label,
  },
}));
