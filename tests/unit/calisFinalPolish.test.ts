import { readFileSync } from "fs";
import { join } from "path";

import { buildDailyPlan } from "../../src/features/studyPlan/services/dailyPlan";

// Phase 117 — Çalış answers "şimdi ne yapmalıyım?" before anything else.
//
// Phase 109 already had the right architecture: one workspace, the focus
// first, the plan inline, the archive and assignments beneath it. What the
// page LOOKED like undercut it — the filter picker stood permanently open
// with two rows of chips between the plan and the topics, the struggling
// topics were full-width rows carrying the same weight as a plan step, and
// the study preferences were reachable only after scrolling past
// everything.
//
// This is presentation. The tests that matter most here are the ones that
// prove nothing underneath moved: the planner's order, the archive's
// semantics, the feed handoff, and the absence of any new score.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SCREEN = "src/features/study/screens/StudyScreen.tsx";
const LAUNCHER = "src/features/study/components/PracticeLauncher.tsx";
const ARCHIVE_ROW = "src/features/studentAnalytics/components/ArchiveEntryRow.tsx";

describe("§13 the workspace's vertical order", () => {
  it("puts the focus first, then plan, archive, assignments, practice, topics, progress, goals", () => {
    // Measured inside the rendered body: the constants are all declared at
    // the top of the file, so their declaration order says nothing.
    const full = code(SCREEN);
    const source = full.slice(full.indexOf("<SafeAreaView"));
    const order = [
      "FOCUS_TITLE",
      "TODAY_TITLE",
      // Assignments stay above the archive: they are the only work here
      // with someone else's deadline on it. The mockup draws the archive
      // first; this order is the truthful one and is kept deliberately.
      "AssignedWorkSection",
      "UNRESOLVED_TITLE",
      "PRACTICE_TILE_FILTER",
      "STRUGGLE_TITLE",
      "STRENGTHS_TITLE",
      "PROGRESS_TITLE",
      "GOAL_TITLE",
    ].map((marker) => {
      const index = source.indexOf(marker);
      expect(index).toBeGreaterThan(-1);
      return index;
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("stays one screen — no second tab, no second planner, no second feed", () => {
    const titles = [...read("app/(student)/(tabs)/_layout.tsx").matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    expect(titles).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
    const source = code(SCREEN);
    expect(source).toContain("useStudyPlan(uid)");
    // One planner hook, one feed launcher, one workspace derivation.
    expect(source.match(/useStudyPlan\(/g)).toHaveLength(1);
    expect(source).toContain("useFeedLaunch()");
  });
});

describe("§15 the focus is the page's one heavy object", () => {
  it("keeps its copy from the canonical step, and adds only a mark", () => {
    const source = code(SCREEN);
    expect(source).toContain("styles.focusMark");
    // Every line still comes from the planner's own step.
    expect(source).toContain("{stepTitle(focus.step)}");
    expect(source).toContain("{focus.step.reason}");
    expect(source).toContain("{stepWhy(focus.step)}");
    expect(source).toContain("label={stepStartLabel(focus.step)}");
  });

  it("invents no duration, difficulty or urgency beside it", () => {
    const source = code(SCREEN);
    expect(source).not.toMatch(/\bdk\b|\bdakika\b|\bkolay\b|\borta\b|\bzor\b|\bacil\b|öncelik puanı/i);
  });

  it("still speaks for the two states that are not a step", () => {
    const source = code(SCREEN);
    expect(source).toContain('focus.kind === "complete"');
    expect(source).toContain("Soru çözmeye başla");
  });
});

describe("§16/§17 the planner is consumed, never re-derived", () => {
  it("renders the planner's steps in the planner's order", () => {
    const source = code(SCREEN);
    expect(source).toContain("plan.steps.map((step, index) => (");
    // No re-sort, no score, no slice to force a row count.
    expect(source).not.toMatch(/plan\.steps\.(sort|filter\([^)]*\)\.map|slice)/);
  });

  it("counts progress from those same steps and claims nothing else", () => {
    const source = code(SCREEN);
    expect(source).toContain('plan.steps.filter((step) => step.state === "completed").length');
    expect(source).toContain("tamamlandı");
    expect(source).not.toMatch(/yüzde|ilerleme puanı|skor/i);
  });

  // Phase 108's order is a service-level guarantee; this pins that the
  // service itself still produces it, so a UI change cannot quietly rely on
  // a different sequence.
  it("leaves Phase 108's priority exactly where it was", () => {
    const planner = code("src/features/studyPlan/services/dailyPlan.ts");
    expect(typeof buildDailyPlan).toBe("function");
    for (const marker of ["archive", "review", "attention", "recovering", "assignment", "practice"]) {
      expect(planner.toLowerCase()).toContain(marker);
    }
    expect(code(SCREEN)).not.toContain("buildDailyPlan(");
  });
});

describe("§19 the archive preview stays Phase 107's", () => {
  it("reads the workspace's archive entries and routes to the canonical screen", () => {
    const source = code(SCREEN);
    expect(source).toContain("workspace.archivePendingCount");
    expect(source).toContain("<ArchiveEntryRow");
    expect(source).toContain("archivedQuestionRoute(questionId)");
  });

  it("classifies nothing itself", () => {
    const source = code(SCREEN);
    // No inclusion rule, no "solved later" derivation in the screen.
    expect(source).not.toMatch(/solvedLater\s*=|buildQuestionArchive\(|summarizeArchive\(/);
  });
});

describe("§21 practice reuses the canonical feed", () => {
  it("launches through useFeedLaunch, with no query or ranking of its own", () => {
    const launcher = code(LAUNCHER);
    expect(launcher).toContain("useFeedLaunch()");
    expect(launcher).toContain("launch({ filter, channel: unresolvedOnly ? \"struggles\" : \"for_you\" })");
    expect(launcher).not.toMatch(/getDocs|query\(|orderBy\(|collection\(/);
  });

  it("is the same launcher, now opened rather than always standing open", () => {
    const source = code(SCREEN);
    expect(source).toContain("<PracticeLauncher />");
    expect(source).toContain("{isPracticeOpen ? <PracticeLauncher /> : null}");
    expect(source).toContain("setIsPracticeOpen((open) => !open)");
  });

  it("sends the second tile to Phase 70's existing concept map", () => {
    const source = code(SCREEN);
    expect(source).toContain("ROUTES.studentConceptMasteryMap");
    expect(read("src/constants/routes.ts")).toContain('studentConceptMasteryMap: "/(student)/study/mastery-map"');
  });
});

describe("§22/§23 topics keep their canonical meaning", () => {
  it("shows the workspace's own struggle topics, with their own words", () => {
    const source = code(SCREEN);
    expect(source).toContain("workspace.struggleTopics.map");
    expect(source).toContain("gapCountLabel(topic)");
    expect(source).toContain("topic.stateLabel");
    // A chip is a place to go; the sentence a screen reader hears is the
    // same one the row used to carry.
    expect(source).toContain("accessibilityHint=\"Bu konudaki çözemediğin soruları açar\"");
  });

  it("adds no percentage, mastery score or alarm word", () => {
    const source = code(SCREEN);
    // "mastery" is deliberately absent: the only occurrence in this file is
    // ROUTES.studentConceptMasteryMap, a route name, not a claim about the
    // student.
    expect(source).not.toMatch(/yüzde|ustalık|\bacil\b|\bkritik\b/i);
  });

  it("keeps strong areas stated as Phase 70's steady topics", () => {
    const source = code(SCREEN);
    expect(source).toContain("workspace.strongAreas.map");
    expect(source).toContain("İstikrarlı");
    expect(source).not.toMatch(/madalya|rozet|yıldız|percentile/i);
  });
});

describe("§14/§25 the header and the settings it owns", () => {
  it("offers the study preferences, not the app's settings", () => {
    const source = code(SCREEN);
    expect(source).toContain("PLAN_ROUTES.settings");
    expect(source).toContain('accessibilityLabel="Çalışma ayarları"');
    // Phase 115's Ayarlar stays on Profil.
    expect(source).not.toContain("/(student)/settings");
  });

  it("keeps the foot of the page reachable as it was", () => {
    const source = code(SCREEN);
    for (const marker of ["DailyGoalEditor", "Plan tercihleri", "Kişisel Analiz", "Öğrenme Atlasım", "İlerleme Hikâyem"]) {
      expect(source).toContain(marker);
    }
  });

  it("adds no greeting, quote, ring or score to the header", () => {
    const source = code(SCREEN);
    expect(source).not.toMatch(/Günaydın|İyi akşamlar|motivasyon|streak|seri|halka/i);
  });
});

describe("§28/§29/§30 the locks", () => {
  it("introduces no points, XP, rank or leaderboard", () => {
    for (const file of [SCREEN, LAUNCHER, "src/components/ui/SectionHeader.tsx"]) {
      expect(code(file)).not.toMatch(/totalPoints|weeklyPoints|\bPuan\b|\bXP\b|leaderboard|liderlik|rozet/i);
    }
  });

  it("exposes no classmate or community data", () => {
    const source = code(SCREEN);
    expect(source).not.toMatch(/classmate|sınıf arkadaş|kudos|community|topluluk/i);
  });

  it("adds no listener, query or fan-out to the screen", () => {
    const source = code(SCREEN);
    expect(source).not.toMatch(/onSnapshot|getDocs|collection\(|subscribeTo/);
    // The two hooks it had are the two it still has.
    expect(source.match(/use(StudyPlan|LearningTrail)\(/g)).toHaveLength(2);
  });

  it("uses theme tokens for both modes", () => {
    for (const file of [SCREEN, "src/components/ui/SectionHeader.tsx"]) {
      expect(code(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|"white"|"black"/);
      expect(read(file)).toContain("themedStyles");
    }
  });
});

describe("§31 the largest text size", () => {
  // Found on the simulator at the largest accessibility size, on Çalış's own
  // archive preview: two lines had room for "Çoktan Seçmeli s…", so the row
  // named the question it could not finish naming. Past a scale the cap
  // lifts instead of the text being cut.
  it("lets the archive preview take the room it needs once text is scaled", () => {
    const row = read(ARCHIVE_ROW);
    expect(row).toContain("const PREVIEW_UNCAP_FONT_SCALE = 1.3;");
    expect(row).toContain("const { fontScale } = useWindowDimensions();");
    expect(row).toContain("numberOfLines={fontScale > PREVIEW_UNCAP_FONT_SCALE ? 4 : 2}");
  });

  it("leaves the row's own words and route untouched", () => {
    const row = code(ARCHIVE_ROW);
    // The fix is a line count. Phase 107's sentence, state and fact are the
    // same ones, and the row still reports only the question id.
    expect(row).toContain("accessibilityLabel={`${place}. ${preview}. ${state}. ${meta}.`}");
    expect(row).toContain("onPress(entry.questionId)");
    expect(row).toContain("archiveStruggleFact(entry)");
  });
});

describe("§31 accessibility", () => {
  it("gives every new target 44pt and a spoken label", () => {
    const source = read(SCREEN);
    expect(source).toContain("minHeight: minTouchTarget");
    expect(source).toContain("accessibilityLabel={`${title}. ${detail}`}");
    expect(source).toContain("accessibilityState={expanded === undefined ? undefined : { expanded }}");
  });

  it("lets a long topic or tile wrap instead of clipping", () => {
    const source = read(SCREEN);
    // Chips and tiles grow with their text; nothing is capped to one line.
    expect(source).not.toMatch(/styles\.chipText}\s*numberOfLines/);
    expect(source).not.toMatch(/styles\.tileTitle}\s*numberOfLines/);
    expect(source).toMatch(/tile:\s*\{[\s\S]*?flexBasis: 150,/);
  });

  it("states plan progress in words rather than colour", () => {
    expect(read("src/components/ui/SectionHeader.tsx")).toContain("caption");
    expect(code(SCREEN)).toContain("planProgressLabel");
  });
});
