import {
  resolveAssignmentSessionCompletion,
  resolveResumeIndex,
} from "../../src/features/assignments/services/assignmentSessionCompletion";

const ALL = ["q1", "q2", "q3", "q4"];

function completion(resolvable: string[], completed: string[], targetCount = 4) {
  return resolveAssignmentSessionCompletion({
    resolvableQuestionIds: resolvable,
    completedQuestionIds: completed,
    targetCount,
  });
}

describe("resolveAssignmentSessionCompletion — continuation counts", () => {
  it("0/N — nothing completed", () => {
    const result = completion(ALL, []);
    expect(result).toEqual({
      isComplete: false,
      completedCount: 0,
      resolvableCount: 4,
      targetCount: 4,
      unavailableCount: 0,
    });
  });

  it("partial — some completed", () => {
    expect(completion(ALL, ["q1", "q2"]).completedCount).toBe(2);
    expect(completion(ALL, ["q1", "q2"]).isComplete).toBe(false);
  });

  it("nearly complete — one left", () => {
    expect(completion(ALL, ["q1", "q2", "q3"]).isComplete).toBe(false);
  });

  it("complete — every resolvable question answered", () => {
    const result = completion(ALL, ALL);
    expect(result.isComplete).toBe(true);
    expect(result.completedCount).toBe(4);
  });
});

describe("resolveAssignmentSessionCompletion — the deleted-question dead end (Phase 38 regression)", () => {
  // Reproduced against the emulator before the fix: an assignment with
  // targetCount 4 whose snapshot named 2 since-deleted questions rendered 2
  // answerable cards and a header reading "0 / 4". Answering both reached
  // "2 / 4" and `completedCount >= targetCount` stayed false forever, so the
  // student hit the end of the list with no completion screen.
  it("COMPLETES once every ANSWERABLE question is done, even though targetCount is higher", () => {
    const result = completion(["q1", "q2"], ["q1", "q2"], 4);
    expect(result.isComplete).toBe(true);
    expect(result.completedCount).toBe(2);
    expect(result.resolvableCount).toBe(2);
    expect(result.targetCount).toBe(4);
    expect(result.unavailableCount).toBe(2);
  });

  it("is NOT complete while an answerable question is still pending", () => {
    expect(completion(["q1", "q2"], ["q1"], 4).isComplete).toBe(false);
  });

  it("reports unavailableCount so the UI can explain the shortfall honestly", () => {
    expect(completion(["q1"], [], 4).unavailableCount).toBe(3);
  });

  it("never reports a negative unavailableCount when more resolved than targetCount claims", () => {
    expect(completion(["q1", "q2", "q3"], [], 2).unavailableCount).toBe(0);
  });
});

describe("resolveAssignmentSessionCompletion — degenerate and hostile inputs", () => {
  it("an assignment with NOTHING answerable is not 'complete' — that is the empty state", () => {
    const result = completion([], [], 4);
    expect(result.isComplete).toBe(false);
    expect(result.resolvableCount).toBe(0);
  });

  it("an empty assignment with completions recorded is still not complete", () => {
    expect(completion([], ["q1"], 4).isComplete).toBe(false);
  });

  it("ignores completions for questions no longer in the session (stale submission entries)", () => {
    const result = completion(["q1", "q2"], ["q1", "q2", "q-deleted", "q-other"], 4);
    expect(result.completedCount).toBe(2);
    expect(result.isComplete).toBe(true);
  });

  it("counts a DUPLICATE resolvable id only once", () => {
    const result = completion(["q1", "q1", "q2"], ["q1"], 3);
    expect(result.resolvableCount).toBe(2);
    expect(result.completedCount).toBe(1);
    expect(result.isComplete).toBe(false);
  });

  it("a duplicated id that is completed does not double-count into completion", () => {
    const result = completion(["q1", "q1"], ["q1"], 2);
    expect(result.resolvableCount).toBe(1);
    expect(result.completedCount).toBe(1);
    expect(result.isComplete).toBe(true);
  });

  it("treats a zero/negative/NaN targetCount defensively without throwing", () => {
    expect(completion(["q1"], ["q1"], 0).targetCount).toBe(0);
    expect(completion(["q1"], ["q1"], -5).targetCount).toBe(0);
    expect(completion(["q1"], ["q1"], Number.NaN).targetCount).toBe(0);
  });

  it("is deterministic and does not mutate its inputs", () => {
    const resolvable = ["q1", "q2"];
    const completed = ["q1"];
    const a = completion(resolvable, completed, 2);
    const b = completion(resolvable, completed, 2);
    expect(a).toEqual(b);
    expect(resolvable).toEqual(["q1", "q2"]);
    expect(completed).toEqual(["q1"]);
  });
});

describe("resolveResumeIndex", () => {
  it("resumes at the first incomplete question", () => {
    expect(resolveResumeIndex(ALL, ["q1", "q2"])).toBe(2);
  });

  it("resumes at 0 when nothing is completed", () => {
    expect(resolveResumeIndex(ALL, [])).toBe(0);
  });

  it("resumes at the first GAP, not the end, when completed out of order", () => {
    expect(resolveResumeIndex(ALL, ["q2", "q3"])).toBe(0);
  });

  it("returns 0 when everything is complete (the completion screen takes over)", () => {
    expect(resolveResumeIndex(ALL, ALL)).toBe(0);
  });

  it("returns 0 for an empty question list", () => {
    expect(resolveResumeIndex([], [])).toBe(0);
  });

  it("ignores completions for questions not in the list", () => {
    expect(resolveResumeIndex(["q1"], ["q-other"])).toBe(0);
  });
});
