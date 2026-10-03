import { readFileSync } from "fs";
import { join } from "path";

import type { Assignment } from "../../src/features/assignments/domain/assignmentTypes";
import { buildPublishConfirmation, PUBLISH_FAILED_MESSAGE } from "../../src/features/assignments/services/assignmentPublishMessages";
import {
  isAssignmentDeliveredToStudents,
  resolveAssignmentSessionAccess,
  selectDraftAssignments,
} from "../../src/features/assignments/services/assignmentStatus";
import { selectClassAssignments } from "../../src/features/classes/services/classSocial";
import { upcomingAssignments } from "../../src/features/teacher/services/teacherToday";

// Phase 129 — the draft lifecycle, made to do what the composer has always
// promised: a draft is the teacher's, a published assignment is the students'.
//
// What this pins: one predicate decides delivery; every student list applies it
// before it reads a single submission; a student who opens a draft or an
// archived assignment from a stale link reads nothing and writes nothing; a
// deleted assignment is not offered a retry; the teacher can find a draft again
// and send it through the write that already existed, once, after confirming
// what it will do; and nothing about rules, indexes or the composer moved.

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

const STUDENT_LIST_HOOK = "src/features/assignments/hooks/useStudentAssignments.ts";
const SESSION_HOOK = "src/features/assignments/hooks/useAssignmentSession.ts";
const SESSION_SCREEN = "src/features/study/screens/StudySessionScreen.tsx";
const DETAIL = "src/features/assignments/screens/AssignmentDetailScreen.tsx";
const PUBLISH_HOOK = "src/features/assignments/hooks/usePublishAssignment.ts";
const CLASS_DETAIL = "src/features/classes/screens/TeacherClassDetailScreen.tsx";
const COMPOSER = "src/features/assignments/screens/CreateAssignmentScreen.tsx";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 3, 12);

function make(over: Partial<Assignment>): Assignment {
  return {
    id: "a",
    classId: "c1",
    organizationId: null,
    teacherId: "t1",
    title: "Denklemler",
    description: null,
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "10",
    targetStudentIds: ["s1", "s2"],
    questionIds: ["q1", "q2"],
    targetCount: 2,
    dueAt: NOW + 3 * DAY,
    status: "published",
    createdAt: NOW - DAY,
    updatedAt: NOW - DAY,
    interventionOf: null,
    ...over,
  };
}

describe("§7 one predicate decides what has been sent", () => {
  it("delivers a published assignment, and never a draft or an archived one", () => {
    expect(isAssignmentDeliveredToStudents({ status: "published" })).toBe(true);
    expect(isAssignmentDeliveredToStudents({ status: "draft" })).toBe(false);
    expect(isAssignmentDeliveredToStudents({ status: "archived" })).toBe(false);
  });

  it("is the rule the student class page already applied — same answers, one definition", () => {
    const published = make({ id: "p" });
    const draft = make({ id: "d", status: "draft" });
    const archived = make({ id: "x", status: "archived" });
    expect(selectClassAssignments([published, draft, archived], "c1").map((a) => a.id)).toEqual(["p"]);
    expect(code("src/features/classes/services/classSocial.ts")).toContain(
      "isAssignmentDeliveredToStudents(assignment)",
    );
  });
});

describe("§8/§17 student lists drop drafts BEFORE reading any submission", () => {
  it("filters the targeted assignments, then reads submissions only for what was sent", () => {
    const hook = code(STUDENT_LIST_HOOK);
    expect(hook).toContain(
      "const assignments = (await getStudentAssignments(uid)).filter(isAssignmentDeliveredToStudents);",
    );
    const filterAt = hook.indexOf(".filter(isAssignmentDeliveredToStudents)");
    const fanOutAt = hook.indexOf("getMySubmission(assignment.id, uid)");
    expect(filterAt).toBeGreaterThan(-1);
    expect(fanOutAt).toBeGreaterThan(filterAt);
  });

  it("feeds every student surface that lists assigned work", () => {
    // Çalış (through the plan), Akış, the atlas: all through the one hook.
    for (const consumer of [
      "src/features/studyPlan/hooks/useStudyPlan.ts",
      "src/features/feed/screens/FeedScreen.tsx",
      "src/features/study/screens/LearningAtlasScreen.tsx",
    ]) {
      expect(code(consumer)).toContain("useStudentAssignments(uid)");
    }
    // Nothing else reads a student's assignments around it, except the class
    // page, which applies the same predicate through selectClassAssignments.
    expect(code("src/features/classes/hooks/useClassSocial.ts")).toContain("getStudentAssignments(uid)");
    expect(code("src/features/classes/screens/StudentClassDetailScreen.tsx")).toContain(
      "selectClassAssignments(social.assignments, classId)",
    );
  });
});

describe("§19-§22 a student's session opens only what was sent", () => {
  it("decides access from the document alone", () => {
    expect(resolveAssignmentSessionAccess(null)).toBe("not_found");
    expect(resolveAssignmentSessionAccess({ status: "draft" })).toBe("unavailable");
    expect(resolveAssignmentSessionAccess({ status: "archived" })).toBe("unavailable");
    expect(resolveAssignmentSessionAccess({ status: "published" })).toBe("open");
  });

  it("reads the assignment alone first, and reads nothing else unless it is open", () => {
    const hook = code(SESSION_HOOK);
    expect(hook).toContain("const assignment = await getAssignmentById(assignmentId);");
    const gateAt = hook.indexOf("const access = resolveAssignmentSessionAccess(assignment);");
    const readsAt = hook.indexOf("getMySubmission(assignmentId, uid),");
    const resolveAt = hook.indexOf("resolveQuestionMetadata(assignment.questionIds),");
    expect(gateAt).toBeGreaterThan(-1);
    expect(readsAt).toBeGreaterThan(gateAt);
    expect(resolveAt).toBeGreaterThan(gateAt);
    // The submission is no longer read in parallel with the document.
    expect(hook).not.toMatch(/Promise\.all\(\[\s*getAssignmentById/);
    // A closed assignment ends the load with nothing to render.
    const closedBranch = hook.slice(gateAt, readsAt);
    expect(closedBranch).toContain("setQuestions([]);");
    expect(closedBranch).toContain('if (access === "not_found") setNotFound(true);');
    expect(closedBranch).toContain("else setUnavailable(true);");
    expect(closedBranch).toContain("return;");
  });

  it("can never write progress to an assignment it has not confirmed was sent", () => {
    const hook = code(SESSION_HOOK);
    expect(hook).toContain("if (!deliveredRef.current) return;");
    // The one place it becomes true is after a successful, open load.
    expect(hook.split("deliveredRef.current = true;")).toHaveLength(2);
    expect(hook.indexOf("deliveredRef.current = true;")).toBeGreaterThan(hook.indexOf("setSubmission(mySubmission);"));
    expect(hook).toContain("deliveredRef.current = false;");
  });

  it("shows the closed and the deleted states without cards, and retries only a failed load", () => {
    const screen = code(SESSION_SCREEN);
    expect(screen).toContain('export const ASSIGNMENT_UNAVAILABLE_TITLE = "Bu çalışma şu an açık değil";');
    expect(screen).toContain('export const ASSIGNMENT_GONE_TITLE = "Bu çalışma artık mevcut değil";');
    const goneAt = screen.indexOf("if (isAssignmentGone) {");
    const closedAt = screen.indexOf("if (isAssignmentUnavailable) {");
    const errorAt = screen.indexOf("if (swipeError) {");
    const feedAt = screen.indexOf("<StudySessionAdaptiveCard");
    expect(goneAt).toBeGreaterThan(-1);
    expect(closedAt).toBeGreaterThan(goneAt);
    expect(errorAt).toBeGreaterThan(closedAt);
    expect(feedAt).toBeGreaterThan(errorAt);
    const goneBranch = screen.slice(goneAt, closedAt);
    const closedBranch = screen.slice(closedAt, errorAt);
    for (const branch of [goneBranch, closedBranch]) {
      expect(branch).toContain('label="Geri Dön" onPress={goBack}');
      expect(branch).not.toContain("Tekrar Dene");
    }
    expect(screen.slice(errorAt, feedAt)).toContain('label="Tekrar Dene" onPress={swipeRefresh}');
  });

  it("stays a nested screen, outside the student tab bar", () => {
    const route = "app/(student)/assignment/[assignmentId].tsx";
    expect(read(route)).toContain('<StudySessionScreen mode="assignment"');
    expect(route).not.toContain("(tabs)");
  });
});

describe("§9-§14 the teacher sends a draft, once, knowing what it will do", () => {
  it("names the draft and hides everything a draft cannot have", () => {
    const detail = code(DETAIL);
    expect(detail).toContain('export const DRAFT_NOTICE = "Bu çalışma henüz yayınlanmadı. Öğrenciler göremez.";');
    expect(detail).toContain('const isDraft = assignment.status === "draft";');
    // The response summary, its CTA, the outcome and the follow-up are all
    // behind !isDraft.
    expect(detail).toContain("{isDraft ? null : (");
    expect(detail).toContain('!isDraft && outcomeInsights && outcomeInsights.effectiveness !== "insufficient_data"');
    expect(detail).toContain("!isDraft && followUp.length > 0");
    // The student view of a draft lists who it is for, never progress.
    const draftStudents = detail.slice(
      detail.indexOf('tab === "students" && isDraft'),
      detail.indexOf('tab === "students" && !isDraft'),
    );
    expect(draftStudents).toContain("Hedef Öğrenciler");
    expect(draftStudents).not.toMatch(/AssignmentStudentRow|completedCount|status/);
  });

  it("makes 'Yayınla' the draft's one action, through the write that already existed", () => {
    const detail = code(DETAIL);
    expect(detail).toContain('export const PUBLISH_LABEL = "Yayınla";');
    expect(detail).toContain("onPress={confirmPublish}");
    expect(detail).toContain("isLoading={publishing.isPublishing}");
    const hook = code(PUBLISH_HOOK);
    expect(hook).toContain('await updateAssignmentStatus(assignmentId, "published");');
    // Nothing else is written, and no new service exists for it.
    expect(hook).not.toMatch(/setDoc|updateDoc|addDoc|httpsCallable|writeBatch/);
    expect(read("src/features/assignments/services/assignmentService.ts")).toContain(
      'await updateDoc(doc(db, "assignments", assignmentId), { status, updatedAt: serverTimestamp() });',
    );
  });

  it("asks first, with the real target count and an honest past-deadline line", () => {
    expect(buildPublishConfirmation({ targetStudentCount: 6, isPastDue: false, dueDateLabel: "14 Ekim 2026" })).toEqual({
      title: "Çalışma yayınlansın mı?",
      message: "6 öğrenciye gönderilecek ve Çalış ekranlarında görünecek.",
    });
    expect(buildPublishConfirmation({ targetStudentCount: 2, isPastDue: true, dueDateLabel: "12 Ekim 2026" }).message).toBe(
      '2 öğrenciye gönderilecek ve Çalış ekranlarında görünecek.\n\nSon tarihi geçmiş (12 Ekim 2026). Öğrenciler bunu "Süresi geçti" olarak görecek.',
    );
    // No deadline at all means no deadline line.
    expect(buildPublishConfirmation({ targetStudentCount: 2, isPastDue: false, dueDateLabel: null }).message).not.toContain(
      "Son tarihi",
    );
    const detail = code(DETAIL);
    expect(detail).toContain("targetStudentCount: assignment.targetStudentIds.length,");
    expect(detail).toContain("isPastDue: isPastDue(assignment.dueAt, Date.now()),");
    expect(detail).toContain("dueDateLabel: formatDueDate(assignment.dueAt),");
    expect(detail).toContain('{ text: "Vazgeç", style: "cancel" }');
    expect(detail).toContain("{ text: PUBLISH_LABEL, onPress: () => void publishing.publish(id) }");
  });

  it("publishes at most once, even on a double tap", () => {
    const hook = code(PUBLISH_HOOK);
    expect(hook).toContain("if (inFlight.current) return false;");
    expect(hook).toContain("inFlight.current = true;");
    expect(hook).toContain("inFlight.current = false;");
    expect(code(DETAIL)).toContain("if (!assignment || publishing.isPublishing) return;");
  });

  it("re-reads the stored state on success and keeps the draft on failure", () => {
    const hook = code(PUBLISH_HOOK);
    expect(hook.indexOf("await onPublished();")).toBeGreaterThan(hook.indexOf("updateAssignmentStatus("));
    expect(hook).toContain("setError(PUBLISH_FAILED_MESSAGE);");
    expect(PUBLISH_FAILED_MESSAGE).toBe("Yayınlanamadı. Tekrar dene.");
    expect(code(DETAIL)).toContain("usePublishAssignment(refresh)");
    expect(code(DETAIL)).toContain('accessibilityRole="alert"');
  });

  it("offers no publish in an archived class, and says why", () => {
    const detail = code(DETAIL);
    expect(detail).toContain('const isClassArchived = classRoom?.status === "archived";');
    expect(detail).toContain("Bu sınıf arşivlendiği için çalışma yayınlanamaz.");
  });
});

describe("§15/§16 the teacher can find a draft again — in the class, not in Bugün", () => {
  it("selects a class's drafts, newest first, and nothing else", () => {
    const drafts = selectDraftAssignments([
      make({ id: "old", status: "draft", createdAt: 1 }),
      make({ id: "pub", status: "published", createdAt: 5 }),
      make({ id: "new", status: "draft", createdAt: 9 }),
      make({ id: "arc", status: "archived", createdAt: 7 }),
    ]);
    expect(drafts.map((a) => a.id)).toEqual(["new", "old"]);
  });

  it("lists them under Sınıf İşleri, opening the existing detail", () => {
    const screen = code(CLASS_DETAIL);
    expect(screen).toContain('export const CLASS_DRAFTS_TITLE = "Taslaklar";');
    expect(screen).toContain("selectDraftAssignments(attention.assignments)");
    expect(screen).toContain("detail={`Taslak · ${draft.targetCount} soru`}");
    expect(screen).toContain("params: { classId, assignmentId: draft.id },");
    // After the work rows, before the roster.
    expect(screen.indexOf("CLASS_DRAFTS_TITLE}")).toBeGreaterThan(screen.indexOf('title="Yorum İncelemeleri"'));
    expect(screen.indexOf("CLASS_DRAFTS_TITLE}")).toBeLessThan(screen.indexOf("CLASS_STUDENTS_TITLE}"));
  });

  it("keeps Bugün's work list published-only", () => {
    const rows = upcomingAssignments(
      [make({ id: "d", status: "draft" }), make({ id: "p", status: "published" })],
      NOW,
    );
    expect(rows.map((row) => row.id)).toEqual(["p"]);
  });
});

describe("§24/§25 nothing outside the lifecycle moved", () => {
  it("keeps the composer's promise and its draft button exactly as Phase 127 left them", () => {
    const composer = code(COMPOSER);
    expect(composer).toContain('onPress={() => handlePublish("draft")}');
    expect(composer).toContain('accessibilityHint="Çalışmayı kaydeder; öğrencilere gönderilmez"');
    expect(composer).toContain('onPress={() => handlePublish("published")}');
  });

});
