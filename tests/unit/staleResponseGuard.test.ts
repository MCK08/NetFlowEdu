import { shouldApplyStaleResponse } from "../../src/features/study/services/staleResponseGuard";

// This repo has no hook-rendering test infrastructure (no
// react-test-renderer / @testing-library, and this pass adds neither) — so
// the four hooks that share this predicate (useStudyQueue,
// useReviewSession, useAdaptiveStudySession, useClassPerformance) cannot be
// rendered directly. What follows proves the GUARD LOGIC itself is correct
// under the exact out-of-order sequence that caused a real bug in a sibling
// hook (useSocialFeed.loadMore): request A starts, request B starts and
// supersedes it, B resolves, A resolves LATE.
describe("shouldApplyStaleResponse — out-of-order request settlement", () => {
  it("applies a response whose request id still matches the current one (no newer request started)", () => {
    expect(shouldApplyStaleResponse(1, 1)).toBe(true);
  });

  it("request A started, request B started and superseded it, B resolves first — B's response applies", () => {
    // requestIdRef progression: starts at 1 (A), bumped to 2 (B).
    const requestIdRef = { current: 1 };
    requestIdRef.current = 2; // B starts, supersedes A
    // B resolves — its own captured id (2) matches current (2).
    expect(shouldApplyStaleResponse(2, requestIdRef.current)).toBe(true);
  });

  it("request A resolves AFTER being superseded by B — A's stale response must NOT apply", () => {
    const requestIdRef = { current: 1 };
    const requestIdA = requestIdRef.current; // A captures 1
    requestIdRef.current = 2; // B starts before A resolves
    // A finally resolves late, still carrying its own captured id (1).
    expect(shouldApplyStaleResponse(requestIdA, requestIdRef.current)).toBe(false);
  });

  it("three overlapping requests — only the response matching the LATEST id applies", () => {
    const requestIdRef = { current: 0 };
    const idA = ++requestIdRef.current; // 1
    const idB = ++requestIdRef.current; // 2
    const idC = ++requestIdRef.current; // 3
    // All three resolve in an arbitrary order; only C's matches current.
    expect(shouldApplyStaleResponse(idA, requestIdRef.current)).toBe(false);
    expect(shouldApplyStaleResponse(idB, requestIdRef.current)).toBe(false);
    expect(shouldApplyStaleResponse(idC, requestIdRef.current)).toBe(true);
  });

  it("is a pure, deterministic comparison — repeated calls with the same input agree", () => {
    expect(shouldApplyStaleResponse(5, 5)).toBe(shouldApplyStaleResponse(5, 5));
    expect(shouldApplyStaleResponse(5, 6)).toBe(shouldApplyStaleResponse(5, 6));
  });
});
