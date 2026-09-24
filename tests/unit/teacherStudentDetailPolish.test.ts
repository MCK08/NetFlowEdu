import { readFileSync } from "fs";
import { join } from "path";

import { resolvePublicIdentity } from "../../src/utils/publicIdentity";
import { teacherStudentHref, teacherStudentRoute } from "../../src/features/teacher/services/actionCenterNavigation";
import {
  attentionCategoryGlyph,
  attentionCategoryLabel,
} from "../../src/features/teacher/services/statusGlyphs";
import {
  buildStudentAttentionInsight,
  sortStudentAttentionCards,
} from "../../src/features/teacher/services/studentAttention";
import type { StudentPerformanceSnapshot } from "../../src/features/teacher/services/studentPerformance";
import { resolvePostInterventionAction } from "../../src/features/teacher/services/postInterventionAction";
import { formatRelativeDayLabel } from "../../src/features/learningStory/services/teacherLearningTimeline";

// Phase 124 — the teacher's student detail, finally naming the student.
//
// What this pins: the screen answers "who is this" before "why are they here"
// and "why" before any number; every fact on it comes from a source that
// already existed; nothing the mockup showed without a source was drawn; the
// four-tab architecture and the ONE student destination are untouched; no new
// read was added; and the accessibility sizes no longer split a word in half.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative)
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
    .join("\n");

const SCREEN = "src/features/teacher/screens/StudentPerformanceScreen.tsx";
const IDENTITY = "src/features/teacher/components/StudentIdentityCard.tsx";
const ROUTE = "app/(teacher)/class/[classId]/student/[studentId].tsx";
const NAV = "src/features/teacher/services/actionCenterNavigation.ts";
const PANEL = "src/features/teacher/components/ClassAttentionPanel.tsx";
const CLASS_DETAIL = "src/features/classes/screens/TeacherClassDetailScreen.tsx";
const GLYPHS = "src/features/teacher/services/statusGlyphs.ts";
const PHASE_124_UI = [SCREEN, IDENTITY];

function tabTitles(layout: string): string[] {
  return [...code(layout).matchAll(/title: "([^"]+)"/g)].map((m) => m[1] ?? "");
}

function styleBlock(source: string, name: string): string {
  const start = source.indexOf(`  ${name}: {`);
  if (start === -1) return "";
  return source.slice(start, source.indexOf("  },", start));
}

const EMPTY_SNAPSHOT: StudentPerformanceSnapshot = {
  totalCount: 0,
  masteredCount: 0,
  dueCount: 0,
  successRatePercent: null,
  today: { reviewedToday: 0, solvedToday: 0, struggledToday: 0 },
  thisWeek: {
    reviewedThisWeek: 0,
    solvedThisWeek: 0,
    struggledThisWeek: 0,
    activeDaysThisWeek: 0,
    studiedThisWeek: false,
  },
  weakTopics: [],
  strongTopics: [],
  allTopics: [],
  trend: "insufficient_data",
  lastStudiedAt: null,
  recentOutcomes: [],
  dayBuckets: [],
  persistentStruggleTopics: [],
  persistentStruggleCount: 0,
  maxItemStruggleEvents: null,
  daysActiveRecently: 0,
};

describe("§12 navigation stays exactly where it was", () => {
  it("teacher tabs are Bugün, Sınıflar, Aksiyonlar, Profil", () => {
    expect(tabTitles("app/(teacher)/(tabs)/_layout.tsx")).toEqual([
      "Bugün",
      "Sınıflar",
      "Aksiyonlar",
      "Profil",
    ]);
  });

  it("student tabs are untouched", () => {
    expect(tabTitles("app/(student)/(tabs)/_layout.tsx")).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
  });

  it("Student Performance stays the ONE nested destination, not a second detail screen", () => {
    // Phase 123's lock: one spelling of the path, in one helper, for every
    // caller. A "Student Detail" or "Student Analytics" route beside it is how
    // the same student starts rendering two different ways.
    expect(read(ROUTE)).toContain("StudentPerformanceScreen");
    expect(code(NAV)).toContain('pathname: "/(teacher)/class/[classId]/student/[studentId]" as const');
    expect(code(NAV).match(/student\/\[studentId\]/g)).toHaveLength(1);
    expect(code(SCREEN)).toContain(
      'fallbackHref={{ pathname: "/(teacher)/class/[classId]", params: { classId } }}',
    );
  });

  it("class detail and the action rows both open it through the same helper", () => {
    expect(code(CLASS_DETAIL)).toContain("teacherStudentRoute(classId, member.uid");
    expect(code(PANEL)).toContain("router.push(teacherStudentHref(classId, studentUid, attention.cards))");
    expect(teacherStudentHref("c1", "s1", [{ studentUid: "s1", displayName: "Ada" }])).toEqual(
      teacherStudentRoute("c1", "s1", "Ada"),
    );
  });
});

describe("§27 the student is named from canonical identity, never invented", () => {
  it("resolves the name through the app's own resolver rather than a private fallback", () => {
    expect(code(IDENTITY)).toContain("resolvePublicIdentity({ displayName: studentName })");
    expect(code(IDENTITY)).toContain("<Avatar displayName={identity.primaryName}");
  });

  it("never renders an empty header again — the caller's empty name resolves to a word", () => {
    // teacherStudentHref sends "" on purpose for a student who is no longer on
    // the roster, and `"" ?? fallback` keeps the empty string: the screen used
    // to title itself with nothing at all.
    expect(teacherStudentHref("c1", "ghost", []).params.studentName).toBe("");
    expect(resolvePublicIdentity({ displayName: "" }).primaryName).toBe("Kullanıcı");
    expect(resolvePublicIdentity({ displayName: undefined }).primaryName).toBe("Kullanıcı");
    expect(code(SCREEN)).not.toContain('studentName ?? "');
  });

  it("titles the screen with its own constant name, and never truncates the student's", () => {
    expect(code(SCREEN)).toContain('export const STUDENT_DETAIL_TITLE = "Öğrenci Performansı"');
    expect(code(SCREEN)).toContain("{STUDENT_DETAIL_TITLE}");
    expect(code(SCREEN)).not.toMatch(/numberOfLines/);
    expect(code(IDENTITY)).not.toMatch(/numberOfLines/);
  });

  it("invents no grade, school, biography, class name, handle or photo for the student", () => {
    // The identity block is where a grade or a school would go, so it carries
    // none of them, and no photo or handle it was never handed.
    const identity = code(IDENTITY);
    expect(identity).not.toMatch(/grade|okul|school|bio|biyografi|bölüm|yaş/i);
    expect(identity).not.toMatch(/usernameHandle|photoURL/);
    // The screen's only gradeLevel is Phase 43's: the grade the composer
    // prefills from the TOPIC's own questions, omitted when they disagree —
    // never a grade claimed about the student.
    const screen = code(SCREEN);
    expect(screen).not.toMatch(/usernameHandle|photoURL/);
    for (const line of screen.split("\n").filter((l) => l.includes("gradeLevel"))) {
      expect(line).toContain("interventionTopic.gradeLevel");
    }
  });
});

describe("§0/§49 no mockup example value reached the product", () => {
  it("hard-codes none of the mockup's names, grades, numbers or timestamps", () => {
    const forbidden = [
      "Demo Öğrenci A",
      "demo_student_a",
      "7. Sınıf",
      "Demo Sınıfı",
      "Güncel Başarı",
      "Son 4 Hafta",
      "Tamamlanan",
      "+12",
      "1 gün önce",
      "2 gün önce",
      "3 gün gecikmiş",
      "4 gün önce",
      "Öğrenci ile Sohbet Et",
      "Genel Performans",
      "Son Etkinlikler",
      "Dikkat Gerektirenler",
    ];
    for (const file of PHASE_124_UI) {
      const source = code(file);
      for (const literal of forbidden) expect(source).not.toContain(literal);
    }
  });

  it("adds no direct teacher→student chat, because no such route exists", () => {
    // Only class chat is a real destination (app/(teacher)/class/[classId]/chat).
    for (const file of PHASE_124_UI) {
      expect(code(file)).not.toMatch(/Sohbet|chat|message|conversation|dm/i);
    }
  });

  it("adds no gamification, ranking or peer comparison", () => {
    for (const file of PHASE_124_UI) {
      const source = code(file).toLocaleLowerCase("tr");
      expect(source).not.toMatch(
        /puan|totalpoints|weeklypoints|\bxp\b|rozet|badge|leaderboard|liderlik|sıralama|ranking|percentile|yüzdelik|en iyi öğrenci|sınıf ortalaması/,
      );
    }
  });
});

describe("§5/§25 human context comes before the number", () => {
  it("renders identity, then the teacher note, then the rate — in that order", () => {
    const source = read(SCREEN);
    const order = ["<StudentIdentityCard", "Öğretmen notu", "Genel başarı"].map((marker) =>
      source.indexOf(marker),
    );
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("keeps the note's words the canonical insight's, never generated text", () => {
    const source = code(SCREEN);
    expect(source).toContain("buildStudentAttentionInsight(snapshot, Date.now())");
    expect(source).toContain("{attention.reasons.map((reason) => (");
    // No model, no template assembly, no adjectives of this screen's own.
    expect(source).not.toMatch(/generate|openai|prompt|llm|summari[sz]e/i);
  });

  it("names the state with the canonical label and mark, not a second vocabulary", () => {
    const source = code(SCREEN);
    expect(source).toContain("attentionCategoryLabel(attention.category)");
    expect(source).toContain("attentionCategoryGlyph(attention?.category ?? \"insufficient_data\")");
    // The words carry the state; the bar only repeats what they already say.
    expect(source).toContain("statusToneColor(attentionGlyph.tone)");
    expect(styleBlock(read(SCREEN), "attentionCard")).toContain("borderLeftWidth: 3");
  });

  it("gives the class list and the student screen ONE set of words for a category", () => {
    expect(code(GLYPHS)).toContain("export function attentionCategoryLabel");
    expect(code("src/features/teacher/screens/ClassPerformanceScreen.tsx")).not.toContain(
      "function categoryLabel(",
    );
    expect(attentionCategoryLabel("needs_attention")).toBe("Dikkat gereken");
    expect(attentionCategoryLabel("watch")).toBe("İzlemede");
    expect(attentionCategoryLabel("progressing")).toBe("İlerliyor");
    expect(attentionCategoryLabel("strong")).toBe("Güçlü");
    expect(attentionCategoryLabel("insufficient_data")).toBe("Yetersiz veri");
    // And the mark beside them is the one already in the vocabulary.
    expect(attentionCategoryGlyph("needs_attention").tone).toBe("danger");
    expect(attentionCategoryGlyph("watch").tone).toBe("neutral");
  });
});

describe("§14/§30 the only number is the one that already existed", () => {
  it("draws the success rate from snapshot.successRatePercent and labels it truthfully", () => {
    const source = code(SCREEN);
    expect(source).toContain("snapshot.successRatePercent === null ? \"—\" : `%${snapshot.successRatePercent}`");
    expect(source).toContain("kaydedilen sonuçlara göre");
  });

  it("retires the 40pt hero: the rate is a card among cards now", () => {
    const source = read(SCREEN);
    expect(source).not.toContain("bigValue:");
    expect(source).not.toContain("summaryCard");
    expect(styleBlock(source, "bigValueSmall")).toContain("fontSize: 24");
    expect(styleBlock(source, "bigValueSmall")).toContain("lineHeight: 30");
  });

  it("invents no trend delta, completion percentage or second score", () => {
    for (const file of PHASE_124_UI) {
      const source = code(file);
      expect(source).not.toMatch(/completionPercent|tamamlanma|delta|change4Week|son4Hafta/i);
      // A "+N" figure beside a number is the mockup's invented trend.
      expect(source).not.toMatch(/`\+\$\{/);
    }
  });

  it("shows no fake zero for a student with no trustworthy history", () => {
    const insight = buildStudentAttentionInsight(EMPTY_SNAPSHOT, Date.now());
    expect(insight.category).toBe("insufficient_data");
    expect(insight.reasons).toEqual(["Bu sınıfta henüz çalışmadı"]);
    expect(attentionCategoryLabel(insight.category)).toBe("Yetersiz veri");
    // null is rendered as "—" plus a sentence, never as 0%.
    expect(code(SCREEN)).toContain('"Henüz yeterli veri yok"');
    expect(EMPTY_SNAPSHOT.successRatePercent).toBeNull();
  });
});

describe("§15/§16 recency and history are real or absent", () => {
  it("prints a relative day only from this student's own lastStudiedAt", () => {
    expect(code(SCREEN)).toContain("formatRelativeDayLabel(timestampMs)");
    expect(code(SCREEN)).toContain("formatLastStudied(snapshot.lastStudiedAt)");
    expect(code(SCREEN)).toContain('if (!timestampMs) return "Henüz çalışılmadı"');
  });

  it("uses the app's own calendar-day formatter, so no label is inferred from order", () => {
    const now = new Date(2026, 8, 25, 12, 0).getTime();
    expect(formatRelativeDayLabel(now, now)).toBe("Bugün");
    expect(formatRelativeDayLabel(new Date(2026, 8, 24, 23, 50).getTime(), now)).toBe("Dün");
    expect(formatRelativeDayLabel(new Date(2026, 8, 22, 9, 0).getTime(), now)).toBe("3 gün önce");
    // Past a week a count stops helping, and it falls back to the date.
    expect(formatRelativeDayLabel(new Date(2026, 8, 1, 9, 0).getTime(), now)).not.toMatch(/gün önce/);
  });

  it("keeps the ONE canonical history section and builds no second feed from unrelated rows", () => {
    const source = code(SCREEN);
    expect(source).toContain("<TeacherLearningTimeline");
    expect(source).toContain("buildTeacherLearningTimeline(timelineEvents)");
    expect(source.match(/<TeacherLearningTimeline/g)).toHaveLength(1);
    // Nothing is assembled out of assignments, questions or archive rows to
    // stand in for an activity feed.
    expect(source).not.toMatch(/activityFeed|recentActivity|buildActivity/i);
  });
});

describe("§45 the screen costs exactly what it cost before", () => {
  it("adds no hook, no query and no listener", () => {
    const source = code(SCREEN);
    for (const hook of [
      "useStudentPerformanceDetail(",
      "useTeacherLearningTimeline(",
      "useInterventionEffectiveness(",
    ]) {
      expect(source.match(new RegExp(hook.replace("(", "\\("), "g"))).toHaveLength(1);
    }
    expect(source).not.toMatch(/onSnapshot|getDocs?\(|collection\(|query\(/);
    // The identity card reads nothing at all — it is handed the name, and its
    // only hooks are the theme subscription and the font scale.
    const identity = code(IDENTITY);
    expect(identity).not.toMatch(/firebase|firestore|onSnapshot|getDoc|useClass|useStudent/i);
    expect([...identity.matchAll(/\buse[A-Z]\w*\(/g)].map((m) => m[0])).toEqual([
      "useThemeSubscription(",
      "useWindowDimensions(",
    ]);
  });

  it("carries no photo URL through a navigation parameter", () => {
    // A Storage download URL is a tokened link; the route params are the one
    // place it must not travel (they are the URL on web).
    expect(teacherStudentRoute("c1", "s1", "Ada")).toEqual({
      pathname: "/(teacher)/class/[classId]/student/[studentId]",
      params: { classId: "c1", studentId: "s1", studentName: "Ada" },
    });
    expect(code(ROUTE)).not.toContain("photo");
  });
});

describe("§44 the accessibility sizes break no word in half", () => {
  it("stacks the pair of half-width tiles past the stacking scale", () => {
    const source = read(SCREEN);
    expect(code(SCREEN)).toContain("const stacked = fontScale >= stackAtFontScale;");
    expect(code(SCREEN)).toContain("style={[styles.row, stacked ? styles.rowStacked : null]}");
    expect(styleBlock(source, "rowStacked")).toContain('flexDirection: "column"');
  });

  it("stacks the identity so the name takes the full width beside no avatar", () => {
    const source = read(IDENTITY);
    expect(code(IDENTITY)).toContain("const stacked = fontScale >= stackAtFontScale;");
    expect(styleBlock(source, "rowStacked")).toContain('flexDirection: "column"');
    expect(styleBlock(source, "nameStacked")).toContain('alignSelf: "stretch"');
  });

  it("tops-aligns the back button against a title that now wraps", () => {
    expect(code(SCREEN)).toContain("style={[styles.header, stacked ? styles.headerStacked : null]}");
    expect(styleBlock(read(SCREEN), "headerStacked")).toContain('alignItems: "flex-start"');
  });

  it("labels its chrome and hides its decoration", () => {
    expect(code(SCREEN)).toContain('accessibilityRole="header"');
    expect(code(IDENTITY)).toContain("accessibilityLabel={identity.primaryName}");
    for (const file of PHASE_124_UI) {
      expect(code(file)).not.toMatch(/height:\s*\d+,[\s\S]{0,80}typography/);
    }
  });
});

describe("§6-§10/§47 the semantics under the screen are untouched", () => {
  it("Phase 42's classifier still draws the same five lines", () => {
    const now = Date.now();
    const base = { ...EMPTY_SNAPSHOT, totalCount: 4, successRatePercent: 75 };

    // Zero outcomes at all — unknown, never "low".
    expect(buildStudentAttentionInsight(EMPTY_SNAPSHOT, now).category).toBe("insufficient_data");
    // A real recent sample where the majority struggled.
    expect(
      buildStudentAttentionInsight(
        { ...base, recentOutcomes: ["struggled", "again", "solved"] },
        now,
      ).category,
    ).toBe("needs_attention");
    // The same severity from the OTHER evidence source: one question failed
    // repeatedly, which can never fill a three-outcome sample.
    expect(
      buildStudentAttentionInsight(
        { ...base, persistentStruggleCount: 1, maxItemStruggleEvents: 8 },
        now,
      ).category,
    ).toBe("needs_attention");
    // One slip is not a pattern.
    expect(
      buildStudentAttentionInsight({ ...base, persistentStruggleCount: 1, maxItemStruggleEvents: 1 }, now)
        .category,
    ).toBe("progressing");
    expect(buildStudentAttentionInsight({ ...base, trend: "declining" }, now).category).toBe("watch");
    expect(
      buildStudentAttentionInsight({ ...base, successRatePercent: 95, trend: "stable" }, now).category,
    ).toBe("strong");
  });

  it("Phase 43's targetability is still persistent struggle only", () => {
    const source = code(SCREEN);
    expect(source).toContain("resolveStudentInterventionTopic(snapshot.persistentStruggleTopics)");
    expect(source).toContain("{snapshot.persistentStruggleCount > 0 ? (");
    expect(source).toContain("{interventionTopic ? (");
  });

  it("Phase 44 stays observational and Phase 47 still gates the action", () => {
    const source = code(SCREEN);
    expect(source).toContain(
      "resolvePostInterventionAction(interventionOutcome.effectiveness, interventionOutcome.confidence)",
    );
    expect(source).toContain('postInterventionAction.kind !== "monitor"');
    // The card prints the SERVICE's sentence, so the claim it makes is Phase
    // 47's — observational, never causal, and never a prediction.
    expect(source).toContain("{postInterventionAction.reason}");
    for (const effectiveness of ["improved", "no_change", "worsened", "insufficient_data"] as const) {
      for (const confidence of ["high", "medium", "low"] as const) {
        const reason = resolvePostInterventionAction(effectiveness, confidence).reason;
        expect(reason).not.toMatch(/sayesinde|neden oldu|yüzünden|kesinlikle|iyileşecek|garanti/i);
      }
    }
    // §9's mapping, unchanged: improved and low-confidence both monitor,
    // worsened with real evidence escalates, no_change follows up.
    expect(resolvePostInterventionAction("improved", "high").kind).toBe("monitor");
    expect(resolvePostInterventionAction("improved", "low").kind).toBe("monitor");
    expect(resolvePostInterventionAction("worsened", "low").kind).toBe("monitor");
    expect(resolvePostInterventionAction("worsened", "high").kind).toBe("escalate");
    expect(resolvePostInterventionAction("worsened", "medium").kind).toBe("escalate");
    expect(resolvePostInterventionAction("no_change", "high").kind).toBe("follow_up");
    expect(resolvePostInterventionAction("no_change", "low").kind).toBe("monitor");
  });

  it("orders attention cards by the canonical sort, not by anything this phase added", () => {
    const insight = buildStudentAttentionInsight({ ...EMPTY_SNAPSHOT, totalCount: 1 }, Date.now());
    const cards = [
      { studentUid: "b", displayName: "B", insight: { ...insight, category: "strong" as const }, successRatePercent: 90 },
      { studentUid: "a", displayName: "A", insight: { ...insight, category: "needs_attention" as const }, successRatePercent: 20 },
      { studentUid: "c", displayName: "C", insight: { ...insight, category: "watch" as const }, successRatePercent: 60 },
    ];
    expect(sortStudentAttentionCards(cards).map((card) => card.studentUid)).toEqual(["a", "c", "b"]);
  });

  it("leaves the semantic services this phase had no business editing alone", () => {
    // statusGlyphs is the presentation vocabulary and gained a word; these are
    // the engines, and none of them learned anything new about this screen.
    for (const service of [
      "src/features/teacher/services/studentAttention.ts",
      "src/features/teacher/services/teacherIntervention.ts",
      "src/features/teacher/services/interventionEffectiveness.ts",
      "src/features/teacher/services/postInterventionAction.ts",
      "src/features/teacher/services/teacherActionCenter.ts",
      "src/features/teacher/services/teacherToday.ts",
    ]) {
      expect(read(service)).not.toContain("Phase 124");
    }
    expect(read("src/features/teacher/services/studentPerformance.ts")).not.toContain("Phase 124");
  });
});
