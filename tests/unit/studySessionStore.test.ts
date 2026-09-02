import { StudyOutcome } from "../../src/features/study/domain/studyTypes";
import {
  ActiveStudySessionEnvelope,
  ActiveStudySessionMode,
  buildActiveStudySession,
  resolveCompletedSession,
  resolveSessionStart,
} from "../../src/features/study/services/activeStudySession";
import {
  EMPTY_STUDY_SESSION_STORE,
  isStudySessionStoreEmpty,
  parseStudySessionStore,
  putStudySessionSlot,
  readStudySessionSlot,
  removeStudySessionSlot,
  serializeStudySessionStore,
  STUDY_SESSION_STORE_VERSION,
  StudySessionStore,
} from "../../src/features/study/services/studySessionStore";
import { SessionOutcomeReceipt } from "../../src/features/study/services/sessionReflection";

const USER = "student-a";
const OTHER = "student-b";
const NOW = 1_700_000_000_000;

function receipt(questionId: string, outcome: StudyOutcome = "solved"): SessionOutcomeReceipt {
  return {
    operationId: `op-${questionId}-${outcome}`,
    questionId,
    subject: "Matematik",
    topic: "Denklemler",
    outcome,
  };
}

function slot(
  mode: ActiveStudySessionMode,
  overrides: Partial<Parameters<typeof buildActiveStudySession>[0]> = {},
): ActiveStudySessionEnvelope {
  return buildActiveStudySession({
    sessionInstanceId: `${mode}-session-1`,
    userId: USER,
    mode,
    startedAt: NOW,
    receipts: [receipt("q1")],
    plannedQuestionIds: mode === "adaptive" ? ["a", "b", "c", "d"] : [],
    ...overrides,
  });
}

function storeWith(...envelopes: ActiveStudySessionEnvelope[]): StudySessionStore {
  return envelopes.reduce(putStudySessionSlot, EMPTY_STUDY_SESSION_STORE);
}

function roundTrip(store: StudySessionStore): StudySessionStore {
  return parseStudySessionStore(serializeStudySessionStore(store));
}

describe("study session store — shape and bounds", () => {
  it("starts empty", () => {
    expect(parseStudySessionStore(null).slots).toEqual({});
    expect(isStudySessionStoreEmpty(parseStudySessionStore(null))).toBe(true);
  });

  it("holds a review slot alone", () => {
    const store = roundTrip(storeWith(slot("mandatory")));
    expect(readStudySessionSlot(store, "mandatory")?.sessionInstanceId).toBe("mandatory-session-1");
    expect(readStudySessionSlot(store, "adaptive")).toBeNull();
  });

  it("holds an adaptive slot alone", () => {
    const store = roundTrip(storeWith(slot("adaptive")));
    expect(readStudySessionSlot(store, "adaptive")?.plannedQuestionIds).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(readStudySessionSlot(store, "mandatory")).toBeNull();
  });

  it("holds both modes at once", () => {
    const store = roundTrip(storeWith(slot("mandatory"), slot("adaptive")));
    expect(readStudySessionSlot(store, "mandatory")?.sessionInstanceId).toBe("mandatory-session-1");
    expect(readStudySessionSlot(store, "adaptive")?.sessionInstanceId).toBe("adaptive-session-1");
  });

  // §14 — bounded, structurally. `slots` is keyed by mode, so there is no
  // shape in which a third session can exist.
  it("cannot grow past two slots however many writes happen", () => {
    let store = EMPTY_STUDY_SESSION_STORE;
    for (let i = 0; i < 20; i += 1) {
      store = putStudySessionSlot(
        store,
        slot("mandatory", { sessionInstanceId: `m-${i}`, receipts: [receipt(`q${i}`)] }),
      );
      store = putStudySessionSlot(store, slot("adaptive", { sessionInstanceId: `a-${i}` }));
    }
    expect(Object.keys(roundTrip(store).slots).sort()).toEqual(["adaptive", "mandatory"]);
  });

  it("replaces a slot rather than appending to it", () => {
    const store = storeWith(
      slot("mandatory", { sessionInstanceId: "first" }),
      slot("mandatory", { sessionInstanceId: "second" }),
    );
    expect(readStudySessionSlot(store, "mandatory")?.sessionInstanceId).toBe("second");
  });
});

// §18/§70 — THE invariant. Writing one mode must not disturb the other.
describe("study session store — slot-preserving mutations", () => {
  it("saving review leaves adaptive byte-identical", () => {
    const before = storeWith(slot("mandatory"), slot("adaptive"));
    const adaptiveBefore = serializeStudySessionStore(
      storeWith(readStudySessionSlot(before, "adaptive")!),
    );

    const after = putStudySessionSlot(
      before,
      slot("mandatory", { receipts: [receipt("q1"), receipt("q2", "struggled")] }),
    );
    expect(readStudySessionSlot(after, "mandatory")?.receipts).toHaveLength(2);
    expect(serializeStudySessionStore(storeWith(readStudySessionSlot(after, "adaptive")!))).toBe(
      adaptiveBefore,
    );
  });

  it("saving adaptive leaves review byte-identical", () => {
    const before = storeWith(slot("mandatory"), slot("adaptive"));
    const reviewBefore = serializeStudySessionStore(
      storeWith(readStudySessionSlot(before, "mandatory")!),
    );

    const after = putStudySessionSlot(
      before,
      slot("adaptive", { receipts: [receipt("a"), receipt("b")] }),
    );
    expect(readStudySessionSlot(after, "adaptive")?.receipts).toHaveLength(2);
    expect(serializeStudySessionStore(storeWith(readStudySessionSlot(after, "mandatory")!))).toBe(
      reviewBefore,
    );
  });

  // §69 — the acknowledge path. Phase 68 removed the whole key here, which is
  // exactly how finishing a review destroyed an in-progress adaptive session.
  it("clearing review leaves adaptive byte-identical", () => {
    const before = storeWith(slot("mandatory"), slot("adaptive"));
    const adaptiveBefore = serializeStudySessionStore(
      storeWith(readStudySessionSlot(before, "adaptive")!),
    );

    const after = removeStudySessionSlot(before, "mandatory");
    expect(readStudySessionSlot(after, "mandatory")).toBeNull();
    expect(serializeStudySessionStore(storeWith(readStudySessionSlot(after, "adaptive")!))).toBe(
      adaptiveBefore,
    );
  });

  it("clearing adaptive leaves review byte-identical", () => {
    const before = storeWith(slot("mandatory"), slot("adaptive"));
    const reviewBefore = serializeStudySessionStore(
      storeWith(readStudySessionSlot(before, "mandatory")!),
    );

    const after = removeStudySessionSlot(before, "adaptive");
    expect(readStudySessionSlot(after, "adaptive")).toBeNull();
    expect(serializeStudySessionStore(storeWith(readStudySessionSlot(after, "mandatory")!))).toBe(
      reviewBefore,
    );
  });

  it("clearing the last slot leaves an empty store the caller can drop", () => {
    const after = removeStudySessionSlot(storeWith(slot("adaptive")), "adaptive");
    expect(isStudySessionStoreEmpty(after)).toBe(true);
  });

  it("clearing an absent slot is a no-op", () => {
    const before = storeWith(slot("adaptive"));
    expect(removeStudySessionSlot(before, "mandatory")).toBe(before);
  });

  it("never mutates the store it is given", () => {
    const before = storeWith(slot("mandatory"));
    const snapshot = serializeStudySessionStore(before);
    putStudySessionSlot(before, slot("adaptive"));
    removeStudySessionSlot(before, "mandatory");
    expect(serializeStudySessionStore(before)).toBe(snapshot);
  });
});

describe("study session store — completion coexistence", () => {
  // §37
  it("holds a completed review beside an active adaptive session", () => {
    const store = roundTrip(
      storeWith(slot("mandatory", { completedAt: NOW + 1000 }), slot("adaptive")),
    );
    expect(readStudySessionSlot(store, "mandatory")?.completedAt).toBe(NOW + 1000);
    expect(readStudySessionSlot(store, "adaptive")?.completedAt).toBeNull();
  });

  // §38
  it("holds a completed adaptive beside an active review session", () => {
    const store = roundTrip(
      storeWith(slot("mandatory"), slot("adaptive", { completedAt: NOW + 1000 })),
    );
    expect(readStudySessionSlot(store, "adaptive")?.completedAt).toBe(NOW + 1000);
    expect(readStudySessionSlot(store, "mandatory")?.completedAt).toBeNull();
  });

  // §68 — reachable, because completing one mode never touches the other, and
  // acknowledgement is a separate explicit act.
  it("holds two completed snapshots, still bounded at two", () => {
    const raw = serializeStudySessionStore(
      storeWith(
        slot("mandatory", { completedAt: NOW + 1000 }),
        slot("adaptive", { completedAt: NOW + 2000 }),
      ),
    );
    expect(resolveCompletedSession({ raw, userId: USER, mode: "mandatory", now: NOW + 3000 })).not.toBeNull();
    expect(resolveCompletedSession({ raw, userId: USER, mode: "adaptive", now: NOW + 3000 })).not.toBeNull();
    expect(Object.keys(parseStudySessionStore(raw).slots)).toHaveLength(2);
  });
});

describe("study session store — untrusted input", () => {
  it("returns an empty store for unreadable records", () => {
    for (const raw of [null, "", "{not json", "[]", '"x"', "42", "null"]) {
      expect(parseStudySessionStore(raw).slots).toEqual({});
    }
  });

  // §75
  it("fails closed on an unknown future version", () => {
    const raw = JSON.stringify({ version: 99, slots: { mandatory: slot("mandatory") } });
    expect(parseStudySessionStore(raw).slots).toEqual({});
  });

  it("returns an empty store when slots is not an object", () => {
    for (const slots of [null, [], "x", 3]) {
      const raw = JSON.stringify({ version: STUDY_SESSION_STORE_VERSION, slots });
      expect(parseStudySessionStore(raw).slots).toEqual({});
    }
  });

  // §76 — allowed modes only. A stray key must never become a slot.
  it("ignores unknown mode keys", () => {
    const raw = JSON.stringify({
      version: STUDY_SESSION_STORE_VERSION,
      slots: {
        adaptive: { ...slot("adaptive") },
        assignment: { ...slot("adaptive"), mode: "assignment" },
        __proto__: { polluted: true },
        "": { ...slot("adaptive"), mode: "" },
      },
    });
    const store = parseStudySessionStore(raw);
    expect(Object.keys(store.slots)).toEqual(["adaptive"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  // §45 — one bad mode must not destroy the other.
  it("drops a malformed slot and keeps its valid sibling", () => {
    const raw = JSON.stringify({
      version: STUDY_SESSION_STORE_VERSION,
      slots: {
        mandatory: { sessionInstanceId: 7, userId: null, receipts: "nope" },
        adaptive: { ...slot("adaptive") },
      },
    });
    const store = parseStudySessionStore(raw);
    expect(readStudySessionSlot(store, "mandatory")).toBeNull();
    expect(readStudySessionSlot(store, "adaptive")?.plannedQuestionIds).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  // A slot whose own mode contradicts the key it sits under is not "repaired"
  // into either — that guess would move evidence between modes.
  it("rejects a slot filed under the wrong mode", () => {
    const raw = JSON.stringify({
      version: STUDY_SESSION_STORE_VERSION,
      slots: { mandatory: { ...slot("adaptive") } },
    });
    expect(parseStudySessionStore(raw).slots).toEqual({});
  });

  it("drops malformed receipts without dropping the slot", () => {
    const raw = JSON.stringify({
      version: STUDY_SESSION_STORE_VERSION,
      slots: {
        adaptive: {
          ...slot("adaptive"),
          receipts: [receipt("q1"), { questionId: "q2" }, null, { operationId: "op" }],
        },
      },
    });
    expect(readStudySessionSlot(parseStudySessionStore(raw), "adaptive")?.receipts).toHaveLength(1);
  });

  it("collapses duplicated operationIds in corrupted storage", () => {
    const dup = receipt("q1");
    const raw = JSON.stringify({
      version: STUDY_SESSION_STORE_VERSION,
      slots: { adaptive: { ...slot("adaptive"), receipts: [dup, dup, dup] } },
    });
    expect(readStudySessionSlot(parseStudySessionStore(raw), "adaptive")?.receipts).toHaveLength(1);
  });
});

// §71/§72/§73 — a real session in progress is not thrown away because the
// local schema moved on.
describe("study session store — migration from Phase 67/68", () => {
  function legacy(fields: Record<string, unknown>): string {
    return JSON.stringify({
      sessionInstanceId: "legacy-1",
      userId: USER,
      startedAt: NOW,
      receipts: [receipt("q1", "struggled")],
      ...fields,
    });
  }

  it("migrates a v1 review record into the review slot", () => {
    const store = parseStudySessionStore(legacy({ version: 1, mode: "mandatory" }));
    const migrated = readStudySessionSlot(store, "mandatory");
    expect(migrated?.sessionInstanceId).toBe("legacy-1");
    expect(migrated?.receipts).toHaveLength(1);
    expect(migrated?.plannedQuestionIds).toEqual([]);
    expect(migrated?.completedAt).toBeNull();
    expect(readStudySessionSlot(store, "adaptive")).toBeNull();
  });

  it("migrates a v2 review record, completion state preserved", () => {
    const raw = legacy({ version: 2, mode: "mandatory", completedAt: NOW + 500 });
    const migrated = readStudySessionSlot(parseStudySessionStore(raw), "mandatory");
    expect(migrated?.completedAt).toBe(NOW + 500);
    expect(resolveCompletedSession({ raw, userId: USER, mode: "mandatory", now: NOW + 600 })).not.toBeNull();
    // Still not resumable as ACTIVE — completion survives migration intact.
    expect(resolveSessionStart({ raw, userId: USER, mode: "mandatory", now: NOW + 600 }).resumed).toBe(false);
  });

  it("migrates a v2 adaptive record with its frozen plan", () => {
    const raw = legacy({
      version: 2,
      mode: "adaptive",
      plannedQuestionIds: ["a", "b", "c"],
    });
    const migrated = readStudySessionSlot(parseStudySessionStore(raw), "adaptive");
    expect(migrated?.plannedQuestionIds).toEqual(["a", "b", "c"]);
    expect(migrated?.receipts).toHaveLength(1);
    expect(readStudySessionSlot(parseStudySessionStore(raw), "mandatory")).toBeNull();
  });

  it("resumes a migrated session through the normal resolver", () => {
    const raw = legacy({ version: 2, mode: "adaptive", plannedQuestionIds: ["a", "b"] });
    const start = resolveSessionStart({ raw, userId: USER, mode: "adaptive", now: NOW + 1000 });
    expect(start.resumed).toBe(true);
    expect(start.sessionInstanceId).toBe("legacy-1");
    expect(start.plannedQuestionIds).toEqual(["a", "b"]);
  });

  // §74 — migrate, write the new schema, re-read: no evidence lost, and the
  // sibling mode can now start without touching the migrated one.
  it("writes the new schema on the next save without losing anything", () => {
    const raw = legacy({ version: 2, mode: "adaptive", plannedQuestionIds: ["a", "b"] });
    const migrated = parseStudySessionStore(raw);

    const withSibling = putStudySessionSlot(migrated, slot("mandatory"));
    const rewritten = serializeStudySessionStore(withSibling);
    expect(JSON.parse(rewritten).version).toBe(STUDY_SESSION_STORE_VERSION);

    const reread = parseStudySessionStore(rewritten);
    expect(readStudySessionSlot(reread, "adaptive")?.sessionInstanceId).toBe("legacy-1");
    expect(readStudySessionSlot(reread, "adaptive")?.plannedQuestionIds).toEqual(["a", "b"]);
    expect(readStudySessionSlot(reread, "adaptive")?.receipts).toHaveLength(1);
    expect(readStudySessionSlot(reread, "mandatory")?.sessionInstanceId).toBe("mandatory-session-1");
  });

  // §26 — no heroic recovery, and above all no timestamp reconstruction.
  it("discards a malformed legacy record rather than guessing", () => {
    for (const raw of [
      legacy({ version: 2 }),
      legacy({ version: 2, mode: "assignment" }),
      legacy({ version: 2, mode: "mandatory", startedAt: "yesterday" }),
      legacy({ version: 2, mode: "mandatory", receipts: "nope" }),
    ]) {
      expect(parseStudySessionStore(raw).slots).toEqual({});
    }
  });
});

// §16/§59 — evidence never crosses accounts.
describe("study session store — user isolation", () => {
  it("does not resume another student's slot", () => {
    const raw = serializeStudySessionStore(storeWith(slot("mandatory"), slot("adaptive")));
    for (const mode of ["mandatory", "adaptive"] as const) {
      const start = resolveSessionStart({ raw, userId: OTHER, mode, now: NOW });
      expect(start.resumed).toBe(false);
      expect(start.receipts).toEqual([]);
      expect(start.plannedQuestionIds).toEqual([]);
    }
  });

  it("does not restore another student's completed summary", () => {
    const raw = serializeStudySessionStore(
      storeWith(slot("adaptive", { completedAt: NOW + 100 })),
    );
    expect(resolveCompletedSession({ raw, userId: OTHER, mode: "adaptive", now: NOW + 200 })).toBeNull();
  });

  // The foreign slot is LEFT IN PLACE, the Phase 67 policy: deleting it would
  // destroy the real session of whoever it belongs to. It is still bounded —
  // one slot per mode, whoever owns it.
  it("leaves a foreign slot readable only by its owner", () => {
    const raw = serializeStudySessionStore(storeWith(slot("adaptive")));
    expect(resolveSessionStart({ raw, userId: OTHER, mode: "adaptive", now: NOW }).resumed).toBe(false);
    expect(resolveSessionStart({ raw, userId: USER, mode: "adaptive", now: NOW }).resumed).toBe(true);
  });
});
