import { Ionicons } from "@expo/vector-icons";
import { StyleProp, Text, ViewStyle } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { iconSize } from "@theme/sizes";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { AnimatedPressable } from "./AnimatedPressable";

interface ActionTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  // Optional layout override, applied AFTER the base style so a caller can
  // relax `minWidth` when the tile sits in an equal-width flex row, where
  // several tiles must fit the narrowest supported phone without
  // overflowing (Profile's quick actions). Omitting it renders exactly as before —
  // this prop is additive and changes no existing caller's appearance.
  style?: StyleProp<ViewStyle>;
}

// Icon-over-label quick-action tile, distinct from ListCard's horizontal
// row shape. First adopted by the teacher dashboard's quick actions.
export function ActionTile({ icon, label, onPress, style }: ActionTileProps) {
  return (
    <AnimatedPressable
      onPress={onPress}
      style={[styles.container, style]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {/* Phase 104 (H3) — decorative. The tile owns the accessible name
          (accessibilityLabel={label}), so announcing the glyph too would
          read the same action twice. */}
      <Ionicons name={icon} size={iconSize.lg} color={colors.primary} accessibilityElementsHidden />
      {/* Phase 103 — one line that shrinks to fit rather than ellipsizing:
          tiles sit in equal-width rows, so at a large OS text size a label
          like "Hesap Değiştir" was clipped to "Hesap De…". Wrapping is not an
          option because single long Turkish words would break mid-word. */}
      <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = themedStyles(() => ({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    padding: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    minWidth: 84,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
}));
