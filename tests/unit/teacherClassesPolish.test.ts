import { readFileSync } from "fs";
import { join } from "path";

// Phase 120 — Sınıflar, the teacher's class navigator.
//
// The screen was already the right thing: one query, one card per class, one
// way to add another. What it LOOKED like buried its own verb — the create
// action was a full-width secondary button under the title, present only once
// a teacher already had a class, so the one state that most needs it (none
// yet) reached it by a different button entirely.
//
// The larger part of this phase is what it does NOT build. The mockup shows an
// "Aktif Sınıflar / Arşivlenen" segmented control and a "Sınıfa Katıl" card,
// and the repository supports neither: no client can write a class document at
// all, so no archive can ever exist, and joinClassByCode rejects any caller
// who is not a student. These tests pin those absences against the server
// rules that make them true, so a later phase cannot quietly draw a control
// the backend would refuse.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SCREEN = "src/features/classes/screens/TeacherClassesScreen.tsx";
const CARD = "src/features/classes/components/ClassCard.tsx";
const HOOK = "src/features/classes/hooks/useTeacherClasses.ts";
const MODAL = "src/features/classes/components/CreateClassModal.tsx";

const PHASE_120_UI = [SCREEN, CARD];

describe("§5/§6 navigation is untouched", () => {
  it("keeps the teacher's four tabs, in order, with Sınıflar second", () => {
    const titles = [...read("app/(teacher)/(tabs)/_layout.tsx").matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    expect(titles).toEqual(["Bugün", "Sınıflar", "Aksiyonlar", "Profil"]);
    expect(titles[1]).toBe("Sınıflar");
  });

  it("leaves the student's tabs and their class screen alone", () => {
    const titles = [...read("app/(student)/(tabs)/_layout.tsx").matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    expect(titles).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
    for (const file of PHASE_120_UI) {
      // No student route, and none of Phase 118's student-class components.
      expect(code(file)).not.toMatch(/\(student\)|StudentClassCard|ClassIdentityCard|ClassSocialSections|ClassmatesPreview/);
    }
  });

  it("leaves Phase 119's Bugün composition exactly as it was", () => {
    const today = code("src/features/teacher/screens/TeacherTodayScreen.tsx");
    const order = [
      "<TeacherTodayHeader",
      "<TeacherClassSwitcher",
      "summary.sentence",
      '<ClassAttentionPanel classId={selectedClass.id} attention={attention} mode="today"',
    ].map((marker) => today.indexOf(marker));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // And Sınıflar did not become a second action centre.
    expect(code(SCREEN)).not.toMatch(/ClassAttentionPanel|useClassAttention|useTeacherToday|ActionCenter/);
  });
});

describe("§19/§25 the list is the canonical one", () => {
  it("reads the teacher's classes through the existing hook and query", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("useTeacherClasses(");
    expect(screen).not.toMatch(/getDocs|getDoc\(|collection\(|onSnapshot|httpsCallable/);
    const hook = code(HOOK);
    expect(hook).toContain("getTeacherClasses(teacherId)");
    // One equality query for the whole screen — no per-class follow-up.
    const service = code("src/services/firebase/classes.ts");
    expect(service).toContain('where("teacherId", "==", teacherId)');
  });

  it("adds no per-class read, listener or fan-out", () => {
    for (const file of PHASE_120_UI) {
      expect(code(file)).not.toMatch(/onSnapshot|getDocs|getDoc\(|collection\(|httpsCallable|mapWithConcurrency/);
      // No loop that turns the list of classes into a list of loads.
      expect(code(file)).not.toMatch(/classes\.map\([^)]*use|\.map\([^)]*await/);
    }
    // The member count is a field the class document already carries.
    expect(code(CARD)).toContain("classRoom.memberCount");
    expect(read("src/types/class.ts")).toContain("memberCount: number;");
  });

  it("puts no metric, analytics or student data on a class card", () => {
    for (const file of PHASE_120_UI) {
      const source = code(file);
      expect(source).not.toMatch(
        /successRate|averag|percent|accuracy|studyItems|studyEvents|persistent_struggle|intervention|assignmentCompletion|\bemail\b/i,
      );
      expect(source).not.toMatch(/useClassPerformance|useClassAssignments|studentPerformance|TeacherStatsCard/);
    }
  });
});

describe("§11/§26/§27 archive: the state exists, the capability does not", () => {
  it("proves no client can archive a class, so no segmented control is built", () => {
    // The rule that settles it: every write to a class document is denied.
    const rules = read("firestore.rules");
    const classDoc = rules.slice(rules.indexOf("match /classes/{classId} {"));
    expect(classDoc.slice(0, 300)).toMatch(/allow write: if false;/);
    // And the only writer, the callable, creates active classes.
    expect(code("functions/src/classes/createClass.ts")).toContain('status: "active"');
    // So the screen builds no tab pair and no restore control.
    const screen = code(SCREEN);
    expect(screen).not.toMatch(/SegmentedPills|accessibilityRole="tab"|Aktif Sınıflar|arşivden çıkar|unarchive|restore/i);
  });

  it("still degrades honestly if a class ever carries the archived status", () => {
    const screen = code(SCREEN);
    expect(screen).toContain('export const TEACHER_ARCHIVED_TITLE = "Arşivlenen";');
    expect(screen).toContain('classes.filter((classRoom) => classRoom.status === "active")');
    expect(screen).toContain('classes.filter((classRoom) => classRoom.status !== "active")');
    // Empty groups render no heading at all.
    expect(screen).toContain("if (active.length > 0) sections.push({ title: null, data: active });");
    expect(screen).toContain("if (archived.length > 0) sections.push({ title: TEACHER_ARCHIVED_TITLE");
    expect(screen).toContain("if (!section.title) return null;");
  });

  it("names an archived class in words, never by colour alone", () => {
    const card = code(CARD);
    expect(card).toContain('const isArchived = classRoom.status !== "active";');
    expect(card).toContain('<Badge label="Arşiv" variant="neutral" />');
    // And a screen reader hears it too.
    expect(card).toContain('${isArchived ? ". Arşivlendi" : ""}');
  });
});

describe("§12/§31 Sınıfa Katıl is not a teacher capability", () => {
  it("is absent from the screen, because the server would refuse it", () => {
    for (const file of PHASE_120_UI) {
      // Stripped of comments: the screen's own doc comment names the control
      // in order to record WHY it is not built, which is worth keeping.
      expect(code(file)).not.toContain("Sınıfa Katıl");
      expect(code(file)).not.toMatch(/joinClassByCode|JoinClassModal|katılım kodu gir/i);
    }
    // The callable's own guard is what makes this the truthful choice.
    expect(code("functions/src/classes/joinClassByCode.ts")).toContain('caller.token.role !== "student"');
  });
});

describe("§13/§24/§30 creating a class reuses the canonical flow", () => {
  it("opens the same modal and the same callable, now always reachable", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("<CreateClassModal");
    expect(screen).toContain("createClass(name)");
    expect(screen).toContain('accessibilityLabel="Yeni sınıf oluştur"');
    // The header action no longer depends on already having a class.
    expect(screen).not.toContain("classes.length > 0 ?");
    // The empty state keeps its own primary button.
    expect(screen).toContain('<PrimaryButton label="İlk Sınıfını Oluştur"');
  });

  it("asks for no field the class model does not have", () => {
    const modal = code(MODAL);
    expect(modal).toContain('placeholder="Sınıf adı"');
    expect(modal).not.toMatch(/subject|ders|grade|sınıf seviyesi|school|okul|description/i);
    // createClass's own signature is unchanged: a name, nothing more.
    expect(code(HOOK)).toContain("createClassCallable(name)");
  });
});

describe("§15/§28/§29 the card says only what the class document holds", () => {
  it("shows the real name, the real count and the real code", () => {
    const card = code(CARD);
    expect(card).toContain("{classRoom.name}");
    expect(card).toContain("{classRoom.joinCode}");
    expect(card).toContain("const memberLabel = `${classRoom.memberCount} üye`;");
    // No subject, grade, section or school is derived from anything.
    expect(card).not.toMatch(/subject|gradeLevel|section\b|school|okul|curriculum/i);
  });

  it("opens the existing teacher class detail, and nothing else", () => {
    expect(code(CARD)).toContain(
      'router.push({ pathname: "/(teacher)/class/[classId]", params: { classId: classRoom.id } })',
    );
    expect(read("app/(teacher)/class/[classId]/index.tsx")).toContain("TeacherClassDetailScreen");
  });

  it("hard-codes nothing from the mockup", () => {
    for (const file of PHASE_120_UI) {
      const source = read(file);
      for (const literal of [
        "9-A Matematik",
        "10-B Matematik",
        "11-C Matematik",
        "9-B Matematik",
        "24 öğrenci",
        "28 öğrenci",
        "16 öğrenci",
        "22 öğrenci",
      ]) {
        expect(source).not.toContain(literal);
      }
      // "Aktif Sınıflar" is named only in the comment that explains why the
      // segmented control is not built.
      expect(code(file)).not.toContain("Aktif Sınıflar");
    }
  });

  it("gives every class the same treatment — no palette that implies a standing", () => {
    const card = code(CARD);
    // One avatar from the class's own initial, not a colour per class.
    expect(card).toContain("<Avatar displayName={classRoom.name} size=\"lg\" />");
    expect(card).not.toMatch(/COLORS\[|colou?rFor|paletteFor|index % |hashCode/i);
  });
});

describe("§16/§43 no gamification, no scores", () => {
  it("introduces no points, rank, leaderboard or class score", () => {
    for (const file of PHASE_120_UI) {
      expect(code(file)).not.toMatch(
        /totalPoints|weeklyPoints|\bPuan\b|\bXP\b|leaderboard|liderlik|sıralama|ranking|rozet|streak|en iyi sınıf|class score/i,
      );
    }
  });
});

describe("§36/§37/§40 both themes, and the largest text size", () => {
  it("paints with tokens only", () => {
    for (const file of PHASE_120_UI) {
      expect(code(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|"white"|"black"/);
      expect(read(file)).toContain("themedStyles");
    }
  });

  it("lets a long class name wrap instead of truncating", () => {
    const card = read(CARD);
    // Capped at one line, a real class name lost its end on a phone.
    expect(card).toContain("<Text style={styles.name}>{classRoom.name}</Text>");
    expect(card).toMatch(/nameRow:\s*\{[\s\S]*?flexWrap: "wrap",/);
  });

  it("stacks the card's top row rather than clipping it once text is scaled", () => {
    const card = read(CARD);
    expect(card).toContain("const stacked = fontScale >= stackAtFontScale;");
    expect(card).toContain("stacked ? styles.topRowStacked : null");
    expect(card).toMatch(/topRowStacked:\s*\{[\s\S]*?flexDirection: "column",/);
    expect(card).toMatch(/textColumn:\s*\{[\s\S]*?minWidth: 0,/);
  });

  it("gives the row a 44pt target and speaks the whole card once", () => {
    const card = read(CARD);
    expect(card).toContain("minHeight: minTouchTarget");
    expect(card).toContain(
      "accessibilityLabel={`${classRoom.name} sınıfını aç. ${memberLabel}${isArchived ? \". Arşivlendi\" : \"\"}`}",
    );
    // Every glyph inside a labelled control is decoration.
    const icons = card.match(/<Ionicons\b[\s\S]*?\/>/g) ?? [];
    expect(icons.length).toBeGreaterThanOrEqual(3);
    for (const icon of icons) expect(icon).toContain("accessibilityElementsHidden");
  });

  // Both found on the simulator at the largest accessibility size, with a
  // clean relaunch — neither dismissed as device behaviour.
  it("never cuts or breaks the join code, the one thing the card exists to hand out", () => {
    const card = read(CARD);
    // Capped at one line it read "DEMO…"; wrapped inside the row it broke in
    // the middle of itself. Stacked, the code owns its own line.
    expect(card).toContain("<Text style={[styles.code, stacked ? styles.codeStacked : null]}>{classRoom.joinCode}</Text>");
    expect(card).not.toMatch(/styles\.code[,\]][^>]*numberOfLines/);
    expect(card).toMatch(/codeRowStacked:\s*\{[\s\S]*?flexDirection: "column",/);
    expect(card).toMatch(/codeStacked:\s*\{[\s\S]*?alignSelf: "stretch",/);
  });

  it("drops the chevron when the row stacks, rather than leaving it pointing at nothing", () => {
    const card = read(CARD);
    expect(card).toContain("{stacked ? null : (");
    expect(card).toContain('name="chevron-forward"');
  });

  it("caps no text on the screen's own headings", () => {
    expect(read(SCREEN)).not.toMatch(/numberOfLines/);
  });
});

describe("§50 no backend", () => {
  it("changes no backend surface and leaves the protected service alone", () => {
    for (const file of PHASE_120_UI) {
      expect(code(file)).not.toMatch(/firebase-admin|functions\/src|firebase\/firestore/);
      expect(code(file)).not.toContain("services/studentPerformance");
    }
  });
});
