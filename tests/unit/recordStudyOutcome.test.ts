// Unit-tests the REAL recordStudyOutcome / setStudyDailyGoal handlers
// (imported straight from functions/src, never reimplemented) against an
// in-memory, path-keyed fake of firebase-admin's Firestore.
//
// The fake ENFORCES Firestore's read-before-write transaction rule — the
// exact rule whose violation caused the 2026-08-05 production outage across
// every notification-producing function while all unit tests stayed green.
// Any read staged after a write here fails loudly.

type DocData = Record<string, unknown>;
const store = new Map<string, DocData>();

function docRef(path: string) {
  return {
    id: path.split("/").pop()!,
    path,
    async get() {
      const data = store.get(path);
      return { exists: data !== undefined, data: () => data, id: path.split("/").pop() };
    },
    async set(data: DocData, options?: { merge?: boolean }) {
      if (options?.merge) store.set(path, { ...(store.get(path) ?? {}), ...data });
      else store.set(path, { ...data });
    },
    async update(data: DocData) {
      store.set(path, { ...(store.get(path) ?? {}), ...data });
    },
    async delete() {
      store.delete(path);
    },
    collection(name: string) {
      return collectionRef(`${path}/${name}`);
    },
  };
}

function collectionRef(path: string) {
  return {
    doc(id: string) {
      return docRef(`${path}/${id}`);
    },
  };
}

function mockFakeDb() {
  return {
    collection(name: string) {
      return collectionRef(name);
    },
    async runTransaction(fn: (tx: unknown) => Promise<unknown>) {
      let hasWritten = false;
      const assertReadPhase = () => {
        if (hasWritten) {
          throw new Error(
            "Firestore transactions require all reads to be executed before all writes.",
          );
        }
      };
      const tx = {
        get: (ref: { get: () => unknown }) => {
          assertReadPhase();
          return ref.get();
        },
        set: (
          ref: { set: (d: DocData, o?: { merge?: boolean }) => unknown },
          data: DocData,
          options?: { merge?: boolean },
        ) => {
          hasWritten = true;
          return ref.set(data, options);
        },
        update: (ref: { update: (d: DocData) => unknown }, data: DocData) => {
          hasWritten = true;
          return ref.update(data);
        },
        delete: (ref: { delete: () => unknown }) => {
          hasWritten = true;
          return ref.delete();
        },
      };
      return fn(tx);
    },
  };
}

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: () => mockFakeDb(),
  FieldValue: { serverTimestamp: () => "__SERVER_TIMESTAMP__" },
}));

// eslint-disable-next-line import/first
import { recordStudyOutcome } from "../../functions/src/study/recordStudyOutcome";
// eslint-disable-next-line import/first
import { setStudyDailyGoal } from "../../functions/src/study/setStudyDailyGoal";
// eslint-disable-next-line import/first
import { removeStudyItem } from "../../functions/src/study/removeStudyItem";
// eslint-disable-next-line import/first
import { DEFAULT_DAILY_GOAL } from "../../functions/src/study/studyTypes";

const STUDENT = "student1";

function studentRequest(data: Record<string, unknown>, role = "student", uid = STUDENT) {
  return { data, auth: { uid, token: { role } } } as never;
}

function seedQuestion(id: string, overrides: DocData = {}) {
  store.set(`questions/${id}`, {
    ownerId: "owner1",
    visibility: "public",
    classId: null,
    ...overrides,
  });
}

function item(questionId = "q1", uid = STUDENT) {
  return store.get(`users/${uid}/studyItems/${questionId}`);
}
function summary(uid = STUDENT) {
  return store.get(`users/${uid}/studyMeta/summary`);
}
function dayDocs(uid = STUDENT) {
  return [...store.entries()]
    .filter(([p]) => p.startsWith(`users/${uid}/studyDays/`))
    .map(([, d]) => d);
}

beforeEach(() => store.clear());

describe("recordStudyOutcome — auth and validation", () => {
  it("rejects an unauthenticated caller", async () => {
    await expect(
      recordStudyOutcome.run({ data: { questionId: "q1", outcome: "solved" }, auth: null } as never),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a TEACHER — the study queue is student-only", async () => {
    seedQuestion("q1");
    await expect(
      recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }, "teacher")),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rejects a missing questionId", async () => {
    await expect(
      recordStudyOutcome.run(studentRequest({ outcome: "solved" })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects an outcome outside the allowlist", async () => {
    seedQuestion("q1");
    await expect(
      recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "mastered" })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects a question that does not exist", async () => {
    await expect(
      recordStudyOutcome.run(studentRequest({ questionId: "ghost", outcome: "solved" })),
    ).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("recordStudyOutcome — question access is re-authorized", () => {
  it("allows a public question", async () => {
    seedQuestion("q1", { visibility: "public" });
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    expect(item()).toBeDefined();
  });

  it("denies another user's PRIVATE question", async () => {
    seedQuestion("q1", { visibility: "private", ownerId: "someone-else" });
    await expect(
      recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" })),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(item()).toBeUndefined();
  });

  it("allows the owner's OWN private question", async () => {
    seedQuestion("q1", { visibility: "private", ownerId: STUDENT });
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    expect(item()).toMatchObject({ source: "private" });
  });

  it("denies a CLASS question when the caller is not a member", async () => {
    seedQuestion("q1", { visibility: "class", classId: "c1", ownerId: "teacher1" });
    await expect(
      recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" })),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("allows a CLASS question for a real member and records the class source", async () => {
    seedQuestion("q1", { visibility: "class", classId: "c1", ownerId: "teacher1" });
    store.set(`classes/c1/members/${STUDENT}`, { uid: STUDENT, role: "student" });
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    expect(item()).toMatchObject({ source: "class", sourceClassId: "c1" });
  });
});

describe("recordStudyOutcome — scheduling and persistence", () => {
  beforeEach(() => seedQuestion("q1"));

  it("creates a study item on the first solve with the 2-day interval", async () => {
    const result = await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "solved" }),
    );
    expect(result.intervalDays).toBe(2);
    expect(result.successfulReviews).toBe(1);
    expect(item()).toMatchObject({
      questionId: "q1",
      status: "review",
      lastOutcome: "solved",
      intervalDays: 2,
      attemptCount: 1,
      schemaVersion: 1,
    });
  });

  it("re-reviewing the same question updates rather than duplicating", async () => {
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    expect(item()).toMatchObject({ intervalDays: 4, successfulReviews: 2, attemptCount: 2 });
    expect(summary()).toMatchObject({ totalUniqueQuestions: 1, totalReviewActions: 2 });
  });

  it("'again' resets progress and schedules ~10 minutes out", async () => {
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    const result = await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "again" }),
    );
    expect(result.status).toBe("learning");
    expect(result.intervalDays).toBe(0);
    expect(result.nextReviewAt - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it("preserves firstAddedAt across reviews", async () => {
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    const first = item()?.firstAddedAt;
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "struggled" }));
    expect(item()?.firstAddedAt).toBe(first);
  });

  it("never writes undefined for any field", async () => {
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    for (const doc of [item(), summary(), dayDocs()[0]]) {
      expect(doc).toBeDefined();
      for (const [key, value] of Object.entries(doc!)) {
        expect([key, value]).not.toContain(undefined);
      }
    }
  });
});

describe("recordStudyOutcome — summary, streak and daily stats", () => {
  beforeEach(() => seedQuestion("q1"));

  it("starts a streak at 1 and defaults the daily goal", async () => {
    const result = await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "solved" }),
    );
    expect(result.currentStreak).toBe(1);
    expect(result.dailyGoal).toBe(DEFAULT_DAILY_GOAL);
    expect(summary()).toMatchObject({ currentStreak: 1, longestStreak: 1 });
  });

  it("counts reviews per day and flags goal completion", async () => {
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    const day = dayDocs()[0];
    expect(day).toMatchObject({ reviewCount: 1, solvedCount: 1, uniqueQuestionCount: 1 });
    expect(day!.goalCompleted).toBe(false);
  });

  it("marks the goal complete once the target is reached", async () => {
    store.set(`users/${STUDENT}/studyMeta/summary`, { dailyGoal: 2 });
    seedQuestion("q2");
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    const second = await recordStudyOutcome.run(
      studentRequest({ questionId: "q2", outcome: "solved" }),
    );
    expect(second.goalCompleted).toBe(true);
    expect(second.reviewedToday).toBe(2);
  });

  it("tracks each outcome in its own daily counter", async () => {
    seedQuestion("q2");
    seedQuestion("q3");
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    await recordStudyOutcome.run(studentRequest({ questionId: "q2", outcome: "struggled" }));
    await recordStudyOutcome.run(studentRequest({ questionId: "q3", outcome: "again" }));
    expect(dayDocs()[0]).toMatchObject({ solvedCount: 1, struggledCount: 1, againCount: 1, reviewCount: 3 });
  });

  it("maintains masteredCount as questions enter and leave mastery", async () => {
    // Drive q1 up to mastery: 2 -> 4 -> 8 -> 16 days, 4 successful reviews.
    for (let i = 0; i < 4; i++) {
      await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    }
    expect(item()?.status).toBe("mastered");
    expect(summary()?.masteredCount).toBe(1);

    // "again" must drop it back out — and decrement the counter.
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "again" }));
    expect(item()?.status).toBe("learning");
    expect(summary()?.masteredCount).toBe(0);
  });

  it("never lets masteredCount go negative from a corrupted starting value", async () => {
    store.set(`users/${STUDENT}/studyMeta/summary`, { masteredCount: 0 });
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "again" }));
    expect(summary()?.masteredCount).toBe(0);
  });

  it("falls back to a safe timezone for a spoofed value instead of failing", async () => {
    await expect(
      recordStudyOutcome.run(
        studentRequest({ questionId: "q1", outcome: "solved", timeZone: "Mars/Olympus" }),
      ),
    ).resolves.toBeDefined();
    expect(dayDocs()[0]?.dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("ignores a client-supplied dayKey/streak — those are server-derived only", async () => {
    await recordStudyOutcome.run(
      studentRequest({
        questionId: "q1",
        outcome: "solved",
        dayKey: "1999-01-01",
        currentStreak: 999,
      } as Record<string, unknown>),
    );
    expect(summary()?.currentStreak).toBe(1);
    expect(dayDocs()[0]?.dayKey).not.toBe("1999-01-01");
  });
});

describe("setStudyDailyGoal", () => {
  it("accepts a goal inside the allowed range", async () => {
    const result = await setStudyDailyGoal.run(studentRequest({ dailyGoal: 25 }));
    expect(result).toEqual({ dailyGoal: 25 });
    expect(summary()?.dailyGoal).toBe(25);
  });

  it("accepts the exact boundaries", async () => {
    await expect(setStudyDailyGoal.run(studentRequest({ dailyGoal: 1 }))).resolves.toEqual({
      dailyGoal: 1,
    });
    await expect(setStudyDailyGoal.run(studentRequest({ dailyGoal: 100 }))).resolves.toEqual({
      dailyGoal: 100,
    });
  });

  it("REJECTS out-of-range values rather than silently clamping", async () => {
    for (const bad of [0, -5, 101, 1.5, Number.NaN, "10", null]) {
      await expect(
        setStudyDailyGoal.run(studentRequest({ dailyGoal: bad as never })),
      ).rejects.toMatchObject({ code: "invalid-argument" });
    }
  });

  it("rejects a teacher and an unauthenticated caller", async () => {
    await expect(
      setStudyDailyGoal.run(studentRequest({ dailyGoal: 20 }, "teacher")),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      setStudyDailyGoal.run({ data: { dailyGoal: 20 }, auth: null } as never),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("does not clobber existing progress fields", async () => {
    store.set(`users/${STUDENT}/studyMeta/summary`, {
      currentStreak: 7,
      longestStreak: 12,
      masteredCount: 4,
    });
    await setStudyDailyGoal.run(studentRequest({ dailyGoal: 30 }));
    expect(summary()).toMatchObject({
      dailyGoal: 30,
      currentStreak: 7,
      longestStreak: 12,
      masteredCount: 4,
    });
  });
});

describe("read-before-write ordering (2026-08-05 incident guard)", () => {
  it("completes without violating the transaction rule for every outcome", async () => {
    for (const outcome of ["again", "struggled", "solved"] as const) {
      store.clear();
      seedQuestion("q1");
      await expect(
        recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome })),
      ).resolves.toBeDefined();
    }
  });

  it("completes for a class question, which needs an EXTRA membership read", async () => {
    seedQuestion("q1", { visibility: "class", classId: "c1", ownerId: "teacher1" });
    store.set(`classes/c1/members/${STUDENT}`, { uid: STUDENT });
    await expect(
      recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" })),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Phase 16B — backend idempotency.
//
// The client's double-tap ref-guard is a UI affordance, NOT integrity: it
// cannot survive a callable auto-retry, two devices, or a lost response.
// These tests exercise the server-side replay guard directly.
// ---------------------------------------------------------------------------
describe("recordStudyOutcome — backend idempotency (operationId)", () => {
  beforeEach(() => seedQuestion("q1"));

  it("replaying the SAME operationId records only ONE review action", async () => {
    const op = "abc12345-def6";
    await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "solved", operationId: op }),
    );
    await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "solved", operationId: op }),
    );

    expect(item()?.attemptCount).toBe(1);
    expect(summary()?.totalReviewActions).toBe(1);
    expect(dayDocs()[0]?.reviewCount).toBe(1);
    // The schedule must not advance twice either.
    expect(item()?.intervalDays).toBe(2);
  });

  it("CONCURRENT replay of the same operationId still records only one", async () => {
    const op = "concurrent-123";
    await Promise.all([
      recordStudyOutcome.run(
        studentRequest({ questionId: "q1", outcome: "solved", operationId: op }),
      ),
      recordStudyOutcome.run(
        studentRequest({ questionId: "q1", outcome: "solved", operationId: op }),
      ),
    ]);
    expect(summary()?.totalReviewActions).toBe(1);
    expect(item()?.attemptCount).toBe(1);
  });

  it("a replay returns a DETERMINISTIC response identical to the original", async () => {
    const op = "determin-1234";
    const first = await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "solved", operationId: op }),
    );
    const replay = await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "solved", operationId: op }),
    );
    expect(replay.status).toBe(first.status);
    expect(replay.intervalDays).toBe(first.intervalDays);
    expect(replay.successfulReviews).toBe(first.successfulReviews);
    expect(replay.nextReviewAt).toBe(first.nextReviewAt);
  });

  it("DIFFERENT operationIds are two legitimate reviews — dedupe must not over-block", async () => {
    await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "solved", operationId: "first-0001" }),
    );
    await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "solved", operationId: "second-002" }),
    );
    expect(item()?.attemptCount).toBe(2);
    expect(item()?.intervalDays).toBe(4);
    expect(summary()?.totalReviewActions).toBe(2);
  });

  it("another user's identical operationId has NO cross-user effect", async () => {
    const op = "shared-op-01";
    await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "solved", operationId: op }),
    );
    // Same id, different caller — the ledger lives on that user's own item.
    await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "solved", operationId: op }, "student", "student2"),
    );
    expect(item("q1", "student1")?.attemptCount).toBe(1);
    expect(item("q1", "student2")?.attemptCount).toBe(1);
    expect(summary("student2")?.totalReviewActions).toBe(1);
  });

  it("the same operationId on a DIFFERENT question is not blocked", async () => {
    seedQuestion("q2");
    const op = "same-op-9999";
    await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "solved", operationId: op }),
    );
    await recordStudyOutcome.run(
      studentRequest({ questionId: "q2", outcome: "solved", operationId: op }),
    );
    expect(item("q1")?.attemptCount).toBe(1);
    expect(item("q2")?.attemptCount).toBe(1);
    expect(summary()?.totalReviewActions).toBe(2);
  });

  it("rejects a malformed operationId rather than silently dropping protection", async () => {
    await expect(
      recordStudyOutcome.run(
        studentRequest({ questionId: "q1", outcome: "solved", operationId: "bad id!" }),
      ),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("still works with NO operationId (older client), just without dedupe", async () => {
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    expect(item()?.attemptCount).toBe(2);
  });

  it("keeps the operation ledger bounded", async () => {
    for (let i = 0; i < 15; i++) {
      await recordStudyOutcome.run(
        studentRequest({ questionId: "q1", outcome: "solved", operationId: `op-${i}-xxxx` }),
      );
    }
    const ledger = item()?.recentOperationIds as string[];
    expect(ledger.length).toBeLessThanOrEqual(10);
  });
});

describe("removeStudyItem", () => {
  beforeEach(() => seedQuestion("q1"));

  it("removes the caller's own item and decrements totalUniqueQuestions", async () => {
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    expect(summary()?.totalUniqueQuestions).toBe(1);

    const result = await removeStudyItem.run(studentRequest({ questionId: "q1" }));

    expect(result).toEqual({ removed: true });
    expect(item()).toBeUndefined();
    expect(summary()?.totalUniqueQuestions).toBe(0);
  });

  it("is idempotent — removing a missing item succeeds without error", async () => {
    const result = await removeStudyItem.run(studentRequest({ questionId: "never-studied" }));
    expect(result).toEqual({ removed: false });
  });

  it("decrements masteredCount ONLY for a mastered item", async () => {
    for (let i = 0; i < 4; i++) {
      await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    }
    expect(item()?.status).toBe("mastered");
    expect(summary()?.masteredCount).toBe(1);

    await removeStudyItem.run(studentRequest({ questionId: "q1" }));
    expect(summary()?.masteredCount).toBe(0);
  });

  it("does NOT decrement masteredCount for a non-mastered item", async () => {
    seedQuestion("q2");
    for (let i = 0; i < 4; i++) {
      await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    }
    await recordStudyOutcome.run(studentRequest({ questionId: "q2", outcome: "struggled" }));
    expect(summary()?.masteredCount).toBe(1);

    await removeStudyItem.run(studentRequest({ questionId: "q2" }));
    expect(summary()?.masteredCount).toBe(1);
  });

  it("floors counters at zero on a corrupted summary", async () => {
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    store.set(`users/${STUDENT}/studyMeta/summary`, { totalUniqueQuestions: 0, masteredCount: 0 });

    await removeStudyItem.run(studentRequest({ questionId: "q1" }));
    expect(summary()?.totalUniqueQuestions).toBe(0);
    expect(summary()?.masteredCount).toBe(0);
  });

  it("NEVER rewrites daily history or the streak", async () => {
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    const dayBefore = { ...dayDocs()[0] };
    const streakBefore = summary()?.currentStreak;
    const actionsBefore = summary()?.totalReviewActions;

    await removeStudyItem.run(studentRequest({ questionId: "q1" }));

    expect(dayDocs()[0]).toEqual(dayBefore);
    expect(summary()?.currentStreak).toBe(streakBefore);
    expect(summary()?.longestStreak).toBeDefined();
    // The student really did perform those reviews.
    expect(summary()?.totalReviewActions).toBe(actionsBefore);
  });

  it("rejects a teacher and an unauthenticated caller", async () => {
    await expect(
      removeStudyItem.run(studentRequest({ questionId: "q1" }, "teacher")),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      removeStudyItem.run({ data: { questionId: "q1" }, auth: null } as never),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a missing questionId", async () => {
    await expect(removeStudyItem.run(studentRequest({}))).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("cannot touch another user's item — the path is caller-scoped", async () => {
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    // student2 asks to remove "q1"; only their OWN (nonexistent) item is considered.
    const result = await removeStudyItem.run(
      studentRequest({ questionId: "q1" }, "student", "student2"),
    );
    expect(result).toEqual({ removed: false });
    expect(item("q1", "student1")).toBeDefined();
  });

  it("never writes undefined", async () => {
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    await removeStudyItem.run(studentRequest({ questionId: "q1" }));
    for (const [key, value] of Object.entries(summary()!)) {
      expect([key, value]).not.toContain(undefined);
    }
  });

  it("obeys read-before-write ordering (strict fake)", async () => {
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    await expect(removeStudyItem.run(studentRequest({ questionId: "q1" }))).resolves.toBeDefined();
  });
});

// Phase 41 — cumulative per-outcome counters on the study item, driven
// through the REAL handler (not a reimplementation of its arithmetic).
//
// These counters are what an honest success rate is computed from;
// `successfulReviews` cannot serve that purpose because the scheduler
// decrements it on "struggled" and resets it to zero on "again".
// Reads the stored counters as real numbers. The in-memory fake stores
// `unknown` values (it mirrors Firestore), so narrowing here keeps the
// assertions below honest without an `as any` anywhere.
function counters(questionId = "q1") {
  const stored = (item(questionId) ?? {}) as Record<string, unknown>;
  const n = (value: unknown): number => (typeof value === "number" ? value : 0);
  const solvedCount = n(stored.solvedCount);
  const struggledCount = n(stored.struggledCount);
  const againCount = n(stored.againCount);
  return {
    solvedCount,
    struggledCount,
    againCount,
    attemptCount: n(stored.attemptCount),
    successfulReviews: n(stored.successfulReviews),
    sum: solvedCount + struggledCount + againCount,
  };
}

describe("recordStudyOutcome — cumulative outcome counters", () => {
  beforeEach(() => seedQuestion("q1"));

  it("starts every counter correctly on the first outcome", async () => {
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    expect(item()).toMatchObject({ solvedCount: 1, struggledCount: 0, againCount: 0 });
  });

  it("accumulates a real sequence: solved, solved, again, struggled, solved", async () => {
    for (const outcome of ["solved", "solved", "again", "struggled", "solved"]) {
      await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome }));
    }
    expect(item()).toMatchObject({
      solvedCount: 3,
      struggledCount: 1,
      againCount: 1,
      attemptCount: 5,
    });
  });

  // The completeness rule the client depends on: for an item that has been
  // counted from its first outcome, the counters account for every attempt.
  it("keeps the counters summing to attemptCount for an item counted from birth", async () => {
    for (const outcome of ["struggled", "solved", "again", "solved"]) {
      await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome }));
    }
    const stored = counters();
    expect(stored.sum).toBe(stored.attemptCount);
  });

  // The counters must never be able to go backwards, unlike successfulReviews.
  it("never decreases a counter — not even on the outcomes that reset scheduler progress", async () => {
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));
    const before = counters();
    expect(before.solvedCount).toBe(2);
    expect(before.successfulReviews).toBe(2);

    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "again" }));
    const after = counters();
    // The scheduler's streak is wiped...
    expect(after.successfulReviews).toBe(0);
    // ...but the record of two real solves is not.
    expect(after.solvedCount).toBe(2);
    expect(after.againCount).toBe(1);
  });

  // A pre-Phase-41 document: real attempts, no counters. Counting starts
  // now, and the sum stays BELOW attemptCount — which is exactly how the
  // client detects that the earlier history is unavailable rather than zero.
  it("starts counting a legacy item without inventing its past", async () => {
    store.set(`users/${STUDENT}/studyItems/q1`, {
      questionId: "q1",
      status: "review",
      lastOutcome: "solved",
      intervalDays: 4,
      successfulReviews: 2,
      attemptCount: 12,
      firstAddedAt: 1,
      lastReviewedAt: 2,
      nextReviewAt: 3,
      source: "public",
      sourceClassId: null,
      questionOwnerId: "owner1",
      recentOperationIds: [],
      schemaVersion: 1,
      updatedAt: 2,
    });

    await recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "solved" }));

    const stored = counters();
    expect(stored.solvedCount).toBe(1);
    expect(stored.attemptCount).toBe(13);
    expect(stored.sum).toBeLessThan(stored.attemptCount);
  });
});

describe("recordStudyOutcome — counters are replay-safe", () => {
  beforeEach(() => seedQuestion("q1"));

  it("replaying the SAME operationId leaves every counter untouched", async () => {
    const op = "replay-000001";
    await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "solved", operationId: op }),
    );
    const first = { ...(item() as Record<string, unknown>) };

    await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "solved", operationId: op }),
    );
    const second = item() as Record<string, unknown>;

    expect(second.solvedCount).toBe(first.solvedCount);
    expect(second.struggledCount).toBe(first.struggledCount);
    expect(second.againCount).toBe(first.againCount);
    expect(second.attemptCount).toBe(first.attemptCount);
  });

  it("a replay does not double-count the DAILY counters either", async () => {
    const op = "replay-000002";
    await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "struggled", operationId: op }),
    );
    await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "struggled", operationId: op }),
    );
    expect(dayDocs()).toHaveLength(1);
    expect(dayDocs()[0]).toMatchObject({ reviewCount: 1, struggledCount: 1 });
  });

  it("a NEW operationId after a replay increments exactly once", async () => {
    const op = "replay-000003";
    await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "solved", operationId: op }),
    );
    await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "solved", operationId: op }),
    );
    await recordStudyOutcome.run(
      studentRequest({ questionId: "q1", outcome: "solved", operationId: "fresh-000004" }),
    );
    expect(item()).toMatchObject({ solvedCount: 2, attemptCount: 2 });
  });

  // A rejected call must leave no trace at all — the counters cannot be
  // incremented by an outcome that never happened.
  it("a REJECTED call creates no counter at all", async () => {
    await expect(
      recordStudyOutcome.run(studentRequest({ questionId: "q1", outcome: "nonsense" })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(item()).toBeUndefined();

    seedQuestion("private1", { visibility: "private", ownerId: "someone-else" });
    await expect(
      recordStudyOutcome.run(studentRequest({ questionId: "private1", outcome: "solved" })),
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(item("private1")).toBeUndefined();
  });
});
