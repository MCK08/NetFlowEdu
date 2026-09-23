import { readFileSync } from "fs";
import { join } from "path";

import {
  actionCenterKindLabel,
  buildTeacherActionCenter,
  TeacherActionCenterItem,
  TeacherActionCenterKind,
} from "../../src/features/teacher/services/teacherActionCenter";
import {
  ACTION_FILTER_ALL,
  ACTION_FILTER_NO_MATCH,
  actionFilterLabel,
  actionFilterOptions,
  filterActionCenterItems,
  isActionFilterActive,
} from "../../src/features/teacher/services/teacherActionFilter";

// Phase 121 — Aksiyonlar, the full Action Center with a way into it.
//
// The list was already right: every canonical action for the selected class,
// in the builder's own precedence, from the load Bugün shares. What it lacked
// was any way to reach one row among many — a teacher looking for a
// particular student read the whole column.
//
// So this phase adds exactly two local controls and nothing else. The danger
// they carry is obvious and is what most of this file is about: a filter that
// quietly becomes a ranking, a chip set that invents a category, or a search
// that needs a read. The narrowing is therefore one pure function returning a
// SUBSEQUENCE of the canonical list, and these tests exercise it rather than
// merely grepping for it.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SCREEN = "src/features/teacher/screens/TeacherActionsScreen.tsx";
const BAR = "src/features/teacher/components/TeacherActionFilterBar.tsx";
const FILTER = "src/features/teacher/services/teacherActionFilter.ts";
const PANEL = "src/features/teacher/components/ClassAttentionPanel.tsx";
const CONTEXT = "src/features/teacher/context/TeacherTodayContext.tsx";

const PHASE_121_UI = [SCREEN, BAR, PANEL];

const KINDS: TeacherActionCenterKind[] = ["escalate", "follow_up", "prepare_intervention", "review_student"];

function item(over: Partial<TeacherActionCenterItem> & { id: string; kind: TeacherActionCenterKind }): TeacherActionCenterItem {
  return {
    studentUid: "s1",
    title: "Öğrenci A",
    topicContext: { subject: "Matematik", topic: "Denklemler", gradeLevel: null },
    reason: "gerekçe",
    evidenceNote: null,
    ...over,
  };
}

/** One of each kind, in the canonical order the builder produces. */
const CANONICAL: TeacherActionCenterItem[] = KINDS.map((kind, index) =>
  item({ id: `${kind}-${index}`, kind, title: `Öğrenci ${index}` }),
);

describe("§5/§6 navigation is untouched", () => {
  it("keeps the teacher's four tabs, in order, with Aksiyonlar third", () => {
    const titles = [...read("app/(teacher)/(tabs)/_layout.tsx").matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    expect(titles).toEqual(["Bugün", "Sınıflar", "Aksiyonlar", "Profil"]);
    expect(titles[2]).toBe("Aksiyonlar");
  });

  it("keeps the student's tabs and stays out of the student app", () => {
    const titles = [...read("app/(student)/(tabs)/_layout.tsx").matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    expect(titles).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
    for (const file of PHASE_121_UI) {
      expect(code(file)).not.toMatch(/\(student\)|features\/(feed|study)\/screens/);
    }
  });

  it("leaves Phase 119's Bugün and Phase 120's Sınıflar composition alone", () => {
    const today = code("src/features/teacher/screens/TeacherTodayScreen.tsx");
    const order = [
      "<TeacherTodayHeader",
      "<TeacherClassSwitcher",
      "summary.sentence",
      '<ClassAttentionPanel classId={selectedClass.id} attention={attention} mode="today"',
    ].map((marker) => today.indexOf(marker));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Bugün takes no filter: its five rows are the head of the list, whole.
    expect(today).not.toMatch(/filter=|TeacherActionFilterBar/);
    // And Sınıflar is still its own screen.
    const classes = code("src/features/classes/screens/TeacherClassesScreen.tsx");
    expect(classes).toContain("useTeacherClasses(");
    expect(classes).not.toMatch(/ClassAttentionPanel|TeacherActionFilterBar/);
  });
});

describe("§21 Aksiyonlar is still one class at a time", () => {
  it("takes its class and its list from the shared provider", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("useTeacherToday()");
    expect(screen).not.toMatch(/useClassAttention\(|useClassPerformance|useTeacherClasses\(/);
    const context = code(CONTEXT);
    expect(context.match(/useClassAttention\(/g)).toHaveLength(1);
  });

  it("adds no read, listener, query or fan-out of any kind", () => {
    for (const file of [...PHASE_121_UI, FILTER]) {
      expect(code(file)).not.toMatch(/onSnapshot|getDocs|getDoc\(|collection\(|httpsCallable|mapWithConcurrency|fetch\(/);
    }
    // The filter service touches nothing but the array it is handed.
    const imports = read(FILTER).match(/from "[^"]+"/g) ?? [];
    expect(imports).toEqual(['from "./teacherActionCenter"']);
  });

  it("clears the filter when the class changes, so it never narrows another class's list", () => {
    expect(code(SCREEN)).toContain("setFilter(EMPTY_ACTION_FILTER);");
    expect(code(SCREEN)).toContain("selectClass(classId);");
  });
});

describe("§22 narrowing never reorders — the guarantee, exercised", () => {
  it("returns a subsequence of the canonical list, in the canonical order", () => {
    const all = filterActionCenterItems(CANONICAL, { kind: ACTION_FILTER_ALL, query: "" });
    expect(all.map((entry) => entry.id)).toEqual(CANONICAL.map((entry) => entry.id));

    // A query that matches several keeps them in their original relative order.
    const list = [
      item({ id: "a", kind: "escalate", title: "Zeynep" }),
      item({ id: "b", kind: "review_student", title: "Ahmet" }),
      item({ id: "c", kind: "follow_up", title: "Zeynep" }),
    ];
    const matched = filterActionCenterItems(list, { kind: ACTION_FILTER_ALL, query: "zeynep" });
    expect(matched.map((entry) => entry.id)).toEqual(["a", "c"]);
    // Every result is the identical object from the input — nothing rebuilt.
    for (const entry of matched) expect(list).toContain(entry);
  });

  it("narrows by kind without touching any other kind's order", () => {
    const only = filterActionCenterItems(CANONICAL, { kind: "follow_up", query: "" });
    expect(only.map((entry) => entry.kind)).toEqual(["follow_up"]);
    const none = filterActionCenterItems(CANONICAL, { kind: "escalate", query: "yok-böyle-bir-şey" });
    expect(none).toEqual([]);
  });

  it("searches only the words a row already prints", () => {
    const one = item({
      id: "x",
      kind: "prepare_intervention",
      title: "Denklemler",
      reason: "4 öğrencide zorlanma",
      evidenceNote: "Müdahaleden sonra 3 soru tekrar edildi.",
    });
    for (const needle of ["denklemler", "MATEMATİK", "zorlanma", "tekrar edildi", "müdahale öneriliyor"]) {
      expect(filterActionCenterItems([one], { kind: ACTION_FILTER_ALL, query: needle })).toHaveLength(1);
    }
    // Not the uid, and not anything the row does not show.
    expect(filterActionCenterItems([one], { kind: ACTION_FILTER_ALL, query: "s1" })).toHaveLength(0);
    expect(code(FILTER)).not.toMatch(/studentUid|\buid\b|email/);
  });

  it("folds Turkish case the way the rest of the app does", () => {
    expect(code(FILTER)).toContain('toLocaleLowerCase("tr")');
    const one = item({ id: "y", kind: "review_student", title: "İzmirli Öğrenci" });
    expect(filterActionCenterItems([one], { kind: ACTION_FILTER_ALL, query: "izmirli" })).toHaveLength(1);
  });
});

describe("§18/§25 the chips are canonical kinds, not new categories", () => {
  it("offers one chip per kind the list actually contains, in canonical order", () => {
    expect(actionFilterOptions(CANONICAL)).toEqual([ACTION_FILTER_ALL, ...KINDS]);
    // A kind with no actions gets no chip that would lead to an empty page.
    const twoKinds = [item({ id: "a", kind: "escalate" }), item({ id: "b", kind: "review_student" })];
    expect(actionFilterOptions(twoKinds)).toEqual([ACTION_FILTER_ALL, "escalate", "review_student"]);
    // One kind is not a choice, so there is no chip row at all.
    expect(actionFilterOptions([item({ id: "a", kind: "escalate" })])).toEqual([]);
    expect(actionFilterOptions([])).toEqual([]);
  });

  it("labels every chip with the canonical label its rows already print", () => {
    for (const kind of KINDS) {
      expect(actionFilterLabel(kind)).toBe(actionCenterKindLabel(kind));
    }
    expect(actionFilterLabel(ACTION_FILTER_ALL)).toBe("Tümü");
    // The labels live in one map in the canonical service, not in this phase.
    expect(code(FILTER)).toContain("actionCenterKindLabel(value)");
    expect(code(FILTER)).not.toMatch(/"Takip gerekli"|"Müdahale öneriliyor"|"İzle"|"Öncelikli inceleme"/);
  });

  // The mockup's Tümü / Takip / Müdahale / İzleme covers three of the four
  // canonical kinds and leaves out `escalate` — the one a teacher would most
  // regret missing. Three chips would have hidden it behind "Tümü".
  it("covers every kind the builder can produce, including escalate", () => {
    const built = buildTeacherActionCenter({
      outcomes: [],
      summaryActions: [
        { kind: "open_student", studentUid: "s1", title: "Öğrenci A", reason: "gerekçe", topicContext: null },
      ],
    });
    expect(built.length).toBeGreaterThan(0);
    for (const entry of built) {
      expect(actionFilterOptions(CANONICAL)).toContain(entry.kind);
    }
    expect(actionFilterOptions(CANONICAL)).toContain("escalate");
  });
});

describe("§27/§30 what the mockup showed and the repository cannot", () => {
  it("adds no second filter control beside the chips", () => {
    // There is no other real filter dimension, so there is no icon that opens
    // a sheet of nothing.
    const bar = code(BAR);
    expect(bar).not.toMatch(/options-outline|funnel|filter-outline|Modal|Sheet/);
    expect(bar).toContain("<SegmentedPills");
    expect(bar).toContain("<SearchInput");
  });

  it("shows no recency, because an action carries no timestamp", () => {
    // TeacherActionCenterItem has no time field; inventing one would mean
    // either a fabricated date or a read per row.
    const model = read("src/features/teacher/services/teacherActionCenter.ts");
    const shape = model.slice(model.indexOf("export interface TeacherActionCenterItem"), model.indexOf("// How many actions"));
    expect(shape).not.toMatch(/At:|timestamp|occurredAt|createdAt/);
    for (const file of PHASE_121_UI) {
      expect(code(file)).not.toMatch(/gün önce|hafta önce|formatRelativeDay|occurredAt/);
    }
  });

  it("hard-codes nothing from the mockup", () => {
    for (const file of [...PHASE_121_UI, FILTER]) {
      const source = read(file);
      for (const literal of [
        "Ahmet Yılmaz",
        "Zeynep Kaya",
        "Mehmet Demir",
        "Elif Çelik",
        "Can Arslan",
        "9-A Matematik",
        "10-B Matematik",
        "11-C Matematik",
        "9-B Matematik",
        "3 gün önce",
        "1 hafta önce",
        "2 hafta önce",
      ]) {
        expect(source).not.toContain(literal);
      }
    }
  });
});

describe("§9–§13 the semantic locks", () => {
  it("introduces no score, ranking or UI-side classifier", () => {
    for (const file of [...PHASE_121_UI, FILTER]) {
      const source = code(file);
      expect(source).not.toMatch(
        /priorityScore|riskScore|urgencyScore|\burgent\b|acil|öncelik puanı|skor|\bscore\b|percentile|yüzde/i,
      );
      expect(source).not.toMatch(/totalPoints|weeklyPoints|\bPuan\b|\bXP\b|leaderboard|liderlik|sıralama|ranking|rozet/i);
      expect(source).not.toContain("buildTeacherActionCenter(");
      expect(source).not.toMatch(/persistent_struggle|one_off_struggle|recovering|insufficient_data|classifyLearning/);
    }
  });

  it("leaves the classifier, targetability, effectiveness and mapping where they are", () => {
    const learning = code("src/features/study/services/learningState.ts");
    for (const state of ["insufficient_data", "stable", "one_off_struggle", "recovering", "persistent_struggle"]) {
      expect(learning).toContain(state);
    }
    const attention = code("src/features/teacher/services/studentAttention.ts");
    expect(attention).toContain("snapshot.persistentStruggleCount > 0");
    const mapping = code("src/features/teacher/services/postInterventionAction.ts");
    for (const kind of ["monitor", "escalate", "follow_up"]) expect(mapping).toContain(kind);
    expect(code("src/features/teacher/services/teacherActionCenter.ts")).toContain(
      'const SURFACED_KINDS: readonly PostInterventionActionKind[] = ["escalate", "follow_up"];',
    );
  });

  it("keeps the builder's precedence as the only ordering", () => {
    const center = code("src/features/teacher/services/teacherActionCenter.ts");
    expect(center).toContain("items.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);");
    expect(center).toContain("escalate: 0,");
    expect(center).toContain("review_student: 3,");
  });
});

describe("§32/§33 privacy and the two different emptinesses", () => {
  it("shows no private student data on this screen", () => {
    for (const file of [...PHASE_121_UI, FILTER]) {
      // ("@features/studentAnalytics/.../SegmentedPills" is a shared pill
      // control, not student data, so the guard names the fields.)
      expect(code(file)).not.toMatch(
        /\bemail\b|accuracy|studyItems|studyEvents|assignmentCompletion|archivePending|masteryState/i,
      );
    }
  });

  it("says 'nothing matched' differently from 'there is nothing'", () => {
    expect(ACTION_FILTER_NO_MATCH).not.toBe("Şu anda öne çıkan bir öğretmen aksiyonu yok.");
    expect(isActionFilterActive({ kind: ACTION_FILTER_ALL, query: "" })).toBe(false);
    expect(isActionFilterActive({ kind: ACTION_FILTER_ALL, query: "  " })).toBe(false);
    expect(isActionFilterActive({ kind: "escalate", query: "" })).toBe(true);
    expect(isActionFilterActive({ kind: ACTION_FILTER_ALL, query: "a" })).toBe(true);
    const panel = code(PANEL);
    expect(panel).toContain("const narrowedToNothing =");
    expect(panel).toContain("canonicalItems.length > 0");
    expect(panel).toContain("{ACTION_FILTER_NO_MATCH}");
    // And the canonical "there is nothing" copy stays where it always was,
    // on the row section, untouched by this phase.
    expect(code("src/features/teacher/components/TeacherActionCenterSection.tsx")).toContain(
      "{ACTION_CENTER_EMPTY_COPY}",
    );
  });

  it("draws the bar only when there is a loaded list to narrow", () => {
    expect(code(SCREEN)).toContain(
      "!attention.isLoadingList && !attention.error && attention.items.length > 0",
    );
  });
});

describe("§36/§37/§40 both themes, and the largest text size", () => {
  it("paints with tokens only", () => {
    for (const file of PHASE_121_UI) {
      expect(code(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|"white"|"black"/);
      expect(read(file)).toContain("themedStyles");
    }
  });

  it("reuses the app's own accessible pills and search field", () => {
    const bar = read(BAR);
    expect(bar).toContain("SegmentedPills");
    expect(bar).toContain("SearchInput");
    // The pills are a radio group whose selection is announced, and they wrap.
    const pills = read("src/features/studentAnalytics/components/SegmentedPills.tsx");
    expect(pills).toContain('accessibilityRole="radiogroup"');
    expect(pills).toContain("accessibilityState={{ checked: selected }}");
    expect(pills).toContain('flexWrap: "wrap"');
    expect(pills).toContain("minHeight: minTouchTarget");
  });

  it("names the search field for a screen reader", () => {
    const bar = read(BAR);
    expect(bar).toContain("accessibilityLabel={ACTION_SEARCH_PLACEHOLDER}");
    expect(bar).toContain('accessibilityLabel="Aksiyon türü filtresi"');
  });

  // Found on the simulator at the largest accessibility size: the shared
  // search field is the only one in the app and it was a FIXED 44pt box, so
  // its text became a sliver along the bottom edge.
  it("lets the shared search field grow instead of clipping its text", () => {
    const input = read("src/components/ui/SearchInput.tsx");
    expect(input).not.toMatch(/container:\s*\{[\s\S]*?\bheight: 44,/);
    expect(input).toMatch(/container:\s*\{[\s\S]*?minHeight: minTouchTarget,/);
    expect(input).toMatch(/container:\s*\{[\s\S]*?paddingVertical:/);
    // minHeight is the old fixed value, so at the ordinary text sizes the
    // field is exactly the 44pt box its two other callers already render.
    expect(read("src/theme/sizes.ts")).toContain("export const minTouchTarget = 44;");
  });

  it("caps no text on the new surfaces", () => {
    for (const file of [BAR, SCREEN]) {
      expect(read(file)).not.toMatch(/numberOfLines/);
    }
  });
});

describe("§52 no backend", () => {
  it("changes no backend surface and leaves the protected service alone", () => {
    for (const file of [...PHASE_121_UI, FILTER]) {
      expect(code(file)).not.toMatch(/firebase-admin|functions\/src|firestore\.rules|firebase\/firestore/);
      expect(code(file)).not.toContain("services/studentPerformance");
    }
  });
});
