import { StudyOutcome } from "../../src/features/study/domain/studyTypes";
import {
  ACTIVE_SESSION_MAX_AGE_MS,
  ActiveStudySessionMode,
  buildActiveStudySession,
  normalizePlannedQuestionIds,
  parseActiveStudySession,
  resolveCompletedSession,
  resolveSessionStart,
  serializeActiveStudySession,
} from "../../src/features/study/services/activeStudySession";
import { resolveAdaptiveSessionCompletion } from "../../src/features/study/services/adaptiveSessionCompletion";
import {
  appendSessionReceipt,
  SessionOutcomeReceipt,
} from "../../src/features/study/services/sessionReflection";

const USER = "student-a";
const OTHER = "student-b";
const NOW = 1_700_000_000_000;

function receipt(
  questionId: string,
  outcome: StudyOutcome = "solved",
  operationId = `op-${questionId}`,
): SessionOutcomeReceipt {
  return { operationId, questionId, subject: "Matematik", topic: "Denklemler", outcome };
}

// A pure stand-in for the hook's own decision order, so the lifecycle is
// testable without a React renderer (this repo has none) — the same modelling
// approach earlier phases used. Every branch here mirrors
// useAdaptiveStudySession: consult storage, prefer a completed snapshot,
// otherwise resume or start, then freeze the live plan only if the session
// does not already own one.
class AdaptiveSessionModel {
  raw: string | null = null;
  sessionInstanceId = "";
  startedAt = 0;
  receipts: SessionOutcomeReceipt[] = [];
  plannedQuestionIds: string[] | null = null;
  restoredCompletion = false;

  constructor(
    private userId: string,
    private mode: ActiveStudySessionMode = "adaptive",
  ) {}

  /** One mount: hydration + the single freeze decision. */
  mount(livePlan: readonly string[], now = NOW): this {
    this.receipts = [];
    this.plannedQuestionIds = null;
    this.restoredCompletion = false;

    const completed = resolveCompletedSession({
      raw: this.raw,
      userId: this.userId,
      mode: this.mode,
      now,
    });
    if (completed) {
      this.sessionInstanceId = completed.sessionInstanceId;
      this.startedAt = completed.startedAt;
      this.receipts = completed.receipts;
      this.plannedQuestionIds = completed.plannedQuestionIds;
      this.restoredCompletion = true;
      return this;
    }

    const start = resolveSessionStart({ raw: this.raw, userId: this.userId, mode: this.mode, now });
    this.sessionInstanceId = start.sessionInstanceId;
    this.startedAt = start.startedAt;
    this.receipts = start.receipts;
    this.plannedQuestionIds =
      start.plannedQuestionIds.length > 0
        ? start.plannedQuestionIds
        : normalizePlannedQuestionIds([...livePlan]);
    return this;
  }

  confirm(questionId: string, outcome: StudyOutcome = "solved", operationId?: string): this {
    const next = appendSessionReceipt(
      this.receipts,
      receipt(questionId, outcome, operationId ?? `op-${questionId}-${outcome}`),
    );
    if (next.length === this.receipts.length) return this;
    this.receipts = next;
    this.raw = serializeActiveStudySession(
      buildActiveStudySession({
        sessionInstanceId: this.sessionInstanceId,
        userId: this.userId,
        mode: this.mode,
        startedAt: this.startedAt,
        receipts: next,
        plannedQuestionIds: this.plannedQuestionIds ?? [],
      }),
    );
    return this;
  }

  completion(resolvable?: readonly string[]) {
    const planned = this.plannedQuestionIds ?? [];
    return resolveAdaptiveSessionCompletion({
      plannedQuestionIds: planned,
      resolvableQuestionIds: resolvable ?? planned,
      receipts: this.receipts,
    });
  }

  isComplete(resolvable?: readonly string[]): boolean {
    return this.restoredCompletion || this.completion(resolvable).isComplete;
  }

  /** What the hook writes when completion is reached. */
  persistCompletion(now = NOW + 1000): this {
    this.raw = serializeActiveStudySession(
      buildActiveStudySession({
        sessionInstanceId: this.sessionInstanceId,
        userId: this.userId,
        mode: this.mode,
        startedAt: this.startedAt,
        receipts: this.receipts,
        plannedQuestionIds: this.plannedQuestionIds ?? [],
        completedAt: now,
      }),
    );
    return this;
  }

  acknowledge(): this {
    this.raw = null;
    return this;
  }
}

describe("adaptive lifecycle — the frozen plan", () => {
  // §62 — the whole point of the phase. The live plan shrinks as the daily
  // goal is consumed (dailyPracticePlan caps at dailyGoal - reviewedToday,
  // and reviewedToday arrives on a listener), so an active session must not
  // follow it.
  it("keeps A B C even after the live plan becomes B C D", () => {
    const model = new AdaptiveSessionModel(USER).mount(["a", "b", "c"]);
    expect(model.plannedQuestionIds).toEqual(["a", "b", "c"]);

    model.confirm("a");
    // Remount with a completely different live plan — a refresh mid-session.
    model.mount(["b", "c", "d"]);
    expect(model.plannedQuestionIds).toEqual(["a", "b", "c"]);
  });

  it("does not shrink as the daily goal is consumed", () => {
    const model = new AdaptiveSessionModel(USER).mount(["a", "b", "c"]);
    model.confirm("a").confirm("b");
    // The live plan is now down to one item; the session's contract is not.
    model.mount(["c"]);
    expect(model.plannedQuestionIds).toEqual(["a", "b", "c"]);
    expect(model.completion().answerableCount).toBe(3);
  });

  it("freezes an empty plan as empty rather than leaving it unset", () => {
    const model = new AdaptiveSessionModel(USER).mount([]);
    expect(model.plannedQuestionIds).toEqual([]);
    expect(model.isComplete()).toBe(false);
  });

  it("normalises a duplicated live plan when freezing", () => {
    const model = new AdaptiveSessionModel(USER).mount(["a", "a", "b"]);
    expect(model.plannedQuestionIds).toEqual(["a", "b"]);
  });
});

describe("adaptive lifecycle — refresh resume", () => {
  // §29 — the mandatory scenario, end to end.
  it("resumes the same session with Q1 confirmed and Q2 still pending", () => {
    const model = new AdaptiveSessionModel(USER).mount(["a", "b", "c"]);
    const originalId = model.sessionInstanceId;
    model.confirm("a");

    model.mount(["b", "c"]);
    expect(model.sessionInstanceId).toBe(originalId);
    expect(model.plannedQuestionIds).toEqual(["a", "b", "c"]);
    expect(model.completion().confirmedCount).toBe(1);
    expect(model.isComplete()).toBe(false);

    model.confirm("b").confirm("c");
    expect(model.isComplete()).toBe(true);
  });

  it("survives repeated refreshes without duplicating a receipt", () => {
    const model = new AdaptiveSessionModel(USER).mount(["a", "b"]);
    model.confirm("a");
    for (let i = 0; i < 5; i += 1) model.mount(["a", "b"]);
    expect(model.receipts).toHaveLength(1);
    expect(model.completion().confirmedCount).toBe(1);
  });

  it("carries the original startedAt so the staleness bound measures real age", () => {
    const model = new AdaptiveSessionModel(USER).mount(["a"], NOW);
    model.confirm("a-not-planned");
    model.mount(["a"], NOW + 60_000);
    expect(model.startedAt).toBe(NOW);
  });

  it("does not resume a session older than the staleness bound", () => {
    const model = new AdaptiveSessionModel(USER).mount(["a", "b"], NOW);
    const originalId = model.sessionInstanceId;
    model.confirm("a");
    model.mount(["a", "b"], NOW + ACTIVE_SESSION_MAX_AGE_MS + 1);
    expect(model.sessionInstanceId).not.toBe(originalId);
    expect(model.receipts).toEqual([]);
  });
});

describe("adaptive lifecycle — isolation", () => {
  // §30 — account isolation, the same rule Phase 67 set for review.
  it("student B never hydrates student A's adaptive session", () => {
    const a = new AdaptiveSessionModel(USER).mount(["a", "b"]);
    a.confirm("a");

    const b = new AdaptiveSessionModel(OTHER);
    b.raw = a.raw;
    b.mount(["x", "y"]);
    expect(b.receipts).toEqual([]);
    expect(b.plannedQuestionIds).toEqual(["x", "y"]);
    expect(b.sessionInstanceId).not.toBe(a.sessionInstanceId);
  });

  // §31 — mode isolation, in both directions.
  it("a review envelope never hydrates as adaptive", () => {
    const review = new AdaptiveSessionModel(USER, "mandatory").mount([]);
    review.confirm("a");

    const adaptive = new AdaptiveSessionModel(USER, "adaptive");
    adaptive.raw = review.raw;
    adaptive.mount(["p", "q"]);
    expect(adaptive.receipts).toEqual([]);
    expect(adaptive.plannedQuestionIds).toEqual(["p", "q"]);
  });

  it("an adaptive envelope never hydrates as review", () => {
    const adaptive = new AdaptiveSessionModel(USER, "adaptive").mount(["a", "b"]);
    adaptive.confirm("a");

    const review = new AdaptiveSessionModel(USER, "mandatory");
    review.raw = adaptive.raw;
    review.mount([]);
    expect(review.receipts).toEqual([]);
    expect(review.plannedQuestionIds).toEqual([]);
  });

  it("a completed adaptive snapshot is not readable as a completed review one", () => {
    const adaptive = new AdaptiveSessionModel(USER, "adaptive").mount(["a"]);
    adaptive.confirm("a").persistCompletion();
    expect(
      resolveCompletedSession({ raw: adaptive.raw, userId: USER, mode: "mandatory", now: NOW }),
    ).toBeNull();
    expect(
      resolveCompletedSession({ raw: adaptive.raw, userId: OTHER, mode: "adaptive", now: NOW }),
    ).toBeNull();
  });
});

describe("adaptive lifecycle — completed snapshot", () => {
  // §65 — complete, persist, remount, reflection restored, acknowledge,
  // cleared, next session starts empty.
  it("restores the summary when the completion screen is refreshed", () => {
    const model = new AdaptiveSessionModel(USER).mount(["a", "b"]);
    model.confirm("a").confirm("b");
    expect(model.isComplete()).toBe(true);
    model.persistCompletion();

    model.mount(["c", "d"]);
    expect(model.restoredCompletion).toBe(true);
    expect(model.isComplete()).toBe(true);
    expect(model.receipts).toHaveLength(2);
    expect(model.plannedQuestionIds).toEqual(["a", "b"]);
  });

  // §28 — a completed session must never reopen as an active one.
  it("a completed record is never resumed as active", () => {
    const model = new AdaptiveSessionModel(USER).mount(["a"]);
    model.confirm("a").persistCompletion();
    const start = resolveSessionStart({ raw: model.raw, userId: USER, mode: "adaptive", now: NOW });
    expect(start.resumed).toBe(false);
    expect(start.receipts).toEqual([]);
    expect(start.plannedQuestionIds).toEqual([]);
  });

  it("acknowledging clears it, and the next session starts empty", () => {
    const model = new AdaptiveSessionModel(USER).mount(["a", "b"]);
    const firstId = model.sessionInstanceId;
    model.confirm("a").confirm("b").persistCompletion().acknowledge();

    model.mount(["c", "d"]);
    expect(model.restoredCompletion).toBe(false);
    expect(model.sessionInstanceId).not.toBe(firstId);
    expect(model.receipts).toEqual([]);
    expect(model.plannedQuestionIds).toEqual(["c", "d"]);
    expect(model.isComplete()).toBe(false);
  });

  it("an active record is not mistaken for a completed snapshot", () => {
    const model = new AdaptiveSessionModel(USER).mount(["a", "b"]);
    model.confirm("a");
    expect(
      resolveCompletedSession({ raw: model.raw, userId: USER, mode: "adaptive", now: NOW }),
    ).toBeNull();
  });

  it("a stale completed snapshot is not restored", () => {
    const model = new AdaptiveSessionModel(USER).mount(["a"], NOW);
    model.confirm("a").persistCompletion();
    expect(
      resolveCompletedSession({
        raw: model.raw,
        userId: USER,
        mode: "adaptive",
        now: NOW + ACTIVE_SESSION_MAX_AGE_MS + 1,
      }),
    ).toBeNull();
  });
});

describe("adaptive lifecycle — corrupted storage", () => {
  // §44 — never mark entries complete because storage is corrupt.
  it("a malformed plan entry is dropped, not coerced into a plan id", () => {
    expect(normalizePlannedQuestionIds(["a", 7, null, { id: "b" }, "", "c"])).toEqual(["a", "c"]);
    expect(normalizePlannedQuestionIds("not-an-array")).toEqual([]);
    expect(normalizePlannedQuestionIds(undefined)).toEqual([]);
  });

  it("garbage storage starts a clean session rather than completing one", () => {
    for (const raw of ["", "{", "null", "[]", '{"version":2}']) {
      const start = resolveSessionStart({ raw, userId: USER, mode: "adaptive", now: NOW });
      expect(start.resumed).toBe(false);
      expect(start.receipts).toEqual([]);
      expect(start.plannedQuestionIds).toEqual([]);
      expect(resolveCompletedSession({ raw, userId: USER, mode: "adaptive", now: NOW })).toBeNull();
    }
  });

  it("a corrupted receipt is dropped without completing the entry it named", () => {
    const raw = JSON.stringify({
      version: 2,
      sessionInstanceId: "s1",
      userId: USER,
      mode: "adaptive",
      startedAt: NOW,
      plannedQuestionIds: ["a", "b"],
      completedAt: null,
      receipts: [{ operationId: "op-a", questionId: "a", subject: "M", topic: "T", outcome: "solved" }, { questionId: "b" }],
    });
    const start = resolveSessionStart({ raw, userId: USER, mode: "adaptive", now: NOW });
    expect(start.receipts).toHaveLength(1);
    const result = resolveAdaptiveSessionCompletion({
      plannedQuestionIds: start.plannedQuestionIds,
      resolvableQuestionIds: start.plannedQuestionIds,
      receipts: start.receipts,
    });
    expect(result.isComplete).toBe(false);
    expect(result.confirmedCount).toBe(1);
  });
});

describe("adaptive lifecycle — schema migration", () => {
  // §43 — a Phase 67 record must still hydrate, and must not gain a plan or a
  // completion it never had.
  it("hydrates a version 1 review record with no plan and no completion", () => {
    const v1 = JSON.stringify({
      version: 1,
      sessionInstanceId: "s-old",
      userId: USER,
      mode: "mandatory",
      startedAt: NOW,
      receipts: [{ operationId: "op1", questionId: "q1", subject: "M", topic: "T", outcome: "solved" }],
    });
    const parsed = parseActiveStudySession(v1);
    expect(parsed?.sessionInstanceId).toBe("s-old");
    expect(parsed?.receipts).toHaveLength(1);
    expect(parsed?.plannedQuestionIds).toEqual([]);
    expect(parsed?.completedAt).toBeNull();

    const start = resolveSessionStart({ raw: v1, userId: USER, mode: "mandatory", now: NOW });
    expect(start.resumed).toBe(true);
    expect(start.sessionInstanceId).toBe("s-old");
  });

  it("a version 1 record is never read as a completed snapshot", () => {
    const v1 = JSON.stringify({
      version: 1,
      sessionInstanceId: "s-old",
      userId: USER,
      mode: "mandatory",
      startedAt: NOW,
      receipts: [],
    });
    expect(resolveCompletedSession({ raw: v1, userId: USER, mode: "mandatory", now: NOW })).toBeNull();
  });

  it("writes the current version", () => {
    const model = new AdaptiveSessionModel(USER).mount(["a"]);
    model.confirm("a");
    expect(JSON.parse(model.raw as string).version).toBe(2);
  });
});
