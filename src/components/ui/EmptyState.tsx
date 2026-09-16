import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, View, ViewStyle } from "react-native";

import { colors } from "@theme/colors";
import { IMMERSIVE_FOREGROUND } from "@theme/immersive";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { iconSize } from "@theme/sizes";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  // Phase 104 (M5) — which ground this panel is standing on.
  //
  // "default" paints the theme's own text colours, which is right on a
  // themed background. The immersive feed is not themed: its pager is
  // pinned to IMMERSIVE_SURFACE in BOTH themes, so in light mode the
  // themed foreground resolved to #4A5568 / #666E7D on #0B0B0F and the
  // explanation was barely readable — the same semantic-colour mismatch as
  // Phase 103's D10, in the opposite direction. "immersive" pins the
  // foreground to the surface the panel actually sits on.
  tone?: "default" | "immersive";
  // Escape hatch for callers that need to size/position the container
  // beyond the default centered padding (e.g. a full-screen paged feed
  // sizing itself to one page's height) — additive, every existing call
  // site that omits it keeps rendering exactly as before.
  style?: ViewStyle;
}

// Generic "nothing here yet" panel — several screens currently just render
// a bare centered <Text> for this (e.g. ProfileScreen's "Henüz soru
// paylaşmadın."). This is a new, opt-in primitive; existing bare-text empty
// states are left as-is for this phase.
//
// Phase 104 — deliberately has NO action/CTA prop. One was written during
// this phase and removed again: all 54 call sites passed nothing to it, and
// the surface that most looked like it wanted a button (the feed) is
// contractually forbidden one — its channel descriptors are a single
// sentence with no fabricated next action. An optional API with no caller is
// a guess about the future, not a capability, so it is not kept here.
export const EmptyState = memo(function EmptyState({
  icon = "file-tray-outline",
  title,
  description,
  tone = "default",
  style,
}: EmptyStateProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  const isImmersive = tone === "immersive";

  return (
    <View style={[styles.container, style]}>
      <Ionicons
        name={icon}
        size={iconSize.xl}
        color={isImmersive ? IMMERSIVE_FOREGROUND : colors.textTertiary}
        style={isImmersive ? styles.immersiveIcon : null}
      />
      <Text style={[styles.title, isImmersive ? styles.titleImmersive : null]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, isImmersive ? styles.descriptionImmersive : null]}>
          {description}
        </Text>
      ) : null}
    </View>
  );
});

const styles = themedStyles(() => ({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
    textAlign: "center",
  },
  description: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },
  // Phase 104 (M5) — the pinned-dark variants, following the restraint the
  // feed's own chrome already uses: the sentence at full strength, the mark
  // and the supporting line stepped back with opacity rather than with a
  // second colour that would have to be invented for this surface.
  immersiveIcon: {
    opacity: 0.7,
  },
  titleImmersive: {
    color: IMMERSIVE_FOREGROUND,
  },
  descriptionImmersive: {
    color: IMMERSIVE_FOREGROUND,
    opacity: 0.75,
  },
}));
