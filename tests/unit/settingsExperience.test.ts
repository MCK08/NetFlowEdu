import { existsSync, readFileSync } from "fs";
import { join } from "path";

import { profileRoutesFor } from "../../src/features/profile/routes";
import { DEFAULT_THEME_PREFERENCE, THEME_PREFERENCES } from "../../src/theme/themePreference";
import { THEME_PREFERENCE_STORAGE_KEY } from "../../src/theme/themeStorage";

// Phase 115 — Ayarlar, as a list of destinations.
//
// Phase 114 gave the gear a real screen by moving appearance, the tour
// replay, the account facts and Çıkış Yap off Profil. That left four unlike
// panels in a column: a segmented control, a row, an info card, a button.
// They now share one shape — Hesap / Uygulama / Oturum, each a titled group
// of rows — and the two that are their own subject became nested screens.
//
// THE RISK THIS PINS
//
// The approved mockup drew six rows this product cannot honour: Şifre ve
// Güvenlik, Bildirim Ayarları, Dil, Yardım Merkezi, Geri Bildirim, Uygulama
// Hakkında. Each would have been a promise with nothing behind it, so each
// is absent — and these tests fail if one is ever drawn without the feature
// arriving first.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SETTINGS = "src/features/profile/screens/SettingsScreen.tsx";
const APPEARANCE = "src/features/profile/screens/AppearanceScreen.tsx";
const ACCOUNT = "src/features/profile/screens/AccountInfoScreen.tsx";
const GROUP = "src/features/profile/components/ProfileMenuGroup.tsx";
const PROFILE = "src/features/profile/screens/ProfileScreen.tsx";

describe("§3 Ayarlar is grouped, nested and reachable", () => {
  it("is opened by Profil's gear and is not a tab", () => {
    expect(code(PROFILE)).toContain('icon="settings-outline"');
    expect(code(PROFILE)).toContain("routes.settings");
    for (const layout of ["app/(student)/(tabs)/_layout.tsx", "app/(teacher)/(tabs)/_layout.tsx"]) {
      expect(read(layout)).not.toContain("settings");
    }
    expect(existsSync(join(ROOT, "app/(student)/(tabs)/settings.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "app/(teacher)/(tabs)/settings.tsx"))).toBe(false);
  });

  it("groups its rows under the three names it actually needs", () => {
    const source = code(SETTINGS);
    expect(source).toContain('title="Hesap"');
    expect(source).toContain('title="Uygulama"');
    expect(source).toContain('title="Oturum"');
  });

  it("goes back to this role's Profil tab", () => {
    expect(code(SETTINGS)).toContain("<AppBackButton fallbackHref={routes.profileTab as never} />");
    expect(profileRoutesFor("student").profileTab).toBe("/(student)/(tabs)/profile");
    expect(profileRoutesFor("teacher").profileTab).toBe("/(teacher)/(tabs)/profile");
  });

  it("renders every row it declares against a route file that exists", () => {
    for (const role of ["student", "teacher"] as const) {
      const routes = profileRoutesFor(role);
      const group = role === "student" ? "(student)" : "(teacher)";
      expect(routes.settings).toBe(`/${group}/settings`);
      for (const file of [
        `app/${group}/settings/index.tsx`,
        `app/${group}/settings/appearance.tsx`,
        `app/${group}/settings/account.tsx`,
        `app/${group}/edit-profile.tsx`,
      ]) {
        expect(existsSync(join(ROOT, file))).toBe(true);
      }
    }
  });
});

describe("§7 no row promises a feature this product does not have", () => {
  // Each of these was drawn in the approved mockup. None has an
  // implementation: password reset exists only as the PRE-LOGIN
  // /(auth)/forgot-password screen, notifications have an inbox but no
  // preferences UI, there is no i18n runtime, and no help, feedback or
  // about surface exists anywhere in the app.
  const ABSENT = [
    "Şifre ve Güvenlik",
    "Bildirim Ayarları",
    "Dil",
    "Yardım Merkezi",
    "Geri Bildirim",
    "Uygulama Hakkında",
    "Hesabı Sil",
  ];

  for (const label of ABSENT) {
    it(`does not draw "${label}"`, () => {
      expect(read(SETTINGS)).not.toContain(`title: "${label}"`);
    });
  }

  it("still has no notification-preferences or localization module to link to", () => {
    // If either ever lands, this fails and the row becomes honest to add.
    expect(existsSync(join(ROOT, "src/features/notifications/screens/NotificationSettingsScreen.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "src/i18n"))).toBe(false);
  });

  it("keeps the account screen's title honest about what it holds", () => {
    expect(read(ACCOUNT)).toContain('ACCOUNT_INFO_TITLE = "Hesap Bilgileri"');
    // It holds facts and Google linking — not password or session
    // management. Comments are stripped first: the file EXPLAINS that it is
    // not those things, and prose saying so must not read as the thing.
    expect(code(ACCOUNT)).not.toMatch(/Şifre|password|oturumları yönet/i);
  });
});

describe("§5 Görünüm uses the theme model that already exists", () => {
  it("offers exactly the preferences the model defines", () => {
    expect([...THEME_PREFERENCES].sort()).toEqual(["dark", "light", "system"]);
    const source = read(APPEARANCE);
    expect(source).toContain('{ value: "light", label: "Açık"');
    expect(source).toContain('{ value: "dark", label: "Koyu"');
    expect(source).toContain('{ value: "system", label: "Sistemle aynı"');
  });

  it("only explains the system option because that option is real", () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe("system");
    expect(read(APPEARANCE)).toContain("Cihazının ayarına göre otomatik olarak açık veya koyu tema kullanılır.");
  });

  it("reads and writes the canonical theme context, adding no state of its own", () => {
    const source = code(APPEARANCE);
    expect(source).toContain("const { preference, setPreference } = useTheme();");
    expect(source).toContain("setPreference(option.value)");
    // No second store, no second persistence key, no local mirror.
    expect(source).not.toMatch(/AsyncStorage|useState|createContext|THEME_PREFERENCE_STORAGE_KEY/);
  });

  it("leaves persistence exactly where Phase 49 put it — one key", () => {
    expect(THEME_PREFERENCE_STORAGE_KEY).toBe("netflowedu.theme.preference.v1");
    const storageUsers = ["src/theme/themeStorage.ts", "src/theme/ThemeProvider.tsx"];
    for (const file of storageUsers) {
      expect(existsSync(join(ROOT, file))).toBe(true);
    }
    expect(code(APPEARANCE)).not.toContain("saveThemePreference");
  });

  it("checks the stored preference, not the rendered theme", () => {
    // With "system" chosen on a dark device, "Koyu" is what renders but is
    // NOT what the user picked — selecting it would be a lie about state.
    const source = code(APPEARANCE);
    expect(source).toContain("const selected = preference === option.value;");
    expect(source).not.toContain("resolvedTheme === option.value");
  });

  it("applies on tap, so it promises no Save step", () => {
    const source = read(APPEARANCE);
    expect(source).not.toMatch(/Kaydet|Uygula|<PrimaryButton/);
  });

  it("announces each option as a radio with its selected state", () => {
    const source = read(APPEARANCE);
    expect(source).toContain('accessibilityRole="radio"');
    expect(source).toContain("accessibilityState={{ selected, checked: selected }}");
    expect(source).toContain("minHeight: minTouchTarget");
  });

  it("returns to Ayarlar, never to a tab root", () => {
    expect(code(APPEARANCE)).toContain("<AppBackButton fallbackHref={settingsHref} />");
    expect(code(APPEARANCE)).toContain("profileRoutesFor(profile?.role).settings");
    expect(profileRoutesFor("teacher").appearance).toBe("/(teacher)/settings/appearance");
  });
});

describe("§6 every real capability stayed reachable", () => {
  it("keeps sign out, as an action rather than a navigation row", () => {
    const source = code(SETTINGS);
    expect(source).toContain('title: "Çıkış Yap"');
    expect(source).toContain('tone: "danger"');
    // A chevron promises another screen; ending a session is not one.
    expect(source).toContain("chevron: false");
    expect(source).toContain("disabled: isSigningOut");
  });

  it("keeps the guided tour replay, which the mockup does not draw", () => {
    const source = code(SETTINGS);
    expect(source).toContain("guidedTour?.replayAudience");
    expect(source).toContain("onPress: guidedTour.replay");
  });

  it("keeps edit profile reachable from both Profil and Ayarlar", () => {
    expect(code(PROFILE)).toContain("routes.editProfile");
    expect(code(SETTINGS)).toContain("routes.editProfile");
  });

  it("moved the account facts down one level rather than deleting them", () => {
    const account = code(ACCOUNT);
    for (const fact of ["E-posta", "Kayıtlı hesap", "Google bağlı", "GoogleSignInButton"]) {
      expect(account).toContain(fact);
    }
    expect(code(SETTINGS)).not.toContain("GoogleSignInButton");
  });
});

describe("§13 accessibility and the largest text size", () => {
  it("gives an action row the same 44pt geometry as a navigation row", () => {
    const source = read(GROUP);
    expect(source).toContain("minHeight: minTouchTarget");
    expect(source).toContain("accessibilityState={{ disabled: item.disabled ?? false }}");
  });

  it("lets a long option label wrap instead of pushing the radio off the row", () => {
    const source = read(APPEARANCE);
    expect(source).toMatch(/label: \{[\s\S]*?flex: 1,\s*minWidth: 0,/);
    expect(source).not.toMatch(/<Text style={\[styles\.label[^>]*numberOfLines/);
  });

  // Found on the simulator at the largest accessibility size: an e-mail
  // sharing a row with its label had room for "stude…", and the Google
  // answer for "H…" — the two facts on screen were the two nobody needed.
  it("stacks an account fact above its value instead of truncating it", () => {
    const source = read(ACCOUNT);
    expect(source).toContain("const STACK_ABOVE_FONT_SCALE = 1.3;");
    expect(source).toContain("const { fontScale } = useWindowDimensions();");
    expect(source).toContain("stacked ? styles.infoRowStacked : null");
    // Truncation is only allowed while the value still has its own row.
    expect(source).toContain("numberOfLines={stacked ? undefined : 1}");
  });

  it("uses theme tokens for both modes rather than literal colours", () => {
    for (const file of [SETTINGS, APPEARANCE, ACCOUNT, GROUP]) {
      expect(code(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(read(file)).toContain("themedStyles");
    }
  });
});

describe("§8/§10/§12 the locks this phase must not break", () => {
  it("leaves both tab bars exactly as Phase 109/111 left them", () => {
    const titles = (layout: string) => [...read(layout).matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    expect(titles("app/(student)/(tabs)/_layout.tsx")).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
    expect(titles("app/(teacher)/(tabs)/_layout.tsx")).toEqual(["Bugün", "Sınıflar", "Aksiyonlar", "Profil"]);
  });

  it("keeps Phase 114's Profil hierarchy intact", () => {
    const source = code(PROFILE);
    for (const marker of ["<ProfileIdentityCard", "<ProfileLearningSummary", "items={learningItems}", "items={accountItems}"]) {
      expect(source).toContain(marker);
    }
    // Settings did not migrate back onto Profil.
    expect(source).not.toContain("Çıkış Yap");
    expect(source).not.toContain("guidedTour");
  });

  it("keeps the teacher friends route and never the removed tab", () => {
    expect(profileRoutesFor("teacher").friends).toBe("/(teacher)/friends");
    for (const file of [SETTINGS, APPEARANCE, ACCOUNT, "src/features/profile/routes.ts"]) {
      expect(code(file)).not.toContain("(teacher)/(tabs)/friends");
    }
  });

  it("introduces no points, XP, rank or leaderboard", () => {
    for (const file of [SETTINGS, APPEARANCE, ACCOUNT, GROUP]) {
      expect(code(file)).not.toMatch(/totalPoints|weeklyPoints|\bPuan\b|\bXP\b|leaderboard|rozet|achievement/i);
    }
  });

  it("adds nothing private to a peer's profile", () => {
    const publicScreen = code("src/features/profile/screens/PublicProfileScreen.tsx");
    for (const forbidden of ["SettingsScreen", "AppearanceScreen", "AccountInfoScreen", "subscribeToStudySummary"]) {
      expect(publicScreen).not.toContain(forbidden);
    }
  });
});
