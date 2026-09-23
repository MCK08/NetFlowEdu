import fs from "fs";
import path from "path";

import {
  actionCenterComposerContext,
  teacherActionCenterHref,
  teacherStudentHref,
} from "../../src/features/teacher/services/actionCenterNavigation";
import { ClassTopicHotspot } from "../../src/features/teacher/services/classTopicInsights";
import {
  InterventionConfidence,
  InterventionEffectiveness,
} from "../../src/features/teacher/services/interventionEffectiveness";
import { resolvePostInterventionAction } from "../../src/features/teacher/services/postInterventionAction";
import { StudentAttentionCard } from "../../src/features/teacher/services/studentAttention";
import {
  actionCenterViewAllLabel,
  actionCenterViewAllSpokenLabel,
  ACTION_CENTER_EMPTY_COPY,
  ACTION_CENTER_FULL_LIST_NOTE,
  ACTION_CENTER_TITLE,
  buildTeacherActionCenter,
  MAX_ACTION_CENTER_ITEMS,
  StudentInterventionOutcome,
  summarizeTeacherActionCenter,
  TeacherActionCenterItem,
} from "../../src/features/teacher/services/teacherActionCenter";
import {
  buildTeacherActionSummary,
  TeacherAction,
} from "../../src/features/teacher/services/teacherActionSummary";

// Phase 101 — the Action Center, discoverable and complete, and still the ONLY
// action model.
//
// What these tests protect is a single promise: the embedded summary on Sınıf
// Performansı and the full "Bugün Öne Çıkanlar" route are the same list. Same
// builder, same order, same dedupe, same copy, same destinations — the summary
// is that list cut at five, and "Tümünü Gör" exists exactly when the cut hides
// something. Anything that lets the two diverge is the second priority system
// this phase was told not to build.

// ---------------------------------------------------------------------------
// Fixtures — built through the REAL Phase 27 and Phase 47 functions.
// ---------------------------------------------------------------------------

function outcome(
  studentUid: string,
  effectiveness: InterventionEffectiveness,
  confidence: InterventionConfidence,
): StudentInterventionOutcome {
  return {
    studentUid,
    displayName: `Öğrenci ${studentUid}`,
    action: resolvePostInterventionAction(effectiveness, confidence),
    result: {
      interventionId: "a1",
      previousState: "persistent_struggle",
      currentState: effectiveness === "improved" ? "stable" : "persistent_struggle",
      effectiveness,
      confidence,
      explanation: "",
      reviewedSinceCount: 2,
    },
  };
}

function hotspot(topic: string, gradeLevel: string | null = "9"): ClassTopicHotspot {
  return {
    subject: "Matematik",
    topic,
    studentsWithAttempts: 6,
    strugglingStudents: 3,
    struggledAttemptCount: null,
    gradeLevel,
    masteredStudents: 0,
    dueStudents: 0,
    sampleQuestionId: "q1",
  };
}

function attention(
  studentUid: string,
  category: StudentAttentionCard["insight"]["category"] = "needs_attention",
): StudentAttentionCard {
  return {
    studentUid,
    displayName: `Öğrenci ${studentUid}`,
    successRatePercent: null,
    insight: { category, reasons: ["Son çalışmalarında çoğunlukla zorlandı"], implicatedTopic: null },
  };
}

/** The complete list, exactly as useClassActionCenter composes it. */
function full(
  outcomes: StudentInterventionOutcome[],
  hotspots: ClassTopicHotspot[],
  cards: StudentAttentionCard[],
): TeacherActionCenterItem[] {
  return buildTeacherActionCenter({
    outcomes,
    summaryActions: buildTeacherActionSummary(hotspots, cards),
  });
}

/** Phase 73's embedded list BEFORE Phase 101, reproduced literally: the Phase
 *  27 builder capped itself at 4, then the Action Center capped at 5. */
function phase73Embedded(
  outcomes: StudentInterventionOutcome[],
  hotspots: ClassTopicHotspot[],
  cards: StudentAttentionCard[],
): TeacherActionCenterItem[] {
  const summaryActions: TeacherAction[] = buildTeacherActionSummary(hotspots, cards).slice(0, 4);
  return buildTeacherActionCenter({ outcomes, summaryActions }).slice(0, 5);
}

/** n distinct actions of a known shape: escalations, then hotspots. */
function actions(n: number): TeacherActionCenterItem[] {
  const escalations = Math.min(n, 3);
  return full(
    Array.from({ length: escalations }, (_, i) => outcome(`e${i}`, "worsened", "high")),
    Array.from({ length: Math.min(n - escalations, 5) }, (_, i) => hotspot(`Konu ${i}`)),
    Array.from({ length: Math.max(0, n - escalations - 5) }, (_, i) => attention(`s${i}`)),
  );
}

// ---------------------------------------------------------------------------
// Summary boundaries — U4 to U11
// ---------------------------------------------------------------------------

describe("summary boundaries", () => {
  it("U4 zero actions: nothing to show, nothing hidden, no view-all", () => {
    const summary = summarizeTeacherActionCenter(actions(0));
    expect(summary).toEqual({ items: [], totalCount: 0, hasMore: false });
    expect(ACTION_CENTER_EMPTY_COPY).toBe("Şu anda öne çıkan bir öğretmen aksiyonu yok.");
  });

  it("U5 one action: shown, no view-all", () => {
    const all = actions(1);
    expect(all).toHaveLength(1);
    expect(summarizeTeacherActionCenter(all)).toEqual({ items: all, totalCount: 1, hasMore: false });
  });

  it("U6 exactly the limit: everything shown, no view-all", () => {
    const all = actions(MAX_ACTION_CENTER_ITEMS);
    expect(all).toHaveLength(5);
    const summary = summarizeTeacherActionCenter(all);
    expect(summary.items).toEqual(all);
    expect(summary.hasMore).toBe(false);
  });

  it("U7 limit + 1: summary still capped, view-all appears, full list has all", () => {
    const all = actions(MAX_ACTION_CENTER_ITEMS + 1);
    expect(all).toHaveLength(6);
    const summary = summarizeTeacherActionCenter(all);
    expect(summary.items).toHaveLength(5);
    expect(summary.hasMore).toBe(true);
    expect(summary.totalCount).toBe(6);
  });

  it("U8 many actions: summary unchanged at five, full list complete", () => {
    const all = actions(23);
    expect(all).toHaveLength(23);
    const summary = summarizeTeacherActionCenter(all);
    expect(summary.items).toEqual(all.slice(0, 5));
    expect(summary.totalCount).toBe(23);
  });

  it("U9/U10 view-all appears if and only if something is hidden", () => {
    for (let n = 0; n <= 12; n += 1) {
      expect(summarizeTeacherActionCenter(actions(n)).hasMore).toBe(n > MAX_ACTION_CENTER_ITEMS);
    }
  });

  it("U11 the stated count is the complete action count, in neutral words", () => {
    const summary = summarizeTeacherActionCenter(actions(9));
    expect(summary.totalCount).toBe(9);
    expect(actionCenterViewAllLabel(summary.totalCount)).toBe("Tümünü Gör (9)");
    const spoken = actionCenterViewAllSpokenLabel(summary.totalCount);
    expect(spoken).toContain("9");
    for (const word of ["sorun", "risk", "zayıf", "kritik", "problem", "başarısız"]) {
      expect(`${actionCenterViewAllLabel(9)} ${spoken}`.toLowerCase()).not.toContain(word);
    }
  });
});

// ---------------------------------------------------------------------------
// One list — U1, U2, U3, U12 and the Phase 73 regression
// ---------------------------------------------------------------------------

describe("the summary is the full list, cut", () => {
  const outcomes = [
    outcome("a", "no_change", "high"),
    outcome("b", "worsened", "high"),
    outcome("c", "improved", "high"),
    outcome("d", "worsened", "low"),
    outcome("e", "no_change", "medium"),
  ];
  const hotspots = [hotspot("Denklemler"), hotspot("Oran-Orantı", null), hotspot("Kesirler")];
  const cards = [attention("f"), attention("a"), attention("g", "watch"), attention("h", "strong"), attention("i")];

  it("U1 the canonical order is unchanged: escalate, follow-up, intervention, student", () => {
    const kinds = full(outcomes, hotspots, cards).map((i) => i.kind);
    const rank = { escalate: 0, follow_up: 1, prepare_intervention: 2, review_student: 3 } as const;
    for (let i = 1; i < kinds.length; i += 1) {
      expect(rank[kinds[i]!]).toBeGreaterThanOrEqual(rank[kinds[i - 1]!]);
    }
  });

  it("U2/U12 the summary is exactly the first five items of the full list", () => {
    const all = full(outcomes, hotspots, cards);
    const summary = summarizeTeacherActionCenter(all);
    expect(summary.items).toEqual(all.slice(0, MAX_ACTION_CENTER_ITEMS));
    expect(summary.items.map((i) => i.id)).toEqual(all.slice(0, 5).map((i) => i.id));
  });

  it("U3 the full list is every qualifying action and nothing else", () => {
    const all = full(outcomes, hotspots, cards);
    // b escalate; a, e follow-up; three hotspots; f, g, i students (a already
    // has a follow-up, h is strong). c improved and d low-confidence are monitor.
    expect(all.map((i) => i.id)).toEqual([
      "escalate|b",
      "follow_up|a",
      "follow_up|e",
      "prepare_intervention|Matematik|Denklemler",
      "prepare_intervention|Matematik|Oran-Orantı",
      "prepare_intervention|Matematik|Kesirler",
      "review_student|f",
      "review_student|g",
      "review_student|i",
    ]);
  });

  it("the full list is stable: same facts, same list, same ids", () => {
    expect(full(outcomes, hotspots, cards)).toEqual(full(outcomes, hotspots, cards));
  });

  // The one behaviour Phase 101 knowingly changed. Before it, the Phase 27
  // builder's own cap of 4 sat underneath the Action Center's cap of 5, so a
  // class with no intervention outcomes, two hotspots and several students
  // showed FOUR rows while a fifth qualifying student existed. Every row that
  // used to be shown still is, in the same position; the empty slot now holds
  // the next action instead of hiding it.
  it("Phase 73 regression: the old embedded list is always a prefix of the new summary", () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const effectivenessValues: InterventionEffectiveness[] = ["improved", "no_change", "worsened", "insufficient_data"];
    const confidenceValues: InterventionConfidence[] = ["low", "medium", "high"];
    const categories: StudentAttentionCard["insight"]["category"][] = [
      "needs_attention", "watch", "progressing", "strong", "insufficient_data",
    ];

    let filledAVacantSlot = 0;
    for (let run = 0; run < 400; run += 1) {
      const studentCount = Math.floor(rand() * 9);
      const runOutcomes = Array.from({ length: Math.floor(rand() * 5) }, (_, i) =>
        outcome(
          `s${Math.floor(rand() * Math.max(studentCount, 1))}-${i % 2}`,
          effectivenessValues[Math.floor(rand() * effectivenessValues.length)]!,
          confidenceValues[Math.floor(rand() * confidenceValues.length)]!,
        ),
      );
      const runHotspots = Array.from({ length: Math.floor(rand() * 6) }, (_, i) => hotspot(`T${i}`));
      const runCards = Array.from({ length: studentCount }, (_, i) =>
        attention(`s${i}-${i % 2}`, categories[Math.floor(rand() * categories.length)]!),
      );

      const before = phase73Embedded(runOutcomes, runHotspots, runCards);
      const after = summarizeTeacherActionCenter(full(runOutcomes, runHotspots, runCards)).items;

      expect(after.slice(0, before.length)).toEqual(before);
      expect(after.length).toBeGreaterThanOrEqual(before.length);
      if (after.length > before.length) filledAVacantSlot += 1;
    }
    // The property must actually have been exercised on the changed case.
    expect(filledAVacantSlot).toBeGreaterThan(0);
  });

  it("Phase 73 regression, the concrete case: two hotspots and five students", () => {
    const h = [hotspot("Denklemler"), hotspot("Kesirler")];
    const c = ["s1", "s2", "s3", "s4", "s5"].map((uid) => attention(uid));
    const before = phase73Embedded([], h, c);
    const after = summarizeTeacherActionCenter(full([], h, c));
    expect(before).toHaveLength(4);
    expect(after.items).toHaveLength(5);
    expect(after.items.slice(0, 4)).toEqual(before);
    expect(after.items[4]!.studentUid).toBe("s3");
    expect(after.totalCount).toBe(7);
    expect(after.hasMore).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Semantics the full list must not drift from — U13 to U19
// ---------------------------------------------------------------------------

describe("the full list keeps every Phase 43 / 47 / 73 rule", () => {
  it("U13 one action per student, even far past the summary cut", () => {
    const outcomes = Array.from({ length: 8 }, (_, i) => outcome(`s${i}`, "worsened", "high"));
    const cards = Array.from({ length: 8 }, (_, i) => attention(`s${i}`));
    const all = full(outcomes, [], cards);
    expect(all).toHaveLength(8);
    expect(new Set(all.map((i) => i.studentUid)).size).toBe(8);
    expect(all.every((i) => i.kind === "escalate")).toBe(true);
  });

  it("U14/U15 escalate and follow-up come only from real-confidence Phase 47 verdicts", () => {
    const all = full(
      [
        outcome("w-high", "worsened", "high"),
        outcome("w-low", "worsened", "low"),
        outcome("n-high", "no_change", "high"),
        outcome("n-low", "no_change", "low"),
      ],
      [],
      [],
    );
    expect(all.map((i) => `${i.kind}|${i.studentUid}`)).toEqual(["escalate|w-high", "follow_up|n-high"]);
  });

  it("U16 prepare-intervention carries its topic and Phase 43's grade — null stays null", () => {
    const all = full([], [hotspot("Denklemler", "12"), hotspot("Kesirler", null)], []);
    expect(all.map((i) => i.kind)).toEqual(["prepare_intervention", "prepare_intervention"]);
    expect(all[0]!.topicContext).toEqual({ subject: "Matematik", topic: "Denklemler", gradeLevel: "12" });
    expect(all[1]!.topicContext?.gradeLevel).toBeNull();
  });

  it("U17 monitor never appears, however long the list", () => {
    const outcomes = [
      ...Array.from({ length: 10 }, (_, i) => outcome(`imp${i}`, "improved", "high")),
      ...Array.from({ length: 10 }, (_, i) => outcome(`low${i}`, "worsened", "low")),
    ];
    const all = full(outcomes, [], []);
    expect(all).toEqual([]);
  });

  it("one_off, recovering and insufficient-data students are not promoted", () => {
    const all = full(
      [],
      [],
      [attention("p", "progressing"), attention("s", "strong"), attention("i", "insufficient_data")],
    );
    expect(all).toEqual([]);
  });

  it("U18 no score, rank, risk or urgency field exists anywhere in the model", () => {
    const all = actions(12);
    const allowed = ["id", "kind", "studentUid", "title", "topicContext", "reason", "evidenceNote"].sort();
    for (const item of all) expect(Object.keys(item).sort()).toEqual(allowed);
    expect(Object.keys(summarizeTeacherActionCenter(all)).sort()).toEqual(["hasMore", "items", "totalCount"]);
    const text = JSON.stringify(all).toLowerCase();
    for (const word of ["score", "rank", "risk", "urgency", "priority", "puan", "skor"]) {
      expect(text).not.toContain(word);
    }
  });

  it("U19 no new action kind or classifier value is produced", () => {
    const kinds = new Set(actions(23).map((i) => i.kind));
    for (const kind of kinds) {
      expect(["escalate", "follow_up", "prepare_intervention", "review_student"]).toContain(kind);
    }
  });
});

// ---------------------------------------------------------------------------
// Destinations — the embedded row and the full-list row go to the same place
// ---------------------------------------------------------------------------

describe("CTA destinations are shared", () => {
  const roster = [
    { studentUid: "s1", displayName: "Ayşe Yılmaz" },
    { studentUid: "s2", displayName: "Berk" },
  ];

  it("a student action opens the student screen with the params Sınıf Performansı always sent", () => {
    expect(teacherStudentHref("class-a", "s1", roster)).toEqual({
      pathname: "/(teacher)/class/[classId]/student/[studentId]",
      params: { classId: "class-a", studentId: "s1", studentName: "Ayşe Yılmaz" },
    });
  });

  it("an unknown student sends an empty name rather than a guess", () => {
    expect(teacherStudentHref("class-a", "ghost", roster).params.studentName).toBe("");
  });

  it("an intervention action prefills the composer with its own topic, grade included", () => {
    const [item] = full([], [hotspot("Denklemler", "9")], []);
    expect(actionCenterComposerContext(item!)).toEqual({
      subject: "Matematik",
      topic: "Denklemler",
      gradeLevel: "9",
    });
  });

  it("a student action never opens the composer", () => {
    const [item] = full([outcome("s1", "worsened", "high")], [], []);
    expect(actionCenterComposerContext(item!)).toBeNull();
  });

  it("the full route is class-scoped", () => {
    expect(teacherActionCenterHref("class-a")).toEqual({
      pathname: "/(teacher)/class/[classId]/actions",
      params: { classId: "class-a" },
    });
  });
});

// ---------------------------------------------------------------------------
// Structure — what the code must keep being, and must not become
// ---------------------------------------------------------------------------

describe("one Action Center, two places", () => {
  const root = path.join(__dirname, "..", "..");
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
  const code = (text: string) =>
    text
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("{/*"))
      .join("\n");

  const performance = code(read("src/features/teacher/screens/ClassPerformanceScreen.tsx"));
  const fullRoute = code(read("src/features/teacher/screens/TeacherActionCenterScreen.tsx"));
  const classPage = read("src/features/classes/screens/TeacherClassDetailScreen.tsx");

  it("both screens compose the list through the same hook and never call the builder directly", () => {
    for (const screen of [performance, fullRoute]) {
      expect(screen).toContain("useClassActionCenter(");
      expect(screen).not.toContain("buildTeacherActionCenter(");
      expect(screen).not.toContain("buildTeacherActionSummary(");
      expect(screen).toContain("<TeacherActionCenterSection");
    }
  });

  it("both screens resolve destinations and open the composer through the same helpers", () => {
    for (const screen of [performance, fullRoute]) {
      expect(screen).toContain("teacherStudentHref(");
      expect(screen).toContain("actionCenterComposerContext(");
      expect(screen).toContain("useClassTopicComposer(");
      expect(screen).toContain("<ClassTopicComposerModals");
    }
  });

  it("the embedded section offers view-all only from the summary's own verdict", () => {
    expect(performance).toContain("actionCenter.summary.items");
    expect(performance).toMatch(/actionCenter\.summary\.hasMore\s*\?/);
    // The full route renders everything and offers no second view-all.
    expect(fullRoute).toContain("items={actionCenter.items}");
    expect(fullRoute).not.toContain("viewAll=");
  });

  it("the full route is the Action Center and nothing else — not Phase 100 again", () => {
    for (const other of [
      "ClassSemanticCohortSection",
      "ClassConceptHeatmapSection",
      "StudentPerformanceCard",
      "useClassSemanticCohorts",
      "monitor",
    ]) {
      expect(fullRoute).not.toContain(other);
    }
  });

  it("the class page links straight to the full route, with no count and no badge", () => {
    // Phase 123 — the entry is a compact row under "Sınıfı İncele" instead of
    // a full-width secondary button, and the summary panel's own "Tümünü Gör"
    // opens the same route. What this test protects is unchanged: the class
    // page states the destination and never counts, badges or summarises it.
    expect(classPage).toContain('pathname: "/(teacher)/class/[classId]/actions"');
    expect(classPage).toContain(`title="${ACTION_CENTER_TITLE}"`);
    const entry = classPage.slice(
      classPage.indexOf(`title="${ACTION_CENTER_TITLE}"`),
      classPage.indexOf('title="Sınıf Performansı"'),
    );
    expect(entry.length).toBeGreaterThan(0);
    // A static label: nothing counted, measured or summarised is interpolated
    // into the entry.
    expect(entry).not.toMatch(/totalCount|Badge|badge|\.length|summary|actionCenter\./);
  });

  it("U20 nothing on the navigation path writes", () => {
    const writes = /\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction|httpsCallable|uploadClassQuestionImage)\s*\(/;
    for (const rel of [
      "src/features/teacher/screens/TeacherActionCenterScreen.tsx",
      "src/features/teacher/hooks/useClassActionCenter.ts",
      "src/features/teacher/hooks/useClassTopicComposer.ts",
      "src/features/teacher/services/actionCenterNavigation.ts",
      "src/features/teacher/components/TeacherActionCenterSection.tsx",
      "src/features/teacher/components/ClassTopicComposerModals.tsx",
      "app/(teacher)/class/[classId]/actions.tsx",
    ]) {
      expect(code(read(rel))).not.toMatch(writes);
    }
  });

  it("one name for one surface", () => {
    expect(ACTION_CENTER_TITLE).toBe("Bugün Öne Çıkanlar");
    // The full route does not claim to list every student: its sources are bounded.
    expect(ACTION_CENTER_FULL_LIST_NOTE.toLowerCase()).not.toMatch(/tüm öğrenci|bütün öğrenci|herkes/);
  });
});
