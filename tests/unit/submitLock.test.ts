import { createSubmitLock } from "@utils/submitLock";

// Phase 75 — the contract that closes the question-upload double-submit.
//
// The vulnerable pattern these tests exist to rule out is `if (isUploading)
// return`, where `isUploading` is React state: a handler closes over the
// value from the render that created it, so two taps landing before the next
// render commits both read the stale `false`. The scenarios below are written
// as that exact sequence — two acquires with no release between them —
// because that is what a double-tap actually does.
describe("createSubmitLock", () => {
  it("lets the first caller through", () => {
    expect(createSubmitLock().acquire()).toBe(true);
  });

  it("refuses a second caller while the first is still in flight", () => {
    const lock = createSubmitLock();
    expect(lock.acquire()).toBe(true);
    expect(lock.acquire()).toBe(false);
  });

  it("refuses every caller in a burst, not just the second", () => {
    const lock = createSubmitLock();
    const results = [lock.acquire(), lock.acquire(), lock.acquire(), lock.acquire()];
    expect(results).toEqual([true, false, false, false]);
  });

  it("lets a genuinely new attempt through after release", () => {
    const lock = createSubmitLock();
    lock.acquire();
    lock.release();
    expect(lock.acquire()).toBe(true);
  });

  it("reports whether a run is in flight", () => {
    const lock = createSubmitLock();
    expect(lock.isLocked()).toBe(false);
    lock.acquire();
    expect(lock.isLocked()).toBe(true);
    lock.release();
    expect(lock.isLocked()).toBe(false);
  });

  it("tolerates a release with nothing in flight", () => {
    const lock = createSubmitLock();
    expect(() => lock.release()).not.toThrow();
    expect(lock.acquire()).toBe(true);
  });

  it("gives each lock its own state, so one screen cannot block another", () => {
    const a = createSubmitLock();
    const b = createSubmitLock();
    a.acquire();
    expect(b.acquire()).toBe(true);
  });
});

// Models the three composers' actual call order. `run` is the whole
// submitDetails body: acquire, await the write, release in `finally`.
describe("the composer submit sequence", () => {
  function makeComposer(write: () => Promise<void>) {
    const lock = createSubmitLock();
    return async function submit(): Promise<"ran" | "blocked"> {
      if (!lock.acquire()) return "blocked";
      try {
        await write();
        return "ran";
      } finally {
        lock.release();
      }
    };
  }

  it("creates exactly one question when tapped twice in the same tick", async () => {
    let writes = 0;
    const submit = makeComposer(async () => {
      writes += 1;
      await Promise.resolve();
    });

    // Both taps dispatched before either await settles — the real double-tap.
    const [first, second] = await Promise.all([submit(), submit()]);

    expect(writes).toBe(1);
    expect([first, second]).toEqual(["ran", "blocked"]);
  });

  it("creates exactly one question across a longer burst", async () => {
    let writes = 0;
    const submit = makeComposer(async () => {
      writes += 1;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const results = await Promise.all([submit(), submit(), submit(), submit(), submit()]);

    expect(writes).toBe(1);
    expect(results.filter((r) => r === "ran")).toHaveLength(1);
  });

  it("leaves the control usable after a failed write, so the author can retry", async () => {
    let attempts = 0;
    const submit = makeComposer(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("upload failed");
    });

    await expect(submit()).rejects.toThrow("upload failed");
    // The retry is a real, separate gesture and must be allowed through.
    await expect(submit()).resolves.toBe("ran");
    expect(attempts).toBe(2);
  });

  it("allows a second question once the first has finished", async () => {
    let writes = 0;
    const submit = makeComposer(async () => {
      writes += 1;
    });

    await submit();
    await submit();

    expect(writes).toBe(2);
  });
});
