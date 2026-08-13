// Runs `task` over `items` with at most `limit` in flight at once — same
// TOTAL number of calls (and Firestore reads, for a caller whose task is a
// query) as Promise.all(items.map(task)), just capped concurrency. Used by
// useClassPerformance.ts so opening a large class doesn't fire dozens of
// simultaneous per-student studyItems queries at once; this does NOT
// reduce the N reads a class-performance load costs (that would need
// pagination or a server-side rollup — see useClassPerformance.ts's own
// doc comment on why neither is done this phase), only how many are ever
// simultaneously in flight.
//
// Order-preserving: results[i] always corresponds to items[i], regardless
// of which worker happened to process it or in what order tasks settle.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index] as T, index);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
