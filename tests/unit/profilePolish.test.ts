import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { PROFILE_ROUTES, profileRoutesFor } from "../../src/features/profile/routes";

// Phase 114 — Profil is a place you pass through, not a dashboard.
//
// The screen used to open with a 96pt hero and then stack seven equally
// weighted cards: stats, a primary button, a tile row, appearance, the tour,
// account facts and sign out. Every one of them was real, and together they
// buried the three destinations a student actually comes here for.
//
// The order is now: who you are, how your learning is going, where you can
// go, and — behind the gear — the account itself. These tests pin that
// order, that every row leads somewhere real, and that nothing invented a
// metric to fill the space Phase 113's "Puan" left behind.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const PROFILE = "src/features/profile/screens/ProfileScreen.tsx";
const SETTINGS = "src/features/profile/screens/SettingsScreen.tsx";
const SUMMARY = "src/features/profile/components/ProfileLearningSummary.tsx";
const GROUP = "src/features/profile/components/ProfileMenuGroup.tsx";
const IDENTITY = "src/features/profile/components/ProfileIdentityCard.tsx";

describe("§4 the approved hierarchy", () => {
  it("opens with the title and the gear, then identity, summary and groups — in that order", () => {
    const source = code(PROFILE);
    const order = [
      "styles.screenTitle",
      'icon="settings-outline"',
      "<ProfileIdentityCard",
      "<ProfileLearningSummary",
      "items={learningItems}",
      "items={accountItems}",
    ].map((marker) => {
      const index = source.indexOf(marker);
      expect(index).toBeGreaterThan(-1);
      return index;
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("drops the hero it shared with a peer's profile, and keeps that hero for the peer", () => {
    expect(code(PROFILE)).not.toContain("<ProfileHero");
    expect(read("src/features/profile/screens/PublicProfileScreen.tsx")).toContain("<ProfileHero");
  });

  it("keeps the question archive the screen has always owned", () => {
    const source = code(PROFILE);
    expect(source).toContain("Sorularım");
    expect(source).toContain("Kaydettiklerim");
    expect(source).toContain("useQuestionArchive");
  });
});

describe("§5 Öğrenme Özetin is two real, cheap facts", () => {
  it("reads one document — the study summary listener, not the analytics set", () => {
    const source = code(SUMMARY);
    expect(source).toContain("subscribeToStudySummary");
    // Phase 109 derived a third fact from every study item; opening Profil
    // paid an analytics-sized read for one number.
    expect(source).not.toContain("useStudentAnalytics");
    expect(source).not.toContain("buildQuestionArchive");
  });

  it("shows the studied count and today's goal, and calls each what it is", () => {
    const source = read(SUMMARY);
    expect(source).toContain("summary.totalUniqueQuestions");
    expect(source).toContain("`${summary.reviewedToday} / ${summary.dailyGoal}`");
    expect(source).toContain('label: "Çalışılan soru"');
    expect(source).toContain('label: "Günlük hedef"');
    // A lifetime distinct count is not a week, so it is not labelled as one.
    expect(source).not.toMatch(/Son 7 gün/);
  });

  it("says nothing rather than printing a confident zero", () => {
    const source = code(SUMMARY);
    expect(source).toContain("summary.totalUniqueQuestions > 0");
    expect(source).toContain("summary.dailyGoal > 0");
    expect(source).toContain("if (facts.length === 0) return null;");
  });

  it("sends 'Tümünü gör' to Kişisel Analiz, the real deep reading", () => {
    expect(code(SUMMARY)).toContain("ANALYTICS_ROUTES.overview");
  });

  it("invents no score, ring, gauge or percentage to fill the card", () => {
    expect(code(SUMMARY)).not.toMatch(/\bXP\b|Puan|Seviye|rozet|progressScore|learningScore|percentile|%/i);
  });
});

describe("§6 every row resolves to a real route", () => {
  it("routes the learning group to the three screens it names", () => {
    const source = code(PROFILE);
    expect(source).toContain("ANALYTICS_ROUTES.overview");
    expect(source).toContain("PLAN_ROUTES.progress");
    expect(source).toContain("PLAN_ROUTES.settings");
    for (const route of [
      "app/(student)/analytics/index.tsx",
      "app/(student)/plan/progress.tsx",
      "app/(student)/plan/settings.tsx",
    ]) {
      expect(existsSync(join(ROOT, route))).toBe(true);
    }
  });

  it("gives the gear a destination that exists for both roles", () => {
    expect(code(PROFILE)).toContain("routes.settings");
    expect(existsSync(join(ROOT, "app/(student)/settings.tsx"))).toBe(true);
    expect(existsSync(join(ROOT, "app/(teacher)/settings.tsx"))).toBe(true);
  });

  it("resolves each role to its own copy of every account destination", () => {
    expect(profileRoutesFor("student")).toEqual({
      settings: "/(student)/settings",
      editProfile: "/(student)/edit-profile",
      friends: "/(student)/friends",
      findFriends: "/(student)/find-friends",
    });
    expect(profileRoutesFor("teacher")).toEqual({
      settings: "/(teacher)/settings",
      editProfile: "/(teacher)/edit-profile",
      friends: "/(teacher)/friends",
      findFriends: "/(teacher)/find-friends",
    });
    // An unknown or absent role falls back to the student copy rather than
    // resolving to nothing.
    expect(profileRoutesFor(undefined).settings).toBe("/(student)/settings");
  });

  // PHASE 111 LOCK.
  it("never rebuilds the teacher friends path as the removed tab", () => {
    expect(PROFILE_ROUTES.teacherFriends).toBe("/(teacher)/friends");
    expect(code("src/features/profile/routes.ts")).not.toContain("(teacher)/(tabs)/friends");
    expect(existsSync(join(ROOT, "app/(teacher)/friends.tsx"))).toBe(true);
  });

  it("names no destination the product does not have", () => {
    // The approved mockup drew "Bildirim Ayarları" and "Gizlilik". Neither
    // screen exists — notifications are a list reached from Sınıf/Bugün, and
    // there is no privacy settings surface at all — so Profil does not
    // advertise them. A row that goes nowhere is worse than an absent row.
    const source = read(PROFILE);
    expect(source).not.toContain("Bildirim Ayarları");
    expect(source).not.toContain("Gizlilik");
  });
});

describe("§6 the gear's destination holds real settings, moved not copied", () => {
  it("owns appearance, the tour, the account facts and sign out", () => {
    const source = code(SETTINGS);
    expect(source).toContain("<AppearanceSelector />");
    expect(source).toContain("guidedTour");
    expect(source).toContain('label="Çıkış Yap"');
    expect(source).toContain("GoogleSignInButton");
  });

  it("leaves none of them behind on Profil, so nothing is duplicated", () => {
    const source = code(PROFILE);
    expect(source).not.toContain("AppearanceSelector");
    expect(source).not.toContain("Çıkış Yap");
    expect(source).not.toContain("GoogleSignInButton");
    expect(source).not.toContain("guidedTour");
  });

  it("can be left again — it is a nested screen with a back button", () => {
    expect(code(SETTINGS)).toContain("<AppBackButton");
  });
});

describe("§11 accessibility", () => {
  it("makes every menu row a button that announces its title and subtitle", () => {
    const source = read(GROUP);
    expect(source).toContain('accessibilityRole="button"');
    expect(source).toContain("accessibilityLabel={`${item.title}. ${item.description}`}");
    expect(source).toContain("minHeight: minTouchTarget");
  });

  it("hides both glyphs from the reader — the row already says what it is", () => {
    const iconTags = read(GROUP).match(/<Ionicons[\s\S]*?\/>/g) ?? [];
    expect(iconTags.length).toBeGreaterThan(0);
    for (const tag of iconTags) {
      expect(tag).toContain("accessibilityElementsHidden");
      expect(tag).not.toContain("accessibilityLabel");
    }
  });

  it("lets a long name, handle or subtitle grow instead of clipping", () => {
    // The name may take two lines; the subtitle is unbounded; neither sits
    // in a fixed-height box.
    expect(read(IDENTITY)).toContain("numberOfLines={2}");
    expect(read(GROUP)).not.toMatch(/description}\s*numberOfLines/);
    expect(read(GROUP)).not.toMatch(/height:\s*\d+,[\s\S]{0,80}description/);
  });

  // Found on the simulator at the largest accessibility text size: the
  // summary's title and its "Tümünü gör" action shared a row, and the action
  // grew wide enough to squeeze the title into one word per line. Flex
  // wrapping did not rescue it — both items still "fit" once they shrank —
  // so past a threshold the card changes shape instead.
  it("stacks the summary card instead of squeezing it at a large text size", () => {
    const source = read(SUMMARY);
    expect(source).toContain("const STACK_ABOVE_FONT_SCALE = 1.3;");
    expect(source).toContain("const { fontScale } = useWindowDimensions();");
    expect(source).toContain("const stacked = fontScale > STACK_ABOVE_FONT_SCALE;");
    expect(source).toContain("stacked ? styles.headerStacked : null");
    expect(source).toContain("stacked ? styles.factsStacked : null");
    // The vertical rule between two facts would sit across a stacked column.
    expect(source).toContain("index > 0 && !stacked");
  });

  it("says what the identity card does, not just whose it is", () => {
    expect(read(IDENTITY)).toContain("Hesap ve profil bilgilerini düzenle");
  });
});

describe("§12 one visual system, both themes", () => {
  it("builds Profil's surfaces from theme tokens rather than literal colours", () => {
    for (const file of [PROFILE, SETTINGS, SUMMARY, GROUP, IDENTITY]) {
      // No hex literals: light and dark both come from the palette, so one
      // theme cannot be tuned while the other quietly breaks.
      expect(code(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(read(file)).toContain("themedStyles");
    }
  });

  it("re-renders on a live theme switch", () => {
    for (const file of [SUMMARY, GROUP, IDENTITY]) {
      expect(read(file)).toContain("useThemeSubscription");
    }
  });
});

describe("§13 the locks this phase must not break", () => {
  it("leaves both tab bars exactly as Phase 109/111 left them", () => {
    const titles = (layout: string) => [...read(layout).matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    expect(titles("app/(student)/(tabs)/_layout.tsx")).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
    expect(titles("app/(teacher)/(tabs)/_layout.tsx")).toEqual(["Bugün", "Sınıflar", "Aksiyonlar", "Profil"]);
  });

  it("keeps Kişisel Analiz nested under Profil, not a tab of its own", () => {
    expect(existsSync(join(ROOT, "app/(student)/(tabs)/analytics.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "app/(student)/analytics/index.tsx"))).toBe(true);
  });

  it("gives a teacher the same language but no invented learning summary", () => {
    const source = code(PROFILE);
    // The summary and the learning group are both student-only.
    expect(source).toMatch(/!isTeacher \? \([\s\S]{0,200}<ProfileLearningSummary/);
    expect(source).toMatch(/!isTeacher \? \([\s\S]{0,200}items=\{learningItems\}/);
    // The account group is shared, so a teacher still gets the same card.
    expect(source).toMatch(/<View style=\{styles\.block\}>\s*<ProfileMenuGroup items=\{accountItems\} \/>/);
  });

  // PHASE 112 LOCK — a peer's profile gains nothing from this redesign.
  it("adds no private learning data to the public profile", () => {
    const publicScreen = code("src/features/profile/screens/PublicProfileScreen.tsx");
    for (const forbidden of [
      "ProfileLearningSummary",
      "Öğrenme Özetin",
      "subscribeToStudySummary",
      "useStudentAnalytics",
      "ANALYTICS_ROUTES",
      "PLAN_ROUTES",
      "dailyGoal",
    ]) {
      expect(publicScreen).not.toContain(forbidden);
    }
  });
});
