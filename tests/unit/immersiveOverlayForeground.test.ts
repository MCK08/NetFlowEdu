import { readFileSync } from "fs";
import { join } from "path";

// Phase 103 — dark theme audit. The feed media cards are pinned dark in BOTH
// themes (darkColors.background / IMMERSIVE_SURFACE), but their overlay
// foreground used `colors.textInverse`, which flips to near-black in dark
// mode: the author, caption, counts, pills, spinners and the class feed's
// "Cevapla" pill were unreadable. Anything painted on those pinned-dark
// surfaces uses the constant IMMERSIVE_FOREGROUND instead (the Phase 55
// FeedScreen chrome fix, extended to the cards themselves).

const ROOT = join(__dirname, "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const PINNED_DARK_OVERLAYS = [
  "src/components/feed/FeedCaption.tsx",
  "src/components/feed/FeedActionRail.tsx",
  "src/components/feed/FeedAuthorHeader.tsx",
  "src/components/feed/FeedImage.tsx",
  "src/features/feed/components/FeedCard.tsx",
  "src/features/classes/components/ClassFeedCard.tsx",
  "src/features/classes/screens/ClassFeedScreen.tsx",
];

describe("immersive overlay foreground", () => {
  it("keeps the immersive foreground a constant white", () => {
    expect(read("src/theme/immersive.ts")).toMatch(/IMMERSIVE_FOREGROUND = "#FFFFFF"/);
  });

  it.each(PINNED_DARK_OVERLAYS)("%s never paints overlay content with the theme-flipping inverse", (file) => {
    const source = read(file);

    expect(source).not.toContain("colors.textInverse");
    expect(source).toContain('import { IMMERSIVE_FOREGROUND } from "@theme/immersive";');
  });

  it("FeedPill pins the on-image fills but keeps the theme pairing on the primary accent fill", () => {
    const source = read("src/components/feed/FeedPill.tsx");

    expect(source).toContain('tone === "accent" ? colors.textInverse : IMMERSIVE_FOREGROUND');
    expect(source).toMatch(/accent:\s*\{\s*backgroundColor: colors\.primary,/);
  });

  it("the class detail's pinned-dark feed entry uses the constant foreground for icon and label", () => {
    const source = read("src/features/classes/screens/StudentClassDetailScreen.tsx");

    expect(source).toMatch(/name="play-circle"[^>]*color=\{IMMERSIVE_FOREGROUND\}/);
    expect(source).toMatch(/feedButton:\s*\{[^}]*backgroundColor: darkColors\.background,/);
    expect(source).toMatch(/feedButtonText:\s*\{[^}]*color: IMMERSIVE_FOREGROUND,/);
  });

  it("the class feed's answer pill is white with dark text in both themes", () => {
    const source = read("src/features/classes/components/ClassFeedCard.tsx");

    expect(source).toMatch(/answerButton:\s*\{[^}]*backgroundColor: IMMERSIVE_FOREGROUND,/);
    expect(source).toMatch(/answerButtonText:\s*\{[^}]*color: darkColors\.background,/);
  });
});
