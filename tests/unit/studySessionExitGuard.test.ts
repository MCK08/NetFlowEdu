import {
  OUTCOME_SUBMITTING_MESSAGE,
  resolveStudySessionExitGuard,
} from "../../src/features/study/services/studySessionExitGuard";

describe("resolveStudySessionExitGuard", () => {
  it("does not block when idle (no submission in flight)", () => {
    expect(resolveStudySessionExitGuard({ isSubmitting: false })).toEqual({
      blocked: false,
      message: "",
    });
  });

  it("blocks while an outcome submission is in flight", () => {
    expect(resolveStudySessionExitGuard({ isSubmitting: true })).toEqual({
      blocked: true,
      message: OUTCOME_SUBMITTING_MESSAGE,
    });
  });

  it("does not block once the request has settled (submitting flips back to false)", () => {
    // Covers both a successful completion and a failed request that's
    // already been caught — useReviewSession/useStudyQuestionState both
    // clear their submitting flag in a `finally`, success or failure alike,
    // so by the time isSubmitting is false the request is no longer
    // outstanding either way.
    expect(resolveStudySessionExitGuard({ isSubmitting: false })).toEqual({
      blocked: false,
      message: "",
    });
  });

  it("transitions true -> false correctly across repeated resolution (no stuck guard)", () => {
    const submitting = resolveStudySessionExitGuard({ isSubmitting: true });
    const settled = resolveStudySessionExitGuard({ isSubmitting: false });
    expect(submitting.blocked).toBe(true);
    expect(settled.blocked).toBe(false);
  });

  it("is a pure, deterministic function", () => {
    expect(resolveStudySessionExitGuard({ isSubmitting: true })).toEqual(
      resolveStudySessionExitGuard({ isSubmitting: true }),
    );
    expect(resolveStudySessionExitGuard({ isSubmitting: false })).toEqual(
      resolveStudySessionExitGuard({ isSubmitting: false }),
    );
  });
});
