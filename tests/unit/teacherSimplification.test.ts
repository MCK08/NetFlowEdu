import { existsSync, readFileSync } from "fs";
import { join } from "path";

import type { Assignment } from "../../src/features/assignments/domain/assignmentTypes";
import { ROUTES } from "../../src/constants/routes";
import { resolveRouteForState } from "../../src/features/authentication/services/routing";
import type { TeacherActionCenterItem } from "../../src/features/teacher/services/teacherActionCenter";
import {
  activeTeacherClasses,
  buildTodaySummary,
  MAX_UPCOMING_ASSIGNMENTS,
  resolveSelectedClassId,
  reviewPendingLabel,
  TODAY_NOTHING_PENDING,
  upcomingAssignments,
} from "../../src/features/teacher/services/teacherToday";
import type { ClassRoom } from "../../src/types/class";

// Phase 111 — the teacher experience, simplified around daily action.
//
// Bugün / Sınıflar / Aksiyonlar / Profil. The attention list is the Action
// Center's own (Phase 73/101, built from Phase 42/43/47) — this phase only
// places it. These tests pin the new shape, that every deep route is still
// reachable, and that nothing ranks, scores or fans out.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const tabTitles = (layout: string) => [...read(layout).matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);

const TEACHER_TABS = "app/(teacher)/(tabs)/_layout.tsx";
const TODAY = "src/features/teacher/screens/TeacherTodayScreen.tsx";
const ACTIONS = "src/features/teacher/screens/TeacherActionsScreen.tsx";
const PANEL = "src/features/teacher/components/ClassAttentionPanel.tsx";
const CONTEXT = "src/features/teacher/context/TeacherTodayContext.tsx";
const ATTENTION_HOOK = "src/features/teacher/hooks/useClassAttention.ts";
const CLASS_DETAIL = "src/features/classes/screens/TeacherClassDetailScreen.tsx";
const CLASSES = "src/features/classes/screens/TeacherClassesScreen.tsx";

function item(id: string, studentUid: string | null, kind: TeacherActionCenterItem["kind"] = "review_student"): TeacherActionCenterItem {
  return { id, kind, studentUid, title: studentUid ?? "Denklemler", topicContext: null, reason: "Tekrar eden zorlanma.", evidenceNote: null };
}

function classRoom(id: string, createdAt: number, status: ClassRoom["status"] = "active"): ClassRoom {
  return { id, name: id.toUpperCase(), organizationId: null, teacherId: "t", joinCode: "X", createdAt, updatedAt: createdAt, memberCount: 3, status };
}

describe("§33 teacher information architecture", () => {
  it("1–2. a teacher lands on Bugün, and has exactly four places", () => {
    expect(tabTitles(TEACHER_TABS)).toEqual(["Bugün", "Sınıflar", "Aksiyonlar", "Profil"]);
    expect(resolveRouteForState({ isAuthenticated: true, isEmailVerified: true, role: "teacher" })).toBe(ROUTES.teacher);
    expect(ROUTES.teacher).toBe("/(teacher)/(tabs)");
    expect(read("app/(teacher)/(tabs)/index.tsx")).toContain("<TeacherTodayScreen />");
    expect(read("app/(teacher)/(tabs)/actions.tsx")).toContain("<TeacherActionsScreen />");
    expect(existsSync(join(ROOT, "app/(teacher)/(tabs)/friends.tsx"))).toBe(false);
  });

  it("leaves no link to the removed teacher friends tab", () => {
    // Typed routes live in a gitignored cache, so tsc only catches a stale
    // href after Metro regenerates it — and a plain-string path never. Expo
    // Router resolves this one to the Bugün tab, silently misrouting.
    for (const file of ["src/features/notifications/services/notificationNavigation.ts", "src/features/friends/screens/FindFriendsScreen.tsx"]) {
      expect(read(file)).not.toContain("(teacher)/(tabs)/friends");
      expect(read(file)).toContain("/(teacher)/friends");
    }
  });

  it("3. leaves the student tabs exactly as they were", () => {
    expect(tabTitles("app/(student)/(tabs)/_layout.tsx")).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
  });

  it("4–7. keeps every deep capability reachable", () => {
    for (const route of [
      "app/(teacher)/class/[classId]/performance.tsx",
      "app/(teacher)/class/[classId]/student/[studentId].tsx",
      "app/(teacher)/class/[classId]/actions.tsx",
      "app/(teacher)/class/[classId]/answer-reviews.tsx",
      "app/(teacher)/class/[classId]/comment-reviews.tsx",
      "app/(teacher)/class/[classId]/assignment/create.tsx",
      "app/(teacher)/class/[classId]/assignment/[assignmentId].tsx",
      "app/(teacher)/(tabs)/profile.tsx",
      "app/(teacher)/friends.tsx",
      "app/(teacher)/feed.tsx",
    ]) {
      expect(existsSync(join(ROOT, route))).toBe(true);
    }
    const classPage = read(CLASS_DETAIL);
    expect(classPage).toContain('pathname: "/(teacher)/class/[classId]/performance"');
    expect(classPage).toContain('pathname: "/(teacher)/class/[classId]/actions"');
    // Friends is opened from Profil now, the feed from Bugün.
    expect(read("src/features/profile/screens/ProfileScreen.tsx")).toContain('isTeacher ? "/(teacher)/friends"');
    expect(read(TODAY)).toContain('router.push("/(teacher)/feed" as never)');
  });

  it("8–9. signed-out guarding and the unknown-route fallback are unchanged", () => {
    expect(resolveRouteForState({ isAuthenticated: false, isEmailVerified: false, role: null })).toBe(ROUTES.login);
    expect(read("app/+not-found.tsx")).toContain("Ana sayfaya dön");
  });
});

describe("§34 Bugün", () => {
  it("counts the canonical action list honestly — distinct students, topic actions", () => {
    const summary = buildTodaySummary([item("1", "ayse"), item("2", "ayse", "escalate"), item("3", "can"), item("4", null, "prepare_intervention")]);
    expect(summary).toMatchObject({ studentCount: 2, topicCount: 1 });
    expect(summary.sentence).toBe("Bugün 2 öğrenci dikkatini bekliyor, 1 konu için müdahale öneriliyor.");
  });

  it("says so calmly when there is nothing — no celebration", () => {
    const summary = buildTodaySummary([]);
    expect(summary.sentence).toBe(TODAY_NOTHING_PENDING);
    expect(summary.sentence).not.toMatch(/tebrik|harika|🎉|mükemmel/i);
  });

  it("shows a review row only when something is really waiting", () => {
    expect(reviewPendingLabel(0, false, "yanıt")).toBeNull();
    expect(reviewPendingLabel(2, false, "yanıt")).toBe("2 yanıt inceleme bekliyor");
    expect(reviewPendingLabel(20, true, "yorum")).toBe("20+ yorum inceleme bekliyor");
  });

  it("lists only published work with a real due date, soonest first, capped", () => {
    const now = Date.UTC(2026, 8, 19, 9, 0, 0);
    const day = 24 * 60 * 60 * 1000;
    const assignment = (id: string, over: Partial<Assignment>) => ({ id, title: `Ödev ${id}`, status: "published", dueAt: null, ...over }) as Assignment;
    const upcoming = upcomingAssignments(
      [
        assignment("later", { dueAt: now + 5 * day }),
        assignment("soon", { dueAt: now + day }),
        assignment("today", { dueAt: now + 60_000 }),
        assignment("draft", { dueAt: now + day, status: "draft" }),
        assignment("undated", { dueAt: null }),
        assignment("past", { dueAt: now - 3 * day }),
        assignment("far", { dueAt: now + 9 * day }),
      ],
      now,
    );
    expect(upcoming.map((u) => u.id)).toEqual(["today", "soon", "later"]);
    expect(upcoming).toHaveLength(MAX_UPCOMING_ASSIGNMENTS);
    expect(upcoming.map((u) => u.dueLabel)).toEqual(["bugün teslim", "yarın teslim", "5 gün sonra teslim"]);
  });

  it("picks an active class and keeps the teacher's choice while it is valid", () => {
    const active = activeTeacherClasses([classRoom("old", 1), classRoom("gone", 9, "archived"), classRoom("new", 5)]);
    expect(active.map((c) => c.id)).toEqual(["new", "old"]);
    expect(resolveSelectedClassId(active, null)).toBe("new");
    expect(resolveSelectedClassId(active, "old")).toBe("old");
    expect(resolveSelectedClassId(active, "gone")).toBe("new");
    expect(resolveSelectedClassId([], "old")).toBeNull();
  });

  it("is composed in the intended order, from the Action Center itself", () => {
    const code = strip(read(TODAY));
    const order = [
      "<TeacherDashboardHeader",
      "<TeacherClassSwitcher",
      "summary.sentence",
      '<ClassAttentionPanel classId={selectedClass.id} attention={attention} mode="summary"',
      '<SectionHeader title="Sınıf İşleri"',
      'title="Soru Akışı"',
    ].map((marker) => code.indexOf(marker));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("uses the existing flows for every row", () => {
    const code = strip(read(TODAY));
    expect(code).toContain('pathname: "/(teacher)/class/[classId]/answer-reviews"');
    expect(code).toContain('pathname: "/(teacher)/class/[classId]/comment-reviews"');
    expect(code).toContain('pathname: "/(teacher)/class/[classId]/assignment/create"');
    expect(code).toContain('pathname: "/(teacher)/class/[classId]/assignment/[assignmentId]"');
    expect(strip(read(PANEL))).toContain("router.push(teacherStudentHref(classId, studentUid, attention.cards))");
  });

  it("invents no metric: no stats card, no grid of numbers", () => {
    for (const file of [TODAY, ACTIONS, CLASSES]) {
      expect(strip(read(file))).not.toMatch(/TeacherStatsCard|deriveTeacherDashboardStats|successRate|averag|percent/i);
    }
  });
});

describe("one class at a time — never a fan-out across classes", () => {
  it("loads exactly one class's attention, shared by Bugün and Aksiyonlar", () => {
    const context = strip(read(CONTEXT));
    expect(context.match(/useClassAttention\(/g)).toHaveLength(1);
    expect(context).toContain("useClassAttention(selectedClassId ?? undefined)");
    expect(context).not.toMatch(/\.map\([^)]*useClass|mapWithConcurrency/);
    expect(read(TEACHER_TABS)).toContain("<TeacherTodayProvider>");
    for (const file of [TODAY, ACTIONS]) {
      expect(strip(read(file))).toContain("useTeacherToday()");
      expect(strip(read(file))).not.toMatch(/useClassPerformance|useClassAttention\(/);
    }
  });

  it("composes the list through the canonical hooks, never the builders directly", () => {
    const hook = strip(read(ATTENTION_HOOK));
    for (const piece of ["useClassPerformance(classId)", "useClassAssignments(classId)", "useClassActionCenter({"]) {
      expect(hook).toContain(piece);
    }
    for (const file of [ATTENTION_HOOK, PANEL, TODAY, ACTIONS, CONTEXT]) {
      const code = strip(read(file));
      expect(code).not.toContain("buildTeacherActionCenter(");
      expect(code).not.toContain("buildTeacherActionSummary(");
    }
  });

  it("keeps Phase 47's order: the list is shown as built, never re-sorted or filtered", () => {
    for (const file of [PANEL, TODAY, ACTIONS]) {
      const code = strip(read(file));
      expect(code).not.toMatch(/items\s*\.\s*(sort|filter|reverse)\(/);
    }
    const panel = strip(read(PANEL));
    expect(panel).toContain('mode === "summary" ? attention.summary.items : attention.items');
  });
});

describe("§35 class detail — attention before the lenses", () => {
  it("orders hero → actions → attention → lenses → reviews → members → questions", () => {
    const code = read(CLASS_DETAIL);
    const order = [
      "<Text style={styles.title}>{classRoom.name}</Text>",
      "<Text style={styles.chatButtonText}>Sınıf Sohbeti</Text>",
      '<ClassAttentionPanel classId={classId} attention={attention} mode="summary"',
      ">Bugün Öne Çıkanlar<",
      ">Sınıf Performansı<",
      "Yanıt İncelemeleri",
      "Üyeler (",
      "Sınıf Soruları",
    ].map((marker) => code.indexOf(marker));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("student performance leads with why, not with the rate", () => {
    const code = read("src/features/teacher/screens/StudentPerformanceScreen.tsx");
    expect(code.indexOf("Öğretmen notu")).toBeLessThan(code.indexOf("Genel başarı"));
  });
});

describe("§36 safety locks", () => {
  const TOUCHED_UI = [
    TODAY,
    ACTIONS,
    PANEL,
    "src/features/teacher/components/TeacherClassSwitcher.tsx",
    "src/features/teacher/components/TeacherWorkRow.tsx",
    CLASSES,
    TEACHER_TABS,
  ];

  it("no leaderboard, ranking, points or 'best student' in the teacher UX", () => {
    for (const file of [...TOUCHED_UI, CLASS_DETAIL, "src/features/teacher/services/teacherToday.ts", CONTEXT]) {
      const code = strip(read(file)).toLocaleLowerCase("tr");
      expect(code).not.toMatch(/leaderboard|liderlik|sıralama|ranking|totalpoints|weeklypoints|en iyi öğrenci|en başarılı|en zayıf|top 5|percentile/);
    }
  });

  it("never renders a raw internal enum as text", () => {
    for (const file of TOUCHED_UI) {
      const code = strip(read(file));
      expect(code).not.toMatch(/>\s*\{?\s*["']?(persistent_struggle|needs_attention|escalate|follow_up|insufficient_data)/);
    }
  });

  it("uses tokens only, no emoji, and no fixed height on text", () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const file of TOUCHED_UI) {
      const code = strip(read(file));
      expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
      expect(code).not.toMatch(emoji);
      const textStyles = code.match(/\b(title|subtitle|sentence|className|label|detail|noticeText)\s*:\s*\{[^}]*\}/g) ?? [];
      for (const style of textStyles) expect(style).not.toMatch(/\bheight:/);
    }
  });

  it("every tappable row is at least 44pt and names itself", () => {
    const row = read("src/features/teacher/components/TeacherWorkRow.tsx");
    expect(row).toContain("minHeight: minTouchTarget");
    expect(row).toContain('accessibilityRole="button"');
    expect(row).toContain("accessibilityLabel={detail ? `${title}. ${detail}` : title}");
  });

  it("touches no learning, scheduling or backend module", () => {
    for (const file of [TODAY, ACTIONS, PANEL, CONTEXT, ATTENTION_HOOK, "src/features/teacher/services/teacherToday.ts"]) {
      const imports = read(file).match(/from "[^"]+"/g) ?? [];
      for (const specifier of imports) {
        expect(specifier).not.toMatch(/learningState|reviewScheduler|interventionEffectiveness|postInterventionAction|functions\/src|firebase\/firestore/);
      }
    }
  });
});
