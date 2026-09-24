import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleProp, Text, TextStyle, View, ViewStyle } from "react-native";

import { colors } from "@theme/colors";
import { iconSize } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";

export type StatusTone = "danger" | "success" | "primary" | "neutral" | "muted";

interface StatusLabelProps {
  icon: keyof typeof Ionicons.glyphMap;
  tone: StatusTone;
  /** The words. The glyph is decorative; this is what a screen reader gets. */
  children: string;
  /** The type role and colour of the words, supplied by the caller. */
  textStyle: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  /** Defaults to the caption-sized glyph; the hero verdict lines pass a larger one. */
  size?: number;
}

// Phase 104 (B5/B1) — a status word with its glyph.
//
// The teacher surfaces said "state" with emoji spliced into strings —
// "🔴 Öğrenci F", "📉 Geriliyor", "➡️ Değişiklik yok", "🟢 Çoğu öğrenci
// ilerledi". Five files, four private vocabularies, each rendered by the OS
// emoji font: coloured discs that read as a traffic light, boxed arrows that
// do not match any other mark in the product, and glyphs that ignore the
// theme entirely. The Action Center already does this properly (an Ionicons
// mark in the state's accent, beside the words); this is that pattern, named,
// so the class summary, the priority rows, the trend lines and the verdict
// cards all speak the same visual language as the rows above them.
//
// The words carry the meaning and the colour never does alone: the glyph is
// hidden from assistive technology and the caller's text remains the single
// accessible node, exactly as before.
/** The palette colour one tone resolves to. Exported for the rare caller that
 *  needs the tone on something other than the words — an accent bar drawn
 *  beside them — so a second mapping can never disagree with this one. */
export function statusToneColor(tone: StatusTone): string {
  switch (tone) {
    case "danger":
      return colors.danger;
    case "success":
      return colors.success;
    case "primary":
      return colors.primary;
    case "neutral":
      return colors.textSecondary;
    case "muted":
      return colors.textTertiary;
  }
}

export const StatusLabel = memo(function StatusLabel({
  icon,
  tone,
  children,
  textStyle,
  style,
  size = iconSize.xs,
}: StatusLabelProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's colours after a live theme switch.
  useThemeSubscription();
  return (
    <View style={[styles.row, style]}>
      <Ionicons name={icon} size={size} color={statusToneColor(tone)} accessibilityElementsHidden />
      <Text style={[styles.text, textStyle]}>{children}</Text>
    </View>
  );
});

const styles = themedStyles(() => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  text: {
    flexShrink: 1,
  },
}));
