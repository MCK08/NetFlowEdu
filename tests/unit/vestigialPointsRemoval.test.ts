import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

// Phase 113 — the points system is removed, not replaced.
//
// totalPoints/weeklyPoints were written once, by onUserCreate, and never
// again: no function, trigger or client ever awarded a point, so both read
// 0 for every account for the product's whole life. Phase 112 stopped
// publishing them to peers; this phase deletes the system itself.
//
// The risk being pinned here is not that the fields come back — it is that
// something takes their place. A removed score is an improvement; a score
// renamed to XP, a level, a badge or a "learning score" is the same
// mistake with new vocabulary. Progress in this product is the study
// outcomes, review schedule, learning state, archive, plan, concept map
// and analytics that already exist.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Every shape a replacement score could arrive in.
 *
 *  Deliberately NOT "badge" or "Seviye": this app has a notification count
 *  badge and a "Sınıf Seviyesi" (grade level) picker, and neither is a
 *  reward. The words here are only ever gamification. */
const GAMIFICATION = /\bXP\b|experiencePoints|gamification|\bcoins?\b|\brozet|\bmadalya|\bödül|achievement|totalPoints|weeklyPoints|Puan|Öğrenme Skoru|learningScore|progressScore/i;

// Active product code — excludes the migration script, whose entire job is
// to name the removed fields, and the comments explaining the removal.
const PRODUCT_SOURCES = [
  "src/types/user.ts",
  "src/services/firebase/firestore.ts",
  "src/features/profile/components/ProfileMenuGroup.tsx",
  "src/features/profile/screens/ProfileScreen.tsx",
  "src/features/profile/screens/PublicProfileScreen.tsx",
  "src/features/profile/components/ProfileIdentityCard.tsx",
  "src/features/profile/components/ProfileLearningSummary.tsx",
  "functions/src/triggers/onUserCreate.ts",
  "functions/src/profiles/syncPublicProfile.ts",
];

describe("§5 the user model", () => {
  it("no longer declares totalPoints or weeklyPoints", () => {
    const type = code("src/types/user.ts");
    expect(type).not.toMatch(/totalPoints/);
    expect(type).not.toMatch(/weeklyPoints/);
  });

  it("keeps every real account field", () => {
    const type = read("src/types/user.ts");
    for (const field of [
      "uid",
      "email",
      "displayName",
      "username",
      "role",
      "organizationId",
      "photoURL",
      "accountStatus",
      "emailVerified",
      "onboardingStatus",
      "requestedRole",
    ]) {
      expect(type).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it("does not map the removed fields off a document that still has them", () => {
    const mapper = code("src/services/firebase/firestore.ts");
    expect(mapper).not.toMatch(/totalPoints|weeklyPoints/);
  });
});

describe("§4 user creation", () => {
  it("writes no points fields for a new account", () => {
    const trigger = code("functions/src/triggers/onUserCreate.ts");
    expect(trigger).not.toMatch(/totalPoints|weeklyPoints/);
  });

  it("still creates the account fields onboarding and rules depend on", () => {
    const trigger = read("functions/src/triggers/onUserCreate.ts");
    for (const field of ["role:", "organizationId:", "accountStatus:", "onboardingStatus:", "requestedRole:", "createdAt:"]) {
      expect(trigger).toContain(field);
    }
  });

  it("seeds demo fixtures without them too, so the emulator matches production", () => {
    expect(code("functions/scripts/seedDemoFixtures.mts")).not.toMatch(/totalPoints|weeklyPoints/);
  });
});

describe("§6 the owner's own profile", () => {
  it("renders no Puan stat and no replacement for it", () => {
    for (const file of [
      "src/features/profile/screens/ProfileScreen.tsx",
      "src/features/profile/components/ProfileLearningSummary.tsx",
    ]) {
      expect(code(file)).not.toMatch(GAMIFICATION);
    }
  });

  // Phase 114 — the stat row that held "Puan" is gone entirely, and with it
  // the module that built it: profileStats.ts had no caller once the points
  // stat was removed. The friend/request counts it used to render survive as
  // the description of the Arkadaşlarım row.
  it("keeps the real friend counters, now on the row that leads to them", () => {
    const screen = code("src/features/profile/screens/ProfileScreen.tsx");
    expect(screen).toMatch(/arkadaş/);
    expect(screen).toMatch(/yeni istek/);
    expect(existsSync(join(ROOT, "src/features/profile/services/profileStats.ts"))).toBe(false);
  });

  it("still routes to the real personal analytics", () => {
    const screen = read("src/features/profile/screens/ProfileScreen.tsx");
    expect(screen).toMatch(/Kişisel Analiz/);
    expect(existsSync(join(ROOT, "src/features/studentAnalytics"))).toBe(true);
  });
});

describe("§7 no replacement gamification anywhere", () => {
  for (const file of PRODUCT_SOURCES) {
    it(`introduces no score, XP, level or badge in ${file.split("/").pop()}`, () => {
      expect(code(file)).not.toMatch(GAMIFICATION);
    });
  }

  // The real guard: walk every product source file rather than a list
  // someone has to remember to extend.
  it("has no points/XP/level/badge concept left anywhere in src/ or functions/src/", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const relative = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(relative);
        } else if (/\.tsx?$/.test(entry.name)) {
          if (GAMIFICATION.test(code(relative))) offenders.push(relative);
        }
      }
    };
    walk("src");
    walk("functions/src");
    // publicProfileProjection.ts names the fields in LEGACY_PUBLIC_PROFILE_FIELDS,
    // which is the list the Phase 112 cleanup deletes — a removal, not a system.
    expect(offenders).toEqual(["functions/src/profiles/publicProfileProjection.ts"]);
  });
});

describe("§6 the rules survive a document without the fields", () => {
  it("compares the removed fields with .get(), not a throwing ==", () => {
    const rules = read("firestore.rules");
    expect(rules).toMatch(/request\.resource\.data\.get\('totalPoints', null\)/);
    expect(rules).toMatch(/request\.resource\.data\.get\('weeklyPoints', null\)/);
    expect(rules).not.toMatch(/request\.resource\.data\.totalPoints == resource\.data\.totalPoints/);
  });

  it("still whitelists only the three client-writable fields", () => {
    expect(read("firestore.rules")).toMatch(/hasOnly\(\['displayName', 'photoURL', 'updatedAt'\]\)/);
  });
});

describe("§11/§12/§13 nothing else moved", () => {
  it("keeps the Phase 112 public profile projection identity-only", () => {
    const projection = read("functions/src/profiles/publicProfileProjection.ts");
    const shape = projection.slice(projection.indexOf("export interface PublicProfileProjection"), projection.indexOf("/** Fields an older projection"));
    expect(shape).toMatch(/uid|username|displayName|photoURL|role/);
    expect(shape).not.toMatch(/totalPoints|weeklyPoints|organizationId|createdAt/);
  });

  it("keeps both tab architectures exactly as Phase 109/111 left them", () => {
    const titles = (layout: string) => [...read(layout).matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    expect(titles("app/(student)/(tabs)/_layout.tsx")).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
    expect(titles("app/(teacher)/(tabs)/_layout.tsx")).toEqual(["Bugün", "Sınıflar", "Aksiyonlar", "Profil"]);
  });

  it("keeps the Phase 111 teacher friends route", () => {
    expect(existsSync(join(ROOT, "app/(teacher)/friends.tsx"))).toBe(true);
    expect(read("src/features/notifications/services/notificationNavigation.ts")).toContain('"/(teacher)/friends"');
  });

  it("leaves the real learning signals in place", () => {
    for (const path of [
      "src/features/study/services/dailyPracticePlan.ts",
      "src/features/studentAnalytics",
      "src/features/studyPlan",
      "src/features/teacher/services/studentPerformance.ts",
    ]) {
      expect(existsSync(join(ROOT, path))).toBe(true);
    }
  });
});
