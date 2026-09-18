import type { StatusTone } from "@components/ui/StatusLabel";
import { colors } from "@theme/colors";

// Phase 107 — the colour for a StatusLabel's WORDS.
//
// StatusLabel tints only its glyph; the text's colour is the caller's (see its
// textStyle doc). Without this the words fell back to the platform default,
// which is black — unreadable on the dark surface. Resolved at render time,
// never at module scope, so a live theme switch repaints it (the Phase 52
// freeze: a map built at import time keeps whichever palette loaded first).
export function toneTextColor(tone: StatusTone): string {
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
    default:
      return colors.textTertiary;
  }
}
