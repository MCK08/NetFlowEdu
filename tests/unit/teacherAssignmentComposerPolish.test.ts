import { readFileSync } from "fs";
import { join } from "path";

import {
  MAX_ASSIGNMENT_DESCRIPTION_LENGTH,
  MAX_ASSIGNMENT_QUESTIONS,
  MAX_ASSIGNMENT_STUDENTS,
  MAX_ASSIGNMENT_TITLE_LENGTH,
} from "../../src/features/assignments/domain/assignmentTypes";
import {
  resolveTargetStudentIds,
  validateAssignmentDraft,
} from "../../src/features/assignments/services/assignmentCreation";
import {
  selectSmartAssignmentQuestions,
  TargetedQuestionSignal,
} from "../../src/features/assignments/services/smartAssignmentSelection";
import { endOfLocalDay } from "../../src/features/assignments/services/assignmentDueDate";
import { Question } from "@/types/question";

// Phase 127 — the teacher's "Yeni Çalışma Oluştur", polished as presentation.
//
// The composer's contract is what this pins first, behaviourally: the real
// limits, the real validation, the real two-stage submit and the fact that
// the three selection options each run a genuinely different operation (so
// the radio group the mockup asked for is not decoration). The rest is
// structural: the screen says which class it is for, uses the canonical
// constants rather than the mockup's numbers, and invents no step, type,
// selector or field that the product does not have.

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

const SCREEN = "src/features/assignments/screens/CreateAssignmentScreen.tsx";
const STEPS = "src/features/assignments/components/ComposerSteps.tsx";
const OPTION = "src/features/assignments/components/StrategyOptionCard.tsx";
const ROUTE = "app/(teacher)/class/[classId]/assignment/create.tsx";
const PHASE_127_UI = [SCREEN, STEPS, OPTION];

function tabTitles(layout: string): string[] {
  return [...code(layout).matchAll(/title: "([^"]+)"/g)].map((m) => m[1] ?? "");
}

// ── Behavioural fixtures, shaped like the real selection inputs ──────────
const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function q(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    ownerId: "teacher-1",
    organizationId: "org-1",
    visibility: "class",
    imageUrl: `https://example.com/${id}.jpg`,
    classId: "class-1",
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "9",
    description: null,
    posterRole: "teacher",
    createdAt: 0,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    choices: null,
    correctChoice: null,
    hints: [],
    choiceFeedback: null,
    ...overrides,
  };
}

const MC = { choices: { A: "1", B: "2", C: "3" }, correctChoice: "A" as const };
const CRITERIA = { subject: "Matematik", topic: "Denklemler", gradeLevel: "9" };

function select(
  pool: Question[],
  targetCount: number,
  strategy: "focus" | "balanced" | "reinforce",
  signals: ReadonlyMap<string, TargetedQuestionSignal> = new Map(),
) {
  return selectSmartAssignmentQuestions({
    pool,
    criteria: CRITERIA,
    targetCount,
    strategy,
    targetedQuestionSignals: signals,
    now: NOW,
  });
}

describe("§7/§12 navigation and the entry point are untouched", () => {
  it("teacher and student tabs are exactly what they were", () => {
    expect(tabTitles("app/(teacher)/(tabs)/_layout.tsx")).toEqual(["Bugün", "Sınıflar", "Aksiyonlar", "Profil"]);
    expect(tabTitles("app/(student)/(tabs)/_layout.tsx")).toEqual(["Akış", "Çalış", "Sınıf", "Profil"]);
    for (const forbidden of ["Ödevler", "Çalışmalar", "Oluştur", "Yönetim"]) {
      expect(tabTitles("app/(teacher)/(tabs)/_layout.tsx")).not.toContain(forbidden);
    }
  });

  it("Class Detail still opens the one existing composer route, and no second one exists", () => {
    const classDetail = code("src/features/classes/screens/TeacherClassDetailScreen.tsx");
    expect(classDetail).toContain('label="Yeni Çalışma Oluştur"');
    expect(classDetail).toContain('pathname: "/(teacher)/class/[classId]/assignment/create"');
    expect(read(ROUTE)).toContain("CreateAssignmentScreen");
    // Every caller reaches the same route; no competing composer path.
    const callers = [
      "src/features/classes/screens/TeacherClassDetailScreen.tsx",
      "src/features/teacher/screens/ClassPerformanceScreen.tsx",
      "src/features/teacher/screens/TeacherTodayScreen.tsx",
      "src/features/teacher/screens/StudentPerformanceScreen.tsx",
      "src/features/assignments/screens/AssignmentDetailScreen.tsx",
      "src/features/feed/screens/TeacherFeedScreen.tsx",
    ];
    for (const caller of callers) {
      expect(read(caller)).toContain('"/(teacher)/class/[classId]/assignment/create"');
    }
  });

  it("back returns to the class the composer was opened for", () => {
    expect(code(SCREEN)).toContain(
      'fallbackHref={{ pathname: "/(teacher)/class/[classId]", params: { classId } }}',
    );
  });
});

describe("§10 the canonical contract is unchanged — behaviourally", () => {
  it("keeps the real limits, which are NOT the mockup's 60 and 200", () => {
    expect(MAX_ASSIGNMENT_TITLE_LENGTH).toBe(80);
    expect(MAX_ASSIGNMENT_DESCRIPTION_LENGTH).toBe(300);
    expect(MAX_ASSIGNMENT_QUESTIONS).toBe(30);
    expect(MAX_ASSIGNMENT_STUDENTS).toBe(200);
    // The screen reads the constants; it does not restate a number.
    const screen = code(SCREEN);
    expect(screen).toContain("maxLength={MAX_ASSIGNMENT_TITLE_LENGTH}");
    expect(screen).toContain("maxLength={MAX_ASSIGNMENT_DESCRIPTION_LENGTH}");
    expect(screen).not.toMatch(/\b(60|200)\b\s*[;,)]/);
    expect(screen).not.toMatch(/MAX_TITLE_LENGTH|MAX_DESCRIPTION_LENGTH/);
  });

  it("enforces exactly the validation it enforced before", () => {
    const base = { title: "Denklemler", targetStudentIds: ["s1"], questionIds: ["q1"], description: null };
    expect(validateAssignmentDraft(base)).toEqual({ valid: true, error: null });
    expect(validateAssignmentDraft({ ...base, title: "   " })).toEqual({
      valid: false,
      error: "Lütfen bir başlık girin.",
    });
    expect(validateAssignmentDraft({ ...base, title: "a".repeat(81) }).error).toBe("Başlık çok uzun.");
    expect(validateAssignmentDraft({ ...base, title: "a".repeat(80) }).valid).toBe(true);
    expect(validateAssignmentDraft({ ...base, description: "a".repeat(301) }).error).toBe("Açıklama çok uzun.");
    expect(validateAssignmentDraft({ ...base, description: "a".repeat(300) }).valid).toBe(true);
    expect(validateAssignmentDraft({ ...base, targetStudentIds: [] }).error).toBe("En az bir öğrenci seçmelisiniz.");
    expect(validateAssignmentDraft({ ...base, questionIds: [] }).error).toBe("Bu kriterlere uyan soru bulunamadı.");
  });

  it("keeps the audience resolution the composer has always used", () => {
    expect(resolveTargetStudentIds("all", ["a", "b"], ["a"])).toEqual(["a", "b"]);
    expect(resolveTargetStudentIds("selected", ["a", "b"], ["b"])).toEqual(["b"]);
    expect(resolveTargetStudentIds("selected", ["a", "b"], [])).toEqual([]);
  });

  it("keeps the due-date offsets as end-of-local-day, or no deadline at all", () => {
    const end = endOfLocalDay(2026, 9, 27);
    const date = new Date(end);
    expect(date.getHours()).toBe(23);
    expect(date.getMinutes()).toBe(59);
    // "Son tarih yok" is a real option: the payload carries null.
    expect(code(SCREEN)).toContain('{ label: "Son tarih yok", daysFromNow: null }');
    expect(code(SCREEN)).toContain("dueAt: dueAtFromOffset(dueDaysFromNow)");
  });

  it("submits through the canonical service with the previewed snapshot", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("useCreateAssignment({");
    expect(screen).toContain("await prepare({");
    expect(screen).toContain("await publish({");
    // No second creation path, no direct write from the screen.
    expect(screen).not.toMatch(/createAssignment\(|setDoc|addDoc|httpsCallable/);
    // The hook still refuses to publish anything that was not prepared.
    expect(code("src/features/assignments/hooks/useCreateAssignment.ts")).toContain(
      "if (!params.teacherId || !preview) return null;",
    );
  });
});

describe("§24 the three options are a real operation each, not decoration", () => {
  const pool = [
    q("mc1", MC),
    q("mc2", MC),
    q("open1"),
    q("open2"),
    q("open3"),
  ];

  it("balanced interleaves multiple-choice and open-ended; focus does not", () => {
    const balanced = select(pool, 4, "balanced").selected.map((s) => s.questionId);
    const focus = select(pool, 4, "focus").selected.map((s) => s.questionId);
    expect(balanced).not.toEqual(focus);
    // Balanced alternates the two kinds rather than taking one group first.
    const isMc = (id: string) => id.startsWith("mc");
    const balancedKinds = balanced.map(isMc);
    expect(new Set(balancedKinds).size).toBe(2);
    expect(balancedKinds[0]).not.toBe(balancedKinds[1]);
  });

  it("reinforce puts the targeted students' struggled question first; the others do not", () => {
    const signals = new Map<string, TargetedQuestionSignal>([
      [
        "open3",
        {
          everAttemptedCount: 3,
          struggledCount: 2,
          mostRecentReviewedAt: NOW - 30 * DAY_MS,
          cumulativeStruggleCount: 4,
        },
      ],
    ]);
    const reinforce = select(pool, 3, "reinforce", signals).selected;
    expect(reinforce[0]?.questionId).toBe("open3");
    expect(reinforce[0]?.reasonLabel).toBe("Zorlandığın konu");
    // Without the history the same pool leads with something else.
    expect(select(pool, 3, "focus").selected[0]?.questionId).not.toBe("open3");
  });

  it("every strategy is deterministic, so the preview a teacher confirms is what publishes", () => {
    for (const strategy of ["balanced", "focus", "reinforce"] as const) {
      const first = select(pool, 3, strategy).selected.map((s) => s.questionId);
      const second = select(pool, 3, strategy).selected.map((s) => s.questionId);
      expect(second).toEqual(first);
    }
  });

  it("the screen offers exactly those three canonical values, and no invented type", () => {
    const screen = code(SCREEN);
    const values = [...screen.matchAll(/value: "(balanced|focus|reinforce)"/g)].map((m) => m[1]);
    expect(values).toEqual(["balanced", "focus", "reinforce"]);
    for (const invented of ["Alıştırmalar", "Kısa Sınav", "Karma", "quiz", "practice_set", "mixed"]) {
      expect(screen).not.toContain(invented);
    }
    // Each one states what it does, and the words come from the real branches.
    expect(screen).toContain("Çoktan seçmeli ve açık uçlu sorular dönüşümlü");
    expect(screen).toContain("Yalnızca seçilen konunun soruları");
    expect(screen).toContain("Öğrencilerin zorlandığı ve uzun süredir çalışmadığı sorular önce");
  });
});

describe("§17/§20 what the mockup asked for, against what exists", () => {
  it("names the class from its own document, with no switcher the flow cannot honour", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("{classRoom.name}");
    expect(screen).toContain("{members.length} öğrenci");
    expect(screen).toContain('classRoom.status !== "active" ? <Badge label="Arşivlendi"');
    // The composer is bound to the classId in its own route: no switcher
    // control (the word survives only in the comments explaining its absence).
    expect(screen).not.toMatch(/label="Değiştir"|>\s*Değiştir\s*</);
    expect(screen).not.toMatch(/useTeacherClasses|ClassSwitcher|setClassId/);
    // No invented class metadata.
    expect(screen).not.toMatch(/classRoom\.(subject|gradeLevel|grade|school|level|description)\b/);
  });

  it("draws the two stages the flow has, not the mockup's four", () => {
    const screen = code(SCREEN);
    expect(screen).toContain('export const COMPOSER_STEPS = ["Çalışma Bilgileri", "Önizleme ve Yayın"] as const;');
    expect(screen).toContain("const stepIndex = preview ? 1 : 0;");
    for (const fake of ["Temel Bilgiler\", \"İçerik", "Ayarlar\", \"Önizleme"]) {
      expect(screen).not.toContain(fake);
    }
    // The indicator reports the real stage, and is spoken as one.
    expect(code(STEPS)).toContain('accessibilityLabel={`Adım ${activeIndex + 1} / ${steps.length}');
  });

  it("hard-codes no mockup example value", () => {
    for (const file of PHASE_127_UI) {
      const source = code(file);
      for (const literal of ["Demo Sınıfı", "7 öğrenci", "Örn. Denklem Çözümleri", "0/60", "0/200"]) {
        expect(source).not.toContain(literal);
      }
    }
    // The counters print the real length against the canonical cap.
    expect(code(SCREEN)).toContain("{title.length}/{MAX_ASSIGNMENT_TITLE_LENGTH}");
    expect(code(SCREEN)).toContain("{description.length}/{MAX_ASSIGNMENT_DESCRIPTION_LENGTH}");
  });

  it("adds no preview step beyond the real one, and no second content engine", () => {
    const screen = code(SCREEN);
    // The canonical preview is the prepared question set, and it is the only one.
    expect(screen).toContain("{preview.selected.length} soru hazırlandı");
    expect(screen).not.toMatch(/Önizleme ekranı|previewRoute|router\.push\(.*preview/i);
    expect(screen).not.toMatch(/fetchAssignmentQuestionPool|selectSmartAssignmentQuestions/);
  });
});

describe("§28/§29 the CTA says what it does, once", () => {
  it("prepares before it publishes, and never claims to have sent anything early", () => {
    const screen = code(SCREEN);
    expect(screen).toContain('label="Soruları Hazırla"');
    expect(screen).toContain('accessibilityHint="Seçtiğin kriterlere uyan soruları hazırlar; henüz kimseye gönderilmez"');
    expect(screen).toContain('label="Yayınla"');
    expect(screen).toContain('accessibilityHint="Çalışmayı öğrencilere gönderir"');
    expect(screen).toContain('accessibilityLabel="Taslak olarak kaydet"');
    expect(screen).toContain('accessibilityHint="Çalışmayı kaydeder; öğrencilere gönderilmez"');
    // "Devam Et" would name a step, not the operation; it is not used.
    expect(screen).not.toContain("Devam Et");
  });

  it("guards the second tap while a submit is in flight", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("const isBusy = isPreparing || isPublishing;");
    expect(screen).toContain("isLoading={isPreparing}");
    expect(screen).toContain("isLoading={isPublishing}");
    expect(screen).toContain("disabled={isBusy}");
    expect(screen).toContain("accessibilityState={{ disabled: isBusy }}");
    // PrimaryButton itself refuses a press while loading.
    const button = code("src/components/ui/PrimaryButton.tsx");
    expect(button).toContain("const isDisabled = disabled || isLoading;");
    expect(button).toContain("disabled={isDisabled}");
  });

  it("keeps the teacher's typing after a recoverable failure", () => {
    const screen = code(SCREEN);
    // The only state a failed prepare/publish touches is the error itself.
    expect(screen).toContain("function handleTitleChange(next: string) {");
    expect(screen).toContain("if (titleError && next.trim().length > 0) setTitleError(null);");
    expect(screen).not.toMatch(/setTitle\(""\)|setDescription\(""\)|reset\(\)/);
    // The server's words are shown, never swallowed or replaced by success.
    expect(screen).toContain("{error}");
    expect(screen).toContain('accessibilityRole="alert"');
    expect(screen).toContain("if (assignmentId) {");
  });

  it("lands on the created work through the existing destination", () => {
    expect(code(SCREEN)).toContain('pathname: "/(teacher)/class/[classId]/assignment/[assignmentId]"');
    expect(code(SCREEN)).toContain("router.replace({");
  });
});

describe("§33 the screen costs what it cost before", () => {
  it("reads the class and its roster once, and nothing else", () => {
    const screen = code(SCREEN);
    expect(screen.match(/getClassById\(/g)).toHaveLength(1);
    expect(screen.match(/getClassMembers\(/g)).toHaveLength(1);
    expect(screen).toContain("Promise.all([getClassById(classId), getClassMembers(classId)])");
    expect(screen).not.toMatch(/onSnapshot|useClassAssignments|useClassPerformance|useClassRoom/);
    for (const file of [STEPS, OPTION]) {
      expect(code(file)).not.toMatch(/firebase|firestore|useEffect|fetch/i);
    }
  });
});

describe("§38 accessibility", () => {
  it("wraps everything that can grow and clips nothing", () => {
    for (const file of PHASE_127_UI) {
      expect(code(file)).not.toMatch(/numberOfLines/);
    }
    const screen = code(SCREEN);
    // The multiline description grows from a floor rather than sitting at a
    // fixed height.
    expect(screen).toMatch(/multiline:\s*\{[^}]*minHeight: 96/);
    // No text-bearing container is pinned to a height (the one fixed box is
    // the class card's decorative 36pt icon square, which holds no words).
    for (const block of ["title", "subtitle", "className", "classMeta", "classLabel", "label", "help", "counter", "error", "previewTitle", "previewLine", "draftButtonText"]) {
      const match = screen.match(new RegExp(`^\\s+${block}:\\s*\\{([^{}]*)\\}`, "m"));
      expect(match?.[1] ?? "").not.toMatch(/\bheight:/);
    }
  });

  it("keeps the keyboard off the field and the CTA", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("<KeyboardAvoidingView");
    expect(screen).toContain('behavior={Platform.OS === "ios" ? "padding" : undefined}');
    expect(screen).toContain('keyboardShouldPersistTaps="handled"');
  });

  it("labels its controls, announces selection, and hides decoration", () => {
    const screen = code(SCREEN);
    // Inputs speak their label through the shared field primitive.
    expect(screen).toContain('label="Çalışma Başlığı"');
    expect(screen).toContain('label="Açıklama (isteğe bağlı)"');
    expect(screen).toContain(`accessibilityHint={\`Zorunlu alan. En fazla \${MAX_ASSIGNMENT_TITLE_LENGTH} karakter.\`}`);
    expect(code("src/components/ui/TextField.tsx")).toContain("accessibilityLabel={label}");
    // The option group is a radio group whose state is spoken, not coloured.
    expect(screen).toContain('accessibilityRole="radiogroup"');
    expect(code(OPTION)).toContain('accessibilityRole="radio"');
    expect(code(OPTION)).toContain("accessibilityState={{ selected, checked: selected }}");
    expect(code(OPTION)).toContain('name={selected ? "radio-button-on" : "radio-button-off"}');
    for (const file of [SCREEN, OPTION]) {
      for (const icon of code(file).match(/<Ionicons\b[\s\S]*?\/>/g) ?? []) {
        expect(icon).toContain("accessibilityElementsHidden");
      }
    }
  });

  it("restructures rather than squeezing at the accessibility text sizes", () => {
    expect(code(STEPS)).toContain("fontScale >= stackAtFontScale");
    expect(code(STEPS)).toContain("stacked ? styles.rowStacked : null");
    // Every control keeps the 44pt floor.
    expect(code(SCREEN)).toMatch(/backButton:\s*\{[^}]*minHeight: minTouchTarget/);
    expect(code(SCREEN)).toMatch(/draftButton:\s*\{[^}]*minHeight: minTouchTarget/);
    expect(code(OPTION)).toMatch(/card:\s*\{[^}]*minHeight: minTouchTarget/);
  });
});

describe("§13/§35 nothing else moved", () => {
  it("adds no gamification", () => {
    for (const file of PHASE_127_UI) {
      const source = code(file).toLocaleLowerCase("tr");
      expect(source).not.toMatch(/\bpuan|\bxp\b|rozet|leaderboard|liderlik|sıralama|ranking|ödül|seviye atla/);
    }
  });

  it("paints with theme tokens in both themes", () => {
    for (const file of PHASE_127_UI) {
      const source = code(file);
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|"white"|"black"|rgba\(/);
      expect(source.match(/fontSize:\s*\d+/g) ?? []).toEqual([]);
      expect(source).toContain("themedStyles(");
    }
  });

  it("changes no shared primitive and no semantic service", () => {
    // The composer consumes TextField/Chip/PrimaryButton/SectionHeader as they
    // are; its two new components are its own.
    expect(code(SCREEN)).toContain('import { TextField } from "@components/ui/TextField";');
    for (const file of PHASE_127_UI) {
      expect(code(file)).not.toMatch(
        /learningState|studentAttention|teacherIntervention|interventionEffectiveness|postInterventionAction|teacherActionCenter|teacherActionSummary|teacherToday|studentPerformance/,
      );
    }
  });
});
