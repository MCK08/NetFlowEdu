import { mapWithConcurrency } from "../../src/features/teacher/services/boundedConcurrency";

describe("mapWithConcurrency", () => {
  it("returns results in the same order as the input, regardless of settle order", async () => {
    const items = [30, 10, 20];
    const results = await mapWithConcurrency(items, 3, (ms) => new Promise((resolve) => setTimeout(() => resolve(ms), ms)));
    expect(results).toEqual([30, 10, 20]);
  });

  it("never runs more than `limit` tasks concurrently (many items, small class-scale)", async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);

    await mapWithConcurrency(items, 4, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return item;
    });

    expect(maxActive).toBeLessThanOrEqual(4);
  });

  it("still calls every item exactly once", async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const calls: number[] = [];
    await mapWithConcurrency(items, 4, async (item) => {
      calls.push(item);
      return item;
    });
    expect(calls.slice().sort((a, b) => a - b)).toEqual(items);
    expect(calls).toHaveLength(20);
  });

  it("handles an empty item list", async () => {
    const task = jest.fn(async (x: number) => x);
    const results = await mapWithConcurrency([], 4, task);
    expect(results).toEqual([]);
    expect(task).not.toHaveBeenCalled();
  });

  it("handles a limit larger than the item count", async () => {
    const results = await mapWithConcurrency([1, 2], 10, async (x) => x * 2);
    expect(results).toEqual([2, 4]);
  });

  it("propagates a task rejection", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (x) => {
        if (x === 2) throw new Error("boom");
        return x;
      }),
    ).rejects.toThrow("boom");
  });
});
