import { runGuardedOnce } from "@features/authentication/services/guardedAction";

describe("runGuardedOnce", () => {
  it("runs the action and returns its result on a normal call", async () => {
    const ref = { current: false };
    const result = await runGuardedOnce(ref, async () => "done");
    expect(result).toBe("done");
    expect(ref.current).toBe(false); // released afterward
  });

  // Regression coverage: the VerifyEmailScreen "Çıkış Yap" button (and the
  // resend button) must never fire two overlapping calls from a rapid
  // double-tap — a plain `isX` boolean READ from React state can't prevent
  // this because state updates aren't synchronous.
  it("a second call that arrives while the first is still in flight is a no-op — never runs the action twice concurrently", async () => {
    const ref = { current: false };
    let concurrentRuns = 0;
    let maxConcurrentRuns = 0;
    let resolveFirst!: () => void;

    const action = jest.fn(async () => {
      concurrentRuns++;
      maxConcurrentRuns = Math.max(maxConcurrentRuns, concurrentRuns);
      await new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      concurrentRuns--;
      return "ok";
    });

    const firstCall = runGuardedOnce(ref, action);
    const secondCall = runGuardedOnce(ref, action); // fired before first resolves

    resolveFirst();
    const [first, second] = await Promise.all([firstCall, secondCall]);

    expect(action).toHaveBeenCalledTimes(1);
    expect(maxConcurrentRuns).toBe(1);
    expect(first).toBe("ok");
    expect(second).toBeUndefined(); // silently skipped, not queued/errored
  });

  it("releases the guard even when the action throws, so a later retry can still run", async () => {
    const ref = { current: false };
    await expect(
      runGuardedOnce(ref, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(ref.current).toBe(false);

    const result = await runGuardedOnce(ref, async () => "retried");
    expect(result).toBe("retried");
  });

  it("a call after the first one fully completes is allowed (guard only blocks concurrent overlap, not sequential reuse)", async () => {
    const ref = { current: false };
    const action = jest.fn(async () => "value");

    await runGuardedOnce(ref, action);
    await runGuardedOnce(ref, action);

    expect(action).toHaveBeenCalledTimes(2);
  });
});
