import { readFileSync } from "fs";
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
const STUDENT_CLASS = "src/features/classes/screens/StudentClassDetailScreen.tsx";
const STUDENT_PERF = "src/features/teacher/screens/StudentPerformanceScreen.tsx";
const STUDY = "src/features/study/screens/StudyScreen.tsx";

describe("B1 — the teacher's class detail speaks the same type roles as the student's", () => {
  it("uses the screen-title, control and section roles instead of private pairs", () => {
    const source = code(TEACHER_CLASS);
    expect(styleBlock(source, "title")).toContain("...typography.screenTitleSm");
    expect(styleBlock(source, "chatButtonText")).toContain("...typography.button");
    expect(styleBlock(source, "secondaryButtonText")).toContain("...typography.button");
    expect(styleBlock(source, "uploadButtonText")).toContain("...typography.button");
    expect(styleBlock(source, "sectionTitle")).toContain("...typography.subtitle");
    expect(styleBlock(source, "code")).toContain("...typography.cardTitle");
    // No hand-written text metrics remain on this screen.
    expect(source).not.toMatch(/fontSize:\s*\d+/);
  });

  it("mirrors the student sibling's roles exactly", () => {
    const student = code(STUDENT_CLASS);
    expect(styleBlock(student, "title")).toContain("...typography.screenTitleSm");
    expect(styleBlock(student, "chatButtonText")).toContain("...typography.button");
    expect(styleBlock(student, "sectionTitle")).toContain("...typography.subtitle");
  });
});

describe("B2 — grouping rhythm", () => {
  it("groups the teacher's seven class controls: chat, three lenses, two review queues, add", () => {
    const source = read(TEACHER_CLASS);
    const groups = source.split('<View style={styles.group}>');
    // Two tight groups...
    expect(groups.length).toBe(3);
    // ...one holding the three ways of looking at the class,
    expect(groups[1]).toContain("Bugün Öne Çıkanlar");
    expect(groups[1]).toContain("Sınıf Performansı");
    expect(groups[1]).toContain("Sınıfın İlerleme Hikâyesi");
    expect(groups[1]).not.toContain("İncelemeleri");
    // ...the other the two review queues.
    expect(groups[2]).toContain("Yanıt İncelemeleri");
    expect(groups[2]).toContain("Yorum İncelemeleri");
    // Inside a group the controls sit a step tighter than between groups.
    expect(styleBlock(source, "group")).toContain("gap: spacing.xs");
    expect(styleBlock(source, "header")).toContain("gap: spacing.md");
    // Nothing was added or lost: still exactly seven navigations/actions.
    expect(source.match(/accessibilityRole="button"/g)?.length).toBe(8); // 7 + "Kodu yenile"
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
  it("moves the utilities to the greeting line and lets the name wrap before it truncates", () => {
    const source = read("src/features/teacher/components/TeacherDashboardHeader.tsx");
    expect(source).toMatch(/<Text style=\{styles\.name\} numberOfLines=\{3\}>\s*\{displayName\}/);
    expect(styleBlock(source, "textColumn")).toContain("minWidth: 0");
    // The bell and sign-out sit on the greeting row, not in the name's row.
    const topRow = source.slice(source.indexOf("<View style={styles.topRow}>"), source.indexOf("styles.identityStacked : styles.identityRow"));
    expect(topRow).toContain("{greeting}");
    expect(topRow).toContain("<NotificationBellButton");
    expect(topRow).toContain('icon="log-out-outline"');
    const identityRow = source.slice(source.indexOf("<View style={stacked ? styles.identityStacked : styles.identityRow}>"));
    expect(identityRow).toContain("<Avatar");
    expect(identityRow).toContain("{displayName}");
    expect(identityRow).not.toContain("<NotificationBellButton");
    // At the accessibility text sizes the row stacks instead of breaking a
    // surname mid-word; below them it is the side-by-side row.
    expect(source).toContain("const STACK_AT_FONT_SCALE = 1.6;");
    expect(source).toContain("const stacked = fontScale >= STACK_AT_FONT_SCALE;");
    expect(source).toContain("const { fontScale } = useWindowDimensions();");
    // Still the same size: no shrinking a person's name to fit chrome.
    expect(styleBlock(source, "name")).toContain("fontSize: 24");
    expect(styleBlock(source, "name")).toContain("lineHeight: 30");
    // The bell and sign-out stay in the row.
    expect(source).toContain("<NotificationBellButton");
    expect(source).toContain('icon="log-out-outline"');
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
