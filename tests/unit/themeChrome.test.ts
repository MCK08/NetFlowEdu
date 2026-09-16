import fs from "fs";
import path from "path";

import { darkColors, lightColors } from "../../src/theme/palettes";
import { IMMERSIVE_SURFACE, immersiveChrome, immersiveTabBarStyle } from "../../src/theme/immersive";
import { resolveTheme } from "../../src/theme/themePreference";
import { getActiveColors, setActiveTheme } from "../../src/theme/themeRuntime";

// themeRuntime only needs StyleSheet.create; the real react-native entry is
// Flow-typed and not loadable under node.
jest.mock("react-native", () => ({ StyleSheet: { create: <T,>(s: T) => s } }));

// Phase 102 — the app's chrome follows the effective theme, and the one
// deliberately dark surface (the student feed pager) carries its own chrome
// with it. Pinned structurally so a white strip cannot quietly return.

const REPO = path.join(__dirname, "..", "..");
const read = (p: string) => fs.readFileSync(path.join(REPO, p), "utf8");
/** Comment lines stripped, so prose about a colour is not read as use of it. */
const code = (text: string) =>
  text.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");

describe("effective theme", () => {
  it("System resolves to the OS scheme; an explicit choice overrides it", () => {
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("system", "light")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
    expect(resolveTheme("light", "dark")).toBe("light");
  });

  it("the runtime palette follows the active theme", () => {
    setActiveTheme("dark");
    expect(getActiveColors()).toBe(darkColors);
    setActiveTheme("light");
    expect(getActiveColors()).toBe(lightColors);
  });

  it("dark and light palettes differ where chrome is painted", () => {
    for (const token of ["background", "surface", "border", "divider", "textPrimary"] as const) {
      expect(darkColors[token]).not.toBe(lightColors[token]);
    }
  });
});

describe("tab bars and stacks are painted with theme tokens", () => {
  it.each(["app/(student)/(tabs)/_layout.tsx", "app/(teacher)/(tabs)/_layout.tsx"])(
    "%s paints tabBarStyle and sceneStyle from tokens, never a literal",
    (file) => {
      const text = code(read(file));
      expect(text).toContain("tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.divider }");
      expect(text).toContain("sceneStyle: { backgroundColor: colors.background }");
      expect(text).not.toMatch(/#fff|#ffffff|"white"|"black"|#000\b/i);
    },
  );

  it.each(["app/_layout.tsx", "app/(student)/_layout.tsx", "app/(teacher)/_layout.tsx"])(
    "%s paints the stack card from tokens (no white flash between screens)",
    (file) => {
      expect(code(read(file))).toContain("contentStyle: { backgroundColor: colors.background }");
    },
  );
});

describe("the immersive feed surface carries its own chrome", () => {
  it("immersive tokens are the dark palette, not ad-hoc values", () => {
    expect(immersiveChrome.divider).toBe(darkColors.divider);
    expect(immersiveChrome.chipSurface).toBe(darkColors.surface);
    expect(immersiveChrome.chipBorder).toBe(darkColors.border);
    expect(immersiveChrome.chipText).toBe(darkColors.textSecondary);
    expect(immersiveChrome.inactiveTint).toBe(darkColors.textTertiary);
    expect(immersiveTabBarStyle()).toEqual({ backgroundColor: IMMERSIVE_SURFACE, borderTopColor: darkColors.divider });
  });

  it("the student feed tab's bar and channel strip use the immersive chrome", () => {
    const tabs = code(read("app/(student)/(tabs)/_layout.tsx"));
    expect(tabs).toContain("tabBarStyle: immersiveTabBarStyle()");
    const feed = code(read("src/features/feed/screens/FeedScreen.tsx"));
    expect(feed).toContain('surface="immersive"');
    expect(feed).toContain("immersiveChrome.surface");
    const bar = code(read("src/features/feed/components/FeedChannelBar.tsx"));
    expect(bar).toContain("immersiveChrome.surface");
    expect(bar).not.toMatch(/#fff|#ffffff|"white"/i);
  });

  it("the feed forces a light status bar only while focused", () => {
    const feed = code(read("src/features/feed/screens/FeedScreen.tsx"));
    // Phase 103 — and only while the first-run guided tour is not covering it;
    // see tests/unit/guidedTourStatusBar.test.ts.
    expect(feed).toContain('{isFocused && !isGuidedTourVisible ? <StatusBar style="light" /> : null}');
  });

  it("the teacher feed stays a themed surface", () => {
    const teacher = code(read("src/features/feed/screens/TeacherFeedScreen.tsx"));
    expect(teacher).not.toContain("immersive");
    expect(teacher).not.toMatch(/#fff|#ffffff|"white"/i);
  });
});
