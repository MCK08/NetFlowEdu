import { readFileSync } from "fs";
import { join } from "path";

// Phase 104 (H3) — one announcement per control.
//
// A row that says "Öğrenciyi Gör" and then reads its chevron aloud, or a
// tile that announces its label and then its glyph, is not extra
// information — it is the same action twice. These controls already carry a
// complete accessible name on the PARENT, so the icon inside is decoration
// and is marked as such.
//
// The point of this file is ownership, not prop-spotting: for every control
// it checks that the parent still holds the name AND that the icon does not
// compete with it. A test that merely counted accessibility props would go
// green on exactly the duplication this fixes.

const ROOT = join(__dirname, "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, "src", relativePath), "utf8");
}

/** The opening tag of the first element of `kind` that carries `marker`. */
function openingTag(source: string, kind: string, marker: string): string {
  const tags = source.match(new RegExp(`<${kind}\\b(?:[^<>]|<[^>]*>)*?>`, "g")) ?? [];
  return tags.find((tag) => tag.includes(marker)) ?? "";
}

/** Every <Ionicons> opening tag in the file. */
function iconTags(source: string): string[] {
  return source.match(/<Ionicons\b[\s\S]*?\/>/g) ?? [];
}

function expectDecorative(icons: string[], name: string): void {
  const icon = icons.find((tag) => tag.includes(name));
  expect(icon).toBeDefined();
  expect(icon).toContain("accessibilityElementsHidden");
  // An icon that carried its own name would be a second announcement.
  expect(icon).not.toContain("accessibilityLabel");
}

describe("decorative icon ownership", () => {
  it("ActionTile announces its label, not its glyph", () => {
    const source = read("components/ui/ActionTile.tsx");
    const parent = openingTag(source, "AnimatedPressable", "accessibilityLabel={label}");

    expect(parent).toContain('accessibilityRole="button"');
    expectDecorative(iconTags(source), "{icon}");
  });

  it("IconButton requires its own name and keeps the glyph silent", () => {
    const source = read("components/ui/IconButton.tsx");
    const parent = openingTag(source, "AnimatedPressable", "accessibilityLabel={accessibilityLabel}");

    // Required, not optional: the primitive can never be nameless.
    expect(source).toMatch(/accessibilityLabel:\s*string;/);
    expect(parent).toContain('accessibilityRole="button"');
    expectDecorative(iconTags(source), "{icon}");
  });

  it("FeedActionRail keeps the spoken count on the action, not the puck", () => {
    const source = read("components/feed/FeedActionRail.tsx");

    // Both branches (pressable and plain view) own the label.
    expect(source).toContain("accessibilityLabel={label}");
    expect(source).toContain("accessibilityState={{ selected: active }}");
    expectDecorative(iconTags(source), "{glyph}");
  });

  it("CameraButton keeps its action name and hint on the button", () => {
    const source = read("features/upload/components/CameraButton.tsx");
    const parent = openingTag(source, "AnimatedPressable", 'accessibilityLabel="Fotoğraf çek"');

    expect(parent).toContain('accessibilityRole="button"');
    expect(parent).toContain("accessibilityHint=");
    expectDecorative(iconTags(source), '"camera"');
  });

  it("RemoveMessageSheet names the row from its title", () => {
    const source = read("features/classes/components/RemoveMessageSheet.tsx");

    // ListCard derives the accessible name from `title`.
    expect(source).toContain("title={REMOVE_MESSAGE_ACTION_LABEL}");
    expectDecorative(iconTags(source), '"remove-circle-outline"');
  });

  it("class detail's three actions each keep one name", () => {
    const source = read("features/classes/screens/StudentClassDetailScreen.tsx");

    for (const label of ["Sınıf sohbetini aç", "Soru paylaş", "Soru akışına gir"]) {
      const parent = openingTag(source, "AnimatedPressable", `accessibilityLabel="${label}"`);
      expect(parent).toContain('accessibilityRole="button"');
    }

    const icons = iconTags(source);
    expectDecorative(icons, '"chatbubble-outline"');
    expectDecorative(icons, '"camera"');
    expectDecorative(icons, '"play-circle"');
  });

  it("teacher action rows keep their composed sentence and silence both chevrons", () => {
    const source = read("features/teacher/components/TeacherActionCenterSection.tsx");

    // The row's name is the whole sentence; the CTA is its last clause.
    expect(source).toContain("accessibilityLabel={joinSpokenLabel(");
    expect(source).toContain("accessibilityLabel={actionCenterViewAllSpokenLabel(");

    const chevrons = iconTags(source).filter((tag) => tag.includes('"chevron-forward"'));
    expect(chevrons).toHaveLength(2);
    for (const chevron of chevrons) {
      expect(chevron).toContain("accessibilityElementsHidden");
    }
    expectDecorative(iconTags(source), "KIND_ICON[item.kind]");
  });
});
