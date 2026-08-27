import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

export type FeedPillTone = "solid" | "translucent" | "accent";

interface FeedPillProps {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: FeedPillTone;
}

// The on-image counterpart to the light-surface Badge/Chip primitives.
//
// Badge and Chip are tuned for light backgrounds (surfaceMuted fill,
// textSecondary label) and wash out to near-invisible over a photograph,
// so the feed cards need a variant with inverse text and a translucent
// fill. This is deliberately a separate small component rather than a new
// variant bolted onto Badge: Badge is consumed by several already-shipped
// screens and this phase must not risk changing how any of them render.
export const FeedPill = memo(function FeedPill({ label, icon, tone = "translucent" }: FeedPillProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  return (
    <View style={[styles.container, TONE_STYLES[tone]]}>
      {icon ? <Ionicons name={icon} size={11} color={colors.textInverse} /> : null}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
});

const styles = themedStyles(() => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    alignSelf: "flex-start",
    flexShrink: 1,
  },
  label: {
    ...typography.label,
    color: colors.textInverse,
    flexShrink: 1,
  },
  translucent: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  solid: {
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  accent: {
    backgroundColor: colors.primary,
  },
}));

const TONE_STYLES = {
  translucent: styles.translucent,
  solid: styles.solid,
  accent: styles.accent,
} as const;
