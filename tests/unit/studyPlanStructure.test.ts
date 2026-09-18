import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Phase 108 — structural pins for the plan, the maps and the community
// signal: theme tokens only, no emoji, no fixed text heights, calm words
// (no AI claims, no invented minutes), routes wired, and the community band
// never carried by colour alone.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative)
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");

function walk(relative: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, relative))) {
    const rel = `${relative}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

const PLAN_FILES = walk("src/features/studyPlan");
const COMMUNITY_FILES = walk("src/features/communityDifficulty");
const ROUTE_FILES = walk("app/(student)/plan");
const UI_FILES = [...PLAN_FILES, ...COMMUNITY_FILES].filter((file) => file.endsWith(".tsx"));

const STATUS_EMOJI = /[\u{1F534}\u{1F7E0}\u{1F7E1}\u{1F7E2}\u{26AA}\u{1F31F}\u{1F4C8}\u{1F4C9}\u{27A1}\u{26A0}\u{2705}\u{1F525}\u{1F680}\u{1F331}\u{1F499}\u{1F3AF}\u{1F4AA}]/u;

describe("design language", () => {
  it.each(UI_FILES)("%s paints only with theme tokens, carries no emoji and no hand-written text metrics", (file) => {
    const source = code(file);
    expect(source).not.toMatch(STATUS_EMOJI);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|"white"|"black"/);
    expect(source.match(/fontSize:\s*\d+/g) ?? []).toEqual([]);
    // Text never gets a fixed height: Dynamic Type must be free to wrap.
    for (const block of source.matchAll(/^\s+\w*(?:Text|title|label|sentence|detail|fact|reason|topic)\w*:\s*\{([^{}]*)\}/gm)) {
      expect(block[1]).not.toMatch(/\bheight:/);
    }
    // Every screen subscribes to the theme so a live switch repaints it.
    if (/export function \w+Screen\(/.test(source)) expect(source).toContain("useThemeSubscription()");
  });

  it("every plan/community file speaks calmly: no AI claim, no fake minutes, no ranking", () => {
    for (const file of [...PLAN_FILES, ...COMMUNITY_FILES]) {
      const source = code(file);
      expect(source).not.toMatch(/Yapay zek[aâ] senin için seçti/i);
      expect(source).not.toMatch(/\b\d+\s*(dk|dakika)\b/);
      expect(source).not.toMatch(/liderlik tablosu|yüzdelik|percentile|leaderboard|\brank\b/i);
    }
  });
});

describe("routes", () => {
  it("ships one route file per PLAN_ROUTES entry, each rendering a feature screen", () => {
    const routes = read("src/features/studyPlan/routes.ts");
    const declared = [...routes.matchAll(/"\/\(student\)\/plan(?:\/([a-z]+))?"/g)].map((m) => m[1] ?? "index");
    expect(declared.sort()).toEqual(["community", "gaps", "index", "progress", "settings", "step", "strengths", "week"]);
    expect(ROUTE_FILES.map((f) => f.split("/").pop()?.replace(".tsx", "")).sort()).toEqual(declared.sort());
    for (const file of ROUTE_FILES) {
      const source = read(file);
      expect(source).toMatch(/import \{ \w+Screen \} from "@features\/(studyPlan|communityDifficulty)"/);
      expect(source).toContain("useThemeSubscription();");
    }
  });

  it("is reachable from Çalış (one quiet row under the next action) and from Analiz (the maps)", () => {
    const study = read("src/features/study/screens/StudyScreen.tsx");
    const header = study.slice(study.indexOf("ListHeaderComponent="), study.indexOf("ListEmptyComponent="));
    expect(header.indexOf("<NextActionSection")).toBeLessThan(header.indexOf('title="Çalışma Planım"'));
    expect(header.indexOf('title="Çalışma Planım"')).toBeLessThan(header.indexOf("<LearningStoryEntryCard"));
    expect(study).toContain("router.push(PLAN_ROUTES.home as never)");

    const overview = read("src/features/studentAnalytics/screens/AnalyticsOverviewScreen.tsx");
    for (const title of ["Eksik Haritam", "Güçlü Alanlarım", "İlerleme Haritam", "Toplulukta Zorlayıcı Sorular"]) {
      expect(overview).toContain(`title="${title}"`);
    }
    expect(overview).toContain("PLAN_ROUTES.community");
  });

  it("the step screen opens real surfaces and completes only from evidence", () => {
    const step = read("src/features/studyPlan/screens/PlanStepScreen.tsx");
    expect(step).toContain('label="Bu Adımı Atla"');
    expect(step).toContain("Neden bu adım?");
    expect(step).toContain('"Sonraki Adıma Geç"');
    expect(step).toContain('"Planı Görüntüle"');
    expect(step).not.toMatch(/markCompleted|setCompleted|completeStep/);
    expect(read("src/features/studyPlan/hooks/useStudyPlan.ts")).not.toMatch(/recordStudyOutcome|setDoc|updateDoc/);
  });
});

describe("community signal", () => {
  it("is never colour-only: every band has a word, an icon and a sentence", () => {
    const band = read("src/features/communityDifficulty/services/communityBand.ts");
    for (const key of ["challenging", "average", "light", "insufficient"]) {
      expect(band.match(new RegExp(`^\\s+${key}:`, "gm"))?.length ?? 0).toBeGreaterThanOrEqual(4);
    }
    const panel = read("src/features/communityDifficulty/components/CommunitySignalPanel.tsx");
    expect(panel).toContain("Topluluk Sinyali");
    expect(panel).toContain("accessibilityLabel");
  });

  it("sits quietly on the question detail for students only", () => {
    const detail = read("src/features/questions/screens/QuestionDetailScreen.tsx");
    expect(detail).toContain("useCommunitySignal(isStudent ? questionId : undefined)");
    expect(detail).toContain("{isStudent ? <CommunitySignalPanel signal={communitySignal} /> : null}");
  });
});
