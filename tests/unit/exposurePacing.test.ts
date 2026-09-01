import { paceEquivalentExposure } from "../../src/features/study/services/exposurePacing";

interface Item {
  id: string;
  topic: string | null;
  // The canonical rank. Equal rank = the comparator declared them equivalent,
  // which is the ONLY band pacing may act in.
  rank: number;
}

function item(id: string, topic: string | null, rank = 0): Item {
  return { id, topic, rank };
}

function pace(items: readonly Item[], previousKey: string | null = null): string[] {
  return paceEquivalentExposure({
    items,
    keyOf: (i) => i.topic,
    isEquivalent: (a, b) => a.rank === b.rank,
    previousKey,
  }).map((i) => i.id);
}

describe("paceEquivalentExposure — bounds", () => {
  it("returns an empty list unchanged", () => {
    expect(pace([])).toEqual([]);
  });

  it("returns a single item unchanged", () => {
    expect(pace([item("A1", "A")])).toEqual(["A1"]);
  });

  it("does not mutate its input", () => {
    const input = [item("A1", "A"), item("A2", "A"), item("B1", "B")];
    const copy = input.map((i) => ({ ...i }));
    paceEquivalentExposure({
      items: input,
      keyOf: (i) => i.topic,
      isEquivalent: (a, b) => a.rank === b.rank,
    });
    expect(input).toEqual(copy);
  });
});

describe("paceEquivalentExposure — topic spacing within an equivalence run", () => {
  // The §45 signature case.
  it("spaces a clustered topic when equal-priority alternatives exist", () => {
    expect(pace([item("A1", "A"), item("A2", "A"), item("B1", "B"), item("C1", "C")])).toEqual([
      "A1",
      "B1",
      "C1",
      "A2",
    ]);
  });

  it("keeps the canonical first item first", () => {
    expect(pace([item("A1", "A"), item("A2", "A"), item("B1", "B")])[0]).toBe("A1");
  });

  // §48 — no alternative exists, so nothing may change and no filler invented.
  it("leaves a single-topic run exactly as it was", () => {
    expect(pace([item("A1", "A"), item("A2", "A"), item("A3", "A")])).toEqual(["A1", "A2", "A3"]);
  });

  // §31 — pacing must not swap canonical order inside one topic.
  it("preserves intra-topic order", () => {
    const out = pace([item("A1", "A"), item("A2", "A"), item("A3", "A"), item("B1", "B")]);
    expect(out.filter((id) => id.startsWith("A"))).toEqual(["A1", "A2", "A3"]);
  });

  // §26 — this is not a no-repeat-ever system; A B A is already spacing.
  it("does not forbid a two-step topic gap", () => {
    expect(pace([item("A1", "A"), item("B1", "B"), item("A2", "A")])).toEqual(["A1", "B1", "A2"]);
  });

  it("never drops or duplicates an item", () => {
    const input = [
      item("A1", "A"),
      item("A2", "A"),
      item("A3", "A"),
      item("B1", "B"),
      item("C1", "C"),
    ];
    const out = pace(input);
    expect(out.slice().sort()).toEqual(input.map((i) => i.id).sort());
    expect(new Set(out).size).toBe(input.length);
  });
});

describe("paceEquivalentExposure — priority is never crossed", () => {
  // THE core safety property. A run boundary is a non-zero comparator result,
  // so a stronger candidate can never be demoted for variety.
  it("never moves a weaker candidate ahead of a stronger one", () => {
    // A1 is stronger (rank 0). B1/A2 are weaker peers (rank 1).
    const out = pace([item("A1", "A", 0), item("A2", "A", 1), item("B1", "B", 1)]);
    expect(out[0]).toBe("A1");
  });

  // §46 — even when the previous topic was A, a stronger A candidate stays first.
  it("keeps a stronger same-topic candidate first despite a topic clash", () => {
    const out = pace([item("A1", "A", 0), item("B1", "B", 1)], "A");
    expect(out).toEqual(["A1", "B1"]);
  });

  it("paces only inside each run, never across runs", () => {
    const out = pace([
      item("A1", "A", 0),
      item("A2", "A", 0),
      item("B1", "B", 0),
      item("A3", "A", 1),
      item("A4", "A", 1),
      item("C1", "C", 1),
    ]);
    // Run 1 (rank 0) paces among itself → A1 B1 A2, ending on topic A.
    // Run 2 (rank 1) then carries that context: it must not OPEN on A, so C1
    // leads. Crucially A3/A4 never rise above the rank-0 run.
    expect(out).toEqual(["A1", "B1", "A2", "C1", "A3", "A4"]);
  });

  // A run of strictly-ordered items must be completely untouched.
  it("leaves a fully-ordered list unchanged", () => {
    const out = pace([item("A1", "A", 0), item("A2", "A", 1), item("A3", "A", 2)]);
    expect(out).toEqual(["A1", "A2", "A3"]);
  });
});

describe("paceEquivalentExposure — previous-exposure context", () => {
  // §52 — the run must not OPEN on the concept just placed.
  it("delays the clashing topic when an alternative exists", () => {
    expect(pace([item("A1", "A"), item("A2", "A"), item("B1", "B")], "A")).toEqual([
      "B1",
      "A1",
      "A2",
    ]);
  });

  it("ignores a previous topic this run does not contain", () => {
    expect(pace([item("A1", "A"), item("B1", "B")], "Z")).toEqual(["A1", "B1"]);
  });

  // No alternative exists, so required content is never withheld.
  it("does not delay when the run has only that one topic", () => {
    expect(pace([item("A1", "A"), item("A2", "A")], "A")).toEqual(["A1", "A2"]);
  });

  it("carries context between runs so a later run does not repeat the last topic", () => {
    // Run 1 ends on B. Run 2 (rank 1) contains B and C → C should lead.
    const out = pace([item("A1", "A", 0), item("B1", "B", 0), item("B2", "B", 1), item("C1", "C", 1)]);
    expect(out).toEqual(["A1", "B1", "C1", "B2"]);
  });
});

describe("paceEquivalentExposure — missing metadata", () => {
  // §49/§50 — an unresolvable concept is its own group, never a shared bucket,
  // so two unrelated legacy items are not treated as the same concept.
  it("treats items with no key as distinct concepts", () => {
    expect(pace([item("X1", null), item("X2", null)])).toEqual(["X1", "X2"]);
  });

  it("does not crash on mixed known and unknown keys", () => {
    const out = pace([item("A1", "A"), item("X1", null), item("A2", "A")]);
    expect(out.slice().sort()).toEqual(["A1", "A2", "X1"]);
  });

  it("never groups a null-key item with a real topic", () => {
    const out = pace([item("A1", "A"), item("A2", "A"), item("X1", null)]);
    expect(out).toEqual(["A1", "X1", "A2"]);
  });
});

describe("paceEquivalentExposure — determinism", () => {
  it("is deterministic across repeated calls", () => {
    const input = [item("A1", "A"), item("A2", "A"), item("B1", "B"), item("C1", "C")];
    expect(pace(input)).toEqual(pace(input));
  });

  it("is deterministic with previous-key context", () => {
    const input = [item("A1", "A"), item("A2", "A"), item("B1", "B")];
    expect(pace(input, "A")).toEqual(pace(input, "A"));
  });

  it("produces no randomness across many runs", () => {
    const input = [item("A1", "A"), item("A2", "A"), item("B1", "B"), item("C1", "C")];
    const results = new Set(Array.from({ length: 25 }, () => pace(input).join(",")));
    expect(results.size).toBe(1);
  });
});
