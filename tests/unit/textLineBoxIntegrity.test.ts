import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// Phase 103 (D11) — a style that spreads a typography token and then raises
// `fontSize` keeps the token's ORIGINAL `lineHeight` unless it overrides that
// too. iOS clamps the line to `lineHeight`, so a box shorter than the glyphs
// trims the ascender: StudentPerformanceScreen's hero percentage was drawn at
// 40pt inside displayLg's 34pt box and the top of the "%" was sliced off, on
// the physical iPhone and in the simulator alike.
//
// The guard below is deliberately about the RATIO, not about one screen: the
// same mistake is invisible until a tall glyph (%, Ş, Ğ, an accented capital)
// lands in the line. SF Pro's natural line height is ~1.19x the font size, so
// anything at or below the font size has no ascender room whatsoever.

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");

// Below this, the line box leaves too little room for the font's ascent.
// The app's own tokens sit at 1.21–1.43; the two header styles that ride at
// 1.18 (ChatHeader, PublicProfileScreen) render correctly and are left alone.
const MIN_SAFE_RATIO = 1.15;

interface TypographyToken {
  fontSize: number;
  lineHeight: number | null;
}

function typographyTokens(): Map<string, TypographyToken> {
  const source = readFileSync(join(SRC, "theme", "typography.ts"), "utf8");
  const tokens = new Map<string, TypographyToken>();

  for (const match of source.matchAll(/(\w+):\s*\{([^}]*)\}/g)) {
    const body = match[2] ?? "";
    const fontSize = body.match(/fontSize:\s*(\d+)/);
    if (!fontSize) continue;
    const lineHeight = body.match(/lineHeight:\s*(\d+)/);
    tokens.set(match[1] ?? "", {
      fontSize: Number(fontSize[1]),
      lineHeight: lineHeight ? Number(lineHeight[1]) : null,
    });
  }

  return tokens;
}

function sourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      found.push(path);
    }
  }

  return found;
}

interface ResizedStyle {
  file: string;
  line: number;
  name: string;
  token: string;
  fontSize: number;
  lineHeight: number | null;
  ratio: number | null;
}

function stylesThatResizeAToken(): ResizedStyle[] {
  const tokens = typographyTokens();
  const styles: ResizedStyle[] = [];

  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, "utf8");

    for (const match of source.matchAll(/^[ \t]+([A-Za-z]\w*):\s*\{([^{}]*)\}/gm)) {
      const body = match[2] ?? "";
      const spread = body.match(/\.\.\.typography\.(\w+)/);
      const ownFontSize = body.match(/fontSize:\s*(\d+)/);
      if (!spread || !ownFontSize) continue;

      const token = tokens.get(spread[1] ?? "");
      if (!token) continue;

      const ownLineHeight = body.match(/lineHeight:\s*(\d+)/);
      const fontSize = Number(ownFontSize[1]);
      const lineHeight = ownLineHeight ? Number(ownLineHeight[1]) : token.lineHeight;

      styles.push({
        file: file.slice(ROOT.length + 1),
        line: source.slice(0, match.index).split("\n").length,
        name: match[1] ?? "",
        token: spread[1] ?? "",
        fontSize,
        lineHeight,
        // A token with no lineHeight leaves iOS its natural metrics, which
        // never clip — those are safe by construction.
        ratio: lineHeight === null ? null : lineHeight / fontSize,
      });
    }
  }

  return styles;
}

describe("text line box integrity", () => {
  // Phase 104 (H1) — the roles themselves, not only the styles that resize
  // them. The Phase 103 guard below starts from a token and checks what a
  // screen did to it; a role defined with too short a line box would sail
  // straight past it and clip everywhere at once.
  it("defines every typography role with a line box tall enough for its glyphs", () => {
    const offenders = [...typographyTokens().entries()]
      .filter(([, token]) => token.lineHeight !== null && token.lineHeight / token.fontSize < MIN_SAFE_RATIO)
      .map(
        ([name, token]) =>
          `typography.${name}: ${token.fontSize}/${token.lineHeight} = ${(
            (token.lineHeight ?? 0) / token.fontSize
          ).toFixed(2)}`,
      );

    expect(offenders).toEqual([]);
  });

  it("finds the styles that resize a typography token", () => {
    const styles = stylesThatResizeAToken();

    // Guard against the walk silently matching nothing (a refactor of the
    // style syntax would otherwise make this whole suite vacuously pass).
    expect(styles.length).toBeGreaterThanOrEqual(20);
    expect(styles.some((style) => style.name === "bigValueSmall")).toBe(true);
  });

  it("never leaves a resized style with a line box too short for its glyphs", () => {
    const offenders = stylesThatResizeAToken()
      .filter((style) => style.ratio !== null && style.ratio < MIN_SAFE_RATIO)
      .map(
        (style) =>
          `${style.file}:${style.line} ${style.name} (...typography.${style.token}) ` +
          `fontSize ${style.fontSize} / lineHeight ${style.lineHeight} = ${style.ratio?.toFixed(2)}`,
      );

    expect(offenders).toEqual([]);
  });

  it("pins the Student Performance value that D11 clipped", () => {
    // Phase 124 retired the 40/50 hero this used to pin alongside: the success
    // rate is no longer drawn as a giant centred figure, so there is no 40pt
    // style left on that screen to hold to its line box. Nothing about the
    // GUARD changed — the ratio rule above still walks every resized style in
    // src, which is what actually catches a recurrence; only the named example
    // moved to the one that survived.
    const styles = stylesThatResizeAToken();
    const secondary = styles.find((style) => style.name === "bigValueSmall");

    expect(styles.some((style) => style.name === "bigValue")).toBe(false);
    expect(secondary).toMatchObject({ fontSize: 24, lineHeight: 30 });
  });
});
