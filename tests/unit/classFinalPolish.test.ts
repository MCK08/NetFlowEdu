import { readFileSync } from "fs";
import { join } from "path";

import { MIN_PULSE_PARTICIPANTS, selectClassAssignments } from "../../src/features/classes/services/classSocial";
import type { Assignment } from "../../src/features/assignments/domain/assignmentTypes";

// Phase 118 — Sınıf, the class instead of a list of classes.
//
// The tab was "Sınıflarım": one card per joined class, and everything real —
// the chat, the questions, sharing one, the classmates, the week, the
// activity — one tap behind it. A student in a single class got a whole
// screen to hold one row, and the only question the tab answered ("which
// classes am I in?") was not the one being asked.
//
// These tests pin the new shape and, more importantly, that nothing beneath
// it moved: Phase 110's social semantics and privacy, the assignment model,
// the question and chat routes, the pulse threshold, and the absence of any
// count, rank or peer metric. They also pin that the mockup's example data —
// a teacher's name, "24 öğrenci", four classmates, "+20" — was never typed
// into the product.

const ROOT = join(__dirname, "..", "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");
const code = (relative: string) =>
  read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const TAB = "src/features/classes/screens/StudentClassesScreen.tsx";
const WORKSPACE = "src/features/classes/screens/StudentClassDetailScreen.tsx";
const IDENTITY = "src/features/classes/components/ClassIdentityCard.tsx";
const ASSIGNMENTS = "src/features/classes/components/ClassAssignmentsSection.tsx";
const SWITCHER = "src/features/classes/components/ClassSwitcherSheet.tsx";
const CARD = "src/features/classes/components/StudentClassCard.tsx";
const SOCIAL = "src/features/classes/components/ClassSocialSections.tsx";
const CLASSMATES = "src/features/classes/components/ClassmatesPreview.tsx";
const PULSE = "src/features/classes/components/ClassPulseCard.tsx";
const ACTIVITY = "src/features/classes/components/ClassActivitySection.tsx";

const PHASE_118_UI = [TAB, WORKSPACE, IDENTITY, ASSIGNMENTS, SWITCHER, CARD, SOCIAL];

describe("§6 navigation is untouched", () => {
  it("keeps the student's four tabs, in order, with Sınıf third", () => {
    const titles = [...read("app/(student)/(tabs)/_layout.tsx").matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    expect(titles).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
    expect(titles[2]).toBe("Sınıf");
  });

  it("leaves the teacher's tabs exactly as they were", () => {
    const titles = [...read("app/(teacher)/(tabs)/_layout.tsx").matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
    expect(titles).toEqual(["Bugün", "Sınıflar", "Aksiyonlar", "Profil"]);
    // The teacher's own class page is not touched by this phase.
    expect(code("src/features/classes/screens/TeacherClassDetailScreen.tsx")).not.toMatch(
      /ClassIdentityCard|ClassAssignmentsSection|ClassSwitcherSheet/,
    );
  });
});

describe("§14/§21 the tab shows a class, and only joined ones", () => {
  it("renders the same workspace the /class/[classId] route renders", () => {
    const tab = code(TAB);
    // Not a copy of the class page — the class page.
    expect(tab).toContain("<StudentClassDetailScreen");
    expect(tab).toContain("classId={selectedClassId}");
    expect(code("app/(student)/class/[classId]/index.tsx")).toContain("<StudentClassDetailScreen classId={classId} />");
  });

  it("picks the class from the canonical joined-class state, never a ranking", () => {
    const tab = code(TAB);
    expect(tab).toContain("useStudentClasses(");
    expect(tab).toContain("function defaultClassId(");
    expect(tab).toContain('classes.find((room) => room.status !== "archived")');
    // No score, no "most active", no recency heuristic over classes.
    expect(tab).not.toMatch(/sort\(|score|lastActive|mostActive|önerilen/i);
  });

  it("offers the switcher only when there is another class to switch to", () => {
    const tab = code(TAB);
    expect(tab).toContain("onSwitchClass={classes.length > 1 ? () => setIsSwitcherOpen(true) : undefined}");
    // And the card is a control only when it was given somewhere to go.
    const identity = code(IDENTITY);
    expect(identity).toContain("if (!onPress) {");
    expect(identity).toContain('accessibilityHint="Başka bir sınıfa geçmek için sınıflarını açar"');
  });

  it("builds no class discovery: the switcher lists the student's own classes", () => {
    const switcher = code(SWITCHER);
    expect(switcher).toContain("classes: readonly ClassRoom[]");
    expect(switcher).not.toMatch(/getDocs|collection\(|query\(|search|discover|keşfet/i);
    expect(code(TAB)).toContain("classes={classes}");
  });

  it("keeps joining a class reachable, by the same flow", () => {
    const tab = code(TAB);
    expect(tab).toContain("<JoinClassModal");
    expect(tab).toContain("joinByCode(code)");
    expect(tab).toContain('accessibilityLabel="Sınıfa katıl"');
    // And it is the screen's one primary button while the student has none.
    expect(tab).toContain('<PrimaryButton label="Sınıfa Katıl"');
    expect(tab).toContain("Henüz bir sınıfa katılmadın");
  });
});

describe("§22/§29 class identity says only what the class document holds", () => {
  it("names the class, its member count and its status — nothing else", () => {
    const identity = code(IDENTITY);
    expect(identity).toContain("{classRoom.name}");
    expect(identity).toContain("{classRoom.memberCount} üye");
    expect(identity).toContain('classRoom.status === "archived"');
    // The class document has no subject, grade, school or description.
    expect(identity).not.toMatch(/subject|gradeLevel|school|okul|description|açıklama|joinCode/i);
  });

  it("takes the teacher's name from the roster this screen already read", () => {
    const workspace = code(WORKSPACE);
    expect(workspace).toContain('social.members.find((member) => member.role === "teacher")');
    // Derived from the existing load; no lookup of its own.
    expect(workspace).not.toMatch(/getUser|publicProfile|getDoc\(|teacherId\s*\)/);
    // Absent a roster it says the count alone rather than a placeholder.
    expect(code(IDENTITY)).toContain("teacherName ? `${teacherName} · ${memberLabel}` : memberLabel");
  });
});

describe("§16/§55 the mockup's example data never entered the product", () => {
  it("hard-codes no name, count, title or date from the reference image", () => {
    const forbidden = [
      "Ayşe Demir",
      "24 öğrenci",
      "Zeynep",
      "Emre",
      "Elif",
      "Mert",
      "+20",
      "Trigonometri",
      "Ünite 4",
      "12 Mayıs",
      "16 Mayıs",
      "9-A",
    ];
    for (const file of PHASE_118_UI) {
      const source = read(file);
      for (const literal of forbidden) expect(source).not.toContain(literal);
    }
  });

  it("omits the mockup's Ödevler tile, which has no screen behind it", () => {
    // The student has no class-scoped assignment list; the canonical list of
    // their assignments is Çalış's "Atanan Çalışmalar". A fourth tile would
    // have needed a screen invented for it, so the class's assignments are a
    // real section instead and each row opens the canonical assignment.
    const workspace = code(WORKSPACE);
    expect(workspace).not.toMatch(/label="Ödevler"|accessibilityLabel="Ödevler/);
    expect(code(ASSIGNMENTS)).toContain('router.push(`/(student)/assignment/${encodeURIComponent(assignment.id)}`');
  });
});

describe("§24 assignments are the assignment model's, not a second one", () => {
  it("selects them by the rule the activity feed already applied", () => {
    const workspace = code(WORKSPACE);
    expect(workspace).toContain("selectClassAssignments(social.assignments, classId)");
    const service = code("src/features/classes/services/classSocial.ts");
    // One rule, used by both the list and the line announcing one.
    expect(service).toContain("for (const assignment of selectClassAssignments(input.assignments, input.classId))");
    expect(service).toContain('assignment.status === "published"');
    expect(service).toContain("!assignment.interventionOf");
  });

  it("really applies that rule", () => {
    const make = (over: Partial<Assignment>): Assignment => ({
      id: "a",
      classId: "c1",
      organizationId: null,
      teacherId: "t1",
      title: "Ödev",
      description: null,
      subject: "Matematik",
      topic: "Denklemler",
      gradeLevel: "9",
      targetStudentIds: ["s1"],
      questionIds: ["q1"],
      targetCount: 1,
      dueAt: null,
      status: "published",
      createdAt: 1,
      updatedAt: 0,
      interventionOf: null,
      ...over,
    });

    const selected = selectClassAssignments(
      [
        make({ id: "older", createdAt: 1 }),
        make({ id: "newer", createdAt: 2 }),
        make({ id: "draft", status: "draft", createdAt: 9 }),
        make({ id: "other-class", classId: "c2", createdAt: 9 }),
        make({ id: "intervention", interventionOf: { subject: "Matematik", topic: "Denklemler" }, createdAt: 9 }),
        make({ id: "untitled", title: "  ", createdAt: 9 }),
      ],
      "c1",
    );
    expect(selected.map((assignment) => assignment.id)).toEqual(["newer", "older"]);
  });

  it("states the deadline with the app's one deadline label, and claims nothing more", () => {
    const section = code(ASSIGNMENTS);
    expect(section).toContain("assignmentDueLabel(assignment.dueAt, now)");
    expect(section).toContain("${assignment.subject} · ${assignment.topic}");
    // No urgency score, no completion percentage, no invented classification.
    expect(section).not.toMatch(/yüzde|acil|öncelik|skor|\bscore\b/i);
    expect(section).not.toMatch(/\d\s*%|\$\{[^}]*\}%/);
    // And no PEER completion: whose submission it is, is never asked here.
    expect(section).not.toMatch(/submission|completedCount|getMySubmission|targetStudentIds/i);
  });

  // Found on the simulator: the row read "Süresi geçti" above an assignment
  // the student had finished ("Ödev tamamlandı, 2 / 2" on the assignment's
  // own screen). The label is true of the ASSIGNMENT and false as an
  // impression of the student, and this list cannot tell the two apart
  // without the per-assignment submission read it deliberately does not make.
  it("says nothing about a deadline that has already passed", () => {
    const section = code(ASSIGNMENTS);
    expect(section).toContain('resolveAssignmentUrgency(assignment.dueAt, now) === "past_due"');
    // Both halves come from Phase 39's module — no second past-due test.
    expect(section).toContain(
      'import { assignmentDueLabel, resolveAssignmentUrgency } from "@features/assignments/services/assignmentUrgency";',
    );
    expect(section).not.toContain("Süresi geçti");
  });

  it("adds no read to get them — they are the ones the screen already holds", () => {
    const section = code(ASSIGNMENTS);
    expect(section).not.toMatch(/useStudentAssignments|useClassAssignments|getDocs|getDoc\(|collection\(/);
    const workspace = code(WORKSPACE);
    expect(workspace.match(/useClassSocial\(/g)).toHaveLength(1);
  });
});

describe("§25/§26/§27 the class's questions, sharing and chat keep their paths", () => {
  it("keeps the class feed, the composer and the chat exactly where they were", () => {
    const workspace = code(WORKSPACE);
    expect(workspace).toContain('router.push({ pathname: "/(student)/class/[classId]/feed", params: { classId } })');
    expect(workspace).toContain('router.push({ pathname: "/(student)/class/[classId]/chat", params: { classId } })');
    expect(workspace).toContain("useStudentQuestionUpload({");
    expect(workspace).toContain("<ClassQuestionTile");
    // No second feed, no ranking of class questions.
    expect(workspace).not.toMatch(/buildQuestionFeedRanking|composeFeedOrder|popularity|beğeni sırala/i);
  });

  it("keeps sharing class-scoped and the vocabulary read-only", () => {
    const workspace = code(WORKSPACE);
    expect(workspace).toContain("classId,");
    expect(workspace).toContain("semanticDefinitions={semanticDefinitions}");
    expect(workspace).not.toContain("onCreateSemanticDefinition");
    expect(workspace).not.toMatch(/visibility: "public"|anonim|anonymous/i);
  });

  it("keeps leaving the class last, quiet and confirmed", () => {
    const source = read(WORKSPACE);
    const footer = source.slice(source.indexOf("ListFooterComponent="), source.indexOf("<ImageSourcePicker"));
    expect(footer).toContain("Sınıftan Ayrıl");
    expect(footer).toContain("onPress={confirmLeave}");
    expect(source).toContain("Bu sınıftan ayrılmak istediğinize emin misiniz?");
  });
});

describe("§28/§30/§31/§32 the social layer keeps Phase 110's semantics", () => {
  it("shows classmates as identity only", () => {
    const preview = code(CLASSMATES);
    expect(preview).toContain("mate.name");
    expect(preview).toContain("mate.photoURL");
    expect(preview).toContain("CLASS_ROLE_LABEL.teacher");
    expect(preview).not.toMatch(/email|accuracy|doğruluk|studyItems|studyEvents|archive|puan|rank/i);
  });

  it("exposes no peer learning data anywhere the class screen draws", () => {
    for (const file of PHASE_118_UI) {
      expect(code(file)).not.toMatch(
        /\bemail\b|accuracy|studyItems|studyEvents|studentAnalytics|studentPerformance|assignmentCompletion|masteryState/i,
      );
    }
  });

  it("keeps the week collective and its threshold where it was", () => {
    expect(MIN_PULSE_PARTICIPANTS).toBe(3);
    const service = code("src/features/classes/services/classSocial.ts");
    expect(service).toContain("export const MIN_PULSE_PARTICIPANTS = 3;");
    expect(service).toContain("pulse.participantCount < MIN_PULSE_PARTICIPANTS");
    const card = code(PULSE);
    expect(card).toContain("classPulseFacts(pulse)");
    expect(card).toContain("CLASS_PULSE_EMPTY");
    // No participant list, no per-student contribution, no chart of invented numbers.
    expect(card).not.toMatch(/members|participants\b|contribution|katkı|bar|chart|%/i);
  });

  it("keeps activity on its canonical builder and kudos count-free", () => {
    const social = code(SOCIAL);
    expect(social).toContain("buildClassActivity({");
    expect(social).toContain("social.congratulated");
    const activity = code(ACTIVITY);
    expect(activity).toContain("<KudosButton");
    expect(activity).not.toMatch(/kudosCount|tebrik etti|congratulationCount|\bcount\b/i);
  });
});

describe("§11/§54 no gamification, and no new cost", () => {
  it("introduces no points, rank, leaderboard or popularity", () => {
    for (const file of PHASE_118_UI) {
      expect(code(file)).not.toMatch(
        /totalPoints|weeklyPoints|\bPuan\b|\bXP\b|leaderboard|liderlik|ranking|percentile|rozet|streak|seri/i,
      );
    }
  });

  it("adds no listener, query or per-member read to the class screens", () => {
    for (const file of [TAB, WORKSPACE, IDENTITY, ASSIGNMENTS, SWITCHER]) {
      expect(code(file)).not.toMatch(/onSnapshot|getDocs|getDoc\(|collection\(|httpsCallable/);
    }
    // The workspace's loads are the four it already had, each called once.
    const workspace = code(WORKSPACE);
    for (const hook of ["useStudentClassInfo\\(", "useClassQuestions\\(", "useClassSocial\\(", "useLeaveClass\\("]) {
      expect(workspace.match(new RegExp(hook, "g"))).toHaveLength(1);
    }
    // And the social load is still one bounded batch, not a loop over members.
    const hook = code("src/features/classes/hooks/useClassSocial.ts");
    expect(hook).toContain("Promise.allSettled([");
    expect(hook).not.toMatch(/members\.map\([^)]*get|for \(const member[\s\S]{0,80}await/);
  });

  it("changes no backend surface", () => {
    for (const file of PHASE_118_UI) {
      expect(code(file)).not.toMatch(/firebase-admin|functions\/src|firestore\.rules/);
    }
    // Phase 110's server-written records stay server-written.
    const rules = read("firestore.rules");
    expect(rules).toMatch(/match \/users\/\{uid\}\/sentKudos\/\{kudosId\} \{\s*allow read: if isOwner\(uid\);\s*allow write: if false;/);
    expect(rules).toMatch(/match \/classes\/\{classId\}\/pulse\/\{weekKey\} \{[\s\S]*?allow write: if false;/);
  });
});

describe("§39/§40/§41 both themes, and the largest text size", () => {
  it("paints with tokens only", () => {
    for (const file of PHASE_118_UI) {
      expect(code(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|"white"|"black"/);
      expect(read(file)).toContain("themedStyles");
    }
  });

  it("gives every new target 44pt and a spoken label", () => {
    for (const file of [IDENTITY, ASSIGNMENTS, SWITCHER]) {
      expect(read(file)).toContain("minHeight: minTouchTarget");
    }
    expect(read(IDENTITY)).toContain("accessibilityLabel={spoken}");
    expect(read(ASSIGNMENTS)).toContain("accessibilityLabel={`${assignment.title}. ${detail}.`}");
    expect(read(CARD)).toContain("accessibilityState={selected === undefined ? undefined : { selected }}");
  });

  // All three were found on the simulator at the largest accessibility size,
  // with a clean relaunch — none dismissed as device behaviour.
  it("keeps an avatar's initial inside the circle drawn for it", () => {
    const avatar = read("src/components/ui/Avatar.tsx");
    // The circle is sized in points; a scaling glyph outgrew it and was cut
    // mid-letter (the class card's "D" at AX5). The name beside it is the
    // text that scales.
    expect(avatar).toContain("allowFontScaling={false}");
    expect(avatar).toContain("fontSize: dimension * 0.4");
  });

  it("stops the classmates heading and its link sharing a row once text is scaled", () => {
    const preview = read(CLASSMATES);
    // The heading was left breaking mid-word down the left edge
    // ("Sını / f / Ark / ada / şlar / ın") beside a wide "Tümünü Gör".
    expect(preview).toContain("const stacked = fontScale >= stackAtFontScale;");
    expect(preview).toContain("stacked ? styles.headerStacked : null");
    expect(preview).toMatch(/headerStacked:\s*\{[\s\S]*?flexDirection: "column",/);
  });

  it("gives a scaled classmate name a wider tile instead of truncating it", () => {
    const preview = read(CLASSMATES);
    // 76pt cut every name to "De m…" / "Öğr en…" at AX5.
    expect(preview).toContain("const MAX_TILE_GROWTH = 2.5;");
    expect(preview).toContain(
      "const tileWidth = Math.round(TILE_WIDTH * Math.min(Math.max(fontScale, 1), MAX_TILE_GROWTH));",
    );
    expect(preview).toContain("style={[styles.tile, { width: tileWidth }]}");
    expect(preview).toContain("numberOfLines={stacked ? 3 : 2}");
    // The fixed width is gone from the style, not merely overridden.
    expect(preview).not.toMatch(/tile:\s*\{[^}]*width: TILE_WIDTH,/);
  });

  it("stacks the identity row rather than clipping it once text is scaled", () => {
    const identity = read(IDENTITY);
    expect(identity).toContain("const stacked = fontScale >= stackAtFontScale;");
    expect(identity).toContain("stacked ? styles.cardStacked : null");
    expect(identity).toMatch(/cardStacked:\s*\{[\s\S]*?flexDirection: "column",/);
  });

  it("caps no text on the new surfaces, so a long name or title wraps", () => {
    for (const file of [IDENTITY, ASSIGNMENTS]) {
      expect(read(file)).not.toMatch(/numberOfLines/);
    }
    for (const file of [IDENTITY, ASSIGNMENTS, SWITCHER]) {
      const textStyles = code(file).match(/\b(title|rowTitle|rowDetail|meta|groupTitle|cancelText):\s*\{[^}]*\}/g) ?? [];
      for (const style of textStyles) expect(style).not.toMatch(/\bheight:/);
    }
  });

  it("marks the selected class with more than a colour", () => {
    const card = read(CARD);
    expect(card).toContain('<Ionicons name="checkmark-circle"');
    expect(card).toContain("selected ? styles.cardSelected : null");
  });
});
