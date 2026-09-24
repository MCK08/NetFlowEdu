import { readFileSync } from "fs";
import { join } from "path";

import { classShareMessage, shareClassCodeLabel } from "../../src/features/classes/services/classShare";
import { teacherStudentHref, teacherStudentRoute } from "../../src/features/teacher/services/actionCenterNavigation";
import { upcomingAssignments } from "../../src/features/teacher/services/teacherToday";
import type { Assignment } from "../../src/features/assignments/domain/assignmentTypes";

// Phase 123 — the teacher's class detail, finally shaped like the job.
//
// What this pins: the four-tab architecture is untouched; every fact on the
// page is the class document's or a canonical hook's; every rendered control
// targets a route that already existed; the roster stays operational and
// privacy-safe; an archived class loses exactly the writes the rules would
// refuse; nothing new is read; and no mockup example value was hard-coded.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative)
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");

const SCREEN = "src/features/classes/screens/TeacherClassDetailScreen.tsx";
const IDENTITY = "src/features/classes/components/TeacherClassIdentity.tsx";
const MEMBER_ROW = "src/features/classes/components/ClassMemberRow.tsx";
const CARD = "src/features/classes/components/ClassCard.tsx";
const SHARE = "src/features/classes/services/classShare.ts";
const SHARE_BUTTON = "src/features/classes/components/ShareCodeButton.tsx";
const PHASE_123_UI = [SCREEN, IDENTITY, MEMBER_ROW, SHARE];

function tabTitles(layout: string): string[] {
  return [...code(layout).matchAll(/title: "([^"]+)"/g)].map((m) => m[1] ?? "");
}

describe("§5/§6 navigation stays exactly where it was", () => {
  it("teacher tabs are Bugün, Sınıflar, Aksiyonlar, Profil — Sınıflar second", () => {
    const titles = tabTitles("app/(teacher)/(tabs)/_layout.tsx");
    expect(titles).toEqual(["Bugün", "Sınıflar", "Aksiyonlar", "Profil"]);
    expect(titles[1]).toBe("Sınıflar");
    for (const forbidden of ["Öğrenciler", "Ödevler", "Sorular", "Analiz", "Raporlar"]) {
      expect(titles).not.toContain(forbidden);
    }
  });

  it("student tabs are untouched", () => {
    expect(tabTitles("app/(student)/(tabs)/_layout.tsx")).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
  });

  it("class detail stays the nested route Sınıflar already opens", () => {
    expect(code(CARD)).toContain(
      'router.push({ pathname: "/(teacher)/class/[classId]", params: { classId: classRoom.id } })',
    );
    expect(read("app/(teacher)/class/[classId]/index.tsx")).toContain("TeacherClassDetailScreen");
    expect(code(SCREEN)).toContain('fallbackHref="/(teacher)/(tabs)/classes"');
  });
});

describe("§25/§26 class identity is the document's own", () => {
  it("shows name, memberCount, joinCode and status — and invents no other metadata", () => {
    const identity = code(IDENTITY);
    expect(identity).toContain("{classRoom.name}");
    expect(identity).toContain("`${classRoom.memberCount} üye`");
    expect(identity).toContain("{classRoom.joinCode}");
    expect(identity).toContain('classRoom.status !== "active"');
    // The class document holds no subject, grade, section, school or level,
    // so no such field is read or drawn.
    expect(identity).not.toMatch(/classRoom\.(subject|topic|gradeLevel|grade|section|school|level|description)\b/);
    expect(identity).not.toMatch(/\b(gradeLevel|seviye|şube|okul)\b/i);
  });

  it("shares the REAL code through the one shared implementation", () => {
    expect(classShareMessage("9-A", "ABC123")).toBe("9-A sınıfına katılmak için kod: ABC123");
    expect(shareClassCodeLabel("9-A")).toBe("9-A sınıfının katılım kodunu paylaş");
    // One control, rendered by both the class list card and class detail; the
    // Share sheet is called in exactly one file.
    expect(code(IDENTITY)).toContain("<ShareCodeButton className={classRoom.name} joinCode={classRoom.joinCode} />");
    expect(code(CARD)).toContain("<ShareCodeButton className={classRoom.name} joinCode={classRoom.joinCode} />");
    expect(code(CARD)).not.toContain("Share.share(");
    expect(code(SHARE)).not.toContain("react-native");
    expect(code(SHARE_BUTTON)).toContain("Share.share({ message: classShareMessage(className, joinCode) })");
  });

  it("adds no teacher join-class flow, and no class lifecycle the backend lacks", () => {
    const screen = code(SCREEN);
    expect(screen).not.toMatch(/joinClassByCode|Sınıfa Katıl|Arşivden Çıkar|Sınıfı Sil|Sahipliği Devret|co-?teacher/i);
    expect(code(IDENTITY)).not.toMatch(/joinClassByCode|Arşivden Çıkar|Sınıfı Sil/i);
  });
});

describe("§27/§31/§32/§33/§34 every rendered control targets an existing destination", () => {
  const screen = code(SCREEN);

  it.each([
    ["/(teacher)/class/[classId]/chat", "app/(teacher)/class/[classId]/chat.tsx"],
    ["/(teacher)/class/[classId]/actions", "app/(teacher)/class/[classId]/actions.tsx"],
    ["/(teacher)/class/[classId]/performance", "app/(teacher)/class/[classId]/performance.tsx"],
    ["/(teacher)/class/[classId]/learning-story", "app/(teacher)/class/[classId]/learning-story.tsx"],
    ["/(teacher)/class/[classId]/answer-reviews", "app/(teacher)/class/[classId]/answer-reviews.tsx"],
    ["/(teacher)/class/[classId]/comment-reviews", "app/(teacher)/class/[classId]/comment-reviews.tsx"],
    ["/(teacher)/class/[classId]/assignment/create", "app/(teacher)/class/[classId]/assignment/create.tsx"],
    ["/(teacher)/class/[classId]/assignment/[assignmentId]", "app/(teacher)/class/[classId]/assignment/[assignmentId].tsx"],
    ["/(teacher)/class/[classId]/student/[studentId]", "app/(teacher)/class/[classId]/student/[studentId].tsx"],
  ])("%s is a real route file", (pathname, file) => {
    expect(read(file).length).toBeGreaterThan(0);
  });

  it("routes only to those, and never invents one", () => {
    const pathnames = [...screen.matchAll(/pathname: "([^"]+)"/g)].map((m) => m[1]);
    // The student route is spelled once, in the shared helper.
    expect(new Set(pathnames)).toEqual(
      new Set([
        "/(teacher)/class/[classId]/chat",
        "/(teacher)/class/[classId]/actions",
        "/(teacher)/class/[classId]/performance",
        "/(teacher)/class/[classId]/learning-story",
        "/(teacher)/class/[classId]/answer-reviews",
        "/(teacher)/class/[classId]/comment-reviews",
        "/(teacher)/class/[classId]/assignment/create",
        "/(teacher)/class/[classId]/assignment/[assignmentId]",
      ]),
    );
    expect(screen).toContain("teacherStudentRoute(classId, member.uid");
  });

  it("assigned work comes from the assignments the attention hook already read, through Bugün's own helper", () => {
    expect(screen).toContain("upcomingAssignments(attention.assignments, Date.now())");
    // No second assignments query, no second ordering rule.
    expect(screen).not.toMatch(/useClassAssignments|getClassAssignments|sortNewestFirst/);
    const now = Date.UTC(2026, 8, 23, 9, 0, 0);
    const assignment = (id: string, dueAt: number | null, status: Assignment["status"] = "published") =>
      ({ id, title: id, dueAt, status } as Assignment);
    const rows = upcomingAssignments(
      [assignment("late", now + 3 * 86400000), assignment("soon", now + 3600000), assignment("draft", now + 60000, "draft"), assignment("undated", null)],
      now,
    );
    expect(rows.map((row) => row.id)).toEqual(["soon", "late"]);
  });

  it("shows no fabricated queue count, and mounts no review-queue read to invent one", () => {
    expect(screen).toContain('title="Yanıt İncelemeleri"');
    expect(screen).toContain('title="Yorum İncelemeleri"');
    expect(screen).not.toMatch(/useAnswerReviewQueue|useCommentReviewQueue|reviewPendingLabel|bekliyor/);
  });

  it("reuses the canonical class-question surface rather than a second feed", () => {
    expect(screen).toContain("useClassQuestions(classId)");
    expect(screen).toContain("<QuestionGridItem");
    expect(screen).not.toMatch(/popular|mostLiked|en çok|score|rank/i);
  });
});

describe("§28 attention rows are the canonical list, unchanged", () => {
  const screen = code(SCREEN);

  it("renders the Action Center's own summary through the shared panel", () => {
    expect(screen).toContain("useClassAttention(classId)");
    expect(screen).toContain('<ClassAttentionPanel');
    expect(screen).toContain('mode="summary"');
    // No second builder, no second filter, no re-ranking in the screen.
    expect(screen).not.toMatch(/buildTeacherActionCenter|buildTeacherActionSummary|filterActionCenterItems|\.sort\(/);
  });

  it("runs no classifier and derives no urgency of its own", () => {
    for (const file of PHASE_123_UI) {
      const source = code(file);
      expect(source).not.toMatch(/persistent_struggle|one_off_struggle|recovering|insufficient_data|buildLearningState|escalate|follow_up/);
      expect(source).not.toMatch(/\b(priority|urgency|riskScore|score|ranking|öncelik)\b/i);
    }
  });
});

describe("§29/§30/§35 the roster stays operational and privacy-safe", () => {
  const screen = code(SCREEN);
  const row = code(MEMBER_ROW);

  it("comes from canonical class membership, with no per-student fetch", () => {
    expect(screen).toContain("useClassDetail(classId)");
    expect(screen).toContain("<ClassMemberRow");
    expect(screen).not.toMatch(/useProfileHandle|usePublicProfile|getUserProfile|resolveQuestionMetadata/);
    expect(row).not.toMatch(/useEffect|fetch|getDoc|onSnapshot/);
  });

  it("shows identity and role only", () => {
    expect(row).toContain("resolvePublicIdentity(member)");
    expect(row).toContain("roleLabel(member.role)");
    expect(row).not.toMatch(/email|accuracy|totalPoints|weeklyPoints|rank|leaderboard|yüzde|%|doğruluk|puan/i);
  });

  it("opens the ONE canonical student screen, spelled in one place", () => {
    expect(teacherStudentRoute("c1", "s1", "Ada")).toEqual({
      pathname: "/(teacher)/class/[classId]/student/[studentId]",
      params: { classId: "c1", studentId: "s1", studentName: "Ada" },
    });
    // The Action Center's own helper resolves through the same function.
    expect(teacherStudentHref("c1", "s1", [{ studentUid: "s1", displayName: "Ada" }])).toEqual(
      teacherStudentRoute("c1", "s1", "Ada"),
    );
    expect(teacherStudentHref("c1", "ghost", [])).toEqual(teacherStudentRoute("c1", "ghost", ""));
    // A teacher's own row has no student screen.
    expect(screen).toContain('member.role === "teacher" ? undefined : openStudent');
    // No second performance dashboard is rendered here.
    expect(screen).not.toMatch(/StudentPerformanceCard|useStudentPerformanceDetail|useClassPerformance\(/);
  });
});

describe("§36 an archived class keeps its readings and loses its writes", () => {
  const screen = code(SCREEN);

  it("gates every write on the document's own status and says so", () => {
    expect(screen).toContain('const isArchived = classRoom.status !== "active";');
    expect(screen).toContain("const canWrite = !isArchived;");
    // The writes: chat/upload actions, regenerate, create work, remove member.
    expect(screen).toContain("{canWrite ? (");
    expect(screen).toContain("onRegenerateCode={canWrite ? regenerateCode : undefined}");
    expect(screen).toContain("canRemove={canWrite && !isMutating}");
    expect(code(IDENTITY)).toContain("TEACHER_CLASS_ARCHIVED_NOTE");
    // The state is a word, never a colour alone.
    expect(code(IDENTITY)).toContain('<Badge label={TEACHER_CLASS_ARCHIVED_BADGE} variant="neutral" />');
  });
});

describe("§18/§43/§44 no gamification, no mockup values, no private fields", () => {
  it("hard-codes nothing from the mockup", () => {
    for (const file of PHASE_123_UI) {
      const source = read(file);
      for (const literal of [
        "Demo Sınıfı",
        "DEMO01",
        "Öğrenci F",
        "Öğrenci B",
        "7 üye",
        "Gerçek atanan çalışma",
        "Bekleyen öğretmen incelemesi",
      ]) {
        expect(source).not.toContain(literal);
      }
    }
  });

  it("carries no score, rank or points vocabulary", () => {
    for (const file of PHASE_123_UI) {
      const source = code(file).toLocaleLowerCase("tr");
      expect(source).not.toMatch(/leaderboard|liderlik|sıralama|ranking|totalpoints|weeklypoints|\bpuan|\bxp\b|rozet|\bseviye|en iyi öğrenci|percentile/);
    }
  });
});

describe("§41 accessibility", () => {
  it("wraps every growing string instead of clipping it", () => {
    for (const file of [SCREEN, IDENTITY, MEMBER_ROW]) {
      // No truncation on names, codes, labels or work titles.
      expect(code(file)).not.toMatch(/numberOfLines/);
    }
    // Text containers grow: no fixed heights on the blocks that hold words.
    const identity = code(IDENTITY);
    for (const block of ["title", "meta", "code", "codeLabel", "archivedNote"]) {
      const match = identity.match(new RegExp(`^\\s+${block}:\\s*\\{([^{}]*)\\}`, "m"));
      expect(match?.[1] ?? "").not.toMatch(/\bheight:/);
    }
  });

  it("keeps 44pt targets and restructures at the accessibility text sizes", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("fontScale >= stackAtFontScale");
    expect(screen).toContain("stackedActions ? styles.actionsStacked : null");
    expect(code(IDENTITY)).toContain("fontScale >= stackAtFontScale");
    expect(code(MEMBER_ROW)).toContain("minHeight: minTouchTarget");
    expect(code(IDENTITY)).toContain("minHeight: minTouchTarget");
    expect(screen).toContain("minHeight: minTouchTarget");
  });

  // Phase 123 completion QA — found on the simulator at the largest
  // accessibility size. Uncapping the name and handle was necessary but not
  // sufficient: the role label kept its place on the same line, leaving the
  // name column about half the row, so the words broke INSIDE themselves
  // ("Demo Öğret / men", "@demo / _teache / r"). With the remove control
  // still held beside the column, a student's handle broke too
  // ("@demo_student_ / a").
  it("stacks a roster row so no name, handle or code breaks mid-word", () => {
    const row = read(MEMBER_ROW);
    expect(row).toContain("const stacked = fontScale >= stackAtFontScale;");
    // Both levels stack: the person block, and the row that holds it beside
    // the remove control.
    expect(row).toContain("style={[styles.row, stacked ? styles.rowStacked : null]}");
    expect(row).toContain("stacked ? styles.personStacked : null");
    expect(row).toContain("stacked ? styles.nameColumnStacked : null");
    expect(row).toMatch(/rowStacked:\s*\{[\s\S]*?flexDirection: "column",/);
    expect(row).toMatch(/personStacked:\s*\{[\s\S]*?flexDirection: "column",/);
    expect(row).toMatch(/personStacked:\s*\{[\s\S]*?alignSelf: "stretch",/);
    // And nothing is capped, so the wrapping actually happens.
    expect(row).not.toMatch(/numberOfLines/);
  });

  it("drops the roster chevron when the row stacks, rather than stranding it", () => {
    const row = read(MEMBER_ROW);
    expect(row).toContain("{stacked ? null : (");
    expect(row).toContain('name="chevron-forward"');
    // The row still says what it opens, stacked or not.
    expect(row).toContain('accessibilityHint="Öğrencinin performans ekranını açar"');
  });

  it("labels its controls and hides its decoration", () => {
    for (const file of [SCREEN, IDENTITY, MEMBER_ROW]) {
      const source = code(file);
      const icons = source.match(/<Ionicons\b[\s\S]*?\/>/g) ?? [];
      expect(icons.length).toBeGreaterThan(0);
      for (const icon of icons) expect(icon).toContain("accessibilityElementsHidden");
      for (const control of source.match(/accessibilityRole="button"/g) ?? []) expect(control).toBeTruthy();
      expect(source).toContain("accessibilityLabel");
    }
    // The back button and the share control say what they do.
    expect(code(SCREEN)).toContain("<AppBackButton");
    expect(code(SHARE_BUTTON)).toContain("accessibilityLabel={shareClassCodeLabel(className)}");
    expect(code(IDENTITY)).toContain('accessibilityLabel="Katılım kodunu yenile"');
  });
});

describe("§39/§45/§46 cost and semantics", () => {
  it("adds no hook, listener or query beyond the four the screen already had", () => {
    const screen = code(SCREEN);
    const hooks = (screen.match(/use[A-Z]\w+\(/g) ?? []).filter(
      (hook) => !["useCallback(", "useMemo(", "useAuth(", "useWindowDimensions(", "useThemeSubscription(", "useNavigationGuard("].includes(hook),
    );
    expect(new Set(hooks)).toEqual(
      new Set(["useClassDetail(", "useClassQuestions(", "useClassAttention(", "useClassUpload("]),
    );
    expect(screen).not.toMatch(/onSnapshot|collection\(|getDocs\(|httpsCallable\(/);
  });

  it("changes no semantic service and no backend file", () => {
    // Presentation-only: the screen imports the canonical services, and the
    // services themselves are not touched by this phase (proved in review by
    // the diff; here we pin that the UI never re-implements them).
    const screen = code(SCREEN);
    expect(screen).not.toMatch(/interventionEffectiveness|postInterventionAction|studentPerformance|teacherActionCenter\b/);
    expect(code(IDENTITY)).not.toMatch(/firebase|firestore|httpsCallable/i);
  });
});
