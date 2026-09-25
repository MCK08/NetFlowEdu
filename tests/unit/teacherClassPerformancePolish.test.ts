import { readFileSync } from "fs";
import { join } from "path";

import { attentionCategoryGlyph, attentionCategoryLabel } from "../../src/features/teacher/services/statusGlyphs";
import { ACTION_CENTER_TITLE } from "../../src/features/teacher/services/teacherActionCenter";

// Phase 125 — the teacher's Class Performance, polished as presentation only.
//
// What this pins: the class is finally named, from a document the screen was
// already reading; every section is a canonical source with canonical words;
// the student list keeps the canonical order and gains no score; the topic
// readings sit under one heading without a new vocabulary; and the two real
// accessibility defects found in the audit (a clipped student row, a
// three-across stat row) stay fixed.

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

const SCREEN = "src/features/teacher/screens/ClassPerformanceScreen.tsx";
const IDENTITY = "src/features/teacher/components/ClassPerformanceIdentity.tsx";
const STUDENT_ROW = "src/features/teacher/components/StudentPerformanceCard.tsx";
const COMPOSER = "src/features/teacher/hooks/useClassTopicComposer.ts";
const PHASE_125_UI = [SCREEN, IDENTITY, STUDENT_ROW];

function styleBlock(source: string, name: string): string {
  const match = source.match(new RegExp(`^\\s+${name}:\\s*\\{([^{}]*)\\}`, "m"));
  return match?.[1] ?? "";
}

function tabTitles(layout: string): string[] {
  return [...code(layout).matchAll(/title: "([^"]+)"/g)].map((m) => m[1] ?? "");
}

describe("§12/§13 navigation is exactly where it was", () => {
  it("teacher and student tabs are untouched", () => {
    expect(tabTitles("app/(teacher)/(tabs)/_layout.tsx")).toEqual(["Bugün", "Sınıflar", "Aksiyonlar", "Profil"]);
    expect(tabTitles("app/(student)/(tabs)/_layout.tsx")).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
    for (const forbidden of ["Performans", "Analiz", "Raporlar"]) {
      expect(tabTitles("app/(teacher)/(tabs)/_layout.tsx")).not.toContain(forbidden);
    }
  });

  it("Class Performance stays the one nested screen Class Detail already opens", () => {
    expect(read("app/(teacher)/class/[classId]/performance.tsx")).toContain("ClassPerformanceScreen");
    expect(code("src/features/classes/screens/TeacherClassDetailScreen.tsx")).toContain(
      'pathname: "/(teacher)/class/[classId]/performance"',
    );
    // Back returns to the class it belongs to, through the shared button.
    expect(code(SCREEN)).toContain("<AppBackButton");
    expect(code(SCREEN)).toContain('fallbackHref={{ pathname: "/(teacher)/class/[classId]", params: { classId } }}');
  });
});

describe("§27 the class is named from its own document, at no new cost", () => {
  it("draws name, memberCount and status — and invents no other class metadata", () => {
    const identity = code(IDENTITY);
    expect(identity).toContain("{classRoom.name}");
    expect(identity).toContain("`${classRoom.memberCount} üye`");
    expect(identity).toContain('classRoom.status !== "active"');
    expect(identity).not.toMatch(/classRoom\.(subject|topic|gradeLevel|grade|section|school|level|description)\b/);
    expect(identity).not.toMatch(/\b(gradeLevel|seviye|şube|okul)\b/i);
  });

  it("reuses the ONE class read the screen already made, and adds no second fetch", () => {
    const composer = code(COMPOSER);
    // One getClassById, kept whole instead of reduced to organizationId.
    expect(composer.match(/getClassById\(/g)).toHaveLength(1);
    expect(composer).toContain("const organizationId = classRoom?.organizationId ?? null;");
    expect(composer).toContain("classRoom,");
    const screen = code(SCREEN);
    expect(screen).toContain("<ClassPerformanceIdentity classRoom={topicComposer.classRoom} />");
    expect(screen).not.toMatch(/getClassById|useClassDetail|getClassMembers/);
    // Nothing is drawn before that read resolves: no placeholder name.
    expect(code(IDENTITY)).toContain("if (!classRoom) return null;");
  });

  it("hard-codes nothing from the mockup", () => {
    for (const file of PHASE_125_UI) {
      // The CODE, not the prose: a comment may legitimately name the fixture
      // value it is explaining the absence of.
      const source = code(file);
      for (const literal of [
        "Demo Sınıfı",
        "7 üye",
        "Öğrenci A",
        "Öğrenci B",
        "Öğrenci C",
        "Kanıta dayalı sınıf görünümü",
        "Dengeli ilerliyor",
        "Öğrenci ayrıntılarını incele",
      ]) {
        expect(source).not.toContain(literal);
      }
    }
  });
});

describe("§16/§17/§36 no class score, no ranking, no peer comparison", () => {
  it("keeps the three canonical figures and adds no new one", () => {
    const screen = code(SCREEN);
    // Exactly the numbers buildClassPerformanceSummary already produced.
    expect(screen).toContain("summary.averageSuccessRatePercent === null ? \"—\" : `%${summary.averageSuccessRatePercent}`");
    expect(screen).toContain("String(summary.totalDueCount)");
    expect(screen).toContain("String(summary.needsSupportCount)");
    expect(screen).toContain("{summary.studentCount} öğrenci");
    // No second summary builder, no derived index of this screen's own.
    expect(screen.match(/buildClassPerformanceSummary\(/g)).toHaveLength(1);
    expect(screen).not.toMatch(/classScore|healthScore|riskScore|engagement|ortalama puan|sınıf puanı/i);
  });

  it("leads the class's state with the canonical categories, not with the average", () => {
    const screen = code(SCREEN);
    const section = screen.slice(screen.indexOf("CLASS_STATE_TITLE}"), screen.indexOf("Öncelikli Öğrenciler"));
    expect(section.indexOf("categoryCounts[category]")).toBeGreaterThan(-1);
    expect(section.indexOf("categoryCounts[category]")).toBeLessThan(section.indexOf("averageSuccessRatePercent"));
  });

  it("carries no gamification or ranking vocabulary", () => {
    for (const file of PHASE_125_UI) {
      const source = code(file).toLocaleLowerCase("tr");
      expect(source).not.toMatch(
        /leaderboard|liderlik|sıralama|ranking|totalpoints|weeklypoints|\bpuan|\bxp\b|rozet|percentile|en iyi öğrenci|en başarılı|en zayıf|top 5/,
      );
    }
  });
});

describe("§30/§31/§32 student rows keep canonical identity, state and order", () => {
  const screen = code(SCREEN);

  it("renders the canonical card, from the canonical list, in the canonical order", () => {
    expect(screen).toContain("<StudentPerformanceCard card={item} onPress={openStudent} />");
    expect(screen).toContain("data={filteredCards}");
    // The only transformation on `cards` is a filter — never a sort.
    expect(screen).toContain('if (filter === "all") return cards;');
    expect(screen).toContain("cards.filter((card) => attentionByStudent.get(card.studentUid)?.insight.category === filter)");
    expect(screen).not.toMatch(/cards\.(sort|toSorted)\(|\[\.\.\.cards\]\.sort/);
  });

  it("opens the canonical Phase 124 student destination", () => {
    expect(screen).toContain("router.push(teacherStudentHref(classId, studentUid, cards))");
    expect(screen).not.toMatch(/StudentIdentityCard|useStudentPerformanceDetail|StudentPerformanceScreen/);
  });

  it("shows no private field on a row", () => {
    const row = code(STUDENT_ROW);
    // A uid is how the row navigates, never what it shows; these are the
    // fields that would be displayed.
    expect(row).not.toMatch(/\bemail\b|totalPoints|weeklyPoints|\brank\b|percentile|card\.uid\b/i);
    expect(row).not.toMatch(/\{\s*card\.studentUid\s*\}/);
    // Identity, the canonical snapshot's own counts, and nothing else.
    expect(row).toContain("card.displayName");
    expect(row).toContain("snapshot.successRatePercent");
  });

  it("uses ONE set of words and marks for a category, shared with the student screen", () => {
    expect(screen).toContain("attentionCategoryLabel(");
    expect(screen).toContain("attentionCategoryGlyph(");
    expect(screen).not.toContain("function categoryLabel(");
    expect(attentionCategoryLabel("needs_attention")).toBe("Dikkat gereken");
    expect(attentionCategoryGlyph("needs_attention").tone).toBe("danger");
    // The filter chips read their words from the same function.
    expect(screen).toContain("label: attentionCategoryLabel(category),");
  });
});

describe("§29/§33 the readings are canonical and stay in their canonical order", () => {
  const screen = code(SCREEN);

  it("shows the Action Center's own summary under its own canonical title", () => {
    expect(ACTION_CENTER_TITLE).toBe("Bugün Öne Çıkanlar");
    expect(screen).toContain("useClassActionCenter(");
    expect(screen).toContain("items={actionCenter.summary.items}");
    expect(screen).toMatch(/actionCenter\.summary\.hasMore\s*\?/);
    expect(screen).not.toMatch(/buildTeacherActionCenter\(|buildTeacherActionSummary\(/);
  });

  it("groups the three canonical topic readings under one heading and invents no topic vocabulary", () => {
    const topic = screen.slice(screen.indexOf("TOPIC_VIEW_TITLE}"), screen.indexOf("Ödevler"));
    expect(topic).toContain("<ClassConceptHeatmapSection");
    expect(topic).toContain("topicHotspots.map(");
    expect(topic).toContain("<ClassSemanticCohortSection");
    // Phase 70/73/81 sources only — no new classification words.
    expect(topic).not.toMatch(/Dengeli|Dikkat gerekiyor|İzleniyor/);
  });

  it("ships the sections in the order the phase asked for", () => {
    const body = screen.slice(screen.indexOf("ListHeaderComponent="));
    const order = [
      "<ClassPerformanceIdentity",
      "<TeacherActionCenterSection",
      "CLASS_STATE_TITLE}",
      "Öncelikli Öğrenciler",
      "TOPIC_VIEW_TITLE}",
      "Ödevler",
      "STUDENT_STATES_TITLE}",
      "{FILTERS.map(",
    ].map((marker) => body.indexOf(marker));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("§35 filtering stays local and order-preserving", () => {
  it("narrows already-loaded cards and triggers no query", () => {
    const screen = code(SCREEN);
    expect(screen).not.toMatch(/getDocs\(|onSnapshot\(|collection\(|httpsCallable\(/);
    // The filter only ever hides rows; the surviving rows keep their places.
    const cards = ["a", "b", "c", "d"];
    const category = new Map([
      ["a", "needs_attention"],
      ["b", "strong"],
      ["c", "needs_attention"],
      ["d", "watch"],
    ]);
    const filtered = cards.filter((id) => category.get(id) === "needs_attention");
    expect(filtered).toEqual(["a", "c"]);
    expect(filtered).toEqual(cards.filter((id) => filtered.includes(id)));
  });
});

describe("§46 the screen costs exactly what it cost before", () => {
  it("mounts the same hooks it already mounted, and no new one", () => {
    const screen = code(SCREEN);
    const hooks = (screen.match(/use[A-Z]\w+\(/g) ?? []).filter(
      (hook) =>
        !["useCallback(", "useMemo(", "useState(", "useAuth(", "useWindowDimensions(", "useThemeSubscription("].includes(hook),
    );
    expect(new Set(hooks)).toEqual(
      new Set([
        "useClassPerformance(",
        "useClassAssignments(",
        "useClassSemanticDefinitions(",
        "useClassActionCenter(",
        "useClassTopicComposer(",
        "useClassSemanticCohorts(",
      ]),
    );
  });

  it("adds no per-student or per-topic fetch", () => {
    for (const file of PHASE_125_UI) {
      const source = code(file);
      expect(source).not.toMatch(/useProfileHandle|usePublicProfile|getUserProfile|getStudentPerformance|getClassSourcedStudyItems/);
    }
    expect(code(IDENTITY)).not.toMatch(/firebase|firestore|useEffect/i);
  });
});

describe("§45 accessibility: nothing clips, nothing is colour-only", () => {
  it("lets every growing string wrap", () => {
    for (const file of PHASE_125_UI) {
      expect(code(file)).not.toMatch(/numberOfLines/);
    }
    // The student row's own column and the identity line grow with their text.
    expect(styleBlock(code(STUDENT_ROW), "name")).not.toMatch(/\bheight:/);
    expect(styleBlock(code(IDENTITY), "name")).not.toMatch(/\bheight:/);
    // Once the name wraps, the avatar stops floating in the middle of nothing.
    expect(styleBlock(code(STUDENT_ROW), "headerRow")).toContain('alignItems: "flex-start"');
  });

  it("restructures instead of squeezing at the accessibility text sizes", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("fontScale >= stackAtFontScale");
    expect(screen).toContain("stacked ? styles.summaryRowStacked : null");
    expect(screen).toContain("stacked ? styles.hotspotActionRowStacked : null");
    expect(styleBlock(screen, "summaryRowStacked")).toContain('flexDirection: "column"');
    expect(styleBlock(screen, "hotspotActionRowStacked")).toContain('flexDirection: "column"');
    expect(code(IDENTITY)).toContain("fontScale >= stackAtFontScale");
  });

  it("keeps every control at the 44pt floor", () => {
    expect(styleBlock(code(SCREEN), "hotspotCreateButton")).toContain("minHeight: minTouchTarget");
    expect(styleBlock(code(SCREEN), "backButton")).toContain("minHeight: 44");
  });

  it("states every status in words as well as tone, and hides its decoration", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("accessibilityLabel={`${categoryCounts[category]} ${attentionCategoryLabel(category)}`}");
    expect(screen).toContain(
      "accessibilityLabel={`${student.displayName}. ${attentionCategoryLabel(student.insight.category)}. ${student.insight.reasons[0] ?? \"\"}`}",
    );
    expect(screen).toContain("accessibilityState={{ expanded }}");
    for (const file of [SCREEN, IDENTITY]) {
      for (const icon of code(file).match(/<Ionicons\b[\s\S]*?\/>/g) ?? []) {
        expect(icon).toContain("accessibilityElementsHidden");
      }
    }
  });
});

describe("§37/§38 insufficient evidence stays calm", () => {
  it("prints the honest dash rather than a zero, and names the state in canonical words", () => {
    const screen = code(SCREEN);
    expect(screen).toContain('summary.averageSuccessRatePercent === null ? "—"');
    expect(code(STUDENT_ROW)).toContain('snapshot.successRatePercent === null ? "Henüz veri yok"');
    expect(attentionCategoryLabel("insufficient_data")).toBe("Yetersiz veri");
    // An empty category is not drawn as a zero chip.
    expect(screen).toContain('category !== "insufficient_data" || categoryCounts[category] > 0');
    expect(screen).not.toMatch(/başarısız|risk|zayıf öğrenci|kötü/i);
  });

  it("keeps the calm empty and filtered-empty states", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("Bu sınıfta henüz öğrenci yok");
    expect(screen).toContain("Bu filtreye uyan öğrenci yok");
  });
});

describe("§47 the semantics under the screen are untouched", () => {
  it("re-implements no classifier, no targetability rule and no action mapping", () => {
    for (const file of PHASE_125_UI) {
      const source = code(file);
      expect(source).not.toMatch(/buildLearningState|persistent_struggle\s*[:=]|struggledCount\s*>=|successfulReviews\s*>\s*0/);
      expect(source).not.toMatch(/\b(escalate|follow_up|monitor)\b\s*[:=]/);
    }
    // The screen consumes the canonical services; it does not restate them.
    const screen = code(SCREEN);
    expect(screen).toContain("resolveTopicInterventionTargets(");
    expect(screen).toContain("buildClassPerformanceSummary(");
  });
});
