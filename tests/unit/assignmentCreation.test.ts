import {
  resolveTargetStudentIds,
  validateAssignmentDraft,
} from "../../src/features/assignments/services/assignmentCreation";
import { MAX_ASSIGNMENT_STUDENTS } from "../../src/features/assignments/domain/assignmentTypes";

describe("resolveTargetStudentIds", () => {
  it("resolves 'all' to the full roster", () => {
    expect(resolveTargetStudentIds("all", ["a", "b", "c"], [])).toEqual(["a", "b", "c"]);
  });

  it("resolves 'selected' to exactly the teacher's picks", () => {
    expect(resolveTargetStudentIds("selected", ["a", "b", "c"], ["a", "c"])).toEqual(["a", "c"]);
  });

  it("dedupes a student id appearing twice in the source", () => {
    expect(resolveTargetStudentIds("selected", [], ["a", "a", "b"])).toEqual(["a", "b"]);
  });

  it("caps at MAX_ASSIGNMENT_STUDENTS", () => {
    const many = Array.from({ length: MAX_ASSIGNMENT_STUDENTS + 10 }, (_, i) => `s${i}`);
    expect(resolveTargetStudentIds("all", many, [])).toHaveLength(MAX_ASSIGNMENT_STUDENTS);
  });

  it("handles an empty roster/selection", () => {
    expect(resolveTargetStudentIds("all", [], [])).toEqual([]);
    expect(resolveTargetStudentIds("selected", ["a"], [])).toEqual([]);
  });
});

describe("validateAssignmentDraft", () => {
  const validInput = {
    title: "Denklemler Tekrarı",
    targetStudentIds: ["s1", "s2"],
    questionIds: ["q1", "q2"],
    description: null,
  };

  it("accepts a well-formed draft", () => {
    expect(validateAssignmentDraft(validInput)).toEqual({ valid: true, error: null });
  });

  it("rejects an empty or whitespace-only title", () => {
    expect(validateAssignmentDraft({ ...validInput, title: "" }).valid).toBe(false);
    expect(validateAssignmentDraft({ ...validInput, title: "   " }).valid).toBe(false);
  });

  it("rejects a title over the max length", () => {
    expect(validateAssignmentDraft({ ...validInput, title: "a".repeat(81) }).valid).toBe(false);
  });

  it("rejects a description over the max length", () => {
    expect(validateAssignmentDraft({ ...validInput, description: "a".repeat(301) }).valid).toBe(false);
  });

  it("rejects zero target students", () => {
    expect(validateAssignmentDraft({ ...validInput, targetStudentIds: [] }).valid).toBe(false);
  });

  it("rejects zero questions — the 'no matching questions' case", () => {
    const result = validateAssignmentDraft({ ...validInput, questionIds: [] });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("soru");
  });

  it("does not treat a smaller-than-requested question count as invalid, only zero", () => {
    // The caller passes whatever selectAssignmentQuestions ACTUALLY found —
    // 1 real question is a valid (if small) assignment, not an error.
    expect(validateAssignmentDraft({ ...validInput, questionIds: ["q1"] }).valid).toBe(true);
  });
});
