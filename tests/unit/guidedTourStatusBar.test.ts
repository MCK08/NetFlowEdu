import fs from "fs";
import path from "path";

// Phase 103 — the first-run guided tour is an opaque theme surface drawn over
// the Feed, and the Feed forces a light (white-icon) status bar for its dark
// immersive header. On a Light theme that left the clock and battery
// white-on-white for the whole tour.
//
// A StatusBar inside the overlay does NOT fix it: React Native applies the
// most recently mounted StatusBar, and on a cold start the Feed mounts after
// the auth redirect settles — after the tour. The simulator showed the icons
// still invisible with that approach. The Feed must yield instead, so the
// root layout's theme-matched bar applies whatever the mount order.

const read = (rel: string) => fs.readFileSync(path.join(__dirname, "..", "..", rel), "utf8");

describe("guided tour status bar", () => {
  const feed = read("src/features/feed/screens/FeedScreen.tsx");

  it("the Feed no longer declares a status bar of its own (Phase 109: a themed surface)", () => {
    // The Phase 103 yield existed because the Feed forced a light bar for
    // its pinned-dark pager. The pager follows the theme now, so the root
    // layout's theme-matched bar is the only one, tour or no tour.
    expect(feed).not.toContain("<StatusBar");
    expect(feed).not.toContain("useGuidedTour");
  });

  it("the overlay still reads the hoisted tour state it is rendered from", () => {
    const host = read("src/features/onboarding/components/GuidedTourHost.tsx");
    expect(host).toContain('tour.presentation.kind !== "visible"');
  });

  it("the root layout's theme-matched status bar is what applies while the Feed yields", () => {
    expect(read("app/_layout.tsx")).toContain('<StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />');
  });

  it("the overlay does not declare a competing status bar of its own", () => {
    expect(read("src/features/onboarding/components/GuidedTourOverlay.tsx")).not.toContain("StatusBar");
  });
});
