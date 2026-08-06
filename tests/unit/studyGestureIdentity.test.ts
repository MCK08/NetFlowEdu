import { resolveGestureOperation } from "../../src/features/study/services/gestureOperationId";
import {
  scopedValue,
  scopeToQuestion,
} from "../../src/features/study/services/questionScopedState";

// The backend replay guard (functions/src/study/operationId.ts) collapses two
// calls carrying the same operationId into ONE recorded review. So deciding
// when to reuse an id decides whether a review is double-counted or an answer
// is silently dropped — these are correctness tests, not formatting ones.

describe("resolveGestureOperation", () => {
  it("mints an id when there is no previous gesture", () => {
    const operation = resolveGestureOperation(null, "q1", "solved");
    expect(operation.questionId).toBe("q1");
    expect(operation.outcome).toBe("solved");
    expect(operation.operationId).toEqual(expect.any(String));
  });

  it("reuses the id when the SAME button is pressed again on the same question", () => {
    // The retry case. If the first call committed and only its response was
    // lost, reusing the id makes the server return the stored state instead
    // of recording a second review for one question.
    const first = resolveGestureOperation(null, "q1", "solved");
    const retry = resolveGestureOperation(first, "q1", "solved");
    expect(retry.operationId).toBe(first.operationId);
  });

  it("mints a NEW id when the student picks a different outcome", () => {
    // "Changed my mind", not "retry". Reusing here would make the server
    // replay the first outcome and silently discard the answer the student
    // actually gave the second time.
    const first = resolveGestureOperation(null, "q1", "solved");
    const changed = resolveGestureOperation(first, "q1", "again");
    expect(changed.operationId).not.toBe(first.operationId);
    expect(changed.outcome).toBe("again");
  });

  it("mints a NEW id for a different question", () => {
    // The class feed swipe case: a failed gesture on q1 leaves its id in the
    // ref, and the next press happens on q2.
    const first = resolveGestureOperation(null, "q1", "solved");
    const other = resolveGestureOperation(first, "q2", "solved");
    expect(other.operationId).not.toBe(first.operationId);
    expect(other.questionId).toBe("q2");
  });

  it("produces ids the backend validator accepts", () => {
    // Must match OPERATION_ID_PATTERN in functions/src/study/operationId.ts —
    // recordStudyOutcome REJECTS a malformed id rather than ignoring it, so a
    // drifting generator here would break every submission.
    const pattern = /^[A-Za-z0-9_-]{8,64}$/;
    for (let i = 0; i < 200; i += 1) {
      expect(resolveGestureOperation(null, "q1", "solved").operationId).toMatch(pattern);
    }
  });

  it("does not collide across rapid successive gestures", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      ids.add(resolveGestureOperation(null, "q1", "solved").operationId);
    }
    // A collision would make an unrelated gesture look like a replay and get
    // silently swallowed by the server's guard.
    expect(ids.size).toBe(500);
  });
});

describe("questionScopedState", () => {
  it("surfaces a value for the question it belongs to", () => {
    const pending = scopeToQuestion("q1", "solved");
    expect(scopedValue(pending, "q1")).toBe("solved");
  });

  it("hides a value belonging to a different question", () => {
    // The class feed keeps one hook alive across a swipe: without scoping,
    // q1's in-flight spinner and error message render on q2's card.
    const pending = scopeToQuestion("q1", "solved");
    expect(scopedValue(pending, "q2")).toBeNull();
  });

  it("hides everything when no question is active", () => {
    expect(scopedValue(scopeToQuestion("q1", "solved"), null)).toBeNull();
  });

  it("is null when nothing is held", () => {
    expect(scopedValue(null, "q1")).toBeNull();
  });
});
