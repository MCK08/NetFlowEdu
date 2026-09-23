import { existsSync, readFileSync } from "fs";
import { join } from "path";

import {
  buildTeacherActionCenter,
  MAX_ACTION_CENTER_ITEMS,
  summarizeTeacherActionCenter,
} from "../../src/features/teacher/services/teacherActionCenter";

// Phase 119 — Bugün, the teacher's day.
//
// The screen already answered "what needs me today" with the canonical action
// list. What it LOOKED like answered a different question first: a third of it
// was the teacher's own avatar, name, role badge and greeting, and the five
// actions beneath were five identical rows, so "which of these first?" could
// only be read from position.
//
// These tests pin the new shape and, above all, that nothing underneath moved:
// Bugün is still one class at a time, the list is still the Action Center's in
// the Action Center's order, and no score, ranking or second classifier was
// introduced to make one item lead.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const TODAY = "src/features/teacher/screens/TeacherTodayScreen.tsx";
const HEADER = "src/features/teacher/components/TeacherTodayHeader.tsx";
const SWITCHER = "src/features/teacher/components/TeacherClassSwitcher.tsx";
const ACTIONS_UI = "src/features/teacher/components/TeacherTodayActions.tsx";
const PANEL = "src/features/teacher/components/ClassAttentionPanel.tsx";
const CONTEXT = "src/features/teacher/context/TeacherTodayContext.tsx";
const ATTENTION_HOOK = "src/features/teacher/hooks/useClassAttention.ts";

const PHASE_119_UI = [TODAY, HEADER, SWITCHER, ACTIONS_UI, PANEL];

describe("§5/§6 navigation is untouched", () => {
  it("keeps the teacher's four tabs, in order, with Bugün first", () => {
    const titles = [...read("app/(teacher)/(tabs)/_layout.tsx").matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    expect(titles).toEqual(["Bugün", "Sınıflar", "Aksiyonlar", "Profil"]);
    expect(titles[0]).toBe("Bugün");
  });

  it("leaves the student's tabs exactly as they were", () => {
    const titles = [...read("app/(student)/(tabs)/_layout.tsx").matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    expect(titles).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
    // Nothing in this phase reaches into the student app.
    for (const file of PHASE_119_UI) {
      expect(code(file)).not.toMatch(/features\/(feed|study|classes)\/screens|\(student\)/);
    }
  });
});

describe("§7/§37 Bugün is still one class at a time", () => {
  it("reads the selected class from the shared provider, never a query of its own", () => {
    const today = code(TODAY);
    expect(today).toContain("useTeacherToday()");
    expect(today).not.toMatch(/useClassPerformance|useClassAttention\(|useTeacherClasses\(/);
    // One attention load for the whole tab group, as Phase 111 set it up.
    const context = code(CONTEXT);
    expect(context.match(/useClassAttention\(/g)).toHaveLength(1);
    expect(context).toContain("useClassAttention(selectedClassId ?? undefined)");
  });

  it("adds no all-class aggregation, fan-out or per-action read", () => {
    for (const file of PHASE_119_UI) {
      expect(code(file)).not.toMatch(/onSnapshot|getDocs|getDoc\(|collection\(|httpsCallable|mapWithConcurrency/);
    }
    // No loop that turns a list of classes into a list of loads.
    expect(code(CONTEXT)).not.toMatch(/classes\.map\([^)]*use|activeClasses\.map\([^)]*use/);
    // The hook still composes the same three canonical loads, once each.
    const hook = code(ATTENTION_HOOK);
    for (const piece of ["useClassPerformance(classId)", "useClassAssignments(classId)", "useClassActionCenter({"]) {
      expect(hook).toContain(piece);
    }
  });

  it("looks up no extra profile to decorate a row", () => {
    // Every name a row shows is already on the canonical item.
    expect(code(ACTIONS_UI)).not.toMatch(/getUser|publicProfile|displayName\s*\?\?|resolvePublicIdentity/);
    expect(code(ACTIONS_UI)).toContain("item.title");
  });
});

describe("§18/§22 the priority card is the canonical list's own first item", () => {
  it("takes the head of the list and the rest untouched", () => {
    const ui = code(ACTIONS_UI);
    expect(ui).toContain("const priority = items[0];");
    expect(ui).toContain("const pending = items.slice(1);");
    // No sort, no filter, no reverse, no weighting of any kind.
    expect(ui).not.toMatch(/items\s*\.\s*(sort|filter|reverse)\(/);
  });

  it("introduces no score, urgency or ranking anywhere on the screen", () => {
    for (const file of PHASE_119_UI) {
      // ("fontWeight" is a style property, not a weighting of actions.)
      expect(code(file)).not.toMatch(
        /priorityScore|riskScore|urgencyScore|\burgent\b|acil|öncelik puanı|skor|\bscore\b|\bweighted\b|percentile|yüzde/i,
      );
    }
  });

  it("really is the first item of the canonical list, not a re-derivation", () => {
    // The precedence that decides which action leads is the builder's, and
    // the summary is by construction that list's own head.
    const items = buildTeacherActionCenter({
      outcomes: [],
      summaryActions: [
        // Deliberately given student-first, so a list that merely preserved
        // input order would fail this.
        { kind: "open_student", studentUid: "s1", title: "Öğrenci A", reason: "gerekçe", topicContext: null },
        {
          kind: "create_question",
          studentUid: null,
          title: "Denklemler",
          reason: "gerekçe",
          topicContext: { subject: "Matematik", topic: "Denklemler", gradeLevel: null },
        },
      ],
    });
    const summary = summarizeTeacherActionCenter(items);
    expect(summary.items[0]).toEqual(items[0]);
    expect(summary.items.length).toBeLessThanOrEqual(MAX_ACTION_CENTER_ITEMS);
    // A topic action outranks a student action by the builder's own order.
    expect(items.map((item) => item.kind)).toEqual(["prepare_intervention", "review_student"]);
  });

  it("offers only the two actions the app can actually perform", () => {
    const ui = code(ACTIONS_UI);
    expect(ui).toContain('return kind === "prepare_intervention" ? "Müdahale Hazırla" : "Öğrenciyi Gör";');
    expect(ui).toContain("onPrepareIntervention(item)");
    expect(ui).toContain("onOpenStudent(item.studentUid)");
    // Both handlers stay the panel's, which keeps the canonical routes.
    expect(code(PANEL)).toContain("router.push(teacherStudentHref(classId, studentUid, attention.cards))");
    expect(code(PANEL)).toContain("topicComposer.openForTopic(context.subject, context.topic, context.gradeLevel)");
  });
});

describe("§23 pending actions consume, never classify", () => {
  it("renders the canonical item's own words", () => {
    const ui = code(ACTIONS_UI);
    for (const field of ["item.title", "item.reason", "item.evidenceNote", "item.topicContext"]) {
      expect(ui).toContain(field);
    }
    expect(ui).toContain("actionCenterLabel(item)");
  });

  it("re-derives no learning state in the UI", () => {
    for (const file of PHASE_119_UI) {
      const source = code(file);
      expect(source).not.toContain("buildTeacherActionCenter(");
      expect(source).not.toContain("buildTeacherActionSummary(");
      expect(source).not.toMatch(/persistent_struggle|one_off_struggle|recovering|insufficient_data|classifyLearning/);
      const imports = source.match(/from "[^"]+"/g) ?? [];
      for (const specifier of imports) {
        expect(specifier).not.toMatch(/learningState|reviewScheduler|interventionEffectiveness|postInterventionAction/);
      }
    }
  });

  it("never prints a raw internal enum", () => {
    for (const file of PHASE_119_UI) {
      expect(code(file)).not.toMatch(/>\s*\{?\s*["']?(persistent_struggle|needs_attention|escalate|follow_up)/);
    }
  });
});

describe("§8–§12 the semantic locks", () => {
  it("leaves the classifier, targetability, effectiveness and action mapping untouched by this phase", () => {
    // Phase 42's five states, still named where they are decided.
    const learning = code("src/features/study/services/learningState.ts");
    for (const state of ["insufficient_data", "stable", "one_off_struggle", "recovering", "persistent_struggle"]) {
      expect(learning).toContain(state);
    }
    // Phase 43 — a persistent struggle, with a real sample behind it, is
    // what puts a student on the teacher's list; the gate stays in the
    // service that owns it.
    const attention = code("src/features/teacher/services/studentAttention.ts");
    expect(attention).toContain("snapshot.persistentStruggleCount > 0");
    expect(attention).toContain("worstItemStruggles >= MIN_RECENT_SAMPLE_FOR_STRUGGLE_SIGNAL");
    // Phase 47 — the mapping's own module still owns the four outcomes.
    const mapping = code("src/features/teacher/services/postInterventionAction.ts");
    for (const kind of ["monitor", "escalate", "follow_up"]) {
      expect(mapping).toContain(kind);
    }
    // And "monitor" is still deliberately not an action on this list.
    expect(code("src/features/teacher/services/teacherActionCenter.ts")).toContain(
      'const SURFACED_KINDS: readonly PostInterventionActionKind[] = ["escalate", "follow_up"];',
    );
  });
});

describe("§18/§26/§27 what the mockups asked for, against what exists", () => {
  it("hard-codes none of the mockups' example strings", () => {
    for (const file of PHASE_119_UI) {
      const source = read(file);
      for (const literal of [
        "Demo Sınıfı",
        "Takip gerektiren öğrenci sinyalleri",
        "Gözden geçirilecek müdahale",
        "Bugünkü işlerin durumu",
        "Seçili sınıftaki gerçek aksiyonları",
        "Son sinyal",
        "mevcut kayıt",
      ]) {
        expect(source).not.toContain(literal);
      }
    }
  });

  it("fills the class summary from the canonical count, or not at all", () => {
    const today = code(TODAY);
    expect(today).toContain("buildTodaySummary(attention.items)");
    expect(today).toContain(
      "const showSummary = !attention.isLoadingList && !attention.error && attention.studentCount > 0;",
    );
    expect(today).toContain("{showSummary ? <Text style={styles.sentence}>{summary.sentence}</Text> : null}");
    // No invented class metric was added to fill the mockup's card.
    expect(today).not.toMatch(/successRate|averag|percent|TeacherStatsCard|deriveTeacherDashboardStats|engagement/i);
  });

  it("omits the Hızlı Erişim tiles, which duplicate two bottom tabs", () => {
    const today = code(TODAY);
    expect(today).not.toContain("Hızlı Erişim");
    // Aksiyonlar is still reachable from here, as the continuation of the
    // list the teacher just read.
    expect(today).toContain('router.navigate("/(teacher)/(tabs)/actions" as never)');
  });

  it("keeps every real row of Sınıf İşleri and its existing destinations", () => {
    const today = code(TODAY);
    for (const route of [
      'pathname: "/(teacher)/class/[classId]/answer-reviews"',
      'pathname: "/(teacher)/class/[classId]/comment-reviews"',
      'pathname: "/(teacher)/class/[classId]/assignment/[assignmentId]"',
      'pathname: "/(teacher)/class/[classId]/assignment/create"',
    ]) {
      expect(today).toContain(route);
    }
    expect(today).toContain('title="Soru Akışı"');
  });
});

describe("§21/§28/§30 class selection, notifications, no-class", () => {
  it("names the selected class and offers a picker only when there is a choice", () => {
    const switcher = code(SWITCHER);
    expect(switcher).toContain('export const TEACHER_CLASS_LABEL = "Seçili sınıf";');
    expect(switcher).toContain("const canSwitch = classes.length >= 2;");
    expect(switcher).toContain("classes: readonly ClassRoom[]");
    // The picker lists the caller's own active classes; it queries nothing.
    expect(switcher).not.toMatch(/getDocs|collection\(|useTeacherClasses|archived/);
  });

  it("keeps the notification bell on the existing subscription and route", () => {
    const header = code(HEADER);
    expect(header).toContain("<NotificationBellButton");
    expect(header).toContain("route={ROUTES.teacherNotifications}");
    // No count, badge or dot invented beside it.
    expect(header).not.toMatch(/unread|badge|count|\bdot\b/i);
  });

  it("keeps the no-class state pointing at the canonical class screen", () => {
    const today = code(TODAY);
    expect(today).toContain("Henüz aktif bir sınıfın yok");
    expect(today).toContain('<PrimaryButton label="Sınıflara Git"');
    expect(today).toContain('router.navigate("/(teacher)/(tabs)/classes" as never)');
  });

  it("keeps the truthful zero-action copy rather than a celebration", () => {
    const ui = code(ACTIONS_UI);
    expect(ui).toContain("ACTION_CENTER_EMPTY_COPY");
    expect(ui).not.toMatch(/tebrik|harika|mükemmel|her şey yolunda/i);
  });
});

describe("§15/§43 no gamification", () => {
  it("introduces no points, rank, leaderboard or streak", () => {
    for (const file of PHASE_119_UI) {
      expect(code(file)).not.toMatch(
        /totalPoints|weeklyPoints|\bPuan\b|\bXP\b|leaderboard|liderlik|sıralama|ranking|rozet|streak|en iyi öğrenci|en başarılı/i,
      );
    }
  });
});

describe("§34/§35/§36 both themes, and the largest text size", () => {
  it("paints with tokens only", () => {
    for (const file of PHASE_119_UI) {
      expect(code(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|"white"|"black"/);
      expect(read(file)).toContain("themedStyles");
    }
  });

  it("gives every new target 44pt and a spoken label", () => {
    for (const file of [HEADER, SWITCHER, ACTIONS_UI]) {
      const source = read(file);
      if (source.includes("Pressable")) expect(source).toContain("minHeight: minTouchTarget");
    }
    expect(read(SWITCHER)).toContain("accessibilityLabel={`${TEACHER_CLASS_LABEL}: ${selected.name}`}");
    expect(read(SWITCHER)).toContain("accessibilityState={{ selected: isSelected }}");
    expect(read(ACTIONS_UI)).toContain("accessibilityLabel={joinSpokenLabel([label, item.title, item.reason, cta])}");
  });

  it("stacks the class card rather than clipping it once text is scaled", () => {
    const switcher = read(SWITCHER);
    expect(switcher).toContain("const stacked = fontScale >= stackAtFontScale;");
    expect(switcher).toContain("stacked ? styles.cardStacked : null");
    expect(switcher).toMatch(/cardStacked:\s*\{[\s\S]*?flexDirection: "column",/);
  });

  it("caps no text on the new surfaces, so long names and reasons wrap", () => {
    for (const file of [HEADER, SWITCHER, ACTIONS_UI]) {
      expect(read(file)).not.toMatch(/numberOfLines/);
    }
  });

  // All three were found on the simulator — two at the largest accessibility
  // size, one by comparing the two themes side by side.
  it("top-aligns a pending row's mark and chevron once its text wraps", () => {
    const ui = read(ACTIONS_UI);
    // Centred against four or five wrapped lines, the chevron landed
    // mid-sentence and the dot beside the second line.
    expect(ui).toContain("const stacked = fontScale >= stackAtFontScale;");
    expect(ui).toContain("stacked ? styles.rowTopAligned : null");
    expect(ui).toMatch(/rowTopAligned:\s*\{[\s\S]*?alignItems: "flex-start",/);
  });

  it("keeps the priority mark a quiet tile in both themes, never a red block", () => {
    const ui = code(ACTIONS_UI);
    // Phase 73's rule. A filled accent also read two different ways across
    // themes, because danger and textInverse both flip.
    expect(ui).toContain("<View style={styles.mark}>");
    expect(ui).not.toMatch(/styles\.mark, \{ backgroundColor: accent \}/);
    expect(ui).toMatch(/mark:\s*\{[\s\S]*?backgroundColor: colors\.surfaceMuted,/);
    // The accent still carries meaning, on the glyph and the word beside it.
    expect(ui).toContain("color={accent}");
    expect(ui).toContain("[styles.kindLabel, { color: accent }]");
  });

  it("names the selected class once on Aksiyonlar, not twice", () => {
    const actions = code("src/features/teacher/screens/TeacherActionsScreen.tsx");
    expect(actions).toContain("<TeacherClassSwitcher");
    // The switcher prints the name itself now.
    expect(actions).not.toContain("styles.className");
    expect(actions).not.toContain("{selectedClass.name}");
  });

  it("resizes a line box whenever it resizes a type role", () => {
    // displayLg at 32 with its own 34 is a 1.06 ratio and clips ğ.
    const header = read(HEADER);
    expect(header).toContain("fontSize: 32");
    expect(header).toContain("lineHeight: 40");
  });
});

describe("§38 no backend", () => {
  it("changes no backend surface and keeps the protected service untouched", () => {
    for (const file of PHASE_119_UI) {
      expect(code(file)).not.toMatch(/firebase-admin|functions\/src|firestore\.rules|firebase\/firestore/);
    }
    // Phase 111's protected file is neither imported nor edited by this UI.
    expect(existsSync(join(ROOT, "src/features/teacher/services/studentPerformance.ts"))).toBe(true);
    for (const file of PHASE_119_UI) {
      expect(code(file)).not.toContain("services/studentPerformance");
    }
  });
});
