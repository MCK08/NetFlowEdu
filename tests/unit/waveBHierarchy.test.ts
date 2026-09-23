import { existsSync, readFileSync } from "fs";
import { join } from "path";

// Phase 104 (Wave B) — the structural shape of the hierarchy, identity and
// immersive fixes, pinned so they cannot quietly regress.
//
// These are about SHAPE, not pixels: which control sits in which group, which
// token a surface names, how many lines a name may take. Each maps to a
// runtime observation recorded in the Wave B report.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative)
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");

function styleBlock(source: string, name: string): string {
  const match = source.match(new RegExp(`^\\s+${name}:\\s*\\{([^{}]*)\\}`, "m"));
  return match?.[1] ?? "";
}

const TEACHER_CLASS = "src/features/classes/screens/TeacherClassDetailScreen.tsx";
const TEACHER_CLASS_IDENTITY = "src/features/classes/components/TeacherClassIdentity.tsx";
const STUDENT_CLASS = "src/features/classes/screens/StudentClassDetailScreen.tsx";
const STUDENT_PERF = "src/features/teacher/screens/StudentPerformanceScreen.tsx";
const STUDY = "src/features/study/screens/StudyScreen.tsx";

describe("B1 — the teacher's class detail speaks the same type roles as the student's", () => {
  it("uses the screen-title, control and section roles instead of private pairs", () => {
    // Phase 123 — the identity (name, member count, join code) moved into
    // TeacherClassIdentity and the section headings onto the shared
    // SectionHeader, so the roles this test protects are read where they now
    // live. The rule is the same one: named roles, never a hand-written pair.
    const source = code(TEACHER_CLASS);
    const identity = code(TEACHER_CLASS_IDENTITY);
    expect(styleBlock(identity, "title")).toContain("...typography.screenTitleSm");
    expect(styleBlock(identity, "code")).toContain("...typography.cardTitle");
    expect(styleBlock(source, "actionPrimaryText")).toContain("...typography.button");
    expect(styleBlock(source, "actionSecondaryText")).toContain("...typography.button");
    expect(source).toContain("<SectionHeader title=");
    expect(code("src/components/ui/SectionHeader.tsx")).toContain("...typography.subtitle");
    // No hand-written text metrics remain on either file.
    expect(source).not.toMatch(/fontSize:\s*\d+/);
    expect(identity).not.toMatch(/fontSize:\s*\d+/);
  });

  it("mirrors the student sibling's roles exactly", () => {
    const student = code(STUDENT_CLASS);
    expect(styleBlock(student, "title")).toContain("...typography.screenTitleSm");
    expect(styleBlock(student, "chatButtonText")).toContain("...typography.button");
    expect(styleBlock(student, "sectionTitle")).toContain("...typography.subtitle");
  });
});

describe("B2 — grouping rhythm", () => {
  it("groups the teacher's class page into headed blocks, tight inside and a step wider between", () => {
    // Phase 123 — the two anonymous `styles.group` clusters became named,
    // headed sections (attention, work, students, lenses, questions). The B2
    // rhythm rule is unchanged and still checked: tight inside a block, wider
    // between blocks.
    const source = read(TEACHER_CLASS);
    expect(styleBlock(source, "block")).toContain("gap: spacing.sm");
    expect(styleBlock(source, "header")).toContain("gap: spacing.lg");
    // Every section names itself, and the lenses stayed together in one.
    const lenses = source.slice(source.indexOf("CLASS_INSIGHT_TITLE}"), source.indexOf("CLASS_QUESTIONS_TITLE}"));
    expect(lenses).toContain("Bugün Öne Çıkanlar");
    expect(lenses).toContain("Sınıf Performansı");
    expect(lenses).toContain("Sınıfın İlerleme Hikâyesi");
    expect(lenses).not.toContain("İncelemeleri");
    // The review queues sit with the work that is waiting, not with the lenses.
    const work = source.slice(source.indexOf("CLASS_WORK_TITLE}"), source.indexOf("CLASS_STUDENTS_TITLE}"));
    expect(work).toContain("Yanıt İncelemeleri");
    expect(work).toContain("Yorum İncelemeleri");
  });

  it("puts the student's destructive leave action after the questions, not between the primary tasks", () => {
    const source = read(STUDENT_CLASS);
    const header = source.slice(source.indexOf("ListHeaderComponent="), source.indexOf("ListFooterComponent="));
    const footer = source.slice(source.indexOf("ListFooterComponent="), source.indexOf("<ImageSourcePicker"));
    expect(header).not.toContain("Sınıftan Ayrıl");
    expect(footer).toContain("Sınıftan Ayrıl");
    // Same control: danger-bordered, quiet 14/600 label (Wave A lock), same
    // confirmation handler.
    expect(footer).toContain("onPress={confirmLeave}");
    expect(styleBlock(source, "leaveButtonText")).toContain("fontSize: 14");
    expect(styleBlock(source, "leaveButton")).toContain("borderColor: colors.danger");
    // The two primary tasks are now adjacent.
    const chat = header.indexOf("Sınıf Sohbeti");
    const share = header.indexOf("Soru Paylaş");
    expect(chat).toBeGreaterThan(-1);
    expect(share).toBeGreaterThan(chat);
    expect(header.slice(chat, share)).not.toContain("danger");
  });

  it("clusters the Student Performance cards and widens only between clusters", () => {
    const source = read(STUDENT_PERF);
    expect(styleBlock(source, "content")).toContain("gap: spacing.lg");
    expect(styleBlock(source, "group")).toContain("gap: spacing.sm");
    const groupCount = source.split('<View style={styles.group}>').length - 1;
    expect(groupCount).toBe(6);
    // A group that may have nothing in it is not rendered at all — an empty
    // View would otherwise leave a stray gap.
    expect(source).toContain("{(intervention && interventionOutcome) || snapshot.persistentStruggleCount > 0 ? (");
    expect(source).toContain("{snapshot.weakTopics.length > 0 || snapshot.strongTopics.length > 0 ? (");
    // The verdict, the next step and the one action stay together, in order.
    const intervention = source.slice(source.indexOf("Phase 44 — the result"), source.indexOf("Zayıf konular"));
    expect(intervention.indexOf("InterventionOutcomeCard")).toBeLessThan(intervention.indexOf("Sonraki adım"));
    expect(intervention.indexOf("Sonraki adım")).toBeLessThan(intervention.indexOf("Tekrarlayan zorlanma"));
  });

  it("pairs the Hub's related blocks and keeps its order", () => {
    // Phase 109 — the Hub became one scrolling workspace: tight inside the
    // identity, a clear step between sections, and the sections in the
    // order the student needs them (act, plan, unresolved, practice, gaps,
    // strengths, progress, goal). The B2 rhythm rule is the same; the
    // blocks it applies to are Phase 109's.
    const source = read(STUDY);
    expect(styleBlock(source, "content")).toContain("gap: spacing.xl");
    expect(styleBlock(source, "identity")).toContain("gap: spacing.xxs");
    expect(styleBlock(source, "section")).toContain("gap: spacing.sm");
    const order = [
      "FOCUS_TITLE}",
      "TODAY_TITLE}",
      "<AssignedWorkSection",
      "UNRESOLVED_TITLE}",
      // Phase 117 — the section header here was the first tile's own
      // words repeated; the tiles label themselves now.
      "PRACTICE_TILE_FILTER}",
      "STRUGGLE_TITLE}",
      "STRENGTHS_TITLE}",
      "PROGRESS_TITLE}",
      "GOAL_TITLE}",
      "<DailyGoalEditor",
    ].map((marker) => source.indexOf(marker, source.indexOf("return (")));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("B3 — identity resilience", () => {
  // Phase 104 fixed a teacher's name truncating beside the avatar in Bugün's
  // identity header. Phase 119 removed that header: Bugün is about the day's
  // work, and a teacher's identity is Profil's subject. The guarantee did not
  // move — it now has only one home, Profil's own hero, whose wrapping is
  // pinned by the test below and by profilePolish's own suite. What is pinned
  // here is that the header is really gone and that nothing it carried was
  // dropped on the way.
  it("keeps Bugün free of the identity header, with its two utilities still reachable", () => {
    expect(existsSync(join(ROOT, "src/features/teacher/components/TeacherDashboardHeader.tsx"))).toBe(false);
    const today = read("src/features/teacher/screens/TeacherTodayScreen.tsx");
    expect(today).not.toMatch(/TeacherDashboardHeader|resolveGreeting|useSignOut|<Avatar/);
    // The bell moved to the new header with the same route and subscription.
    const header = read("src/features/teacher/components/TeacherTodayHeader.tsx");
    expect(header).toContain("<NotificationBellButton");
    expect(header).toContain("route={ROUTES.teacherNotifications}");
    // Sign-out keeps the home Phase 115 gave it, on Profil → Ayarlar.
    expect(read("src/features/profile/screens/SettingsScreen.tsx")).toContain('title: "Çıkış Yap"');
  });

  it("centres the role badge under the profile hero's centred identity", () => {
    const source = read("src/features/profile/components/ProfileHero.tsx");
    expect(source).toMatch(/<View>\s*<RoleBadge role=\{role\} \/>\s*<\/View>/);
    expect(styleBlock(source, "container")).toContain('alignItems: "center"');
    // The cause is Badge's own leading-edge pin, which stays for row callers.
    expect(styleBlock(read("src/components/ui/Badge.tsx"), "container")).toContain('alignSelf: "flex-start"');
  });
});

describe("B5 — immersive controls follow the surface, not the theme", () => {
  it("pins the camera shutter to the immersive vocabulary", () => {
    const source = code("src/features/upload/components/CameraButton.tsx");
    expect(source).toContain('import { IMMERSIVE_FOREGROUND, IMMERSIVE_SURFACE } from "@theme/immersive";');
    // (styleBlock cannot be used here: the block nests a shadowOffset object.)
    expect(source).toContain("backgroundColor: IMMERSIVE_FOREGROUND");
    expect(source).toContain("borderColor: IMMERSIVE_SURFACE");
    expect(source).toContain('color={IMMERSIVE_SURFACE} accessibilityElementsHidden');
    // No theme token left on this control.
    expect(source).not.toContain("colors.");
    // Geometry unchanged.
    expect(source).toContain("width: 68");
    expect(source).toContain("height: 68");
    expect(source).toContain("borderRadius: 34");
  });

  it("puts the class feed's empty and error panels on the immersive EmptyState", () => {
    const source = code("src/features/classes/screens/ClassFeedScreen.tsx");
    expect(source.match(/tone="immersive"/g)?.length).toBe(2);
    expect(source).not.toContain("colors.textTertiary");
    expect(source).not.toMatch(/"white"|#0B0B0F|#B4B8C0|#F97066/);
    expect(styleBlock(source, "flex")).toContain("backgroundColor: IMMERSIVE_SURFACE");
    // The real actions survive the migration: retry when recoverable, back always.
    expect(source).toContain('accessibilityLabel="Tekrar dene"');
    expect(source.match(/accessibilityLabel="Sınıfa dön"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
