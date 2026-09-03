import { TextStyle } from "react-native";

// Font sizes/weights already found across screens (titles ~18-28,
// body ~14-15, captions ~11-13) formalized into a named type scale.
// `allowFontScaling` is intentionally left at RN's default (true) on every
// style here — Step 6 (accessibility/dynamic type) requires text to grow
// with the user's OS font-size setting, never opt out of it.
export interface TypographyToken extends TextStyle {
  fontSize: number;
  fontWeight: TextStyle["fontWeight"];
  lineHeight: number;
}

export const typography: Record<
  | "displayLg"
  | "screenTitle"
  | "title"
  | "subtitle"
  | "body"
  | "bodyStrong"
  | "caption"
  | "label",
  TypographyToken
> = {
  displayLg: { fontSize: 28, fontWeight: "700", lineHeight: 34 },
  // Phase 74 — the ROLE, split out of the size.
  //
  // `displayLg` names a scale step, and screens used it for two unrelated
  // jobs: the h1 at the top of a screen, and the oversized figure in a stat
  // block. Because it read as "the big one" rather than "the screen title",
  // screens that felt it was too big for them overrode it in place —
  // producing 28 on the Phase 70-73 surfaces but 26, 24 and 22 elsewhere for
  // the same semantic element. Naming the role gives a screen something to
  // reach for instead of a number to tune, and leaves `displayLg` free to go
  // on being the display scale that stat figures build from.
  //
  // 28/34 is not a new value: it is what the Concept Mastery Map, Struggle
  // Pattern Memory, Learning Story and every auth screen already render.
  screenTitle: { fontSize: 28, fontWeight: "700", lineHeight: 34 },
  title: { fontSize: 18, fontWeight: "700", lineHeight: 24 },
  subtitle: { fontSize: 15, fontWeight: "600", lineHeight: 20 },
  body: { fontSize: 14, fontWeight: "400", lineHeight: 20 },
  bodyStrong: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: "500", lineHeight: 16 },
  label: { fontSize: 11, fontWeight: "700", lineHeight: 14 },
};
