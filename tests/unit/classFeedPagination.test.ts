import {
  calculateActiveIndex,
  dedupeQuestionsById,
  formatFeedPosition,
  isEndOfFeed,
  mergeQuestionPages,
  reinjectQuestionForSecondChance,
  restoreActiveIndex,
  shouldPrefetchNextPage,
} from "@features/classes/services/classFeedPagination";
import { Question } from "@/types/question";

function q(id: string, createdAt = 0): Question {
  return {
    id,
    ownerId: "teacher-1",
    organizationId: "org-1",
    visibility: "class",
    imageUrl: `https://example.com/${id}.jpg`,
    classId: "class-1",
    subject: "",
    description: null,
    posterRole: "teacher",
    createdAt,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
  };
}

describe("mergeQuestionPages — no duplicates, no losses across page boundaries", () => {
  it("appends a clean second page in server order", () => {
    const merged = mergeQuestionPages([q("a"), q("b")], [q("c"), q("d")]);
    expect(merged.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("drops ids already present — an overlapping cursor page never renders twice", () => {
    // Real scenario: a new question is inserted at the head between page 1
    // and page 2, shifting everything down, so page 2 re-returns "b".
    const merged = mergeQuestionPages([q("a"), q("b")], [q("b"), q("c")]);
    expect(merged.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps questions that are genuinely new even when the page fully overlaps at the front", () => {
    const merged = mergeQuestionPages([q("a"), q("b"), q("c")], [q("a"), q("b"), q("c"), q("d")]);
    expect(merged.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("returns the existing array untouched for an empty incoming page", () => {
    const existing = [q("a")];
    expect(mergeQuestionPages(existing, [])).toBe(existing);
  });

  it("never mutates the existing array", () => {
    const existing = [q("a")];
    mergeQuestionPages(existing, [q("b")]);
    expect(existing.map((x) => x.id)).toEqual(["a"]);
  });

  it("does not re-sort — server ordering (createdAt desc) is preserved verbatim", () => {
    const merged = mergeQuestionPages([q("a", 300), q("b", 200)], [q("c", 100)]);
    expect(merged.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

// The invariant behind "liking/saving/paginating never sends the student
// back to the top": whatever question index N pointed at before a page was
// appended, it must still point at the same question afterwards. If merge
// ever prepended or re-sorted, the active card would silently change under
// the user's finger mid-read.
describe("mergeQuestionPages — the active question never moves", () => {
  it("keeps every already-loaded index pointing at the same question after a page is appended", () => {
    const before = [q("a"), q("b"), q("c")];
    const after = mergeQuestionPages(before, [q("d"), q("e")]);

    for (let i = 0; i < before.length; i++) {
      expect(after[i]?.id).toBe(before[i]?.id);
    }
  });

  it("keeps the active index pointing at the same question even when the incoming page overlaps", () => {
    const before = [q("a"), q("b"), q("c")];
    const activeIndex = 1; // student is reading "b"
    const after = mergeQuestionPages(before, [q("b"), q("c"), q("d")]);

    expect(after[activeIndex]?.id).toBe("b");
    expect(after.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("only ever grows the list — appending never removes a loaded question", () => {
    const before = [q("a"), q("b")];
    const after = mergeQuestionPages(before, [q("c")]);
    expect(after.length).toBeGreaterThanOrEqual(before.length);
    for (const original of before) {
      expect(after.some((x) => x.id === original.id)).toBe(true);
    }
  });
});

describe("dedupeQuestionsById", () => {
  it("keeps the first occurrence only, so React keys are always unique", () => {
    expect(dedupeQuestionsById([q("a"), q("b"), q("a")]).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("handles an empty list", () => {
    expect(dedupeQuestionsById([])).toEqual([]);
  });
});

describe("calculateActiveIndex — one swipe is exactly one question", () => {
  const H = 800;

  it("reports the exact page at exact offsets", () => {
    expect(calculateActiveIndex(0, H, 5)).toBe(0);
    expect(calculateActiveIndex(800, H, 5)).toBe(1);
    expect(calculateActiveIndex(1600, H, 5)).toBe(2);
  });

  it("rounds to the nearest page rather than flooring, so a near-complete swipe reports the new card", () => {
    expect(calculateActiveIndex(780, H, 5)).toBe(1);
    expect(calculateActiveIndex(420, H, 5)).toBe(1);
    expect(calculateActiveIndex(380, H, 5)).toBe(0);
  });

  it("clamps a negative offset (iOS rubber-band above the first card) to 0", () => {
    expect(calculateActiveIndex(-120, H, 5)).toBe(0);
  });

  it("clamps an overshoot past the last card to the final index", () => {
    expect(calculateActiveIndex(999999, H, 5)).toBe(4);
  });

  it("is safe for an empty list and for a zero viewport height", () => {
    expect(calculateActiveIndex(0, H, 0)).toBe(0);
    expect(calculateActiveIndex(500, 0, 5)).toBe(0);
  });

  it("stays correct after a viewport height change (rotation / split view)", () => {
    // Same card index, different device height — offset scales with height.
    expect(calculateActiveIndex(2 * 800, 800, 6)).toBe(2);
    expect(calculateActiveIndex(2 * 1000, 1000, 6)).toBe(2);
  });
});

describe("shouldPrefetchNextPage — request deduplication", () => {
  const base = { activeIndex: 0, loadedCount: 8, hasMore: true, isFetching: false };

  it("does not prefetch early in the page", () => {
    expect(shouldPrefetchNextPage({ ...base, activeIndex: 0 })).toBe(false);
    expect(shouldPrefetchNextPage({ ...base, activeIndex: 3 })).toBe(false);
  });

  it("prefetches once the active card is within the threshold of the end", () => {
    expect(shouldPrefetchNextPage({ ...base, activeIndex: 4 })).toBe(true);
    expect(shouldPrefetchNextPage({ ...base, activeIndex: 7 })).toBe(true);
  });

  it("never prefetches while a request is already in flight — rapid swiping cannot fire duplicate pages", () => {
    expect(shouldPrefetchNextPage({ ...base, activeIndex: 7, isFetching: true })).toBe(false);
  });

  it("never prefetches when the server says there is nothing more", () => {
    expect(shouldPrefetchNextPage({ ...base, activeIndex: 7, hasMore: false })).toBe(false);
  });

  it("never prefetches from an empty list", () => {
    expect(shouldPrefetchNextPage({ ...base, loadedCount: 0, activeIndex: 0 })).toBe(false);
  });

  it("honours a custom threshold", () => {
    expect(shouldPrefetchNextPage({ ...base, activeIndex: 5, threshold: 1 })).toBe(false);
    expect(shouldPrefetchNextPage({ ...base, activeIndex: 6, threshold: 1 })).toBe(true);
  });
});

describe("restoreActiveIndex — position survives a refresh", () => {
  const list = [q("a"), q("b"), q("c")];

  it("returns to the same question by id even if its index moved", () => {
    // A new question arrived at the head, pushing "b" from index 1 to 2.
    const refreshed = [q("new"), q("a"), q("b"), q("c")];
    expect(restoreActiveIndex(refreshed, "b", 1)).toBe(2);
  });

  it("keeps the exact index when nothing moved", () => {
    expect(restoreActiveIndex(list, "b", 1)).toBe(1);
  });

  it("falls back to the previous index when the question was deleted while the feed was open", () => {
    const withoutB = [q("a"), q("c")];
    expect(restoreActiveIndex(withoutB, "b", 1)).toBe(1);
  });

  it("clamps the fallback when the list shrank past the previous index", () => {
    expect(restoreActiveIndex([q("a")], "gone", 5)).toBe(0);
  });

  it("returns 0 for an emptied feed", () => {
    expect(restoreActiveIndex([], "b", 2)).toBe(0);
  });

  it("falls back cleanly when there was no anchor id", () => {
    expect(restoreActiveIndex(list, undefined, 2)).toBe(2);
  });
});

describe("isEndOfFeed — explicit completion, never an endless spinner", () => {
  it("is false while the server still has more pages", () => {
    expect(isEndOfFeed({ activeIndex: 7, loadedCount: 8, hasMore: true })).toBe(false);
  });

  it("is false in the middle of the loaded list", () => {
    expect(isEndOfFeed({ activeIndex: 3, loadedCount: 8, hasMore: false })).toBe(false);
  });

  it("is true only on the last card with nothing more to load", () => {
    expect(isEndOfFeed({ activeIndex: 7, loadedCount: 8, hasMore: false })).toBe(true);
  });

  it("is false for an empty feed (that is the empty state, not the end state)", () => {
    expect(isEndOfFeed({ activeIndex: 0, loadedCount: 0, hasMore: false })).toBe(false);
  });
});

describe("formatFeedPosition", () => {
  it("renders a 1-based position", () => {
    expect(formatFeedPosition(0, 18)).toBe("1 / 18");
    expect(formatFeedPosition(2, 18)).toBe("3 / 18");
    expect(formatFeedPosition(17, 18)).toBe("18 / 18");
  });

  it("renders 0 / 0 for an empty feed instead of 1 / 0", () => {
    expect(formatFeedPosition(0, 0)).toBe("0 / 0");
  });

  it("clamps an out-of-range index rather than showing 19 / 18", () => {
    expect(formatFeedPosition(99, 18)).toBe("18 / 18");
    expect(formatFeedPosition(-3, 18)).toBe("1 / 18");
  });
});

// Phase 18 — the array-mutation half of the scroll-first "second chance"
// reshow (classFeedStudyGating.test.ts covers the decision half).
describe("reinjectQuestionForSecondChance", () => {
  it("splices the question in at the given index without removing anything", () => {
    const questions = [q("a"), q("b"), q("c"), q("d")];
    const result = reinjectQuestionForSecondChance(questions, q("a"), 2);
    expect(result.map((question) => question.id)).toEqual(["a", "b", "a", "c", "d"]);
  });

  it("deliberately allows the same id to appear twice", () => {
    // The whole point: the struggled question's SAME id resurfaces later in
    // this session. A dedupe pass here would silently cancel the feature.
    const questions = [q("a"), q("b")];
    const result = reinjectQuestionForSecondChance(questions, q("a"), 1);
    expect(result.filter((question) => question.id === "a")).toHaveLength(2);
  });

  it("does not mutate the input array", () => {
    const questions = [q("a"), q("b")];
    const copy = [...questions];
    reinjectQuestionForSecondChance(questions, q("c"), 1);
    expect(questions).toEqual(copy);
  });

  it("clamps a negative index to the start", () => {
    const questions = [q("a"), q("b")];
    const result = reinjectQuestionForSecondChance(questions, q("c"), -5);
    expect(result.map((question) => question.id)).toEqual(["c", "a", "b"]);
  });

  it("clamps an index past the end to the end", () => {
    const questions = [q("a"), q("b")];
    const result = reinjectQuestionForSecondChance(questions, q("c"), 999);
    expect(result.map((question) => question.id)).toEqual(["a", "b", "c"]);
  });
});
