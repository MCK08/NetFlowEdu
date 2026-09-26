import { readFileSync } from "fs";
import { join } from "path";

import { buildTeacherLearningStory } from "../../src/features/learningStory/services/buildTeacherLearningStory";
import { resolveStoryPanel } from "../../src/features/learningStory/services/storyPanel";
import { buildClassTrend } from "../../src/features/teacher/services/classTrend";
import {
  classTrendLabel,
  learningTrendGlyph,
} from "../../src/features/teacher/services/statusGlyphs";
import {
  buildStudentAttentionInsight,
  type AttentionCategory,
  type StudentAttentionCard,
} from "../../src/features/teacher/services/studentAttention";
import { resolvePostInterventionAction } from "../../src/features/teacher/services/postInterventionAction";
import { resolveStudentInterventionTopic } from "../../src/features/teacher/services/teacherIntervention";
import type { StudentPerformanceSnapshot } from "../../src/features/teacher/services/studentPerformance";

// Phase 126 — the teacher's class progress story, polished as presentation.
//
// What this pins: the screen names its class and states its title ONCE; the
// only longitudinal claim it makes is the canonical class trend, in the
// canonical words, with no score and no cause; and every element the approved
// mockup showed without a canonical source — the period control, the weekly
// chart, the topic percentages, the timestamped activity feed — is absent
// rather than invented.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative)
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("{/*");
    })
    .join("\n");

const SCREEN = "src/features/learningStory/screens/TeacherLearningStoryScreen.tsx";
const ROUTE = "app/(teacher)/class/[classId]/learning-story.tsx";
const CLASS_DETAIL = "src/features/classes/screens/TeacherClassDetailScreen.tsx";
const CLASS_ROOM_HOOK = "src/features/classes/hooks/useClassRoom.ts";
const BUILDER = "src/features/learningStory/services/buildTeacherLearningStory.ts";
const GLYPHS = "src/features/teacher/services/statusGlyphs.ts";
const PHASE_126_UI = [SCREEN, CLASS_ROOM_HOOK];

function styleBlock(source: string, name: string): string {
  const match = source.match(new RegExp(`^\\s+${name}:\\s*\\{([^{}]*)\\}`, "m"));
  return match?.[1] ?? "";
}

function tabTitles(layout: string): string[] {
  return [...code(layout).matchAll(/title: "([^"]+)"/g)].map((m) => m[1] ?? "");
}

function card(uid: string, category: AttentionCategory): StudentAttentionCard {
  return {
    studentUid: uid,
    displayName: uid.toUpperCase(),
    insight: { category, reasons: ["x"], implicatedTopic: null },
    successRatePercent: 50,
  };
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

describe("§14 navigation stays exactly where it was", () => {
  it("teacher and student tabs are untouched", () => {
    expect(tabTitles("app/(teacher)/(tabs)/_layout.tsx")).toEqual([
      "Bugün",
      "Sınıflar",
      "Aksiyonlar",
      "Profil",
    ]);
    expect(tabTitles("app/(student)/(tabs)/_layout.tsx")).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
  });

  it("stays the ONE nested screen Class Detail already opens", () => {
    expect(read(ROUTE)).toContain("TeacherLearningStoryScreen");
    expect(code(CLASS_DETAIL)).toContain('pathname: "/(teacher)/class/[classId]/learning-story"');
    // Back declares the class it belongs to; it never hard-codes a tab.
    expect(code(SCREEN)).toContain(
      'fallbackHref={{ pathname: "/(teacher)/class/[classId]", params: { classId } }}',
    );
  });

  it("drills into the canonical Class Performance rather than re-implementing it", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("/performance");
    // No second student-detail or performance dashboard grows here.
    expect(screen).not.toMatch(/StudentPerformanceCard|useStudentPerformanceDetail|buildClassPerformanceSummary/);
  });
});

describe("§30/§31 the screen names itself once, and names its class", () => {
  it("states its title exactly once", () => {
    const screen = code(SCREEN);
    expect(screen).toContain('export const CLASS_STORY_TITLE = "Sınıfın İlerleme Hikâyesi"');
    expect(screen.match(/CLASS_STORY_TITLE/g)).toHaveLength(2); // the definition and the one render
    // The story's own headline repeated that title directly beneath it.
    expect(screen).not.toContain("{story.headline}");
  });

  it("names the class from the class document, through the shared identity", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("const classRoom = useClassRoom(classId)");
    expect(screen).toContain("<ClassPerformanceIdentity classRoom={classRoom} />");
    // One document get, and nothing else: no roster, no second class read.
    const hook = code(CLASS_ROOM_HOOK);
    expect(hook.match(/getClassById\(/g)).toHaveLength(1);
    expect(hook).not.toMatch(/getClassMembers|onSnapshot|collection\(|query\(/);
  });

  it("invents no class metadata the document does not carry", () => {
    for (const file of PHASE_126_UI) {
      expect(code(file)).not.toMatch(/gradeLevel|okul|school|şube|seviye|subject/i);
    }
  });
});

describe("§1/§49 nothing from the mockup was hard-coded", () => {
  it("carries none of the mockup's fixture values", () => {
    for (const file of PHASE_126_UI) {
      const source = code(file);
      for (const literal of [
        "Demo Sınıfı",
        "DEMO01",
        "Son 4 Hafta",
        "Son 3 Ay",
        "Tüm Dönem",
        "Sınıfın Genel İlerlemesi",
        "Konu Bazlı İlerleme",
        "Son İlerleme Etkinlikleri",
        "Sınıfı İncele",
        "gün önce",
      ]) {
        expect(source).not.toContain(literal);
      }
    }
  });

  it("renders no period control, because no canonical time window exists", () => {
    const screen = code(SCREEN);
    expect(screen).not.toMatch(/Hafta|Dönem|\bperiod\b|timeWindow|dateRange|setRange/i);
  });

  it("renders no chart, because no comparable class time-series exists", () => {
    const screen = code(SCREEN);
    expect(screen).not.toMatch(/Chart|Svg|Polyline|Path\b|VictoryLine|axis|dayBuckets|weekly/i);
  });

  it("prints no percentage and no relative timestamp", () => {
    const screen = code(SCREEN);
    // A rendered percentage, not the "100%" of a width token.
    expect(screen).not.toMatch(/`%\$\{|>%|%\d|yüzde/i);
    expect(screen).not.toMatch(/formatRelativeDayLabel|occurredAt|toLocaleDateString|Date\.now\(\)/);
  });

  it("builds no activity feed out of unrelated rows", () => {
    const screen = code(SCREEN);
    expect(screen).not.toMatch(/activityFeed|recentActivity|buildActivity|getRecentClassLearningEvents/i);
  });
});

describe("§15/§16 no score, no ranking, no gamification", () => {
  it("carries none of that vocabulary", () => {
    for (const file of PHASE_126_UI) {
      const source = code(file).toLocaleLowerCase("tr");
      expect(source).not.toMatch(
        /puan|totalpoints|weeklypoints|\bxp\b|rozet|badge|leaderboard|liderlik|sıralama|ranking|percentile|yüzdelik|skor|\bscore\b|momentum/,
      );
    }
  });

  it("emits no count the teacher has to read and discard", () => {
    // An empty category is not rendered as a zero row.
    const story = buildTeacherLearningStory([card("a", "strong")]);
    expect(story.sections).toHaveLength(1);
    expect(story.sections[0]?.description).not.toContain("0 ");
  });
});

describe("§6/§33 the one temporal claim is observed, never caused", () => {
  it("states the class trend in the canonical words, shared with Sınıf Performansı", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("classTrendLabel(trend)");
    expect(screen).toContain("learningTrendGlyph(trend)");
    expect(code(GLYPHS)).toContain("export function classTrendLabel");
    // The class list no longer keeps a private copy of those words.
    expect(code("src/features/teacher/screens/ClassPerformanceScreen.tsx")).not.toContain(
      "function classTrendLabel(",
    );
    expect(classTrendLabel("improving")).toBe("Sınıf geneli gelişiyor");
    expect(classTrendLabel("declining")).toBe("Sınıf geneli geriliyor");
    expect(classTrendLabel("stable")).toBe("Sınıf geneli sabit");
  });

  it("reads the trend the hook already computed, adding no query for it", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("const { attentionCards, trend, isLoading, error } = useClassPerformance(classId)");
    expect(screen.match(/useClassPerformance\(/g)).toHaveLength(1);
  });

  it("never claims a cause for what it reports", () => {
    const screen = code(SCREEN).toLocaleLowerCase("tr");
    for (const claim of [
      "sayesinde",
      "neden oldu",
      "yüzünden",
      "işe yaradı",
      "müdahale ile düzeldi",
      "başarı sağladı",
      "artıracak",
      "iyileşecek",
    ]) {
      expect(screen).not.toContain(claim);
    }
    // And the builder's own sentences stay observational.
    const story = buildTeacherLearningStory(
      (["needs_attention", "watch", "progressing", "strong"] as const).map((c, i) => card(String(i), c)),
    );
    for (const section of story.sections) {
      expect(section.description).toMatch(/görülüyor|durumda|bekliyor/);
    }
  });
});

describe("§39/§40 no history is a real answer, not a failure", () => {
  it("says the trend is not yet known, rather than drawing a zero or a decline", () => {
    expect(buildClassTrend([])).toBe("insufficient_data");
    expect(classTrendLabel("insufficient_data")).toBe("Sınıf trendi için henüz yeterli veri yok");
    // No mark at all for that state — the sentence stands alone, calm.
    expect(learningTrendGlyph("insufficient_data")).toBeNull();
    // Nothing in those words reads as a judgment.
    const copy = classTrendLabel("insufficient_data").toLocaleLowerCase("tr");
    for (const word in { düşük: 1, zayıf: 1, kötü: 1, başarısız: 1, risk: 1 }) {
      expect(copy).not.toContain(word);
    }
  });

  it("keeps one calm empty state rather than four empty sections", () => {
    const story = buildTeacherLearningStory([]);
    expect(story.isFirstRun).toBe(true);
    expect(story.sections).toHaveLength(0);
    expect(resolveStoryPanel({ isLoading: false, hasError: false, hasContent: false, isFirstRun: true })).toBe(
      "empty",
    );
    // A failed load is still reported as ours, never as a statement about the class.
    expect(resolveStoryPanel({ isLoading: false, hasError: true, hasContent: false, isFirstRun: true })).toBe(
      "error",
    );
  });
});

describe("§44 the accessibility sizes strand nothing", () => {
  it("lets every growing string wrap", () => {
    for (const file of PHASE_126_UI) {
      expect(code(file)).not.toMatch(/numberOfLines/);
    }
    expect(styleBlock(code(SCREEN), "navTitle")).not.toMatch(/\bheight:/);
  });

  it("tops-aligns the back button and the section tile once the text wraps", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("const stacked = fontScale >= stackAtFontScale;");
    expect(screen).toContain("style={[styles.navRow, stacked ? styles.navRowStacked : null]}");
    expect(styleBlock(screen, "navRowStacked")).toContain('alignItems: "flex-start"');
    expect(styleBlock(screen, "sectionRow")).toContain('alignItems: "flex-start"');
  });

  it("drops the chevron when it would sit alone beside a wrapped column", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("{stacked ? null : (");
    expect(screen).toContain('name="chevron-forward"');
    // The row still announces itself and what it opens.
    expect(screen).toContain('accessibilityRole="button"');
    expect(screen).toContain("İncele.");
  });

  it("labels the title and hides every decorative mark", () => {
    const screen = code(SCREEN);
    expect(screen).toContain('accessibilityRole="header"');
    for (const icon of screen.match(/<Ionicons\b[\s\S]*?\/>/g) ?? []) {
      expect(icon).toContain("accessibilityElementsHidden");
    }
  });

  it("keeps the footnote wrapping shape Phase 103 fixed", () => {
    const source = read(SCREEN);
    expect(source).toMatch(/<View style=\{styles\.footnoteBody\}>\s*<Text style=\{styles\.footnoteText\}>/);
    expect(styleBlock(source, "footnote")).toMatch(/alignItems: "flex-start",/);
  });
});

describe("§45 the screen costs one document more than it did", () => {
  it("adds no listener, no fan-out and no per-period query", () => {
    const screen = code(SCREEN);
    expect(screen).not.toMatch(/onSnapshot|getDocs|collection\(|query\(|Promise\.all/);
    // One identity read, made once on mount, keyed by classId alone.
    expect(code(CLASS_ROOM_HOOK)).toContain("}, [classId]);");
    for (const hook of ["useClassRoom(", "useWindowDimensions("]) {
      expect(screen.match(new RegExp(hook.replace("(", "\\("), "g"))).toHaveLength(1);
    }
  });
});

describe("§7/§8/§9/§46 the semantics under the screen are untouched", () => {
  it("Phase 42's classifier still draws the same lines", () => {
    const now = Date.now();
    const base = { ...EMPTY_SNAPSHOT, totalCount: 4, successRatePercent: 75 };
    expect(buildStudentAttentionInsight(EMPTY_SNAPSHOT, now).category).toBe("insufficient_data");
    expect(
      buildStudentAttentionInsight({ ...base, recentOutcomes: ["struggled", "again", "solved"] }, now).category,
    ).toBe("needs_attention");
    expect(
      buildStudentAttentionInsight({ ...base, persistentStruggleCount: 1, maxItemStruggleEvents: 8 }, now)
        .category,
    ).toBe("needs_attention");
    expect(buildStudentAttentionInsight({ ...base, trend: "declining" }, now).category).toBe("watch");
  });

  it("Phase 43's targetability is still persistent struggle only", () => {
    expect(resolveStudentInterventionTopic([])).toBeNull();
    expect(
      resolveStudentInterventionTopic([
        { subject: "Matematik", topic: "Denklemler", gradeLevel: null, struggledAttemptCount: 4 },
      ]),
    ).toEqual({ subject: "Matematik", topic: "Denklemler", gradeLevel: null, struggledAttemptCount: 4 });
  });

  it("Phase 47's mapping is unchanged", () => {
    expect(resolvePostInterventionAction("improved", "high").kind).toBe("monitor");
    expect(resolvePostInterventionAction("worsened", "low").kind).toBe("monitor");
    expect(resolvePostInterventionAction("worsened", "high").kind).toBe("escalate");
    expect(resolvePostInterventionAction("no_change", "high").kind).toBe("follow_up");
  });

  it("leaves the story builder and every engine this phase had no business editing alone", () => {
    for (const service of [
      BUILDER,
      "src/features/teacher/services/studentAttention.ts",
      "src/features/teacher/services/teacherIntervention.ts",
      "src/features/teacher/services/interventionEffectiveness.ts",
      "src/features/teacher/services/postInterventionAction.ts",
      "src/features/teacher/services/teacherActionCenter.ts",
      "src/features/teacher/services/teacherActionSummary.ts",
      "src/features/teacher/services/teacherToday.ts",
      "src/features/teacher/services/classTrend.ts",
    ]) {
      expect(read(service)).not.toContain("Phase 126");
    }
    expect(read("src/features/teacher/services/studentPerformance.ts")).not.toContain("Phase 126");
  });
});
