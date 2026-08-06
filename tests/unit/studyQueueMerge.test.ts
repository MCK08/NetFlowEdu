import {
  dedupeStudyItems,
  hasMorePages,
  mergeResolvedPages,
  mergeStudyItemPages,
  removeStudyItemById,
} from "@features/study/services/studyQueueMerge";
import type { ResolvedQueueEntry, StudyItem } from "@features/study/services/studyService";

function item(questionId: string, nextReviewAt = 1): StudyItem {
  return {
    questionId,
    status: "review",
    lastOutcome: "solved",
    intervalDays: 2,
    successfulReviews: 1,
    attemptCount: 1,
    nextReviewAt,
    lastReviewedAt: 0,
    source: "public",
    sourceClassId: null,
  };
}

function entry(questionId: string): ResolvedQueueEntry {
  return { item: item(questionId), question: null };
}

describe("mergeStudyItemPages", () => {
  it("appends a following page", () => {
    const merged = mergeStudyItemPages([item("a")], [item("b"), item("c")]);
    expect(merged.map((i) => i.questionId)).toEqual(["a", "b", "c"]);
  });

  it("drops duplicates from an OVERLAPPING page — the real cursor hazard", () => {
    // nextReviewAt is rewritten by every review, so a cursor page boundary
    // can legitimately return an already-seen item.
    const merged = mergeStudyItemPages([item("a"), item("b")], [item("b"), item("c")]);
    expect(merged.map((i) => i.questionId)).toEqual(["a", "b", "c"]);
  });

  it("returns the SAME reference for an empty incoming page (no needless re-render)", () => {
    const existing = [item("a")];
    expect(mergeStudyItemPages(existing, [])).toBe(existing);
  });

  it("preserves order and never re-sorts", () => {
    const merged = mergeStudyItemPages([item("z", 100)], [item("a", 1)]);
    expect(merged.map((i) => i.questionId)).toEqual(["z", "a"]);
  });

  it("is a no-op when every incoming item is already present", () => {
    const merged = mergeStudyItemPages([item("a"), item("b")], [item("a"), item("b")]);
    expect(merged.map((i) => i.questionId)).toEqual(["a", "b"]);
  });
});

describe("mergeResolvedPages", () => {
  it("dedupes resolved entries by questionId", () => {
    const merged = mergeResolvedPages([entry("a"), entry("b")], [entry("b"), entry("c")]);
    expect(merged.map((e) => e.item.questionId)).toEqual(["a", "b", "c"]);
  });

  it("returns the same reference for an empty page", () => {
    const existing = [entry("a")];
    expect(mergeResolvedPages(existing, [])).toBe(existing);
  });
});

describe("dedupeStudyItems", () => {
  it("keeps the first occurrence", () => {
    const first = item("a", 5);
    const result = dedupeStudyItems([first, item("a", 9), item("b")]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(first);
  });
});

describe("removeStudyItemById", () => {
  it("removes the matching item", () => {
    const result = removeStudyItemById([item("a"), item("b")], "a");
    expect(result.map((i) => i.questionId)).toEqual(["b"]);
  });

  it("returns the same reference when the id is absent", () => {
    const items = [item("a")];
    expect(removeStudyItemById(items, "missing")).toBe(items);
  });
});

describe("hasMorePages", () => {
  it("is true for a full page", () => {
    expect(hasMorePages(10, 10)).toBe(true);
  });

  it("is false for a short page (terminal)", () => {
    expect(hasMorePages(4, 10)).toBe(false);
  });

  it("is false for an EMPTY final page — must not spin forever", () => {
    expect(hasMorePages(0, 10)).toBe(false);
  });
});
