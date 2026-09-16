import { readFileSync } from "fs";
import { join } from "path";

// Phase 103 — 150% text audit. Equal-width button rows (Profile quick
// actions, teacher quick actions, the appearance selector) clipped or
// mid-word-wrapped their labels at large OS text sizes. The contract pinned
// here: those labels stay on one line and shrink to fit instead.

const ROOT = join(__dirname, "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function textOpeningTags(source: string): string[] {
  return source.match(/<Text\b[^>]*>/g) ?? [];
}

function expectSingleLineShrinkToFit(tag: string): void {
  expect(tag).toMatch(/numberOfLines=\{1\}/);
  expect(tag).toMatch(/\badjustsFontSizeToFit\b(?!=\{false\})/);
  expect(tag).toMatch(/minimumFontScale=\{0\.5\}/);
}

describe("action label text scaling", () => {
  it("ActionTile's label shrinks to fit on one line instead of ellipsizing", () => {
    const tags = textOpeningTags(read("src/components/ui/ActionTile.tsx"));

    expect(tags).toHaveLength(1);
    expectSingleLineShrinkToFit(tags[0] ?? "");
  });

  it("AppearanceSelector's option label shrinks to fit instead of wrapping mid-word", () => {
    const tags = textOpeningTags(read("src/theme/AppearanceSelector.tsx"));

    expect(tags).toHaveLength(1);
    expectSingleLineShrinkToFit(tags[0] ?? "");
  });

  it("StudyProgressCard's stat labels shrink to fit instead of clipping", () => {
    const source = read("src/features/study/components/StudyProgressCard.tsx");
    const tag = textOpeningTags(source).find((candidate) => candidate.includes("styles.statLabel"));

    expectSingleLineShrinkToFit(tag ?? "");
    expect(source).toMatch(/flex: 1,\s*minWidth: 0,/);
  });

  it("StudyOutcomeButtons' labels shrink to fit instead of clipping", () => {
    const source = read("src/features/study/components/StudyOutcomeButtons.tsx");
    const tag = textOpeningTags(source).find((candidate) => candidate.includes("styles.buttonLabel"));

    expectSingleLineShrinkToFit(tag ?? "");
    expect(source).toMatch(/flex: 1,\s*minWidth: 0,/);
  });

  it("keeps the equal-width tile rows that make shrinking necessary", () => {
    for (const file of [
      "src/features/profile/screens/ProfileScreen.tsx",
      "src/features/teacher/components/TeacherQuickActions.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("<ActionTile");
      expect(source).toMatch(/flex: 1,\s*minWidth: 0,/);
    }
  });
});
