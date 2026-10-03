import { readFileSync } from "fs";
import { join } from "path";

import { ROUTES } from "../../src/constants/routes";
import type { Assignment, AssignmentSubmission } from "../../src/features/assignments/domain/assignmentTypes";
import {
  applyAssignmentCompletion,
  computeAssignmentProgress,
} from "../../src/features/assignments/services/assignmentProgress";
import {
  ASSIGNMENT_COMPLETE_TITLE,
  ASSIGNMENT_EMPTY_TITLE,
  ASSIGNMENT_INFO_LABEL,
  ASSIGNMENT_INSTRUCTION_TITLE,
  ASSIGNMENT_START_LABEL,
  assignmentCompletionLine,
  assignmentProgressAccessibilityLabel,
  assignmentSessionProgressLabel,
  buildAssignmentSessionIdentity,
  RETURN_TO_STUDY_LABEL,
  shouldOpenOnAssignmentIntro,
} from "../../src/features/assignments/services/assignmentSessionPresentation";
import { assignmentDueLabel } from "../../src/features/assignments/services/assignmentUrgency";
import { STUDY_OUTCOMES } from "../../src/features/study/domain/studyTypes";
import { mcResultToStudyOutcome } from "../../src/features/study/services/multipleChoiceStudyBridge";
import { resolveSessionHeaderHeight } from "../../src/features/study/services/studySessionLayout";

// Phase 130 — the student's assignment session, told in the product's own
// words and about the assignment it actually is.
//
// What this pins: "Çalışma", never "Ödev"; the assignment's title, subject,
// class, deadline and the teacher's note reach the student from the document
// that was already read; a started assignment resumes exactly as before; the
// completion speaks for the whole assignment, never for one visit; "Çalış'a
// Dön" goes to Çalış; and nothing about how a question is answered, how an
// outcome is recorded or how progress is written has moved.

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

const SCREEN = "src/features/study/screens/StudySessionScreen.tsx";
const HOOK = "src/features/assignments/hooks/useAssignmentSession.ts";
const CONTEXT = "src/features/assignments/components/AssignmentSessionContext.tsx";
const PRESENTATION = "src/features/assignments/services/assignmentSessionPresentation.ts";
const CARD = "src/features/study/components/StudySessionAdaptiveCard.tsx";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 3, 12);

function assignment(over: Partial<Assignment> = {}): Assignment {
  return {
    id: "a1",
    classId: "c1",
    organizationId: null,
    teacherId: "t1",
    title: "Denklemler Tekrarı",
    description: "Aşağıdaki denklemleri dikkatlice çöz.",
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "10",
    targetStudentIds: ["s1"],
    questionIds: ["q1", "q2", "q3", "q4", "q5"],
    targetCount: 5,
    dueAt: NOW + 5 * DAY,
    status: "published",
    createdAt: NOW - DAY,
    updatedAt: NOW - DAY,
    interventionOf: null,
    ...over,
  };
}

function submission(completed: string[]): AssignmentSubmission {
  return {
    studentId: "s1",
    completedQuestionIds: completed,
    completedCount: completed.length,
    startedAt: completed.length > 0 ? NOW - 2 * DAY : null,
    lastCompletedAt: completed.length > 0 ? NOW - DAY : null,
    completedAt: null,
    questionOutcomes: {},
  };
}

/** Everything the assignment mode draws after its Phase 129 states. */
function assignmentBranches(screen: string): string {
  return screen.slice(screen.indexOf("if (isAssignmentEmpty) {"), screen.indexOf("const HEADER_HEIGHT"));
}

function branch(screen: string, start: string, end: string): string {
  const from = screen.indexOf(start);
  const to = screen.indexOf(end, from + 1);
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return screen.slice(from, to);
}

describe("§10 §19 §20 the session speaks the product's language", () => {
  it("calls an assignment 'Çalışma' in the header, in every state", () => {
    const screen = code(SCREEN);
    expect(screen).toContain('{mode === "mandatory" ? "Tekrar" : "Çalışma"}');
    expect(screen).not.toMatch(/ödev/i);
    expect(code(HOOK)).not.toMatch(/ödev/i);
  });

  it("finishes as 'Çalışma Tamamlandı', with no emoji, and returns to Çalış", () => {
    expect(ASSIGNMENT_COMPLETE_TITLE).toBe("Çalışma Tamamlandı");
    expect(RETURN_TO_STUDY_LABEL).toBe("Çalış'a Dön");
    expect(ASSIGNMENT_EMPTY_TITLE).toBe("Bu çalışmada artık geçerli soru yok");
    const branches = assignmentBranches(code(SCREEN));
    expect(branches).not.toContain("Öğrenme Merkezine Dön");
    expect(branches).not.toContain("tamamlandı 🎉");
    expect(branches).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("sends 'Çalış'a Dön' to the Çalış tab the stack already holds", () => {
    const screen = code(SCREEN);
    expect(ROUTES.studentStudy).toBe("/(student)/(tabs)/study");
    expect(screen).toContain("const returnToStudy = useCallback(() => router.dismissTo(ROUTES.studentStudy as never), []);");
    const completion = branch(screen, "if (isAssignmentComplete) {", "if (showAssignmentIntro");
    expect(completion).toContain("<PrimaryButton label={RETURN_TO_STUDY_LABEL} onPress={returnToStudy} />");
    // One dominant action — no second CTA beside it.
    expect(completion.match(/<PrimaryButton/g)).toHaveLength(1);
  });
});

describe("§11-§13 the student can see which assignment this is", () => {
  it("builds the identity from the document's own fields", () => {
    const identity = buildAssignmentSessionIdentity({ assignment: assignment(), className: "Demo Sınıfı", now: NOW });
    expect(identity).toEqual({
      title: "Denklemler Tekrarı",
      subjectLine: "Matematik · Denklemler",
      contextLine: "10. sınıf · Demo Sınıfı",
      dueLabel: assignmentDueLabel(NOW + 5 * DAY, NOW),
      isPastDue: false,
      instruction: "Aşağıdaki denklemleri dikkatlice çöz.",
    });
  });

  it("leaves out what is missing instead of inventing it", () => {
    expect(buildAssignmentSessionIdentity({ assignment: assignment(), className: null, now: NOW }).contextLine).toBe(
      "10. sınıf",
    );
    const bare = buildAssignmentSessionIdentity({
      assignment: assignment({ subject: "", topic: " ", gradeLevel: "", description: null, dueAt: null }),
      className: null,
      now: NOW,
    });
    expect(bare.subjectLine).toBeNull();
    expect(bare.contextLine).toBeNull();
    expect(bare.dueLabel).toBeNull();
    expect(bare.instruction).toBeNull();
  });

  it("shows the teacher's instruction only when there is one, trimmed", () => {
    const blank = buildAssignmentSessionIdentity({ assignment: assignment({ description: "   \n " }), className: null, now: NOW });
    expect(blank.instruction).toBeNull();
    const padded = buildAssignmentSessionIdentity({ assignment: assignment({ description: "  Adımları yaz.  " }), className: null, now: NOW });
    expect(padded.instruction).toBe("Adımları yaz.");
    const context = code(CONTEXT);
    expect(ASSIGNMENT_INSTRUCTION_TITLE).toBe("Öğretmenin Talimatı");
    expect(context).toContain("{identity.instruction ? (");
    expect(context).toContain("{ASSIGNMENT_INSTRUCTION_TITLE}");
  });

  it("states the deadline with the canonical student label, past due included", () => {
    for (const dueAt of [NOW + 2 * 60 * 60 * 1000, NOW + DAY, NOW + 9 * DAY, NOW - DAY]) {
      const identity = buildAssignmentSessionIdentity({ assignment: assignment({ dueAt }), className: null, now: NOW });
      expect(identity.dueLabel).toBe(assignmentDueLabel(dueAt, NOW));
    }
    const late = buildAssignmentSessionIdentity({ assignment: assignment({ dueAt: NOW - DAY }), className: null, now: NOW });
    expect(late.dueLabel).toBe("Süresi geçti");
    expect(late.isPastDue).toBe(true);
    // No second date formatter and no invented countdown.
    for (const path of [PRESENTATION, CONTEXT]) {
      expect(code(path)).not.toContain("toLocaleDateString");
      expect(code(path)).not.toContain("gün kaldı");
    }
    expect(code(PRESENTATION)).toContain("dueLabel: assignmentDueLabel(assignment.dueAt, params.now),");
  });

  it("keeps the document it already read, and only one that was delivered", () => {
    const hook = code(HOOK);
    const gateAt = hook.indexOf("const access = resolveAssignmentSessionAccess(assignment);");
    const keptAt = hook.indexOf("setDeliveredAssignment(assignment);");
    expect(hook.indexOf("setDeliveredAssignment(null);")).toBeLessThan(gateAt);
    expect(keptAt).toBeGreaterThan(hook.indexOf("resolveQuestionMetadata(assignment.questionIds),"));
    expect(keptAt).toBeLessThan(hook.indexOf("deliveredRef.current = true;"));
    expect(hook.split("setDeliveredAssignment(assignment);")).toHaveLength(2);
    // Still exactly one read of the assignment itself.
    expect(hook.split("getAssignmentById(")).toHaveLength(2);
    expect(code(SCREEN)).toContain("const deliveredAssignment = isAssignmentMode ? assignmentSession.assignment : null;");
  });

  it("names the class with one bounded get, never a listener, and not for finished work", () => {
    const screen = code(SCREEN);
    expect(screen).toContain(
      "deliveredAssignment && !isAssignmentComplete && !isAssignmentEmpty ? deliveredAssignment.classId : undefined,",
    );
    expect(screen.split("useClassRoom(")).toHaveLength(2);
    const classRoomHook = code("src/features/classes/hooks/useClassRoom.ts");
    expect(classRoomHook).toContain("getClassById(classId)");
    expect(classRoomHook).not.toContain("onSnapshot");
    expect(screen).toContain("className: assignmentClass?.name ?? null,");
  });
});

describe("§14 §15 an unstarted assignment opens on its introduction; a started one resumes", () => {
  it("decides from the canonical progress alone", () => {
    expect(shouldOpenOnAssignmentIntro(computeAssignmentProgress(null, 5))).toBe(true);
    expect(shouldOpenOnAssignmentIntro(computeAssignmentProgress(submission([]), 5))).toBe(true);
    expect(shouldOpenOnAssignmentIntro(computeAssignmentProgress(submission(["q1"]), 5))).toBe(false);
    expect(shouldOpenOnAssignmentIntro(computeAssignmentProgress(submission(["q1", "q2", "q3"]), 5))).toBe(false);
  });

  it("is a state of the same screen: no route, no write, and 'Başla' only leaves it", () => {
    const screen = code(SCREEN);
    expect(ASSIGNMENT_START_LABEL).toBe("Başla");
    const intro = branch(screen, "if (showAssignmentIntro && assignmentIdentity && assignmentProgress) {", "  return (\n    <View style={styles.flex}>\n      <FlatList");
    expect(intro).toContain("onPress={() => setIsAssignmentIntroDismissed(true)}");
    expect(intro).not.toMatch(/recordProgress|router\.|<FlatList|<StudySessionAdaptiveCard/);
    expect(screen).toContain("!isAssignmentIntroDismissed &&");
    expect(screen).toContain("shouldOpenOnAssignmentIntro(assignmentProgress);");
  });

  it("leaves the resume order and the list geometry exactly as they were", () => {
    const hook = code(HOOK);
    expect(hook).toContain("...resolved.filter((question) => !completedSet.has(question.id)),");
    expect(hook.indexOf("!completedSet.has(question.id)")).toBeLessThan(hook.indexOf("...resolved.filter((question) => completedSet.has(question.id)),"));
    const screen = code(SCREEN);
    expect(screen).toContain("initialScrollIndex={isAssignmentMode ? undefined : adaptiveInitialIndex}");
    expect(screen).toContain("snapToOffsets={swipeSnapOffsets}");
    expect(screen).toContain("offset: computeSessionItemContentOffset(index, headerHeight, cardHeight),");
    expect(screen).toContain("ListHeaderComponent={<View style={{ height: headerHeight }} />}");
  });

  it("orders the states: closed and deleted, error, empty, completion, introduction, questions", () => {
    const screen = code(SCREEN);
    const order = [
      "if (isAssignmentGone) {",
      "if (isAssignmentUnavailable) {",
      "if (swipeError) {",
      "if (isAssignmentEmpty) {",
      "if (isAssignmentComplete) {",
      "if (showAssignmentIntro && assignmentIdentity && assignmentProgress) {",
      "<StudySessionAdaptiveCard",
    ].map((marker) => screen.indexOf(marker));
    expect(order).not.toContain(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe("§16 progress is the assignment's own, and says what it means", () => {
  it("counts from the submission in the Çalış row's own words", () => {
    expect(assignmentSessionProgressLabel(computeAssignmentProgress(null, 5))).toBe("5 soru");
    expect(assignmentSessionProgressLabel(computeAssignmentProgress(submission(["q1", "q2"]), 5))).toBe("2 / 5 tamamlandı");
    expect(assignmentProgressAccessibilityLabel(computeAssignmentProgress(submission(["q1", "q2"]), 5))).toBe(
      "5 sorudan 2 tanesi tamamlandı",
    );
  });

  it("shows the header's fraction only while questions are on screen, with a spoken label", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("isSolvingAssignment && assignmentProgress ? (");
    expect(screen).toContain("accessibilityLabel={assignmentProgressAccessibilityLabel(assignmentProgress)}");
    const solving = branch(screen, "const isSolvingAssignment =", "const [isAssignmentInfoOpen");
    expect(solving).toContain("assignmentIdentity !== null &&");
    expect(solving).toContain("!showAssignmentIntro;");
  });

  it("keeps the instruction one tap away for the rest of the session", () => {
    const screen = code(SCREEN);
    expect(ASSIGNMENT_INFO_LABEL).toBe("Çalışma bilgileri");
    expect(screen).toContain("const headerInfo = isSolvingAssignment ? (");
    expect(screen).toContain("accessibilityLabel={ASSIGNMENT_INFO_LABEL}");
    const sheet = branch(screen, "<BottomActionSheet visible={isAssignmentInfoOpen}", "</BottomActionSheet>");
    expect(sheet).toContain("<AssignmentSessionContext");
    expect(sheet).toContain("maxHeight: Math.round(windowHeight * 0.6)");
  });
});

describe("§7-§9 §17 how a question is answered has not moved", () => {
  it("solves through the same card and records the same outcome", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("if (isAssignmentMode) assignmentSession.recordProgress(question.id, outcome);");
    const card = code(CARD);
    expect(card).toContain("const operationId = await study.submit(outcome);");
    expect(card).toContain("<StudyOutcomeControls");
    expect(card).toContain("<StudyAnswerButton");
    expect(code("src/features/study/hooks/useStudyQuestionState.ts")).toContain(
      "await recordStudyOutcome(questionId, outcome, operation.operationId);",
    );
    expect(STUDY_OUTCOMES).toEqual(["again", "struggled", "solved"]);
  });

  it("adds no answer field, no check button and no automatic verdict", () => {
    for (const path of [SCREEN, CONTEXT, PRESENTATION, CARD]) {
      const source = code(path);
      expect(source).not.toMatch(/TextInput|Yanıtı Kontrol Et|Doğru!|Yanlış!|MultipleChoiceAnswer/);
    }
    // Multiple choice keeps its own inline mapping, outside the session.
    expect(mcResultToStudyOutcome("correct")).toBe("solved");
    expect(mcResultToStudyOutcome("incorrect")).toBe("struggled");
  });

  it("keeps progress idempotent: one question never counts twice", () => {
    const once = applyAssignmentCompletion(null, "q1", 5, NOW, "struggled");
    const twice = applyAssignmentCompletion(once, "q1", 5, NOW + 1000, "solved");
    expect(twice).toBe(once);
    expect(twice.completedCount).toBe(1);
    expect(twice.questionOutcomes).toEqual({ q1: "struggled" });
    expect(code(HOOK)).toContain("if (!deliveredRef.current) return;");
  });
});

describe("§18 §19 completion is the whole assignment's, and honest", () => {
  it("counts every question with an outcome as complete, never as 'solved'", () => {
    const done = computeAssignmentProgress(submission(["q1", "q2", "q3", "q4", "q5"]), 5);
    expect(assignmentCompletionLine(done)).toBe("5 / 5 soru tamamlandı");
    expect(code(SCREEN)).not.toContain("soru çözüldü");
  });

  it("draws no reflection, score or percentage of this visit", () => {
    const completion = branch(code(SCREEN), "if (isAssignmentComplete) {", "if (showAssignmentIntro");
    expect(completion).not.toMatch(/Reflection|receipts|%|puan|skor/i);
    expect(completion).toContain("{assignmentCompletionLine(assignmentProgress)}");
    expect(completion).toContain("{assignmentIdentity.title}");
    // The mark is decorative; the title is the heading.
    expect(completion).toContain('importantForAccessibility="no-hide-descendants"');
    expect(completion).toContain("<Text style={styles.completionTitle} accessibilityRole=\"header\">");
  });
});

describe("§22 §23 the Phase 129 states and the delivery lock are untouched", () => {
  it("still offers only the way back from a closed or deleted assignment", () => {
    const screen = code(SCREEN);
    const gone = branch(screen, "if (isAssignmentGone) {", "if (isAssignmentUnavailable) {");
    const closed = branch(screen, "if (isAssignmentUnavailable) {", "if (swipeError) {");
    for (const state of [gone, closed]) {
      expect(state).toContain('label="Geri Dön" onPress={goBack}');
      expect(state).not.toMatch(/Tekrar Dene|AssignmentSessionContext|useClassRoom/);
    }
    expect(branch(screen, "if (swipeError) {", "if (isAdaptiveEmpty) {")).toContain(
      'label="Tekrar Dene" onPress={swipeRefresh}',
    );
  });

  it("reads nothing more for an assignment that is not open", () => {
    const hook = code(HOOK);
    const gateAt = hook.indexOf("const access = resolveAssignmentSessionAccess(assignment);");
    const closed = hook.slice(gateAt, hook.indexOf("getMySubmission(assignmentId, uid),"));
    expect(closed).toContain("return;");
    expect(closed).not.toContain("setDeliveredAssignment(assignment);");
  });
});

describe("§25-§27 every size, both themes", () => {
  it("leaves the default header geometry exactly as it was", () => {
    // 59pt status bar; the header draws 8 + 44 + 8 below it.
    expect(resolveSessionHeaderHeight({ insetsTop: 59, reservedHeight: 48, designedHeight: 60, measuredHeight: 119 })).toBe(107);
    expect(resolveSessionHeaderHeight({ insetsTop: 59, reservedHeight: 48, designedHeight: 60, measuredHeight: 119.4 })).toBe(107);
    expect(resolveSessionHeaderHeight({ insetsTop: 59, reservedHeight: 48, designedHeight: 60, measuredHeight: null })).toBe(107);
    expect(resolveSessionHeaderHeight({ insetsTop: 0, reservedHeight: 48, designedHeight: 60, measuredHeight: Number.NaN })).toBe(48);
  });

  it("gives the card back exactly what larger text added to the header", () => {
    expect(resolveSessionHeaderHeight({ insetsTop: 59, reservedHeight: 48, designedHeight: 60, measuredHeight: 205 })).toBe(
      107 + 86,
    );
    expect(resolveSessionHeaderHeight({ insetsTop: 47, reservedHeight: 48, designedHeight: 60, measuredHeight: 150.2 })).toBe(
      95 + 44,
    );
  });

  it("measures the header and stacks it at the app's one threshold", () => {
    const screen = code(SCREEN);
    expect(screen).toContain("const isHeaderStacked = fontScale >= stackAtFontScale;");
    expect(screen).toContain("onLayout={handleHeaderLayout}");
    expect(screen).toContain("const HEADER_DESIGNED_HEIGHT = spacing.xs * 2 + minTouchTarget;");
    expect(screen).toMatch(/headerTitleStacked: \{\s*flex: 0,\s*\}/);
  });

  it("lets every new surface scroll and wrap rather than clip", () => {
    const screen = code(SCREEN);
    const completion = branch(screen, "if (isAssignmentComplete) {", "if (showAssignmentIntro");
    const intro = branch(screen, "if (showAssignmentIntro && assignmentIdentity && assignmentProgress) {", "  return (\n    <View style={styles.flex}>\n      <FlatList");
    expect(completion).toContain("<ScrollView");
    expect(intro).toContain("<ScrollView");
    // "Başla" sits under the scroll, reachable past a long note.
    expect(intro.indexOf("<PrimaryButton")).toBeGreaterThan(intro.indexOf("</ScrollView>"));
    for (const path of [SCREEN, CONTEXT]) {
      expect(code(path)).not.toContain("numberOfLines");
    }
  });

  it("uses theme tokens only, and never colour alone", () => {
    for (const path of [SCREEN, CONTEXT]) {
      expect(code(path)).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    }
    const context = code(CONTEXT);
    // Each mark sits beside the sentence that says it.
    expect(context.match(/accessibilityElementsHidden/g)).toHaveLength(2);
    expect(context).toContain("{identity.dueLabel}");
    expect(context).toContain("{progressLabel}");
  });
});
