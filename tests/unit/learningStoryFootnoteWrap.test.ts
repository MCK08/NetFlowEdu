import { readFileSync } from "fs";
import { join } from "path";

// Phase 103 — 150% text audit. The learning story footnote (icon + one
// caption sentence) was clipped mid-word on a single line ("…tüm çalışma so")
// at a large OS text size instead of wrapping, whether its Text was sized
// inside the row by shrink or by flex. It now uses the shape of
// ProfileScreen's tour row, which wraps correctly on the same device: a
// top-aligned row with the sentence inside its own `flex: 1` column.

const ROOT = join(__dirname, "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function styleBlock(source: string, name: string): string {
  const match = source.match(new RegExp(`^\\s+${name}:\\s*\\{([^{}]*)\\}`, "m"));
  return match?.[1] ?? "";
}

describe("learning story footnote wrapping", () => {
  it.each([
    "src/features/learningStory/screens/StudentLearningStoryScreen.tsx",
    "src/features/learningStory/screens/TeacherLearningStoryScreen.tsx",
  ])("%s wraps the footnote sentence in its own flex column", (file) => {
    const source = read(file);

    expect(source).toMatch(/<View style=\{styles\.footnoteBody\}>\s*<Text style=\{styles\.footnoteText\}>/);
    expect(styleBlock(source, "footnote")).toMatch(/alignItems: "flex-start",/);
    expect(styleBlock(source, "footnoteBody")).toMatch(/flex: 1,\s*minWidth: 0,/);
    expect(styleBlock(source, "footnoteText")).not.toMatch(/\bflex(Shrink|Grow)?:/);
  });

  // Phase 114 moved the tour row from Profil to the Ayarlar screen behind
  // the gear. Same row, same wrapping shape — only its address changed.
  it("mirrors the tour row that already wraps correctly at a large text size", () => {
    const source = read("src/features/profile/screens/SettingsScreen.tsx");

    expect(styleBlock(source, "tourRow")).toMatch(/alignItems: "flex-start",/);
    expect(styleBlock(source, "tourCopy")).toMatch(/flex: 1,\s*minWidth: 0,/);
  });
});
