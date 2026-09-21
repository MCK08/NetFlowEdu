import { existsSync, readFileSync } from "fs";
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
  // Phase 114 — ActionTile's own case was removed with the component: the
  // Profile quick-action row was its last call site, and a primitive with no
  // caller is not a shrink-to-fit guarantee, just an untested file.

  // Phase 115 — AppearanceSelector's three-pill row became the Görünüm
  // screen, where each option owns a full-width row. A label with the whole
  // row does not need to shrink; it wraps. So the shrink-to-fit case went
  // with the component, and the wrapping rule that replaced it is checked.
  it("gives each appearance option a full row whose label can wrap", () => {
    const source = read("src/features/profile/screens/AppearanceScreen.tsx");

    expect(existsSync(join(ROOT, "src/theme/AppearanceSelector.tsx"))).toBe(false);
    expect(source).toMatch(/label: \{[\s\S]*?flex: 1,\s*minWidth: 0,/);
    expect(source).not.toMatch(/<Text style={styles.label}[^>]*numberOfLines/);
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

  // Phase 114 — there is no equal-width tile row left in the app. Profile's
  // was the last one (Phase 111 had already removed the teacher dashboard's),
  // and it is now a grouped list whose rows are full width, so a label has
  // the whole row to use and wraps instead of competing for a third of it.
  it("replaces the tile row with full-width rows whose text can wrap", () => {
    const group = read("src/features/profile/components/ProfileMenuGroup.tsx");

    expect(read("src/features/profile/screens/ProfileScreen.tsx")).not.toContain("<ActionTile");
    expect(group).toMatch(/flex: 1,\s*minWidth: 0,/);
    expect(group).not.toMatch(/<Text style={styles.description} numberOfLines/);
  });
});
