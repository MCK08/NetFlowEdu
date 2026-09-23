import { readFileSync } from "fs";
import { join } from "path";

import { profileRoutesFor, PROFILE_ROUTES } from "../../src/features/profile/routes";

// Phase 122 — the teacher's Profil.
//
// Most of this phase is refusal. The reference image draws Güvenlik, Destek,
// Hakkında and notification preferences, and Phase 115 already audited every
// one of them and found nothing behind them: password reset exists only
// before login, notifications have an inbox but no preferences, and there is
// no support, about or legal surface at all. A settings row is a promise that
// something is there, so none of them is drawn — and these tests pin those
// absences so a later phase cannot quietly add one.
//
// What DID change is small and specific: a teacher was offered "Hesap ve
// Profil" immediately beneath an identity card that opens the same screen and
// whose spoken label already ends "Hesap ve profil bilgilerini düzenle". One
// of the two had to go, and the card is the one that also shows who you are.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const PROFILE = "src/features/profile/screens/ProfileScreen.tsx";
const IDENTITY = "src/features/profile/components/ProfileIdentityCard.tsx";
const GRID_ITEM = "src/features/profile/components/QuestionGridItem.tsx";
const SETTINGS = "src/features/profile/screens/SettingsScreen.tsx";
const APPEARANCE = "src/features/profile/screens/AppearanceScreen.tsx";

const PHASE_122_UI = [PROFILE, IDENTITY, GRID_ITEM];

describe("§5/§6 navigation is untouched", () => {
  it("keeps the teacher's four tabs, in order, with Profil fourth", () => {
    const titles = [...read("app/(teacher)/(tabs)/_layout.tsx").matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    expect(titles).toEqual(["Bugün", "Sınıflar", "Aksiyonlar", "Profil"]);
    expect(titles[3]).toBe("Profil");
  });

  it("keeps the student's four tabs, in order", () => {
    const titles = [...read("app/(student)/(tabs)/_layout.tsx").matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    expect(titles).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
  });

  it("leaves the teacher's other three tabs exactly as Phases 119–121 left them", () => {
    const today = code("src/features/teacher/screens/TeacherTodayScreen.tsx");
    expect(today).toContain("<TeacherTodayHeader");
    expect(today).toContain('mode="today"');
    expect(code("src/features/classes/screens/TeacherClassesScreen.tsx")).toContain("useTeacherClasses(");
    expect(code("src/features/teacher/screens/TeacherActionsScreen.tsx")).toContain("<TeacherActionFilterBar");
  });
});

describe("§7 a teacher gets no invented learning content", () => {
  it("keeps the learning summary and the learning group student-only", () => {
    const source = code(PROFILE);
    expect(source).toMatch(/!isTeacher \? \([\s\S]{0,260}<ProfileLearningSummary/);
    expect(source).toMatch(/!isTeacher \? \([\s\S]{0,260}items=\{learningItems\}/);
  });

  it("puts no teacher metric of any kind on this screen", () => {
    for (const file of PHASE_122_UI) {
      expect(code(file)).not.toMatch(
        /sınıf sayısı|öğrenci sayısı|müdahale sayısı|assignmentsCreated|actionCount|responseTime|productivity|teacher score|successRate|averag/i,
      );
    }
  });

  it("introduces no points, rank or leaderboard", () => {
    for (const file of PHASE_122_UI) {
      expect(code(file)).not.toMatch(
        /totalPoints|weeklyPoints|\bPuan\b|\bXP\b|leaderboard|liderlik|sıralama|ranking|rozet|streak/i,
      );
    }
  });
});

describe("§9/§17 the rows the reference drew and the product does not have", () => {
  it("adds no live Profil or Ayarlar row for an unsupported feature", () => {
    const forbidden = [
      "Güvenlik",
      "Şifre",
      "Bildirim Ayarları",
      "Bildirim Tercih",
      "Dil Seçimi",
      "Destek",
      "Geri Bildirim",
      "Yardım Merkezi",
      "Hakkında",
      "Hesabı Sil",
      "Gizlilik Politikası",
    ];
    for (const file of [PROFILE, SETTINGS]) {
      // Comment-stripped: Ayarlar's own doc comment NAMES these in order to
      // record why none of them is drawn, and that record is worth keeping.
      const source = code(file);
      for (const label of forbidden) expect(source).not.toContain(label);
    }
  });

  it("keeps Phase 115's settings inventory exactly as it is", () => {
    const settings = code(SETTINGS);
    for (const title of [
      '"Profil Bilgileri"',
      '"Hesap Bilgileri"',
      '"Görünüm"',
      '"Uygulama Turunu Tekrar Gör"',
      '"Çıkış Yap"',
    ]) {
      expect(settings).toContain(title);
    }
    // Three groups, no more.
    const groups = [...settings.matchAll(/<ProfileMenuGroup title="([^"]+)"/g)].map((m) => m[1]);
    expect(groups).toEqual(["Hesap", "Uygulama", "Oturum"]);
  });
});

describe("§21/§24 identity, and the duplicate that was removed", () => {
  it("shows only the identity fields the profile document carries", () => {
    const identity = code(IDENTITY);
    for (const field of ["photoURL", "primaryName", "usernameHandle", "role"]) {
      expect(identity).toContain(field);
    }
    // No email on the root, and nothing the profile document does not have.
    // ("typography.subtitle" is a type role, not a professional title.)
    expect(identity).not.toMatch(/\bemail\b|branş|okul|unvan|biyografi|deneyim|\bschool\b|professional/i);
    expect(identity).not.toMatch(/question\.subject|profile\.subject|jobTitle/i);
    // The name comes from the canonical resolver, never a literal.
    expect(code(PROFILE)).toContain("resolvePublicIdentity(profile)");
  });

  it("stops offering a teacher the row that repeated the card above it", () => {
    const source = code(PROFILE);
    // Built only for a student now…
    expect(source).toContain("...(isTeacher");
    expect(source).toContain('title: "Hesap ve Profil"');
    // …while the card itself is still the way in, for both roles.
    expect(source).toContain('onPress={() => go("edit-profile", routes.editProfile)}');
    expect(code(IDENTITY)).toContain("Hesap ve profil bilgilerini düzenle");
  });

  it("leaves the edit-profile screen reachable by its canonical routes", () => {
    expect(profileRoutesFor("teacher").editProfile).toBe(PROFILE_ROUTES.teacherEditProfile);
    expect(profileRoutesFor("student").editProfile).toBe(PROFILE_ROUTES.studentEditProfile);
    // Ayarlar keeps its own way in, so nothing was lost by removing the row.
    expect(code(SETTINGS)).toContain("router.push(routes.editProfile as never)");
  });

  it("hard-codes no identity from the reference image", () => {
    for (const file of PHASE_122_UI) {
      const source = read(file);
      for (const literal of ["Mert Yılmaz", "Matematik Öğretmeni", "mert.yilmaz@example.com"]) {
        expect(source).not.toContain(literal);
      }
    }
  });
});

describe("§8/§23/§26/§27/§28 every canonical destination is still the canonical one", () => {
  it("reaches Ayarlar through the gear, and only through it", () => {
    const source = code(PROFILE);
    expect(source).toContain('icon="settings-outline"');
    expect(source).toContain('go("settings", routes.settings)');
    expect(source).toContain('accessibilityLabel="Ayarlar"');
    // No second Ayarlar row duplicating the gear.
    expect(source).not.toMatch(/title: "Ayarlar"/);
  });

  it("keeps the role-correct settings, account and appearance routes", () => {
    const teacher = profileRoutesFor("teacher");
    expect(teacher.settings).toBe("/(teacher)/settings");
    expect(teacher.accountInfo).toBe("/(teacher)/settings/account");
    expect(teacher.appearance).toBe("/(teacher)/settings/appearance");
    // PHASE 111 LOCK.
    expect(teacher.friends).toBe("/(teacher)/friends");
  });

  it("keeps appearance on the one canonical theme preference and key", () => {
    const appearance = code(APPEARANCE);
    for (const option of ["Açık", "Koyu", "Sistemle aynı"]) expect(appearance).toContain(option);
    expect(code("src/theme/themeStorage.ts")).toContain(
      'export const THEME_PREFERENCE_STORAGE_KEY = "netflowedu.theme.preference.v1";',
    );
    // Profil renders no theme control of its own.
    expect(code(PROFILE)).not.toMatch(/setPreference|themePreference|Sistemle aynı/);
  });

  it("keeps the tour replay and sign-out on their canonical mechanisms, in Ayarlar", () => {
    const settings = code(SETTINGS);
    expect(settings).toContain("useGuidedTour()");
    expect(settings).toContain("guidedTour.replay");
    expect(settings).toContain("useSignOut()");
    expect(settings).toContain("onPress: signOut");
    // Phase 114 moved both off Profil; this phase does not move them back.
    const profile = code(PROFILE);
    expect(profile).not.toContain("Çıkış Yap");
    expect(profile).not.toContain("guidedTour");
  });
});

describe("§13/§36 privacy and cost", () => {
  it("adds no read, listener or query", () => {
    for (const file of PHASE_122_UI) {
      expect(code(file)).not.toMatch(/onSnapshot|getDocs|getDoc\(|collection\(|httpsCallable/);
    }
    // The screen's two existing subscriptions are the two it still has.
    const profile = code(PROFILE);
    expect(profile.match(/useSocialMeta\(/g)).toHaveLength(1);
    expect(profile.match(/useQuestionArchive\(/g)).toHaveLength(1);
  });

  it("exposes no student or class data on a personal profile", () => {
    for (const file of PHASE_122_UI) {
      expect(code(file)).not.toMatch(
        /studentPerformance|useClassAttention|classmate|öğrenci listesi|studyItems|studyEvents/i,
      );
    }
  });
});

describe("§34 accessibility", () => {
  it("names each archive tile by what it is, instead of six identical buttons", () => {
    const item = read(GRID_ITEM);
    expect(item).toContain("function tileSubtitle(");
    expect(item).toContain('accessibilityLabel={subtitle ? `${subtitle} sorusunu aç` : "Soruyu aç"}');
    // Both fields are "" on pre-Phase-21 questions, so an empty pair is null.
    expect(item).toContain('parts.length > 0 ? parts.join(" · ") : null');
  });

  it("gives a tile whose image cannot load something truthful to show", () => {
    const item = read(GRID_ITEM);
    expect(item).toContain("onError={() => setImageFailed(true)}");
    expect(item).toContain("styles.fallback");
    // The mark is decoration; the row's own label already names the question.
    expect(item).toMatch(/name="image-outline"[\s\S]*?accessibilityElementsHidden/);
  });

  it("keeps the identity card a 44pt target whose name wraps", () => {
    const identity = read(IDENTITY);
    expect(identity).toContain("minHeight: minTouchTarget");
    expect(identity).toContain("numberOfLines={2}");
    expect(identity).toMatch(/identity:\s*\{[\s\S]*?minWidth: 0,/);
    expect(identity).toMatch(/<Ionicons[\s\S]*?name="chevron-forward"[\s\S]*?accessibilityElementsHidden/);
  });

  // Both found on the simulator at the largest accessibility size, with a
  // clean relaunch. The card is shared with the student's Profil, so both
  // fixes are gated on the scale — below it the card renders exactly as it
  // always has, which was checked on device at the default size.
  it("stacks the identity card rather than floating the avatar against wrapped text", () => {
    const identity = read(IDENTITY);
    expect(identity).toContain("const stacked = fontScale >= stackAtFontScale;");
    expect(identity).toContain("<Card style={stacked ? styles.cardStacked : styles.card}>");
    expect(identity).toMatch(/cardStacked:\s*\{[\s\S]*?flexDirection: "column",/);
    expect(identity).toMatch(/identity:\s*\{[\s\S]*?alignSelf: "stretch",/);
    // A chevron alone at the foot of a column points at nothing.
    expect(identity).toContain("{stacked ? null : (");
  });

  it("wraps the username instead of cutting it in half", () => {
    const identity = read(IDENTITY);
    // One line cut "@demo_teacher" to "@demo_tea…", and half a handle
    // identifies no account.
    expect(identity).toMatch(/<Text style=\{styles\.handle\} numberOfLines=\{2\}>/);
    expect(identity).not.toMatch(/styles\.handle\} numberOfLines=\{1\}/);
  });

  it("names the groups it draws, and caps no text in them", () => {
    const profile = read(PROFILE);
    expect(profile).toContain('export const ACCOUNT_GROUP_TITLE = "Hesap";');
    expect(profile).toContain('export const LEARNING_GROUP_TITLE = "Öğrenme";');
    const group = read("src/features/profile/components/ProfileMenuGroup.tsx");
    expect(group).toContain("minHeight: minTouchTarget");
    expect(group).toContain("accessibilityLabel={`${item.title}. ${item.description}`}");
    const textStyles = group.match(/\b(title|description|sectionTitle):\s*\{[^}]*\}/g) ?? [];
    for (const style of textStyles) expect(style).not.toMatch(/\bheight:/);
  });
});

describe("§30/§32/§33 both themes", () => {
  it("paints with tokens only", () => {
    for (const file of [PROFILE, IDENTITY]) {
      expect(code(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|"white"|"black"/);
      expect(read(file)).toContain("themedStyles");
    }
  });
});

describe("§37 no backend", () => {
  it("changes no backend surface and leaves the protected service alone", () => {
    for (const file of PHASE_122_UI) {
      expect(code(file)).not.toMatch(/firebase-admin|functions\/src|firestore\.rules|firebase\/firestore/);
      expect(code(file)).not.toContain("services/studentPerformance");
    }
  });
});
