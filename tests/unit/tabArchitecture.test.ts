import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { ROUTES } from "@constants/routes";
import { resolveRouteForState } from "@features/authentication/services/routing";

// Phase 109 — the four-tab student architecture.
//
// Exactly Akış, Çalış, Sınıf, Profil; Akış is the landing tab and the
// question feed; Analiz is a nested reading, not a tab; teacher routing,
// the signed-out guard and the unknown-route fallback are untouched.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative)
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");

function tabTitles(layout: string): string[] {
  return [...code(layout).matchAll(/title: "([^"]+)"/g)].map((m) => m[1] ?? "");
}

function tabNames(layout: string): string[] {
  return [...code(layout).matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((m) => m[1] ?? "");
}

describe("student tabs", () => {
  const LAYOUT = "app/(student)/(tabs)/_layout.tsx";

  it("are exactly Akış, Çalış, Sınıf, Profil — in that order", () => {
    expect(tabTitles(LAYOUT)).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
    expect(tabNames(LAYOUT)).toEqual(["index", "study", "classes", "profile"]);
  });

  it("do not include Analiz, and its old tab file is gone", () => {
    expect(code(LAYOUT)).not.toMatch(/Analiz|name="analytics"/);
    expect(existsSync(join(ROOT, "app/(student)/(tabs)/analytics.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "app/(student)/analytics/index.tsx"))).toBe(true);
  });

  it("land a signed-in student on Akış, which is the question feed", () => {
    expect(ROUTES.student).toBe("/(student)/(tabs)");
    expect(resolveRouteForState({ isAuthenticated: true, isEmailVerified: true, role: "student" })).toBe(ROUTES.student);
    // The group's first registered tab is index, and index renders the feed.
    expect(tabNames(LAYOUT)[0]).toBe("index");
    expect(read("app/(student)/(tabs)/index.tsx")).toContain('import { FeedScreen } from "@features/feed";');
    expect(read("src/features/feed/screens/FeedScreen.tsx")).toContain('export const FEED_TITLE = "Soru Akışı";');
  });

  it("use one themed chrome for every tab, with no icon dependency beyond Ionicons", () => {
    const layout = code(LAYOUT);
    expect(layout).not.toContain("immersiveTabBarStyle");
    expect(layout).toContain("tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.divider }");
    expect(layout.match(/from "@expo\/vector-icons"/g)?.length).toBe(1);
    expect(layout).toContain("tabBarButton: ProfileTabButton");
  });
});

describe("what did not change", () => {
  it("teacher routing is untouched; the teacher tabs are Phase 111's four", () => {
    // Phase 111 deliberately recomposed the teacher tabs around intent
    // (pinned in full by teacherSimplification.test.ts). The landing ROUTE is
    // unchanged — only what the index tab renders changed.
    expect(tabTitles("app/(teacher)/(tabs)/_layout.tsx")).toEqual(["Bugün", "Sınıflar", "Aksiyonlar", "Profil"]);
    expect(resolveRouteForState({ isAuthenticated: true, isEmailVerified: true, role: "teacher" })).toBe(ROUTES.teacher);
    expect(read("app/(teacher)/(tabs)/index.tsx")).toContain("TeacherTodayScreen");
  });

  it("signed-out and unverified users are still guarded", () => {
    expect(resolveRouteForState({ isAuthenticated: false, isEmailVerified: false, role: null })).toBe(ROUTES.login);
    expect(resolveRouteForState({ isAuthenticated: true, isEmailVerified: false, role: "student" })).toBe(ROUTES.verifyEmail);
  });

  it("the Phase 105 unknown-route fallback is intact", () => {
    const notFound = read("app/+not-found.tsx");
    expect(notFound).toContain("Ana sayfaya dön");
    expect(read("tests/unit/routeBackAudit.test.ts")).toContain('"app/+not-found.tsx"');
  });

  it("Analiz remains reachable: its overview is nested under Profil and every deep reading keeps its route", () => {
    expect(read("src/features/studentAnalytics/routes.ts")).toContain('overview: "/(student)/analytics"');
    expect(read("src/features/studentAnalytics/screens/AnalyticsOverviewScreen.tsx")).toContain("backFallbackHref={ROUTES.studentProfile}");
    for (const file of [
      "app/(student)/analytics/subjects.tsx",
      "app/(student)/analytics/topic.tsx",
      "app/(student)/analytics/question-types.tsx",
      "app/(student)/analytics/archive/index.tsx",
      "app/(student)/analytics/archive/[questionId].tsx",
      "app/(student)/plan/index.tsx",
      "app/(student)/plan/gaps.tsx",
      "app/(student)/plan/strengths.tsx",
      "app/(student)/plan/progress.tsx",
      "app/(student)/plan/community.tsx",
    ]) {
      expect(existsSync(join(ROOT, file))).toBe(true);
    }
    const profile = read("src/features/profile/screens/ProfileScreen.tsx");
    expect(profile).toContain("<ProfileLearningSummary");
    expect(read("src/features/profile/components/ProfileLearningSummary.tsx")).toContain("ANALYTICS_ROUTES.overview");
  });
});
