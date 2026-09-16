import { readFileSync } from "fs";
import { join } from "path";

// Phase 104 (M5) — an empty panel has to be readable on the ground it is
// actually standing on.
//
// The immersive feed pager is pinned to IMMERSIVE_SURFACE in BOTH themes,
// but EmptyState painted its text with the THEME's foreground. In light mode
// that resolved to #4A5568 / #666E7D on #0B0B0F: the explanation was there
// and almost invisible. That is Phase 103's D10 mismatch pointing the other
// way, so the fix is the same shape — pin the foreground where the surface
// is pinned, and leave every themed caller alone.

const ROOT = join(__dirname, "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const EMPTY_STATE = "src/components/ui/EmptyState.tsx";
const FEED_SCREEN = "src/features/feed/screens/FeedScreen.tsx";
const FEED_LOCAL_EMPTY_STATE = "src/features/feed/components/EmptyState.tsx";

function styleBlock(source: string, name: string): string {
  const match = source.match(new RegExp(`^\\s+${name}:\\s*\\{([^{}]*)\\}`, "m"));
  return match?.[1] ?? "";
}

describe("EmptyState tone contract", () => {
  it("keeps the default tone on the theme's own foreground", () => {
    const source = read(EMPTY_STATE);

    expect(styleBlock(source, "title")).toMatch(/color: colors\.textSecondary,/);
    expect(styleBlock(source, "description")).toMatch(/color: colors\.textTertiary,/);
    // The icon's default must stay themed too — it is the third thing on the
    // panel and would be the first to disappear.
    expect(source).toContain("isImmersive ? IMMERSIVE_FOREGROUND : colors.textTertiary");
  });

  it("pins the immersive tone to the shared immersive foreground token", () => {
    const source = read(EMPTY_STATE);

    expect(source).toContain('import { IMMERSIVE_FOREGROUND } from "@theme/immersive";');
    expect(styleBlock(source, "titleImmersive")).toMatch(/color: IMMERSIVE_FOREGROUND,/);
    expect(styleBlock(source, "descriptionImmersive")).toMatch(/color: IMMERSIVE_FOREGROUND,/);
    // No screen-specific colour invented for this surface — checked against
    // the CODE only. The comments in that file quote the very hex values
    // that made the panel unreadable (#4A5568 on #0B0B0F), and explaining a
    // defect must never be the reason a test fails.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("carries no CTA capability at all", () => {
    // Phase 104 — an optional action prop was added and then removed: every
    // one of the 54 call sites passed nothing to it, and the feed (the panel
    // that most looked like it wanted a button) is contractually forbidden
    // one. An API with no caller is speculation, and on THIS primitive it
    // would invite exactly the fabricated "next step" the feed's channel
    // contract rules out.
    const source = read(EMPTY_STATE);

    expect(source).not.toMatch(/^\s*action\?:/m);
    expect(source).not.toContain("PrimaryButton");
  });

  it("is never handed an action by any caller", () => {
    const callers = [FEED_SCREEN, FEED_LOCAL_EMPTY_STATE];

    for (const caller of callers) {
      const panels = read(caller).match(/<(Shared)?EmptyState\b[\s\S]*?\/>/g) ?? [];
      for (const panel of panels) {
        expect(panel).not.toContain("action=");
      }
    }
  });

  it("opts every immersive-surface feed panel into the immersive tone", () => {
    const source = read(FEED_SCREEN);
    const panels = source.match(/<SharedEmptyState\b[\s\S]*?\/>/g) ?? [];
    const immersivePanels = panels.filter(
      (panel) => panel.includes("IMMERSIVE_SURFACE") || panel.includes("cloud-offline-outline"),
    );

    expect(immersivePanels.length).toBeGreaterThanOrEqual(3);
    for (const panel of immersivePanels) {
      expect(panel).toContain('tone="immersive"');
    }
  });

  it("leaves the themed feed panel on the theme's foreground", () => {
    // This one paints colors.background, which is WHITE in light mode —
    // pinning a light foreground here would recreate the same defect with
    // the colours swapped.
    const source = read(FEED_LOCAL_EMPTY_STATE);

    expect(source).toContain("colors.background");
    expect(source).not.toContain('tone="immersive"');
  });
});
