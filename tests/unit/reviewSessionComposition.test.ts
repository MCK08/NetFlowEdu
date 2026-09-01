// Phase 63 — review page interleaving.
//
// The safety property under test is narrow but important: this may only
// change the ORDER of entries the due query already returned, never which
// entries those are. Every test below either proves a diversity improvement
// or proves that nothing about eligibility, membership or determinism moved.

import {
  interleaveReviewEntries,
  trailingTopicKey,
} from "../../src/features/study/services/reviewSessionComposition";
import { ResolvedQueueEntry } from "../../src/features/study/services/studyService";
import { mergeResolvedPages } from "../../src/features/study/services/studyQueueMerge";

function entry(
  questionId: string,
  topic: string | null = "Denklemler",
  subject: string | null = "Matematik",
): ResolvedQueueEntry {
  return {
    item: { questionId } as ResolvedQueueEntry["item"],
    question:
      topic === null || subject === null
        ? null
        : ({ id: questionId, subject, topic } as ResolvedQueueEntry["question"]),
  };
}

function ids(entries: readonly ResolvedQueueEntry[]): string[] {
  return entries.map((e) => e.item.questionId);
}

describe("interleaveReviewEntries — diversity", () => {
  // §43 — the mandated three-topic case.
  it("spreads topics instead of clustering them", () => {
    const page = [
      entry("A1", "Algebra"),
      entry("A2", "Algebra"),
      entry("B1", "Geometry"),
      entry("C1", "Fractions"),
    ];
    expect(ids(interleaveReviewEntries(page))).toEqual(["A1", "B1", "C1", "A2"]);
  });

  // §83 — the WOW case.
  it("balances a heavily clustered page", () => {
    const page = [
      entry("A1", "Algebra"),
      entry("A2", "Algebra"),
      entry("A3", "Algebra"),
      entry("B1", "Geometry"),
      entry("C1", "Fractions"),
    ];
    expect(ids(interleaveReviewEntries(page))).toEqual(["A1", "B1", "C1", "A2", "A3"]);
  });

  it("keeps the page's canonical first entry first", () => {
    const page = [
      entry("A1", "Algebra"),
      entry("A2", "Algebra"),
      entry("B1", "Geometry"),
    ];
    // The most-overdue item the query put at the top is still at the top.
    expect(ids(interleaveReviewEntries(page))[0]).toBe("A1");
  });

  it("never places the same topic consecutively when an alternative exists", () => {
    const page = [
      entry("A1", "Algebra"),
      entry("A2", "Algebra"),
      entry("A3", "Algebra"),
      entry("B1", "Geometry"),
      entry("B2", "Geometry"),
      entry("C1", "Fractions"),
    ];
    const out = interleaveReviewEntries(page);
    // Walk the result: a repeat is only acceptable once the other topics are
    // exhausted, which the round-robin guarantees happens at the tail.
    expect(ids(out)).toEqual(["A1", "B1", "C1", "A2", "B2", "A3"]);
  });
});

describe("interleaveReviewEntries — no starvation", () => {
  // §54 — a dominant topic must not crowd out the others, and must not be
  // starved by them either.
  it("gives every topic an early slot, then returns to the dominant one", () => {
    const page = [
      ...["A1", "A2", "A3", "A4", "A5", "A6"].map((id) => entry(id, "Algebra")),
      entry("B1", "Geometry"),
      entry("C1", "Fractions"),
    ];
    const out = ids(interleaveReviewEntries(page));
    expect(out.slice(0, 3)).toEqual(["A1", "B1", "C1"]);
    // Every Algebra item is still present, in its original relative order.
    expect(out.filter((id) => id.startsWith("A"))).toEqual([
      "A1", "A2", "A3", "A4", "A5", "A6",
    ]);
  });
});

describe("interleaveReviewEntries — membership is never changed", () => {
  it("returns exactly the same set of questions", () => {
    const page = [
      entry("A1", "Algebra"),
      entry("B1", "Geometry"),
      entry("A2", "Algebra"),
      entry("C1", "Fractions"),
    ];
    expect(ids(interleaveReviewEntries(page)).sort()).toEqual(ids(page).sort());
  });

  it("never introduces or drops an entry", () => {
    const page = ["q1", "q2", "q3", "q4", "q5"].map((id, i) =>
      entry(id, i % 2 === 0 ? "Algebra" : "Geometry"),
    );
    expect(interleaveReviewEntries(page)).toHaveLength(page.length);
  });

  // §51 — defensive only; cross-page duplicates are the queue merge's job.
  it("drops a duplicated questionId within one page", () => {
    const page = [
      entry("A1", "Algebra"),
      entry("A1", "Algebra"),
      entry("B1", "Geometry"),
      entry("C1", "Fractions"),
    ];
    const out = ids(interleaveReviewEntries(page));
    expect(out.filter((id) => id === "A1")).toHaveLength(1);
  });
});

describe("interleaveReviewEntries — degenerate pages", () => {
  it("returns an empty page unchanged", () => {
    expect(interleaveReviewEntries([])).toEqual([]);
  });

  it("returns a single entry unchanged", () => {
    expect(ids(interleaveReviewEntries([entry("A1")]))).toEqual(["A1"]);
  });

  // §41 — nothing to balance against.
  it("keeps canonical order when every entry shares one topic", () => {
    const page = ["A1", "A2", "A3"].map((id) => entry(id, "Algebra"));
    expect(ids(interleaveReviewEntries(page))).toEqual(["A1", "A2", "A3"]);
  });

  it("leaves a two-entry page exactly as the query returned it", () => {
    const page = [entry("A1", "Algebra"), entry("A2", "Algebra")];
    expect(ids(interleaveReviewEntries(page))).toEqual(["A1", "A2"]);
  });
});

describe("interleaveReviewEntries — missing metadata", () => {
  // §17 / §52 — an unavailable question has no topic to group by.
  it("treats entries without a resolvable question as their own group", () => {
    const page = [
      entry("A1", "Algebra"),
      entry("X1", null, null),
      entry("A2", "Algebra"),
      entry("X2", null, null),
    ];
    const out = ids(interleaveReviewEntries(page));
    // Never lumped into one shared "unknown" bucket, so two unrelated
    // unavailable rows do not become artificially adjacent.
    expect(out).toHaveLength(4);
    expect(out[0]).toBe("A1");
    expect(new Set(out)).toEqual(new Set(["A1", "X1", "A2", "X2"]));
  });

  it("handles a page of entirely unresolvable entries", () => {
    const page = [entry("X1", null, null), entry("X2", null, null), entry("X3", null, null)];
    expect(ids(interleaveReviewEntries(page))).toEqual(["X1", "X2", "X3"]);
  });

  it("groups topics that differ only by surrounding whitespace", () => {
    const page = [
      entry("A1", "Algebra"),
      entry("A2", " Algebra "),
      entry("B1", "Geometry"),
    ];
    // " Algebra " is the same topic, so it must not be treated as a third
    // group and interleaved as if it were variety.
    expect(ids(interleaveReviewEntries(page))).toEqual(["A1", "B1", "A2"]);
  });

  it("does not merge two different subjects that share a topic name", () => {
    const page = [
      entry("M1", "Denklemler", "Matematik"),
      entry("F1", "Denklemler", "Fizik"),
      entry("M2", "Denklemler", "Matematik"),
    ];
    expect(ids(interleaveReviewEntries(page))).toEqual(["M1", "F1", "M2"]);
  });
});

describe("interleaveReviewEntries — determinism", () => {
  it("produces the same output for the same input every time", () => {
    const page = [
      entry("A1", "Algebra"),
      entry("B1", "Geometry"),
      entry("A2", "Algebra"),
      entry("C1", "Fractions"),
      entry("A3", "Algebra"),
    ];
    expect(ids(interleaveReviewEntries(page))).toEqual(ids(interleaveReviewEntries(page)));
  });

  it("follows the query's order, so a different query order gives a different (still deterministic) result", () => {
    const first = [entry("A1", "Algebra"), entry("A2", "Algebra"), entry("B1", "Geometry")];
    const second = [entry("B1", "Geometry"), entry("A1", "Algebra"), entry("A2", "Algebra")];
    // Both are stable; the lead entry is whichever the canonical query put
    // first, which is exactly the behaviour that preserves scheduler order.
    expect(ids(interleaveReviewEntries(first))[0]).toBe("A1");
    expect(ids(interleaveReviewEntries(second))[0]).toBe("B1");
    expect(ids(interleaveReviewEntries(second))).toEqual(ids(interleaveReviewEntries(second)));
  });

  it("preserves each topic's internal order exactly", () => {
    const page = [
      entry("A1", "Algebra"),
      entry("A2", "Algebra"),
      entry("A3", "Algebra"),
      entry("B1", "Geometry"),
    ];
    const out = ids(interleaveReviewEntries(page));
    expect(out.filter((id) => id.startsWith("A"))).toEqual(["A1", "A2", "A3"]);
  });
});

// §78 — the composed pipeline exactly as useReviewSession performs it:
// interleave the INCOMING page, then merge it onto what is already loaded.
// This is where the mid-session safety property actually lives, so it is
// tested against the real merge rather than a stand-in.
describe("review session pipeline — interleave then merge", () => {
  it("balances the first page the student sees", () => {
    const page = [
      entry("A1", "Algebra"),
      entry("A2", "Algebra"),
      entry("A3", "Algebra"),
      entry("B1", "Geometry"),
      entry("C1", "Fractions"),
    ];
    const state = mergeResolvedPages([], interleaveReviewEntries(page));
    expect(ids(state)).toEqual(["A1", "B1", "C1", "A2", "A3"]);
  });

  // §25 — the property that makes this safe to ship.
  it("NEVER reorders entries the student has already loaded", () => {
    const pageOne = [
      entry("A1", "Algebra"),
      entry("A2", "Algebra"),
      entry("B1", "Geometry"),
    ];
    const afterFirst = mergeResolvedPages([], interleaveReviewEntries(pageOne));
    const settled = ids(afterFirst);

    const pageTwo = [
      entry("D1", "Kesirler"),
      entry("D2", "Kesirler"),
      entry("E1", "Üçgenler"),
    ];
    const afterSecond = mergeResolvedPages(afterFirst, interleaveReviewEntries(pageTwo));

    // Page one's order is untouched, and page two is appended after it.
    expect(ids(afterSecond).slice(0, settled.length)).toEqual(settled);
    expect(ids(afterSecond)).toHaveLength(6);
  });

  it("keeps the queue's cross-page dedupe working", () => {
    // A page boundary can legitimately re-return an item whose nextReviewAt
    // was rewritten by a review; the merge must still drop it.
    const pageOne = [entry("A1", "Algebra"), entry("B1", "Geometry"), entry("C1", "Fractions")];
    const afterFirst = mergeResolvedPages([], interleaveReviewEntries(pageOne));
    const pageTwo = [entry("A1", "Algebra"), entry("D1", "Kesirler"), entry("E1", "Üçgenler")];
    const afterSecond = mergeResolvedPages(afterFirst, interleaveReviewEntries(pageTwo));
    expect(ids(afterSecond).filter((id) => id === "A1")).toHaveLength(1);
    expect(ids(afterSecond)).toHaveLength(5);
  });

  it("introduces no entry the due query did not return", () => {
    const page = [entry("A1", "Algebra"), entry("A2", "Algebra"), entry("B1", "Geometry")];
    const state = mergeResolvedPages([], interleaveReviewEntries(page));
    expect(new Set(ids(state))).toEqual(new Set(ids(page)));
  });
});

// ---------------------------------------------------------------------------
// Phase 64 — cross-page continuity.
//
// The addition is one rule: do not OPEN a page with the topic the session
// already ends on, when the page offers an alternative. Everything Phase 63
// established must survive it unchanged, so the first block below is
// deliberately a regression guard rather than a new feature test.
// ---------------------------------------------------------------------------

describe("Phase 64 — first page is unchanged", () => {
  it("composes identically with no previous topic", () => {
    const page = [
      entry("A1", "Algebra"),
      entry("A2", "Algebra"),
      entry("A3", "Algebra"),
      entry("B1", "Geometry"),
      entry("C1", "Fractions"),
    ];
    // Explicit null and the default argument must both mean "first page".
    expect(ids(interleaveReviewEntries(page, null))).toEqual(ids(interleaveReviewEntries(page)));
    expect(ids(interleaveReviewEntries(page))).toEqual(["A1", "B1", "C1", "A2", "A3"]);
  });
});

describe("Phase 64 — boundary rule", () => {
  const ALGEBRA = "Matematik|Algebra";

  // §18
  it("delays the repeated topic when one alternative exists", () => {
    const page = [entry("A1", "Algebra"), entry("A2", "Algebra"), entry("B1", "Geometry")];
    expect(ids(interleaveReviewEntries(page, ALGEBRA))).toEqual(["B1", "A1", "A2"]);
  });

  // §19
  it("delays the repeated topic when several alternatives exist", () => {
    const page = [
      entry("A1", "Algebra"),
      entry("A2", "Algebra"),
      entry("B1", "Geometry"),
      entry("C1", "Fractions"),
    ];
    expect(ids(interleaveReviewEntries(page, ALGEBRA))).toEqual(["B1", "C1", "A1", "A2"]);
  });

  // §17 / §55 — nothing to offer instead.
  it("leaves a single-topic page untouched", () => {
    const page = ["A1", "A2", "A3"].map((id) => entry(id, "Algebra"));
    expect(ids(interleaveReviewEntries(page, ALGEBRA))).toEqual(["A1", "A2", "A3"]);
  });

  it("leaves a full page of one topic untouched", () => {
    const page = Array.from({ length: 10 }, (_, i) => entry(`A${i}`, "Algebra"));
    expect(ids(interleaveReviewEntries(page, ALGEBRA))).toEqual(ids(page));
  });

  // §20 — previous topic absent from this page.
  it("changes nothing when the previous topic is not in the page", () => {
    const page = [
      entry("A1", "Algebra"),
      entry("A2", "Algebra"),
      entry("B1", "Geometry"),
      entry("C1", "Fractions"),
    ];
    const withUnrelated = interleaveReviewEntries(page, "Matematik|Zebra");
    expect(ids(withUnrelated)).toEqual(ids(interleaveReviewEntries(page)));
  });

  // §21 — unresolvable previous entry means no context at all.
  it("falls back to Phase 63 order when the previous topic is unknown", () => {
    const page = [entry("A1", "Algebra"), entry("A2", "Algebra"), entry("B1", "Geometry")];
    expect(ids(interleaveReviewEntries(page, null))).toEqual(ids(interleaveReviewEntries(page)));
  });

  it("does not treat the same topic under a different subject as a repeat", () => {
    const page = [
      entry("M1", "Denklemler", "Matematik"),
      entry("M2", "Denklemler", "Matematik"),
      entry("F1", "Denklemler", "Fizik"),
    ];
    // Previous was Fizik|Denklemler, so the Matematik group must NOT be moved.
    expect(ids(interleaveReviewEntries(page, "Fizik|Denklemler"))).toEqual(["M1", "F1", "M2"]);
  });

  // §40 — delayed, never dropped.
  it("keeps every entry and every intra-topic order when delaying", () => {
    const page = [
      entry("A1", "Algebra"),
      entry("A2", "Algebra"),
      entry("A3", "Algebra"),
      entry("B1", "Geometry"),
    ];
    const out = ids(interleaveReviewEntries(page, ALGEBRA));
    expect(new Set(out)).toEqual(new Set(["A1", "A2", "A3", "B1"]));
    expect(out.filter((id) => id.startsWith("A"))).toEqual(["A1", "A2", "A3"]);
  });

  // §25
  it("is deterministic", () => {
    const page = [
      entry("A1", "Algebra"),
      entry("B1", "Geometry"),
      entry("A2", "Algebra"),
      entry("C1", "Fractions"),
    ];
    expect(ids(interleaveReviewEntries(page, ALGEBRA))).toEqual(
      ids(interleaveReviewEntries(page, ALGEBRA)),
    );
  });
});

describe("trailingTopicKey", () => {
  it("reads the topic the session currently ends on", () => {
    expect(trailingTopicKey([entry("A1", "Algebra"), entry("B1", "Geometry")])).toBe(
      "Matematik|Geometry",
    );
  });

  it("is null for an empty session", () => {
    expect(trailingTopicKey([])).toBeNull();
  });

  // §21 — an unavailable question yields no context rather than a guess.
  it("is null when the last entry has no resolvable topic", () => {
    expect(trailingTopicKey([entry("A1", "Algebra"), entry("X1", null, null)])).toBeNull();
  });
});

describe("Phase 64 — multi-page pipeline", () => {
  // §53 — the mandated boundary case, run through the real merge.
  it("avoids a same-topic boundary without touching the frozen prefix", () => {
    const pageOne = [entry("X1", "Kesirler"), entry("Y1", "Üçgenler"), entry("A1", "Algebra")];
    const first = mergeResolvedPages([], interleaveReviewEntries(pageOne, null));
    const frozen = ids(first);

    const pageTwo = [
      entry("A2", "Algebra"),
      entry("A3", "Algebra"),
      entry("B1", "Geometry"),
      entry("C1", "Fractions"),
    ];
    const second = mergeResolvedPages(
      first,
      interleaveReviewEntries(pageTwo, trailingTopicKey(first)),
    );
    const out = ids(second);

    // §27 — the prefix is byte-for-byte identical.
    expect(out.slice(0, frozen.length)).toEqual(frozen);
    // The session ended on Algebra, so page two must not open with it.
    expect(out[frozen.length]).not.toBe("A2");
    expect(out).toEqual([...frozen, "B1", "C1", "A2", "A3"]);
  });

  it("demonstrates the improvement over page-only composition", () => {
    const pageOne = [entry("X1", "Kesirler"), entry("Y1", "Üçgenler"), entry("A1", "Algebra")];
    const first = mergeResolvedPages([], interleaveReviewEntries(pageOne, null));
    const pageTwo = [
      entry("A2", "Algebra"),
      entry("A3", "Algebra"),
      entry("B1", "Geometry"),
      entry("C1", "Fractions"),
    ];
    // Phase 63 behaviour: page composed with no knowledge of the boundary.
    const pageOnly = ids(mergeResolvedPages(first, interleaveReviewEntries(pageTwo)));
    const withContinuity = ids(
      mergeResolvedPages(first, interleaveReviewEntries(pageTwo, trailingTopicKey(first))),
    );
    // The old behaviour repeated Algebra across the seam; the new one does not.
    expect(pageOnly[2]).toBe("A1");
    expect(pageOnly[3]).toBe("A2");
    expect(withContinuity[2]).toBe("A1");
    expect(withContinuity[3]).not.toBe("A2");
  });

  // §56 / §57 — page 3's context must come from the COMPOSED page 2 tail.
  it("derives page 3 context from the composed page 2, not the raw query order", () => {
    const pageOne = [entry("A1", "Algebra"), entry("B1", "Geometry")];
    const s1 = mergeResolvedPages([], interleaveReviewEntries(pageOne, null));

    const pageTwo = [entry("C1", "Fractions"), entry("C2", "Fractions"), entry("D1", "Kesirler")];
    const s2 = mergeResolvedPages(s1, interleaveReviewEntries(pageTwo, trailingTopicKey(s1)));
    // Composed page two ends on Fractions (C2); its RAW order ended on Kesirler.
    expect(ids(s2).at(-1)).toBe("C2");
    expect(trailingTopicKey(s2)).toBe("Matematik|Fractions");

    const pageThree = [entry("C3", "Fractions"), entry("E1", "Üçgenler")];
    const s3 = mergeResolvedPages(s2, interleaveReviewEntries(pageThree, trailingTopicKey(s2)));
    // Because context came from the composed tail, page three does not open
    // with another Fractions question.
    expect(ids(s3).at(-2)).toBe("E1");
    expect(ids(s3).at(-1)).toBe("C3");
  });

  // §59 / §62 — pagination integrity is unaffected.
  it("never skips or duplicates a question across three pages", () => {
    const p1 = [entry("A1", "Algebra"), entry("B1", "Geometry")];
    const p2 = [entry("A2", "Algebra"), entry("C1", "Fractions"), entry("A3", "Algebra")];
    // A legitimate boundary overlap: A1 is returned again after a review.
    const p3 = [entry("A1", "Algebra"), entry("D1", "Kesirler")];

    let state = mergeResolvedPages([], interleaveReviewEntries(p1, null));
    state = mergeResolvedPages(state, interleaveReviewEntries(p2, trailingTopicKey(state)));
    state = mergeResolvedPages(state, interleaveReviewEntries(p3, trailingTopicKey(state)));

    const out = ids(state);
    expect(new Set(out).size).toBe(out.length);
    expect(new Set(out)).toEqual(new Set(["A1", "B1", "A2", "C1", "A3", "D1"]));
  });

  // §31 — recomposing the same inputs (a rerender) yields the same session.
  it("produces the same session when recomposed from the same inputs", () => {
    const p1 = [entry("A1", "Algebra"), entry("B1", "Geometry"), entry("A2", "Algebra")];
    const p2 = [entry("A3", "Algebra"), entry("C1", "Fractions")];
    const build = () => {
      const s = mergeResolvedPages([], interleaveReviewEntries(p1, null));
      return ids(mergeResolvedPages(s, interleaveReviewEntries(p2, trailingTopicKey(s))));
    };
    expect(build()).toEqual(build());
  });
});

// Phase 64 — regression guard for the seam Phase 63 missed.
//
// Phase 63 wired interleaving into loadMore only, so the very first page every
// student sees was still rendered in raw query order. The pure function and
// the merge pipeline were both correct and both tested; the hook simply called
// a different code path for the initial load. This test encodes the shape that
// bug produced, so a future refactor that drops first-page composition fails
// here rather than silently shipping.
describe("Phase 64 — the first page must be composed, not raw", () => {
  it("balances a first page that arrives heavily clustered", () => {
    // Exactly the runtime fixture: eight Algebra then one each of two others.
    const rawFirstPage = [
      ...Array.from({ length: 8 }, (_, i) => entry(`a${i + 1}`, "Algebra")),
      entry("b1", "Geometri"),
      entry("c1", "Kesirler"),
    ];
    // What the hook now stores for page one.
    const composed = ids(interleaveReviewEntries(rawFirstPage, null));

    expect(composed.slice(0, 3)).toEqual(["a1", "b1", "c1"]);
    // The raw order would have opened with three Algebra questions in a row.
    expect(ids(rawFirstPage).slice(0, 3)).toEqual(["a1", "a2", "a3"]);
    expect(composed).not.toEqual(ids(rawFirstPage));
    // Nothing gained or lost by composing.
    expect(new Set(composed)).toEqual(new Set(ids(rawFirstPage)));
  });

  it("leaves the composed first page ending on the dominant topic", () => {
    // This is what makes cross-page continuity necessary at all: after
    // balancing, a dominant topic naturally trails the page.
    const rawFirstPage = [
      ...Array.from({ length: 8 }, (_, i) => entry(`a${i + 1}`, "Algebra")),
      entry("b1", "Geometri"),
      entry("c1", "Kesirler"),
    ];
    const composed = interleaveReviewEntries(rawFirstPage, null);
    expect(trailingTopicKey(composed)).toBe("Matematik|Algebra");
  });
});
