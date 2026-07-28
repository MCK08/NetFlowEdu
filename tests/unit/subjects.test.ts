import {
  CLASS_QUESTION_SUBJECTS,
  isKnownClassQuestionSubject,
} from "@features/classes/services/subjects";

describe("CLASS_QUESTION_SUBJECTS", () => {
  it("is a non-empty list of distinct subjects", () => {
    expect(CLASS_QUESTION_SUBJECTS.length).toBeGreaterThan(0);
    expect(new Set(CLASS_QUESTION_SUBJECTS).size).toBe(CLASS_QUESTION_SUBJECTS.length);
  });

  it("includes a catch-all 'Diğer' option", () => {
    expect(CLASS_QUESTION_SUBJECTS).toContain("Diğer");
  });
});

describe("isKnownClassQuestionSubject", () => {
  it("accepts every subject in the fixed list", () => {
    for (const subject of CLASS_QUESTION_SUBJECTS) {
      expect(isKnownClassQuestionSubject(subject)).toBe(true);
    }
  });

  it("rejects an arbitrary string not in the list", () => {
    expect(isKnownClassQuestionSubject("Astroloji")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isKnownClassQuestionSubject("")).toBe(false);
  });
});
