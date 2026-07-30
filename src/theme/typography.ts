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
  "displayLg" | "title" | "subtitle" | "body" | "bodyStrong" | "caption" | "label",
  TypographyToken
> = {
  displayLg: { fontSize: 28, fontWeight: "700", lineHeight: 34 },
  title: { fontSize: 18, fontWeight: "700", lineHeight: 24 },
  subtitle: { fontSize: 15, fontWeight: "600", lineHeight: 20 },
  body: { fontSize: 14, fontWeight: "400", lineHeight: 20 },
  bodyStrong: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: "500", lineHeight: 16 },
  label: { fontSize: 11, fontWeight: "700", lineHeight: 14 },
};
