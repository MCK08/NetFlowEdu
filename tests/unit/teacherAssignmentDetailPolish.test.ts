import { readFileSync } from "fs";
import { join } from "path";

import {
  MAX_ASSIGNMENT_DESCRIPTION_LENGTH,
  MAX_ASSIGNMENT_QUESTIONS,
  MAX_ASSIGNMENT_STUDENTS,
  MAX_ASSIGNMENT_TITLE_LENGTH,
  type AssignmentSubmission,
} from "../../src/features/assignments/domain/assignmentTypes";
import {
  assignmentStatusLabel,
  resolveAssignmentDisplayStatus,
} from "../../src/features/assignments/services/assignmentStatus";
import {
  buildTeacherAssignmentProgress,
  countAssignmentStatuses,
  studentAssignmentStatusLabel,
} from "../../src/features/assignments/services/teacherAssignmentProgress";
import { studentAssignmentStatusGlyph } from "../../src/features/teacher/services/statusGlyphs";

// Phase 128 — the teacher's assignment detail, polished as presentation.
//
// What this pins: the screen names itself once and the assignment in full;
// every fact on it is a field the assignment document holds; the response
// summary counts the product's own four student states and nothing else;
// "Yanıtları İncele" leads to this assignment's real responses rather than to
// an unrelated queue; the questions are shown in their assigned order and only
// read when opened; and nothing the mockup showed without a source — a
// completion percentage, a donut, difficulty badges, a reminder or copy action
// — was invented to fill it.

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

const SCREEN = "src/features/assignments/screens/AssignmentDetailScreen.tsx";
const ROUTE = "app/(teacher)/class/[classId]/assignment/[assignmentId].tsx";
const TABS = "src/features/assignments/components/AssignmentDetailTabs.tsx";
const SUMMARY = "src/features/assignments/components/AssignmentResponseSummary.tsx";
const STUDENT_ROW = "src/features/assignments/components/AssignmentStudentRow.tsx";
const QUESTION_LIST = "src/features/assignments/components/AssignmentQuestionList.tsx";
const QUESTIONS_HOOK = "src/features/assignments/hooks/useAssignmentQuestions.ts";
const DETAIL_HOOK = "src/features/assignments/hooks/useAssignmentDetail.ts";
const PHASE_128_UI = [SCREEN, TABS, SUMMARY, STUDENT_ROW, QUESTION_LIST];

function tabTitles(layout: string): string[] {
  return [...code(layout).matchAll(/title: "([^"]+)"/g)].map((m) => m[1] ?? "");
}

function styleBlock(source: string, name: string): string {
  const match = source.match(new RegExp(`^\\s+${name}:\\s*\\{([^{}]*)\\}`, "m"));
  return match?.[1] ?? "";
}

function submission(studentId: string, completedCount: number): AssignmentSubmission {
  const completedQuestionIds = Array.from({ length: completedCount }, (_, i) => `q${i}`);
  return {
    studentId,
    completedQuestionIds,
    completedCount,
    startedAt: completedCount > 0 ? 1 : null,
    lastCompletedAt: completedCount > 0 ? 2 : null,
    completedAt: null,
    questionOutcomes: {},
  };
}

describe("§20 navigation stays exactly where it was", () => {
  it("teacher and student tabs are untouched", () => {
    expect(tabTitles("app/(teacher)/(tabs)/_layout.tsx")).toEqual(["Bugün", "Sınıflar", "Aksiyonlar", "Profil"]);
    expect(tabTitles("app/(student)/(tabs)/_layout.tsx")).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
  });

  it("is still the one nested detail, outside the tab group, so no tab bar renders", () => {
    expect(read(ROUTE)).toContain("AssignmentDetailScreen");
    expect(ROUTE.startsWith("app/(teacher)/class/")).toBe(true);
    expect(ROUTE).not.toContain("(tabs)");
  });

  it("every entry point — Phase 127's publish included — opens that same route", () => {
    const route = '"/(teacher)/class/[classId]/assignment/[assignmentId]"';
    for (const caller of [
      "src/features/classes/screens/TeacherClassDetailScreen.tsx",
      "src/features/teacher/screens/TeacherTodayScreen.tsx",
      "src/features/teacher/screens/ClassPerformanceScreen.tsx",
      "src/features/assignments/screens/CreateAssignmentScreen.tsx",
    ]) {
      expect(code(caller)).toContain(`pathname: ${route}`);
    }
    // The composer still replaces itself with the detail after publishing.
    expect(code("src/features/assignments/screens/CreateAssignmentScreen.tsx")).toContain("router.replace({");
  });

  it("back returns to the assignment's own class, never a guessed tab", () => {
    expect(code(SCREEN)).toContain(
      '? { pathname: "/(teacher)/class/[classId]", params: { classId: assignment.classId } }',
    );
  });
});

describe("§21 Phase 127's assignment contract is unchanged", () => {
  it("keeps the document's limits exactly", () => {
    expect(MAX_ASSIGNMENT_TITLE_LENGTH).toBe(80);
    expect(MAX_ASSIGNMENT_DESCRIPTION_LENGTH).toBe(300);
    expect(MAX_ASSIGNMENT_QUESTIONS).toBe(30);
    expect(MAX_ASSIGNMENT_STUDENTS).toBe(200);
  });

  it("writes nothing: the screen reaches no create, update or delete", () => {
    const screen = code(SCREEN);
    expect(screen).not.toMatch(/setDoc|updateDoc|deleteDoc|addDoc|writeBatch|httpsCallable/);
    // The one pre-existing action still only OPENS the existing composer.
    expect(screen).toContain('pathname: "/(teacher)/class/[classId]/assignment/create"');
  });
});

describe("§13 the assignment and its class are named from real data", () => {
  it("titles the screen once, and the assignment in full", () => {
    const screen = code(SCREEN);
    expect(screen).toContain('export const ASSIGNMENT_DETAIL_TITLE = "Çalışma Detayı"');
    expect(screen).toContain('accessibilityRole="header"');
    expect(screen).toContain("{assignment.title}");
    // The old header fell back to "Ödev" and cut the title at one line.
    expect(screen).not.toContain('?? "Ödev"');
    for (const file of PHASE_128_UI) {
      expect(code(file)).not.toMatch(/numberOfLines/);
    }
  });

  it("states the canonical status, in the canonical words", () => {
    const screen = code(SCREEN);
    expect(screen).toContain(
      "resolveAssignmentDisplayStatus(assignment.status, assignment.dueAt, Date.now())",
    );
    expect(screen).toContain("assignmentStatusLabel(displayStatus)");
    expect(assignmentStatusLabel(resolveAssignmentDisplayStatus("draft", null, 0))).toBe("Taslak");
    expect(assignmentStatusLabel(resolveAssignmentDisplayStatus("archived", null, 0))).toBe("Arşivlendi");
    expect(assignmentStatusLabel(resolveAssignmentDisplayStatus("published", 100, 200))).toBe("Süresi geçti");
    expect(assignmentStatusLabel(resolveAssignmentDisplayStatus("published", 300, 200))).toBe("Aktif");
    expect(assignmentStatusLabel(resolveAssignmentDisplayStatus("published", null, 200))).toBe("Aktif");
    // Sınıf Performansı reads the same words from the same place.
    expect(code("src/features/teacher/screens/ClassPerformanceScreen.tsx")).not.toContain(
      "function assignmentStatusLabel(",
    );
  });

  it("names the class from its document, and the grade the way the product does", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("const classRoom = useClassRoom(assignment?.classId)");
    expect(screen).toContain("classRoom?.name");
    expect(screen).toContain("`${assignment.gradeLevel}. sınıf`");
    // Class management is not this screen's job.
    expect(screen).not.toMatch(/joinCode|memberCount/);
  });

  it("prints a deadline only from dueAt, as a date, with no invented time of day", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("formatDueDate(assignment.dueAt)");
    expect(screen).toContain('{ day: "numeric", month: "long", year: "numeric" }');
    expect(screen).not.toMatch(/hour:|minute:|toLocaleTimeString/);
    expect(screen).toContain('"Son tarih yok"');
  });
});

describe("§15/§16 the response summary counts the product's own states, nothing more", () => {
  const targets = ["a", "b", "c", "d"].map((uid) => ({ uid, displayName: uid.toUpperCase() }));

  it("puts every targeted student in exactly one state, so the counts reconcile", () => {
    const progress = buildTeacherAssignmentProgress({
      targetStudents: targets,
      submissionsByStudent: new Map([
        ["a", submission("a", 3)],
        ["b", submission("b", 1)],
      ]),
      targetCount: 3,
      dueAt: null,
      now: 10,
    });
    const counts = countAssignmentStatuses(progress.rows);
    expect(counts).toEqual({ completed: 1, in_progress: 1, not_started: 2, past_due: 0 });
    expect(counts.completed + counts.in_progress + counts.not_started + counts.past_due).toBe(progress.totalStudents);
  });

  it("lets completion outrank a missed deadline, as the canonical resolver does", () => {
    const progress = buildTeacherAssignmentProgress({
      targetStudents: targets.slice(0, 2),
      submissionsByStudent: new Map([["a", submission("a", 3)]]),
      targetCount: 3,
      dueAt: 5,
      now: 10,
    });
    expect(countAssignmentStatuses(progress.rows)).toEqual({
      completed: 1,
      in_progress: 0,
      not_started: 0,
      past_due: 1,
    });
  });

  it("names and marks each state once, in palette tones only", () => {
    expect(studentAssignmentStatusLabel("completed")).toBe("Tamamladı");
    expect(studentAssignmentStatusLabel("in_progress")).toBe("Devam ediyor");
    expect(studentAssignmentStatusLabel("not_started")).toBe("Başlamadı");
    expect(studentAssignmentStatusLabel("past_due")).toBe("Süresi geçti");
    expect(studentAssignmentStatusGlyph("completed").tone).toBe("success");
    expect(studentAssignmentStatusGlyph("past_due").tone).toBe("danger");
    expect(studentAssignmentStatusGlyph("in_progress").tone).toBe("primary");
    expect(studentAssignmentStatusGlyph("not_started").tone).toBe("muted");
  });

  it("says the fraction, draws the same fraction, and invents no percentage", () => {
    const summary = code(SUMMARY);
    expect(summary).toContain("`${completed} / ${totalStudents} tamamladı`");
    expect(summary).toContain('accessibilityRole="progressbar"');
    expect(summary).toContain("text: headline");
    // Every percent sign is a style dimension (the bar's width and its fill's
    // height), never printed text.
    const percents = summary.split("\n").filter((line) => line.includes("%"));
    expect(percents.length).toBeGreaterThan(0);
    for (const line of percents) {
      expect(line).toMatch(/\b(width|height):/);
    }
    // A deadline-less assignment never shows a "Süresi geçti" row.
    expect(summary).toContain('status !== "past_due" || hasDeadline');
  });

  it("draws no donut, no chart and no success rate", () => {
    for (const file of PHASE_128_UI) {
      const source = code(file);
      expect(source).not.toMatch(/\bSvg\b|<Circle|donut|Chart\b|başarı oranı|successRate|completionRate|\baverage|ortalama/i);
    }
  });
});

describe("§17 the questions are what was asked, in the order it was asked", () => {
  it("reads nothing for them until the teacher opens them", () => {
    expect(code(SCREEN)).toContain(
      'useAssignmentQuestions(assignment?.questionIds ?? null, tab === "questions")',
    );
    const hook = code(QUESTIONS_HOOK);
    expect(hook).toContain("if (!enabled || key === null || !questionIds) return;");
  });

  it("resolves through the shared question cache, keeping the assigned order", () => {
    const hook = code(QUESTIONS_HOOK);
    expect(hook).toContain("resolveQuestionMetadata(questionIds)");
    expect(hook).toContain("questionIds.map((questionId) => ({ questionId, question: byId.get(questionId) ?? null }))");
    // Entries belong to the ids they were resolved for; another assignment's
    // questions are never shown while this one's resolve.
    expect(hook).toContain("resolved !== null && resolved.key === key ? resolved.entries : null");
    expect(hook).not.toMatch(/getDocs|onSnapshot|collection\(|query\(|\.sort\(/);
  });

  it("shows the image and the written prompt, keeps a missing question in its place, and grades nothing", () => {
    const list = code(QUESTION_LIST);
    expect(list).toContain("question.description?.trim() || IMAGE_ONLY_QUESTION_LABEL");
    expect(list).toContain('export const MISSING_QUESTION_LABEL = "Bu soru artık görüntülenemiyor"');
    expect(list).toContain("`${index + 1}. soru`");
    // Preview only: no row opens anything, nothing is scored.
    expect(list).not.toMatch(/onPress|router|correctChoice|questionOutcomes|struggled/);
  });

  it("writes a percentage the Turkish way, before the number", () => {
    expect(code(SCREEN)).toContain("`%${Math.round(outcomeInsights.topicOutcome.struggleRate * 100)} zorlanma oranı`");
  });

  it("invents no difficulty", () => {
    for (const file of [...PHASE_128_UI, QUESTIONS_HOOK]) {
      expect(code(file)).not.toMatch(/difficulty|zorluk|Kolay|Orta\b|\bZor\b/i);
    }
  });
});

describe("§18 'Yanıtları İncele' leads to this assignment's real responses", () => {
  it("is the dominant action, and opens the student responses view", () => {
    const screen = code(SCREEN);
    expect(screen).toContain('export const REVIEW_RESPONSES_LABEL = "Yanıtları İncele"');
    expect(screen).toContain('onPress={() => selectTab("students")}');
    // Shown only when there is anyone to review.
    expect(screen.indexOf("REVIEW_RESPONSES_LABEL}")).toBeGreaterThan(screen.indexOf("{hasStudents ? ("));
  });

  it("does not point at the class's answer-publication queue, which knows no assignments", () => {
    expect(code(SCREEN)).not.toMatch(/answer-reviews|AnswerReview/);
    expect(read("src/features/teacher/services/answerReviewService.ts")).not.toMatch(/assignment/i);
  });

  it("opens each student's canonical performance screen, in the assignment's own order", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("router.push(teacherStudentRoute(assignment.classId, row.studentUid, row.displayName))");
    expect(screen).toContain("progress.rows.map((row) => (");
    expect(screen).not.toMatch(/rows\]?\.sort|sortBy|orderBy/);
  });

  it("keeps the one other action secondary, and away from an archived class", () => {
    const screen = code(SCREEN);
    expect(screen).toContain('variant="secondary"');
    expect(screen).toContain('classRoom?.status !== "archived"');
  });

  it("adds no action the product does not have", () => {
    for (const file of PHASE_128_UI) {
      expect(code(file)).not.toMatch(
        /Hatırlatma|Kopyas|Arşivle\b|Sil\b|Düzenle|duplicate|reschedule|remind|deleteAssignment|archiveAssignment/i,
      );
    }
  });
});

describe("§1/§16 nothing from the mockup was hard-coded", () => {
  it("carries none of its example values", () => {
    for (const file of PHASE_128_UI) {
      const source = code(file);
      for (const literal of [
        "Denklem Çözümleri",
        "Denklemler Tekrarı",
        "Demo Sınıfı",
        "DEMO01",
        "12 Ara",
        "23:59",
        "%83",
        "%75",
        "%17",
        "%67",
        "Devam Ediyor",
        "Ahmet",
        "Ayşe",
        "doğru",
        "Sonuçlar yüklenemedi",
      ]) {
        expect(source).not.toContain(literal);
      }
    }
  });

  it("carries no ranking, points or private field", () => {
    for (const file of PHASE_128_UI) {
      const source = code(file).toLocaleLowerCase("tr");
      expect(source).not.toMatch(/puan|\bxp\b|leaderboard|liderlik|sıralama|ranking|percentile|en hızlı|email|e-posta/);
    }
  });
});

describe("§23 the screen costs one class document more than it did", () => {
  it("keeps the detail load at its three reads", () => {
    const hook = code(DETAIL_HOOK);
    for (const read of ["getAssignmentById(", "getClassMembers(", "getAssignmentSubmissions("]) {
      expect(hook.split(read)).toHaveLength(2);
    }
    expect(hook).not.toMatch(/onSnapshot|for \(const .* of .*\) \{[^}]*await/);
  });

  it("adds no listener, no per-student read and no query of its own", () => {
    for (const file of PHASE_128_UI) {
      expect(code(file)).not.toMatch(/onSnapshot|getDocs|getDoc\(|collection\(|query\(/);
    }
    const screen = code(SCREEN);
    expect(screen.split("useClassRoom(")).toHaveLength(2);
    expect(screen.split("useAssignmentDetail(")).toHaveLength(2);
  });
});

describe("§30 loading, missing and failed are three different answers", () => {
  it("tells a deleted assignment apart from a failed load, and offers retry only for the second", () => {
    const hook = code(DETAIL_HOOK);
    expect(hook).toContain("setNotFound(true);");
    const screen = code(SCREEN);
    const notFoundBranch = screen.slice(screen.indexOf("if (notFound) {"), screen.indexOf("if (error || !assignment"));
    expect(notFoundBranch).toContain("Bu çalışma artık mevcut değil");
    expect(notFoundBranch).not.toContain("Tekrar Dene");
    const errorBranch = screen.slice(screen.indexOf("if (error || !assignment"), screen.indexOf("const displayStatus"));
    expect(errorBranch).toContain('label="Tekrar Dene" onPress={refresh}');
  });

  it("says plainly when an assignment has nobody or nothing in it", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("Bu çalışma henüz bir öğrenciye atanmadı.");
    expect(screen).toContain("Bu çalışmada soru yok.");
  });
});

describe("§28/§29 the accessibility sizes break nothing", () => {
  it("stacks the header, the tabs, a student row and a question row", () => {
    for (const file of [SCREEN, TABS, STUDENT_ROW, QUESTION_LIST]) {
      expect(code(file)).toContain("fontScale >= stackAtFontScale");
    }
    expect(styleBlock(code(TABS), "barStacked")).toContain('flexDirection: "column"');
    expect(styleBlock(code(STUDENT_ROW), "metaStacked")).toContain('flexDirection: "column"');
    expect(styleBlock(code(QUESTION_LIST), "rowStacked")).toContain('flexDirection: "column"');
  });

  it("lists facts one per line instead of fixed-width tiles", () => {
    const screen = code(SCREEN);
    expect(styleBlock(screen, "fact")).toContain('flexDirection: "row"');
    expect(styleBlock(screen, "factText")).toContain("flex: 1");
    expect(screen).not.toMatch(/justifyContent: "space-between",\s*marginTop/);
  });

  it("never clips text with a fixed height", () => {
    expect(styleBlock(code(QUESTION_LIST), "index")).toContain("minHeight: 28");
    expect(styleBlock(code(QUESTION_LIST), "index")).not.toMatch(/\bheight: \d/);
    // A stacked prompt must not keep a zero flex-basis inside a column.
    expect(styleBlock(code(QUESTION_LIST), "promptStacked")).toContain("flex: 0");
  });

  it("drops the chevron rather than stranding it", () => {
    const row = code(STUDENT_ROW);
    expect(row).toContain("{stacked ? null : (");
    expect(row).toContain('name="chevron-forward"');
    expect(row).toContain('accessibilityHint="Öğrencinin performans ekranını açar"');
  });

  it("gives every control a 44pt target and a real role", () => {
    expect(styleBlock(code(TABS), "tab")).toContain("minHeight: minTouchTarget");
    expect(code(TABS)).toContain('accessibilityRole="tab"');
    expect(code(TABS)).toContain('accessibilityRole="tablist"');
    expect(code(TABS)).toContain("accessibilityState={{ selected: isSelected }}");
    expect(styleBlock(code(STUDENT_ROW), "row")).toContain("minHeight: minTouchTarget");
  });

  it("hides every decorative mark and never says a state by colour alone", () => {
    for (const file of PHASE_128_UI) {
      for (const icon of code(file).match(/<Ionicons\b[\s\S]*?\/>/g) ?? []) {
        expect(icon).toContain("accessibilityElementsHidden");
      }
    }
    // State is a word beside a mark: StatusLabel, or the Badge's own label.
    expect(code(STUDENT_ROW)).toContain("<StatusLabel");
    expect(code(SUMMARY)).toContain("<StatusLabel");
    expect(code(SCREEN)).toContain("<Badge label={statusWord}");
  });

  it("uses theme tokens, never a private palette", () => {
    for (const file of [...PHASE_128_UI, QUESTIONS_HOOK]) {
      expect(code(file)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    }
  });
});

describe("§24 the semantics under the screen are untouched", () => {
  it("leaves every engine this phase had no business editing alone", () => {
    for (const service of [
      "src/features/assignments/services/assignmentProgress.ts",
      "src/features/assignments/services/assignmentOutcomeInsights.ts",
      "src/features/assignments/services/assignmentFollowUp.ts",
      "src/features/assignments/services/assignmentCreation.ts",
      "src/features/assignments/services/smartAssignmentSelection.ts",
      "src/features/assignments/hooks/useAssignmentSession.ts",
      "src/features/teacher/services/studentAttention.ts",
      "src/features/teacher/services/teacherIntervention.ts",
      "src/features/teacher/services/interventionEffectiveness.ts",
      "src/features/teacher/services/postInterventionAction.ts",
      "src/features/teacher/services/teacherActionCenter.ts",
      "src/features/teacher/services/teacherToday.ts",
    ]) {
      expect(read(service)).not.toContain("Phase 128");
    }
    expect(read("src/features/teacher/services/studentPerformance.ts")).not.toContain("Phase 128");
  });
});
