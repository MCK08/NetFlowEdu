import { StudyOutcome } from "../../src/features/study/domain/studyTypes";
import {
  ACTIVE_SESSION_MAX_AGE_MS,
  ActiveStudySessionMode,
  buildActiveStudySession,
  normalizePlannedQuestionIds,
  resolveCompletedSession,
  resolveSessionStart,
} from "../../src/features/study/services/activeStudySession";
import {
  parseStudySessionStore,
  putStudySessionSlot,
  removeStudySessionSlot,
  serializeStudySessionStore,
} from "../../src/features/study/services/studySessionStore";
import { resolveAdaptiveSessionCompletion } from "../../src/features/study/services/adaptiveSessionCompletion";
import {
  appendSessionReceipt,
  buildSessionReflection,
  SessionOutcomeReceipt,
} from "../../src/features/study/services/sessionReflection";

// Phase 69 — the destructive seam this file exists to keep closed.
//
// Phases 67/68 kept ONE envelope under one key and both hooks wrote it whole.
// The overwrite did NOT happen on mount; it happened on the first confirmed
// outcome in the other mode, on that mode's completion stamp, and on its
// acknowledge (which removed the shared key outright). So a student at
// "adaptive 1/4" who answered a single review card lost the adaptive session
// entirely — id, receipts and frozen plan.
//
// The repo runs jest in a plain node environment with no React renderer, so
// the hooks cannot be mounted. Both are therefore modelled by calling the same
// pure functions in exactly the order they call them, against ONE shared
// storage value — which is the only way the sibling-clobbering bug is visible
// at all. Modelling each hook alone would pass over it, exactly as the Phase
// 63 unit tests passed over the bug Phase 64 found by instrumenting the hook.

const USER = "student-a";
const OTHER = "student-b";
const NOW = 1_700_000_000_000;

/** The one AsyncStorage value both hooks share. */
class Device {
  raw: string | null = null;
}

function receipt(
  questionId: string,
  outcome: StudyOutcome = "solved",
  operationId = `op-${questionId}-${outcome}`,
): SessionOutcomeReceipt {
  return { operationId, questionId, subject: "Matematik", topic: "Denklemler", outcome };
}

/** Mirrors useReviewSession / useAdaptiveStudySession's shared lifecycle. */
class SessionModel {
  sessionInstanceId = "";
  startedAt = 0;
  receipts: SessionOutcomeReceipt[] = [];
  plannedQuestionIds: string[] = [];
  restoredCompletion = false;
  hydrated = false;

  constructor(
    private device: Device,
    private userId: string,
    private mode: ActiveStudySessionMode,
  ) {}

  /** One mount: completed snapshot first, then resume, then a new session. */
  mount(livePlan: readonly string[] = [], now = NOW): this {
    this.receipts = [];
    this.plannedQuestionIds = [];
    this.restoredCompletion = false;

    const completed = resolveCompletedSession({
      raw: this.device.raw,
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
      this.hydrated = true;
      return this;
    }

    const start = resolveSessionStart({
      raw: this.device.raw,
      userId: this.userId,
      mode: this.mode,
      now,
    });
    this.sessionInstanceId = start.sessionInstanceId;
    this.startedAt = start.startedAt;
    this.receipts = start.receipts;
    this.plannedQuestionIds =
      start.plannedQuestionIds.length > 0
        ? start.plannedQuestionIds
        : normalizePlannedQuestionIds([...livePlan]);
    this.hydrated = true;
    return this;
  }

  /** The production write path: replace THIS slot, carry the sibling through. */
  private write(completedAt: number | null = null): void {
    this.device.raw = serializeStudySessionStore(
      putStudySessionSlot(
        parseStudySessionStore(this.device.raw),
        buildActiveStudySession({
          sessionInstanceId: this.sessionInstanceId,
          userId: this.userId,
          mode: this.mode,
          startedAt: this.startedAt,
          receipts: this.receipts,
          plannedQuestionIds: this.plannedQuestionIds,
          completedAt,
        }),
      ),
    );
  }

  confirm(questionId: string, outcome: StudyOutcome = "solved", operationId?: string): this {
    const next = appendSessionReceipt(this.receipts, receipt(questionId, outcome, operationId));
    if (next.length === this.receipts.length) return this;
    this.receipts = next;
    this.write();
    return this;
  }

  complete(now = NOW + 1000): this {
    this.write(now);
    return this;
  }

  acknowledge(): this {
    this.device.raw = serializeStudySessionStore(
      removeStudySessionSlot(parseStudySessionStore(this.device.raw), this.mode),
    );
    return this;
  }

  completion(resolvable?: readonly string[]) {
    return resolveAdaptiveSessionCompletion({
      plannedQuestionIds: this.plannedQuestionIds,
      resolvableQuestionIds: resolvable ?? this.plannedQuestionIds,
      receipts: this.receipts,
    });
  }
}

function review(device: Device, user = USER) {
  return new SessionModel(device, user, "mandatory");
}
function adaptive(device: Device, user = USER) {
  return new SessionModel(device, user, "adaptive");
}

describe("safe handoff — adaptive → review → adaptive", () => {
  // §32/§101 — the signature case, and the exact scenario Phase 68 broke.
  it("keeps the adaptive session intact across a review outcome", () => {
    const device = new Device();

    const a = adaptive(device).mount(["a", "b", "c", "d"]);
    const adaptiveId = a.sessionInstanceId;
    a.confirm("a");
    expect(a.completion().confirmedCount).toBe(1);

    // Handoff: the student opens Review and answers a card.
    const r = review(device).mount();
    const reviewId = r.sessionInstanceId;
    r.confirm("x", "struggled");

    // Back to Adaptive. THIS is what used to be destroyed.
    const a2 = adaptive(device).mount(["completely", "different", "plan"]);
    expect(a2.sessionInstanceId).toBe(adaptiveId);
    expect(a2.plannedQuestionIds).toEqual(["a", "b", "c", "d"]);
    expect(a2.receipts.map((x) => x.questionId)).toEqual(["a"]);
    expect(a2.completion().confirmedCount).toBe(1);
    expect(a2.restoredCompletion).toBe(false);

    // And the review session is still its own thing.
    const r2 = review(device).mount();
    expect(r2.sessionInstanceId).toBe(reviewId);
    expect(r2.receipts.map((x) => x.questionId)).toEqual(["x"]);
    expect(reviewId).not.toBe(adaptiveId);
  });

  // §29/§30 — a handoff is neither completion nor abandonment.
  it("does not complete, clear or acknowledge the source session", () => {
    const device = new Device();
    const a = adaptive(device).mount(["a", "b"]);
    a.confirm("a");

    review(device).mount().confirm("x");

    const stored = parseStudySessionStore(device.raw).slots.adaptive;
    expect(stored?.completedAt).toBeNull();
    expect(stored?.receipts).toHaveLength(1);
    expect(stored?.plannedQuestionIds).toEqual(["a", "b"]);
  });

  // §34/§102 — the frozen plan survives the whole review lifecycle.
  it("never regenerates the frozen plan across a full review lifecycle", () => {
    const device = new Device();
    const a = adaptive(device).mount(["a", "b", "c", "d"]);
    a.confirm("a");
    const frozen = [...a.plannedQuestionIds];

    const r = review(device).mount();
    r.confirm("x");
    r.complete();
    r.mount();
    r.acknowledge();

    const a2 = adaptive(device).mount(["b", "c"]);
    expect(a2.plannedQuestionIds).toEqual(frozen);
    expect(a2.receipts).toHaveLength(1);
  });
});

describe("safe handoff — review → adaptive → review", () => {
  // §31/§103
  it("keeps the review session intact across the adaptive lifecycle", () => {
    const device = new Device();

    const r = review(device).mount();
    const reviewId = r.sessionInstanceId;
    r.confirm("r1", "struggled").confirm("r2");
    expect(r.receipts).toHaveLength(2);

    const a = adaptive(device).mount(["a", "b"]);
    a.confirm("a").confirm("b");
    a.complete();
    a.mount();
    a.acknowledge();

    const r2 = review(device).mount();
    expect(r2.sessionInstanceId).toBe(reviewId);
    expect(r2.receipts.map((x) => x.questionId)).toEqual(["r1", "r2"]);
    expect(r2.restoredCompletion).toBe(false);
  });
});

describe("coexistence — both modes live at once", () => {
  // §66 — reload the app, enter each mode, both resume.
  it("resumes both sessions after a reload", () => {
    const device = new Device();
    adaptive(device).mount(["a", "b", "c"]).confirm("a");
    review(device).mount().confirm("r1");

    const a = adaptive(device).mount(["z"]);
    const r = review(device).mount();
    expect(a.plannedQuestionIds).toEqual(["a", "b", "c"]);
    expect(a.receipts).toHaveLength(1);
    expect(r.receipts).toHaveLength(1);
    expect(a.sessionInstanceId).not.toBe(r.sessionInstanceId);
  });

  // §37/§67
  it("holds a completed review beside an active adaptive session", () => {
    const device = new Device();
    const a = adaptive(device).mount(["a", "b", "c"]);
    a.confirm("a").confirm("b");

    const r = review(device).mount();
    r.confirm("r1").complete();

    expect(review(device).mount().restoredCompletion).toBe(true);
    const a2 = adaptive(device).mount([]);
    expect(a2.restoredCompletion).toBe(false);
    expect(a2.completion().confirmedCount).toBe(2);
    expect(a2.plannedQuestionIds).toEqual(["a", "b", "c"]);
  });

  // §38/§67
  it("holds a completed adaptive beside an active review session", () => {
    const device = new Device();
    const r = review(device).mount();
    r.confirm("r1");

    const a = adaptive(device).mount(["a"]);
    a.confirm("a").complete();

    expect(adaptive(device).mount([]).restoredCompletion).toBe(true);
    const r2 = review(device).mount();
    expect(r2.restoredCompletion).toBe(false);
    expect(r2.receipts).toHaveLength(1);
  });

  // §39/§92 — acknowledging clears ONLY the mode acknowledged.
  it("acknowledging one completion leaves the sibling untouched", () => {
    const device = new Device();
    adaptive(device).mount(["a", "b"]).confirm("a");
    const r = review(device).mount();
    r.confirm("r1").complete();

    review(device).mount().acknowledge();

    expect(review(device).mount().receipts).toEqual([]);
    const a = adaptive(device).mount(["zzz"]);
    expect(a.plannedQuestionIds).toEqual(["a", "b"]);
    expect(a.receipts).toHaveLength(1);
  });

  // §40/§41/§93 — a genuinely new session in one mode replaces only that mode.
  it("a new session in one mode never replaces the other", () => {
    const device = new Device();
    adaptive(device).mount(["a", "b"]).confirm("a");

    const r = review(device).mount();
    r.confirm("r1").complete();
    r.acknowledge();
    const fresh = review(device).mount();
    fresh.confirm("r2");
    expect(fresh.receipts.map((x) => x.questionId)).toEqual(["r2"]);

    const a = adaptive(device).mount(["zzz"]);
    expect(a.plannedQuestionIds).toEqual(["a", "b"]);
    expect(a.receipts.map((x) => x.questionId)).toEqual(["a"]);
  });
});

describe("multi-mode isolation", () => {
  // §17 — no cross-mode receipt mixing, in either direction.
  it("never mixes receipts between modes", () => {
    const device = new Device();
    adaptive(device).mount(["a"]).confirm("a", "solved", "op-shared-1");
    review(device).mount().confirm("r1", "solved", "op-shared-2");

    expect(adaptive(device).mount([]).receipts.map((x) => x.operationId)).toEqual(["op-shared-1"]);
    expect(review(device).mount().receipts.map((x) => x.operationId)).toEqual(["op-shared-2"]);
  });

  // §59 — account isolation survives a mode switch.
  it("gives student B none of student A's sessions", () => {
    const device = new Device();
    adaptive(device).mount(["a", "b"]).confirm("a");
    review(device).mount().confirm("r1");

    const bAdaptive = adaptive(device, OTHER).mount(["x", "y"]);
    const bReview = review(device, OTHER).mount();
    expect(bAdaptive.receipts).toEqual([]);
    expect(bAdaptive.plannedQuestionIds).toEqual(["x", "y"]);
    expect(bReview.receipts).toEqual([]);

    // …and A's own work is still there when A comes back.
    const aAdaptive = adaptive(device).mount([]);
    expect(aAdaptive.plannedQuestionIds).toEqual(["a", "b"]);
    expect(aAdaptive.receipts).toHaveLength(1);
  });

  // §106 — idempotency survives handoff and reload.
  it("collapses a replayed operationId across a handoff", () => {
    const device = new Device();
    const a = adaptive(device).mount(["a", "b"]);
    a.confirm("a", "solved", "op-1");

    review(device).mount().confirm("r1");

    const a2 = adaptive(device).mount([]);
    a2.confirm("a", "solved", "op-1");
    expect(a2.receipts).toHaveLength(1);
    expect(buildSessionReflection(a2.receipts).confirmedOutcomeCount).toBe(1);
  });
});

describe("technical staleness — applied per slot", () => {
  // §42/§44/§105 — an expired slot must not take its sibling with it.
  it("a stale review slot does not disturb a valid adaptive slot", () => {
    const device = new Device();
    const a = adaptive(device).mount(["a", "b"], NOW);
    a.confirm("a");

    const r = review(device).mount([], NOW - ACTIVE_SESSION_MAX_AGE_MS);
    r.confirm("r1");

    // The review slot is now older than the bound; the adaptive one is not.
    const staleReview = review(device).mount([], NOW + 1000);
    expect(staleReview.receipts).toEqual([]);

    const a2 = adaptive(device).mount([], NOW + 1000);
    expect(a2.sessionInstanceId).toBe(a.sessionInstanceId);
    expect(a2.plannedQuestionIds).toEqual(["a", "b"]);
  });

  it("a stale adaptive slot does not disturb a valid review slot", () => {
    const device = new Device();
    const a = adaptive(device).mount(["a"], NOW - ACTIVE_SESSION_MAX_AGE_MS);
    a.confirm("a");
    const r = review(device).mount([], NOW);
    r.confirm("r1");

    expect(adaptive(device).mount([], NOW + 1000).receipts).toEqual([]);
    const r2 = review(device).mount([], NOW + 1000);
    expect(r2.sessionInstanceId).toBe(r.sessionInstanceId);
    expect(r2.receipts).toHaveLength(1);
  });

  // §43 — staleness gates local RESUME. It never decides which outcomes
  // belonged to a session; membership was already fixed when each was
  // confirmed.
  it("expiring a slot never regroups outcomes, it only refuses to resume", () => {
    const device = new Device();
    const a = adaptive(device).mount(["a", "b"], NOW);
    a.confirm("a");
    const expired = adaptive(device).mount(["a", "b"], NOW + ACTIVE_SESSION_MAX_AGE_MS + 1);
    expect(expired.receipts).toEqual([]);
    expect(expired.sessionInstanceId).not.toBe(a.sessionInstanceId);
  });
});
