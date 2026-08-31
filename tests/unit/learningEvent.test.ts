import {
  buildLearningEventId,
  buildLearningEventRecord,
  LEARNING_EVENT_SCHEMA_VERSION,
} from "../../functions/src/study/learningEvent";

describe("buildLearningEventId — structural idempotency", () => {
  // THE core integrity property: the same logical gesture, retried, must
  // resolve to the same document id so `set` overwrites instead of appending.
  it("is the operationId when the client supplied one", () => {
    expect(buildLearningEventId({ questionId: "q1", operationId: "op-abc123", now: 1000 })).toBe(
      "op-abc123",
    );
  });

  it("is identical across retries of the same operation, even at a different clock", () => {
    const first = buildLearningEventId({ questionId: "q1", operationId: "op-abc123", now: 1000 });
    const retry = buildLearningEventId({ questionId: "q1", operationId: "op-abc123", now: 9999 });
    expect(retry).toBe(first);
  });

  it("differs for two genuinely different gestures on the same question", () => {
    expect(buildLearningEventId({ questionId: "q1", operationId: "op-a", now: 1000 })).not.toBe(
      buildLearningEventId({ questionId: "q1", operationId: "op-b", now: 1000 }),
    );
  });

  // Without an operationId the id still must be stable for one invocation,
  // because `now` is captured once before the transaction opens — so a
  // Firestore transaction retry re-derives the same id.
  it("is stable for one invocation when no operationId is supplied", () => {
    const a = buildLearningEventId({ questionId: "q1", now: 1000 });
    const b = buildLearningEventId({ questionId: "q1", now: 1000 });
    expect(a).toBe(b);
  });

  it("separates two different questions in the fallback form", () => {
    expect(buildLearningEventId({ questionId: "q1", now: 1000 })).not.toBe(
      buildLearningEventId({ questionId: "q2", now: 1000 }),
    );
  });

  // Firestore document ids may not contain "/".
  it("never produces an id containing a path separator", () => {
    expect(buildLearningEventId({ questionId: "a/b", now: 1000 })).not.toContain("/");
    expect(buildLearningEventId({ questionId: "q", operationId: "o", now: 1 })).not.toContain("/");
  });

  it("never produces an empty id", () => {
    expect(buildLearningEventId({ questionId: "q1", now: 1000 }).length).toBeGreaterThan(0);
  });
});

describe("buildLearningEventRecord", () => {
  it("records the outcome verbatim, using the canonical enum", () => {
    for (const outcome of ["solved", "struggled", "again"] as const) {
      expect(buildLearningEventRecord({ questionId: "q1", outcome, now: 5, sourceClassId: null }).outcome).toBe(
        outcome,
      );
    }
  });

  // Server clock only — the record must carry exactly the timestamp it was
  // given, never a re-read of the local clock.
  it("uses the supplied server timestamp exactly", () => {
    expect(
      buildLearningEventRecord({ questionId: "q1", outcome: "solved", now: 1234, sourceClassId: null })
        .occurredAt,
    ).toBe(1234);
  });

  it("carries sourceClassId through, including null for non-class questions", () => {
    expect(
      buildLearningEventRecord({ questionId: "q1", outcome: "solved", now: 1, sourceClassId: "c1" })
        .sourceClassId,
    ).toBe("c1");
    expect(
      buildLearningEventRecord({ questionId: "q1", outcome: "solved", now: 1, sourceClassId: null })
        .sourceClassId,
    ).toBeNull();
  });

  it("stamps the schema version", () => {
    expect(
      buildLearningEventRecord({ questionId: "q1", outcome: "solved", now: 1, sourceClassId: null })
        .schemaVersion,
    ).toBe(LEARNING_EVENT_SCHEMA_VERSION);
  });

  // The event must never denormalize question content — the same rule
  // StudyItemRecord documents for itself, applied with more force because an
  // event outlives the item.
  it("carries no question content", () => {
    const record = buildLearningEventRecord({
      questionId: "q1",
      outcome: "solved",
      now: 1,
      sourceClassId: "c1",
    });
    expect(Object.keys(record).sort()).toEqual(
      ["occurredAt", "outcome", "questionId", "schemaVersion", "sourceClassId"].sort(),
    );
  });

  it("is deterministic", () => {
    const params = { questionId: "q1", outcome: "struggled" as const, now: 7, sourceClassId: null };
    expect(buildLearningEventRecord(params)).toEqual(buildLearningEventRecord(params));
  });
});
