import { StudyOutcome } from "../../src/features/study/domain/studyTypes";
import {
  resolveAdaptiveResumeIndex,
  resolveAdaptiveSessionCompletion,
} from "../../src/features/study/services/adaptiveSessionCompletion";
import {
  appendSessionReceipt,
  buildSessionReflection,
  SessionOutcomeReceipt,
} from "../../src/features/study/services/sessionReflection";

function receipt(
  questionId: string,
  outcome: StudyOutcome = "solved",
  operationId = `op-${questionId}-${outcome}`,
  subject = "Matematik",
  topic = "Denklemler",
): SessionOutcomeReceipt {
  return { operationId, questionId, subject, topic, outcome };
}

function completion(params: {
  planned: string[];
  resolvable?: string[];
  receipts?: SessionOutcomeReceipt[];
}) {
  return resolveAdaptiveSessionCompletion({
    plannedQuestionIds: params.planned,
    resolvableQuestionIds: params.resolvable ?? params.planned,
    receipts: params.receipts ?? [],
  });
}

describe("adaptive completion — plan size bounds", () => {
  // §10 — a session that planned nothing never started, so it cannot have
  // finished. Congratulating a student for completing nothing is the exact
  // fake completion this phase exists to remove.
  it("an empty plan is never complete", () => {
    expect(completion({ planned: [] }).isComplete).toBe(false);
  });

  it("a one-item plan completes on its single confirmed outcome", () => {
    expect(completion({ planned: ["a"] }).isComplete).toBe(false);
    expect(completion({ planned: ["a"], receipts: [receipt("a")] }).isComplete).toBe(true);
  });

  it("a multi-item plan completes only when every entry is confirmed", () => {
    const planned = ["a", "b", "c"];
    expect(completion({ planned, receipts: [receipt("a")] }).isComplete).toBe(false);
    expect(completion({ planned, receipts: [receipt("a"), receipt("b")] }).isComplete).toBe(false);
    expect(
      completion({ planned, receipts: [receipt("a"), receipt("b"), receipt("c")] }).isComplete,
    ).toBe(true);
  });
});

describe("adaptive completion — progress counts", () => {
  // §63 — the fraction the header renders. The denominator is the frozen
  // plan's answerable size and must not move as outcomes arrive.
  it("counts 0/3, 1/3, 2/3 then completes at 3/3", () => {
    const planned = ["a", "b", "c"];
    const steps: SessionOutcomeReceipt[] = [];
    const seen: string[] = [];
    for (const id of ["", "a", "b", "c"]) {
      if (id) steps.push(receipt(id));
      const result = completion({ planned, receipts: [...steps] });
      seen.push(`${result.confirmedCount}/${result.answerableCount}`);
    }
    expect(seen).toEqual(["0/3", "1/3", "2/3", "3/3"]);
  });

  it("keeps the denominator fixed while outcomes accumulate", () => {
    const planned = ["a", "b", "c"];
    const denominators = [[], [receipt("a")], [receipt("a"), receipt("b")]].map(
      (receipts) => completion({ planned, receipts }).answerableCount,
    );
    expect(denominators).toEqual([3, 3, 3]);
  });
});

describe("adaptive completion — confirmed outcomes only", () => {
  // §14 — a failed write produces no receipt at all (the operationId only
  // exists on success), so the contract can only ever move on real evidence.
  it("an entry with no receipt stays pending", () => {
    const result = completion({ planned: ["a", "b"], receipts: [receipt("a")] });
    expect(result.confirmedCount).toBe(1);
    expect(result.isComplete).toBe(false);
  });

  // §15 — a retry of the same gesture reuses the operationId, so the second
  // delivery collapses instead of counting twice.
  it("a retried gesture completes the entry exactly once", () => {
    let receipts: SessionOutcomeReceipt[] = [];
    const retried = receipt("a", "solved", "op-shared");
    receipts = appendSessionReceipt(receipts, retried);
    receipts = appendSessionReceipt(receipts, retried);
    expect(receipts).toHaveLength(1);
    expect(completion({ planned: ["a"], receipts }).confirmedCount).toBe(1);
  });

  // §13 — reaching the last card is not completion. Modelled directly: the
  // index is at the end, and nothing is confirmed.
  it("being on the final card confirms nothing", () => {
    const planned = ["a", "b", "c"];
    const atLastCard = planned.length - 1;
    expect(atLastCard).toBe(2);
    expect(completion({ planned }).isComplete).toBe(false);
  });
});

describe("adaptive completion — duplicate delivery", () => {
  // §61 — the same success callback firing twice must not double-count.
  it("a duplicate callback with the same operationId collapses", () => {
    let receipts: SessionOutcomeReceipt[] = [];
    const once = receipt("a", "struggled", "op-1");
    receipts = appendSessionReceipt(receipts, once);
    receipts = appendSessionReceipt(receipts, once);
    receipts = appendSessionReceipt(receipts, once);
    expect(receipts).toHaveLength(1);
    expect(buildSessionReflection(receipts).confirmedOutcomeCount).toBe(1);
  });

  // A genuinely different decision on the same question is a different
  // gesture and a different id, so it is a second real outcome — but it still
  // completes only the one plan entry.
  it("a changed answer on one question is two outcomes but one completed entry", () => {
    let receipts: SessionOutcomeReceipt[] = [];
    receipts = appendSessionReceipt(receipts, receipt("a", "struggled", "op-1"));
    receipts = appendSessionReceipt(receipts, receipt("a", "solved", "op-2"));
    expect(receipts).toHaveLength(2);
    const result = completion({ planned: ["a", "b"], receipts });
    expect(result.confirmedCount).toBe(1);
    expect(result.isComplete).toBe(false);
  });
});

describe("adaptive completion — entries outside the plan", () => {
  // §47 — an outcome for something this session never planned is real work
  // and belongs in the reflection, but it is not progress against THIS
  // session's contract and must not complete it early.
  it("an unplanned outcome cannot complete the session", () => {
    const result = completion({ planned: ["a", "b"], receipts: [receipt("a"), receipt("zz")] });
    expect(result.confirmedCount).toBe(1);
    expect(result.isComplete).toBe(false);
  });

  it("but it still counts toward the reflection", () => {
    const receipts = [receipt("a"), receipt("zz")];
    expect(buildSessionReflection(receipts).confirmedOutcomeCount).toBe(2);
  });
});

describe("adaptive completion — unavailable planned entries", () => {
  // §23 — a planned question that no longer resolves is excluded from the
  // contract, never marked done. Requiring it would deadlock the session at
  // "2 / 3" with no card left to answer.
  it("excludes an unresolvable entry rather than crediting it", () => {
    const result = completion({
      planned: ["a", "b", "gone"],
      resolvable: ["a", "b"],
      receipts: [receipt("a"), receipt("b")],
    });
    expect(result.isComplete).toBe(true);
    expect(result.confirmedCount).toBe(2);
    expect(result.answerableCount).toBe(2);
    expect(result.plannedCount).toBe(3);
    expect(result.unavailableCount).toBe(1);
  });

  it("does not deadlock when every remaining entry became unavailable", () => {
    const result = completion({
      planned: ["a", "gone1", "gone2"],
      resolvable: ["a"],
      receipts: [receipt("a")],
    });
    expect(result.isComplete).toBe(true);
    expect(result.unavailableCount).toBe(2);
  });

  it("a session whose every entry vanished is not complete, it is empty", () => {
    const result = completion({ planned: ["gone1", "gone2"], resolvable: [] });
    expect(result.isComplete).toBe(false);
    expect(result.answerableCount).toBe(0);
    expect(result.unavailableCount).toBe(2);
  });
});

describe("adaptive completion — duplicate plan entries", () => {
  // §45 — a frozen plan holding the same id twice would demand two confirmed
  // outcomes for one question, which no single answer can satisfy. Normalised
  // rather than left unfinishable.
  it("a duplicated plan id does not make the session unfinishable", () => {
    const result = completion({ planned: ["a", "a", "b"], receipts: [receipt("a"), receipt("b")] });
    expect(result.plannedCount).toBe(2);
    expect(result.isComplete).toBe(true);
  });
});

describe("adaptive completion — resume index", () => {
  it("lands on the first unconfirmed entry", () => {
    expect(
      resolveAdaptiveResumeIndex({
        resolvableQuestionIds: ["a", "b", "c"],
        receipts: [receipt("a")],
      }),
    ).toBe(1);
  });

  it("lands on the first gap when answers came out of order", () => {
    expect(
      resolveAdaptiveResumeIndex({
        resolvableQuestionIds: ["a", "b", "c"],
        receipts: [receipt("b")],
      }),
    ).toBe(0);
  });

  it("returns 0 when everything is confirmed (the completion screen takes over)", () => {
    expect(
      resolveAdaptiveResumeIndex({
        resolvableQuestionIds: ["a"],
        receipts: [receipt("a")],
      }),
    ).toBe(0);
  });

  it("returns 0 for an empty session", () => {
    expect(resolveAdaptiveResumeIndex({ resolvableQuestionIds: [], receipts: [] })).toBe(0);
  });
});

describe("adaptive completion — reflection reuse", () => {
  // §25/§64 — the completed adaptive session's summary is Phase 66's builder
  // output, unchanged. No adaptive-specific reflection semantics exist.
  it("produces exactly Phase 66's reflection from the session's receipts", () => {
    const receipts = [
      receipt("a", "struggled", "op-1"),
      receipt("b", "solved", "op-2"),
      receipt("c", "solved", "op-3"),
    ];
    const reflection = buildSessionReflection(receipts);
    expect(reflection.confirmedOutcomeCount).toBe(3);
    expect(reflection.distinctQuestionCount).toBe(3);
    expect(reflection.solvedCount).toBe(2);
    expect(reflection.struggledCount).toBe(1);
    // All three share a topic, and the sequence ends on a solve after a real
    // struggle — Phase 66's own recovery rule, applied unchanged.
    expect(reflection.moments[0]?.kind).toBe("recovery");
  });

  it("says nothing when the session confirmed nothing", () => {
    expect(buildSessionReflection([]).isEmpty).toBe(true);
  });
});
