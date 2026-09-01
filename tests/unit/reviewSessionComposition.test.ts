// Phase 63 — review page interleaving.
//
// The safety property under test is narrow but important: this may only
// change the ORDER of entries the due query already returned, never which
// entries those are. Every test below either proves a diversity improvement
// or proves that nothing about eligibility, membership or determinism moved.

import { interleaveReviewEntries } from "../../src/features/study/services/reviewSessionComposition";
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
