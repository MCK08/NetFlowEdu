import {
  createOnceGuard,
  mcResultToStudyOutcome,
  shouldReportMcOutcome,
} from "../../src/features/study/services/multipleChoiceStudyBridge";

describe("mcResultToStudyOutcome — §16 correct/incorrect mapping", () => {
  it("maps a correct answer to 'solved'", () => {
    expect(mcResultToStudyOutcome("correct")).toBe("solved");
  });

  it("maps an incorrect answer to 'struggled'", () => {
    expect(mcResultToStudyOutcome("incorrect")).toBe("struggled");
  });
});

describe("shouldReportMcOutcome — §13 gating (authenticated student only)", () => {
  it("allows reporting for a real questionId and an authenticated student", () => {
    expect(shouldReportMcOutcome("q1", true)).toBe(true);
  });

  it("denies reporting with no questionId — legacy/untracked call sites keep prior behavior", () => {
    expect(shouldReportMcOutcome(undefined, true)).toBe(false);
    expect(shouldReportMcOutcome(null, true)).toBe(false);
    expect(shouldReportMcOutcome("", true)).toBe(false);
  });

  it("denies reporting for a non-student (e.g. a teacher viewing their own question)", () => {
    expect(shouldReportMcOutcome("q1", false)).toBe(false);
  });

  it("denies reporting when isStudent is unknown", () => {
    expect(shouldReportMcOutcome("q1", undefined)).toBe(false);
    expect(shouldReportMcOutcome("q1", null)).toBe(false);
  });
});

describe("createOnceGuard — §16 duplicate-interaction protection", () => {
  it("allows the FIRST call to proceed", () => {
    const guard = createOnceGuard();
    expect(guard.shouldProceed()).toBe(true);
  });

  it("denies every call after the first — the same UI interaction can never report twice", () => {
    const guard = createOnceGuard();
    guard.shouldProceed();
    expect(guard.shouldProceed()).toBe(false);
    expect(guard.shouldProceed()).toBe(false);
    expect(guard.shouldProceed()).toBe(false);
  });

  it("is independent per instance — a fresh guard (a new mount) starts unused again", () => {
    const first = createOnceGuard();
    first.shouldProceed();

    const second = createOnceGuard();
    expect(second.shouldProceed()).toBe(true);
  });
});
