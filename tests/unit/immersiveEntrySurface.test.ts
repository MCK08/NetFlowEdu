import { readFileSync } from "fs";
import { join } from "path";

// Phase 104 — the class detail "Soru Akışına Gir" control.
//
// Found by Wave-A runtime QA, pre-existing before this phase: the button's
// fill was pinned to darkColors.background, which is EXACTLY the dark theme's
// page background. Light mode read as intended (a dark pill that previews the
// immersive feed it opens); dark mode lost the button entirely and left the
// label floating on the page.
//
// The contract pinned here is the SELECTION, not the hex: the pinned pill
// survives where it carries meaning, and dark falls back to the palette's own
// raised-container token. Asserting colours would pass just as happily on a
// hardcoded value, which is the thing that caused the defect.

const ROOT = join(__dirname, "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, "src", relativePath), "utf8");
}

function styleBlock(source: string, name: string): string {
  const match = source.match(new RegExp(`^\\s+${name}:\\s*\\{([^{}]*)\\}`, "m"));
  return match?.[1] ?? "";
}

const CLASS_DETAIL = "features/classes/screens/StudentClassDetailScreen.tsx";

describe("immersive entry surface", () => {
  it("keeps the pinned pill in light and a raised surface in dark", () => {
    const fill = styleBlock(read(CLASS_DETAIL), "feedButton");

    expect(fill).toContain('getActiveTheme() === "dark" ? colors.surface : darkColors.background');
    // No screen-local colour invented for either theme.
    expect(fill).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("resolves the APP theme, not the device scheme", () => {
    const source = read(CLASS_DETAIL);

    expect(source).toContain('import { getActiveTheme, themedStyles } from "@theme/themeRuntime";');
    // useColorScheme would ignore an explicit Light/Dark preference and is
    // only legitimate inside ThemeProvider itself.
    expect(source).not.toContain("useColorScheme");
  });

  it("branches inside the themed factory so a theme switch recomputes it", () => {
    const source = read(CLASS_DETAIL);
    const factoryStart = source.indexOf("const styles = themedStyles(");
    const branch = source.indexOf("getActiveTheme() ===");

    expect(factoryStart).toBeGreaterThan(-1);
    // Inside the factory, not hoisted to module scope where it would be
    // evaluated once and frozen at the theme that happened to be active.
    expect(branch).toBeGreaterThan(factoryStart);
  });

  it("uses the token the app's own raised containers use", () => {
    // `surface` is declared "cards, elevated panels" and is Card's base fill,
    // so the dark branch is a semantic match rather than a convenient hex.
    const palette = readFileSync(join(ROOT, "src", "theme", "palettes.ts"), "utf8");
    const card = read("components/ui/Card.tsx");

    expect(palette).toMatch(/surface: string; \/\/ cards, elevated panels/);
    expect(styleBlock(card, "base")).toContain("backgroundColor: colors.surface,");
  });

  it("leaves the immersive media cards pinned, since they sit on the pager itself", () => {
    // These merge into IMMERSIVE_SURFACE on purpose — they are not the same
    // defect and must not be "fixed" along with it.
    for (const file of [
      "features/feed/components/FeedCard.tsx",
      "features/classes/components/ClassFeedCard.tsx",
    ]) {
      expect(styleBlock(read(file), "card")).toContain("backgroundColor: darkColors.background,");
    }
  });
});
