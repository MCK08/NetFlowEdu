// Phase 67 — durable local session identity.
//
// The repo runs jest in a plain node environment with no React renderer, so
// the hook itself cannot be mounted. The lifecycle is therefore modelled by
// calling the same pure functions in exactly the order useReviewSession calls
// them — the approach Phase 64 used to catch a real bug the pure-function
// tests had passed over.

import {
  ACTIVE_SESSION_MAX_AGE_MS,
  ACTIVE_STUDY_SESSION_STORAGE_KEY,
  ACTIVE_STUDY_SESSION_VERSION,
  ActiveStudySessionEnvelope,
  buildActiveStudySession,
  createSessionInstanceId,
  parseActiveStudySession,
  resolveSessionStart,
} from "../../src/features/study/services/activeStudySession";
import {
  EMPTY_STUDY_SESSION_STORE,
  parseStudySessionStore,
  putStudySessionSlot,
  readStudySessionSlot,
  serializeStudySessionStore,
  STUDY_SESSION_STORE_VERSION,
} from "../../src/features/study/services/studySessionStore";
import {
  appendSessionReceipt,
  buildSessionReflection,
  sessionHeadline,
  SessionOutcomeReceipt,
} from "../../src/features/study/services/sessionReflection";
import { StudyOutcome } from "../../src/features/study/domain/studyTypes";

const NOW = 1_700_000_000_000;
const USER = "student-a";

function receipt(
  operationId: string,
  outcome: StudyOutcome,
  questionId = `q-${operationId}`,
  topic = "Denklemler",
  subject = "Matematik",
): SessionOutcomeReceipt {
  return { operationId, questionId, subject, topic, outcome };
}

function envelope(
  overrides: Partial<ActiveStudySessionEnvelope> = {},
): ActiveStudySessionEnvelope {
  return buildActiveStudySession({
    sessionInstanceId: "session-1",
    userId: USER,
    mode: "mandatory",
    startedAt: NOW,
    receipts: [receipt("op1", "struggled")],
    ...overrides,
  });
}

// Phase 69 no longer WRITES this shape — the store does (studySessionStore.ts).
// It is still exactly what a device may hold from a Phase 67/68 session that is
// genuinely in progress, so these tests keep exercising it as untrusted input
// and as the migration source. Written out explicitly rather than through a
// production writer, so they cannot quietly follow a format change.
function serializeLegacy(input: ActiveStudySessionEnvelope): string {
  return JSON.stringify({
    version: input.version,
    sessionInstanceId: input.sessionInstanceId,
    userId: input.userId,
    mode: input.mode,
    startedAt: input.startedAt,
    receipts: input.receipts.map((r) => ({
      operationId: r.operationId,
      questionId: r.questionId,
      subject: r.subject,
      topic: r.topic,
      outcome: r.outcome,
    })),
    plannedQuestionIds: [...input.plannedQuestionIds],
    completedAt: input.completedAt,
  });
}

function stored(overrides: Partial<ActiveStudySessionEnvelope> = {}): string {
  return serializeLegacy(envelope(overrides));
}

// The REAL write path since Phase 69: one slot inside the bounded store.
function storedByProduction(overrides: Partial<ActiveStudySessionEnvelope> = {}): string {
  return serializeStudySessionStore(
    putStudySessionSlot(EMPTY_STUDY_SESSION_STORE, envelope(overrides)),
  );
}

function hydratedReceipts(raw: string): SessionOutcomeReceipt[] {
  return readStudySessionSlot(parseStudySessionStore(raw), "mandatory")!.receipts;
}

describe("active session — storage contract", () => {
  it("uses the repo's namespaced versioned key convention", () => {
    expect(ACTIVE_STUDY_SESSION_STORAGE_KEY).toBe("netflowedu.study.active-session.v1");
  });

  it("round trips an envelope unchanged", () => {
    const original = envelope({
      receipts: [receipt("op1", "struggled"), receipt("op2", "solved")],
    });
    expect(parseActiveStudySession(serializeLegacy(original))).toEqual(original);
  });

  it("serialises stable output for the same envelope", () => {
    expect(serializeLegacy(envelope())).toBe(serializeLegacy(envelope()));
  });
});

describe("active session — untrusted input", () => {
  it("returns null for a missing record", () => {
    expect(parseActiveStudySession(null)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseActiveStudySession("")).toBeNull();
  });

  it("does not throw on invalid JSON", () => {
    expect(() => parseActiveStudySession("{not json")).not.toThrow();
    expect(parseActiveStudySession("{not json")).toBeNull();
  });

  it("rejects a JSON array", () => {
    expect(parseActiveStudySession("[]")).toBeNull();
  });

  it("rejects a JSON primitive", () => {
    expect(parseActiveStudySession('"session"')).toBeNull();
    expect(parseActiveStudySession("42")).toBeNull();
    expect(parseActiveStudySession("null")).toBeNull();
  });

  it("fails closed on an unknown future version", () => {
    const raw = JSON.stringify({ ...envelope(), version: 99 });
    expect(parseActiveStudySession(raw)).toBeNull();
  });

  it("rejects a missing session id", () => {
    const raw = JSON.stringify({ ...envelope(), sessionInstanceId: undefined });
    expect(parseActiveStudySession(raw)).toBeNull();
  });

  it("rejects a missing user", () => {
    const raw = JSON.stringify({ ...envelope(), userId: "" });
    expect(parseActiveStudySession(raw)).toBeNull();
  });

  it("rejects an unknown mode", () => {
    // Phase 68 made "adaptive" a real mode; "assignment" is still excluded,
    // and anything unrecognised must still fail closed rather than being
    // adopted as some other kind of session.
    for (const mode of ["assignment", "practice", "", 7, null]) {
      const raw = JSON.stringify({ ...envelope(), mode });
      expect(parseActiveStudySession(raw)).toBeNull();
    }
  });

  it("accepts the adaptive mode Phase 68 added", () => {
    const raw = JSON.stringify({ ...envelope(), mode: "adaptive" });
    expect(parseActiveStudySession(raw)?.mode).toBe("adaptive");
  });

  it("rejects a non-numeric startedAt", () => {
    const raw = JSON.stringify({ ...envelope(), startedAt: "yesterday" });
    expect(parseActiveStudySession(raw)).toBeNull();
  });

  it("rejects receipts that are not an array", () => {
    const raw = JSON.stringify({ ...envelope(), receipts: { op1: "solved" } });
    expect(parseActiveStudySession(raw)).toBeNull();
  });
});

describe("active session — receipt validation", () => {
  function withReceipts(receipts: unknown[]): string {
    return JSON.stringify({ ...envelope(), receipts });
  }

  it("drops an outcome that is not canonical", () => {
    const raw = withReceipts([
      { operationId: "op1", questionId: "q1", subject: "M", topic: "T", outcome: "foo" },
      { operationId: "op2", questionId: "q2", subject: "M", topic: "T", outcome: "solved" },
    ]);
    const parsed = parseActiveStudySession(raw);
    expect(parsed?.receipts).toHaveLength(1);
    expect(parsed?.receipts[0]!.operationId).toBe("op2");
  });

  it("drops a receipt with no operation id", () => {
    const raw = withReceipts([{ questionId: "q1", subject: "M", topic: "T", outcome: "solved" }]);
    expect(parseActiveStudySession(raw)?.receipts).toHaveLength(0);
  });

  it("drops a receipt with no question id", () => {
    const raw = withReceipts([{ operationId: "op1", subject: "M", topic: "T", outcome: "solved" }]);
    expect(parseActiveStudySession(raw)?.receipts).toHaveLength(0);
  });

  it("drops a non-object receipt", () => {
    const raw = withReceipts(["solved", null, 7]);
    expect(parseActiveStudySession(raw)?.receipts).toHaveLength(0);
  });

  it("keeps a valid receipt whose metadata never resolved", () => {
    const raw = withReceipts([{ operationId: "op1", questionId: "q1", outcome: "solved" }]);
    const parsed = parseActiveStudySession(raw);
    expect(parsed?.receipts).toHaveLength(1);
    expect(parsed?.receipts[0]!.subject).toBe("");
    expect(parsed?.receipts[0]!.topic).toBe("");
  });

  it("collapses a duplicated operationId rather than double counting", () => {
    const raw = withReceipts([
      { operationId: "op1", questionId: "q1", subject: "M", topic: "T", outcome: "solved" },
      { operationId: "op1", questionId: "q1", subject: "M", topic: "T", outcome: "solved" },
    ]);
    expect(parseActiveStudySession(raw)?.receipts).toHaveLength(1);
  });

  it("preserves confirmed order rather than sorting", () => {
    const raw = withReceipts([
      { operationId: "op1", questionId: "q1", subject: "M", topic: "T", outcome: "struggled" },
      { operationId: "op2", questionId: "q2", subject: "M", topic: "T", outcome: "again" },
      { operationId: "op3", questionId: "q3", subject: "M", topic: "T", outcome: "solved" },
    ]);
    expect(parseActiveStudySession(raw)?.receipts.map((r) => r.outcome)).toEqual([
      "struggled",
      "again",
      "solved",
    ]);
  });
});

describe("active session — resume decision", () => {
  function start(raw: string | null, userId = USER, now = NOW + 1000) {
    return resolveSessionStart({ raw, userId, mode: "mandatory", now });
  }

  it("resumes a compatible session with its identity and receipts", () => {
    const result = start(stored());
    expect(result.resumed).toBe(true);
    expect(result.sessionInstanceId).toBe("session-1");
    expect(result.receipts).toHaveLength(1);
  });

  it("starts a new session when nothing is stored", () => {
    const result = start(null);
    expect(result.resumed).toBe(false);
    expect(result.receipts).toHaveLength(0);
  });

  it("never hydrates another student's session", () => {
    const result = start(stored(), "student-b");
    expect(result.resumed).toBe(false);
    expect(result.receipts).toHaveLength(0);
    expect(result.sessionInstanceId).not.toBe("session-1");
  });

  it("never hydrates a session recorded under a different mode", () => {
    const raw = JSON.stringify({ ...envelope(), mode: "adaptive" });
    expect(start(raw).resumed).toBe(false);
  });

  it("does not resume from corrupt storage", () => {
    expect(start("{broken").resumed).toBe(false);
    expect(start("{broken").receipts).toHaveLength(0);
  });

  it("does not resume a session older than the technical staleness bound", () => {
    const result = start(stored(), USER, NOW + ACTIVE_SESSION_MAX_AGE_MS + 1);
    expect(result.resumed).toBe(false);
    expect(result.receipts).toHaveLength(0);
  });

  it("still resumes just inside the staleness bound", () => {
    const result = start(stored(), USER, NOW + ACTIVE_SESSION_MAX_AGE_MS - 1);
    expect(result.resumed).toBe(true);
  });

  it("does not resume a record stamped in the future", () => {
    // A clock change must not produce an ageless session.
    expect(start(stored(), USER, NOW - 1).resumed).toBe(false);
  });

  it("carries startedAt forward so a refresh cannot reset the session's age", () => {
    const first = start(stored(), USER, NOW + 60_000);
    expect(first.startedAt).toBe(NOW);
    const second = resolveSessionStart({
      raw: serializeStudySessionStore(
        putStudySessionSlot(
          EMPTY_STUDY_SESSION_STORE,
          buildActiveStudySession({
            sessionInstanceId: first.sessionInstanceId,
            userId: USER,
            mode: "mandatory",
            startedAt: first.startedAt,
            receipts: first.receipts,
          }),
        ),
      ),
      userId: USER,
      mode: "mandatory",
      now: NOW + 120_000,
    });
    expect(second.startedAt).toBe(NOW);
  });

  it("stamps a new session with the current time", () => {
    expect(start(null, USER, NOW + 5).startedAt).toBe(NOW + 5);
  });
});

describe("session instance id", () => {
  it("mints a distinct id per new session", () => {
    const ids = new Set(Array.from({ length: 50 }, () => createSessionInstanceId()));
    expect(ids.size).toBe(50);
  });

  it("is never persisted as an outcome identity", () => {
    // The id lives only in the envelope; no receipt carries it.
    const parsed = parseActiveStudySession(stored());
    for (const entry of parsed!.receipts) {
      expect(entry.operationId).not.toBe(parsed!.sessionInstanceId);
    }
  });
});

// The sequence useReviewSession actually performs, step by step.
describe("session lifecycle — modelled in hook order", () => {
  function persist(sessionInstanceId: string, startedAt: number, receipts: SessionOutcomeReceipt[]) {
    return serializeStudySessionStore(
      putStudySessionSlot(
        EMPTY_STUDY_SESSION_STORE,
        buildActiveStudySession({
          sessionInstanceId,
          userId: USER,
          mode: "mandatory",
          startedAt,
          receipts,
        }),
      ),
    );
  }

  it("survives a refresh and finishes with every outcome exactly once", () => {
    // mount → new session
    const first = resolveSessionStart({ raw: null, userId: USER, mode: "mandatory", now: NOW });
    expect(first.resumed).toBe(false);

    // two confirmed outcomes, each appended then persisted
    let receipts = appendSessionReceipt(first.receipts, receipt("op1", "struggled", "q1"));
    let disk = persist(first.sessionInstanceId, first.startedAt, receipts);
    receipts = appendSessionReceipt(receipts, receipt("op2", "solved", "q2"));
    disk = persist(first.sessionInstanceId, first.startedAt, receipts);

    // refresh: all React state is destroyed, storage is not
    const resumed = resolveSessionStart({
      raw: disk,
      userId: USER,
      mode: "mandatory",
      now: NOW + 30_000,
    });
    expect(resumed.resumed).toBe(true);
    expect(resumed.sessionInstanceId).toBe(first.sessionInstanceId);
    expect(resumed.receipts).toHaveLength(2);

    // third outcome after the refresh
    const finalReceipts = appendSessionReceipt(resumed.receipts, receipt("op3", "solved", "q3"));
    const reflection = buildSessionReflection(finalReceipts);
    expect(reflection.confirmedOutcomeCount).toBe(3);
    expect(reflection.distinctQuestionCount).toBe(3);
    expect(sessionHeadline(reflection)).toBe("3 soru üzerinde çalıştın");
  });

  it("keeps the session id stable across repeated remounts", () => {
    const first = resolveSessionStart({ raw: null, userId: USER, mode: "mandatory", now: NOW });
    let disk = persist(first.sessionInstanceId, first.startedAt, []);
    for (let i = 0; i < 5; i += 1) {
      const again = resolveSessionStart({
        raw: disk,
        userId: USER,
        mode: "mandatory",
        now: NOW + i * 1000,
      });
      expect(again.sessionInstanceId).toBe(first.sessionInstanceId);
      disk = persist(again.sessionInstanceId, again.startedAt, again.receipts);
    }
  });

  it("does not grow the receipt on repeated reloads", () => {
    const start = resolveSessionStart({ raw: null, userId: USER, mode: "mandatory", now: NOW });
    let disk = persist(
      start.sessionInstanceId,
      start.startedAt,
      appendSessionReceipt(start.receipts, receipt("op1", "solved", "q1")),
    );
    for (let i = 0; i < 10; i += 1) {
      const reloaded = resolveSessionStart({
        raw: disk,
        userId: USER,
        mode: "mandatory",
        now: NOW + i,
      });
      expect(reloaded.receipts).toHaveLength(1);
      disk = persist(reloaded.sessionInstanceId, reloaded.startedAt, reloaded.receipts);
    }
  });

  it("ignores a success callback replayed after a refresh", () => {
    // The exact runtime case: outcome confirmed, persisted, page reloads, and
    // the same logical gesture is delivered again.
    const start = resolveSessionStart({ raw: null, userId: USER, mode: "mandatory", now: NOW });
    const disk = persist(
      start.sessionInstanceId,
      start.startedAt,
      appendSessionReceipt(start.receipts, receipt("op1", "solved", "q1")),
    );
    const resumed = resolveSessionStart({
      raw: disk,
      userId: USER,
      mode: "mandatory",
      now: NOW + 10,
    });
    const replayed = appendSessionReceipt(resumed.receipts, receipt("op1", "solved", "q1"));
    expect(replayed).toHaveLength(1);
    expect(buildSessionReflection(replayed).confirmedOutcomeCount).toBe(1);
  });

  it("hydrating after an early outcome keeps both, in confirmed order", () => {
    // Models the hook's merge: an outcome landed while the storage read was
    // still in flight, so hydration folds rather than assigns.
    const alreadyInMemory = [receipt("op-live", "solved", "q9")];
    const fromDisk = [receipt("op1", "struggled", "q1")];
    const merged = fromDisk.reduce(appendSessionReceipt, alreadyInMemory);
    expect(merged.map((r) => r.operationId)).toEqual(["op-live", "op1"]);
  });

  it("starts the next session clean once the previous one completed", () => {
    // Completion clears the stored record; the next mount therefore sees null.
    const next = resolveSessionStart({
      raw: null,
      userId: USER,
      mode: "mandatory",
      now: NOW + 60_000,
    });
    expect(next.resumed).toBe(false);
    expect(next.receipts).toHaveLength(0);
    expect(buildSessionReflection(next.receipts).isEmpty).toBe(true);
  });
});

// §88 — persistence must not change what the reflection says.
describe("reflection equivalence", () => {
  const inMemory = [
    receipt("op1", "struggled", "q1"),
    receipt("op2", "solved", "q2"),
    receipt("op3", "solved", "q3", "Geometri"),
  ];

  it("produces an identical reflection after a storage round trip", () => {
    const raw = storedByProduction({ receipts: inMemory });
    const hydrated = hydratedReceipts(raw);
    expect(buildSessionReflection(hydrated)).toEqual(buildSessionReflection(inMemory));
    expect(sessionHeadline(buildSessionReflection(hydrated))).toBe(
      sessionHeadline(buildSessionReflection(inMemory)),
    );
  });

  it("keeps the topic moment a round trip earned", () => {
    const raw = storedByProduction({ receipts: inMemory });
    const reflection = buildSessionReflection(hydratedReceipts(raw));
    expect(reflection.moments[0]!.topic).toBe("Denklemler");
    expect(reflection.moments[0]!.kind).toBe("recovery");
  });
});

describe("persisted payload privacy", () => {
  it("writes only the declared fields", () => {
    const parsed = JSON.parse(storedByProduction()) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(["slots", "version"]);
    const slot = (parsed.slots as Record<string, Record<string, unknown>>).mandatory!;
    expect(Object.keys(slot).sort()).toEqual([
      // Phase 68 added the frozen plan (ids only) and the completion stamp.
      // Phase 69 moved `version` up to the store. Nothing here is content.
      "completedAt",
      "mode",
      "plannedQuestionIds",
      "receipts",
      "sessionInstanceId",
      "startedAt",
      "userId",
    ]);
    const entry = (slot.receipts as Record<string, unknown>[])[0]!;
    expect(Object.keys(entry).sort()).toEqual([
      "operationId",
      "outcome",
      "questionId",
      "subject",
      "topic",
    ]);
  });

  it("carries no question content, credential or profile field", () => {
    const raw = storedByProduction({ receipts: [receipt("op1", "solved", "q1")] });
    for (const forbidden of [
      "questionText",
      "imageUrl",
      "choices",
      "answer",
      "displayName",
      "email",
      "token",
      "apiKey",
      "idToken",
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it("stamps the declared schema version", () => {
    expect(JSON.parse(storedByProduction()).version).toBe(STUDY_SESSION_STORE_VERSION);
    // The legacy constant still names the newest format this build can READ.
    expect(ACTIVE_STUDY_SESSION_VERSION).toBe(2);
  });
});
