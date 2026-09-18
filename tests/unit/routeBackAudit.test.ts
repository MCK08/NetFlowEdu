import fs from "fs";
import path from "path";

import { resolveBackNavigation } from "../../src/utils/backNavigation";

// Phase 102 — no pushed screen may ship without a way out.
//
// Physical-iPhone testing found four nested screens (Öğrenme Haritam,
// Zorlanma Örüntülerim, both İlerleme Hikâyesi screens) with no visible back
// affordance, and a modal with no close. This audit walks every Expo Router
// route file, resolves the screen it renders, and requires that every
// NON-ROOT route reaches the shared AppBackButton (directly, or through a
// header component in its own feature). Root tabs and landing routes are
// listed explicitly — a root having no back is correct, and adding one there
// would be its own bug.

const REPO = path.join(__dirname, "..", "..");
const APP = path.join(REPO, "app");

/** True roots: tab screens and landing/bootstrap routes. */
const ROOT_ROUTES = new Set([
  "app/index.tsx",
  "app/unknown-role.tsx",
  // Phase 105 — expo-router's unmatched-route fallback, placed here
  // deliberately per the rule above. It is a terminal state, not a pushed
  // screen: the URL that reached it never resolved to a node in the tree, so
  // there is no canonical parent for AppBackButton's fallbackHref to declare.
  // Like unknown-role.tsx it ships exactly one recovery action instead
  // ("Ana sayfaya dön" -> "/", resolved by RouteGuard), which is what the
  // "every pushed screen has a way out" rule actually protects.
  "app/+not-found.tsx",
  "app/(admin)/index.tsx",
  "app/(student)/(tabs)/index.tsx",
  "app/(student)/(tabs)/study.tsx",
  // Phase 107 — the Analiz tab. A root, so it carries no back button; its
  // pushed readings (analytics/*) are nested and each reaches AppBackButton.
  "app/(student)/(tabs)/analytics.tsx",
  "app/(student)/(tabs)/classes.tsx",
  "app/(student)/(tabs)/profile.tsx",
  "app/(teacher)/(tabs)/index.tsx",
  "app/(teacher)/(tabs)/classes.tsx",
  "app/(teacher)/(tabs)/friends.tsx",
  "app/(teacher)/(tabs)/profile.tsx",
]);

/** The signed-out flow: login is its root; register and forgot-password
 *  carry a Link back to login; verify-email and google-onboarding are gated
 *  steps that `replace` forward once satisfied. None is a pushed screen. */
const AUTH_FLOW_ROUTES = new Set([
  "app/(auth)/login.tsx",
  "app/(auth)/register.tsx",
  "app/(auth)/forgot-password.tsx",
  "app/(auth)/verify-email.tsx",
  "app/(auth)/google-onboarding.tsx",
]);

const ALIASES: Record<string, string> = {
  "@features/": "src/features/",
  "@components/": "src/components/",
  "@services/": "src/services/",
  "@hooks/": "src/hooks/",
  "@/": "src/",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  let target = spec;
  for (const [alias, real] of Object.entries(ALIASES)) {
    if (target.startsWith(alias)) target = path.join(REPO, real, target.slice(alias.length));
  }
  if (target.startsWith(".")) target = path.resolve(path.dirname(from), target);
  for (const candidate of [target + ".tsx", target + ".ts", path.join(target, "index.tsx"), path.join(target, "index.ts")]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** The screen component file a route renders, following a feature barrel. */
function screenFileFor(routeFile: string): string | null {
  const src = fs.readFileSync(routeFile, "utf8");
  const match = /import \{ ([A-Za-z]+Screen[A-Za-z]*) \} from "([^"]+)"/.exec(src);
  if (!match) return null;
  const name = match[1] ?? "";
  const spec = match[2] ?? "";
  let file = resolveImport(routeFile, spec);
  if (file && /index\.tsx?$/.test(file)) {
    const barrel = fs.readFileSync(file, "utf8");
    const re = new RegExp(`export \\{[^}]*\\b${name}\\b[^}]*\\} from "([^"]+)"`);
    const inner = re.exec(barrel);
    if (inner?.[1]) file = resolveImport(file, inner[1]);
  }
  return file;
}

/** Whether a screen (or a header component it imports) uses the shared back affordance. */
function hasBackAffordance(screenFile: string): boolean {
  const text = fs.readFileSync(screenFile, "utf8");
  if (/AppBackButton|useBackNavigation/.test(text)) return true;
  // A header component in the same feature (ChatHeader, QuestionHeader) may
  // own it — or, since Phase 108, a shared header another feature exports
  // (studyPlan and communityDifficulty screens reuse AnalyticsHeader).
  const imports = [...text.matchAll(/import \{[^}]*\} from "((?:\.\.?\/|@features\/)[^"]+)"/g)].map((m) => m[1] ?? "");
  return imports.some((spec) => {
    const file = resolveImport(screenFile, spec);
    return file !== null && /AppBackButton|useBackNavigation/.test(fs.readFileSync(file, "utf8"));
  });
}

describe("the back-navigation rule", () => {
  it("goes back when there is history and to the declared parent when there is none", () => {
    expect(resolveBackNavigation(true, "/(student)/(tabs)/study")).toEqual({ kind: "back" });
    expect(resolveBackNavigation(false, "/(student)/(tabs)/study")).toEqual({
      kind: "replace",
      href: "/(student)/(tabs)/study",
    });
  });
});

describe("route audit — every pushed screen has a way out", () => {
  const routes = walk(APP)
    .filter((f) => !f.endsWith("_layout.tsx"))
    .map((f) => path.relative(REPO, f))
    .sort();

  it("classifies every route as root, auth flow, or nested", () => {
    // A new route file must be placed deliberately: either it is a root (and
    // is listed above) or it is nested and must carry a back affordance.
    expect(routes.length).toBeGreaterThan(40);
    for (const route of routes) {
      const isRoot = ROOT_ROUTES.has(route) || AUTH_FLOW_ROUTES.has(route);
      const screen = screenFileFor(path.join(REPO, route));
      if (isRoot) continue;
      expect({ route, screen }).toMatchObject({ screen: expect.any(String) });
    }
  });

  const nested = routes.filter((r) => !ROOT_ROUTES.has(r) && !AUTH_FLOW_ROUTES.has(r));

  it.each(nested)("%s reaches AppBackButton", (route) => {
    const screen = screenFileFor(path.join(REPO, route));
    expect(screen).not.toBeNull();
    expect(hasBackAffordance(screen as string)).toBe(true);
  });

  it("root tabs do not render the shared back button", () => {
    for (const route of ROOT_ROUTES) {
      if (!route.includes("(tabs)")) continue;
      const screen = screenFileFor(path.join(REPO, route));
      if (!screen) continue;
      const text = fs.readFileSync(screen, "utf8");
      // FriendsScreen is shared with a pushed student route and hides its
      // back button behind showBackButton={false} on the teacher tab.
      if (/showBackButton/.test(text)) {
        expect(fs.readFileSync(path.join(REPO, route), "utf8")).toContain("showBackButton={false}");
        continue;
      }
      expect(text).not.toMatch(/<AppBackButton/);
    }
  });
});
