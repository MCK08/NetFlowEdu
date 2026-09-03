import {
  buildFeedItems,
  FeedItem,
  reconcileFeedItems,
  reinjectPairForSecondChance,
} from "@features/classes/services/feedItems";
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
    topic: "",
    gradeLevel: "",
    description: null,
    posterRole: "teacher",
    createdAt,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    choices: null,
    correctChoice: null,
    hints: [],
  };
}

describe("buildFeedItems", () => {
  it("interleaves [Question, Rating, Question, Rating, ...] by default", () => {
    const items = buildFeedItems([q("a"), q("b")]);
    expect(items.map((item) => `${item.type}:${item.question.id}`)).toEqual([
      "question:a",
      "rating:a",
      "question:b",
      "rating:b",
    ]);
  });

  it("tags every item with its question's ORIGINAL index", () => {
    const items = buildFeedItems([q("a"), q("b")]);
    expect(items.map((item) => item.questionIndex)).toEqual([0, 0, 1, 1]);
  });

  it("continues indexing from baseIndexOffset for a newly-loaded page", () => {
    const items = buildFeedItems([q("c"), q("d")], 2);
    expect(items.map((item) => item.questionIndex)).toEqual([2, 2, 3, 3]);
  });

  it("builds question-only items (no rating cards) when includeRating is false", () => {
    // The teacher path — study items don't exist for teachers, and
    // recordStudyOutcome rejects them outright, so a rating card would be a
    // guaranteed error.
    const items = buildFeedItems([q("a"), q("b")], 0, false);
    expect(items.map((item) => item.type)).toEqual(["question", "question"]);
  });

  it("gives every item a unique key with no interleaving", () => {
    const items = buildFeedItems([q("a"), q("b"), q("c")]);
    const keys = items.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("marks every original item as not a reshow", () => {
    const items = buildFeedItems([q("a")]);
    expect(items.every((item) => item.isReshow === false)).toBe(true);
  });

  it("returns an empty array for an empty source list", () => {
    expect(buildFeedItems([])).toEqual([]);
  });
});

describe("reinjectPairForSecondChance", () => {
  it("splices a [Question, Rating] PAIR at the given index, not a single item", () => {
    const items = buildFeedItems([q("a"), q("b")]);
    const result = reinjectPairForSecondChance(items, q("a"), 0, 2);
    expect(result.map((item) => `${item.type}:${item.question.id}`)).toEqual([
      "question:a",
      "rating:a",
      "question:a",
      "rating:a",
      "question:b",
      "rating:b",
    ]);
  });

  it("marks the reinjected pair as a reshow, and leaves the original pair alone", () => {
    const items = buildFeedItems([q("a")]);
    const result = reinjectPairForSecondChance(items, q("a"), 0, 2);
    expect(result[0]?.isReshow).toBe(false);
    expect(result[1]?.isReshow).toBe(false);
    expect(result[2]?.isReshow).toBe(true);
    expect(result[3]?.isReshow).toBe(true);
  });

  it("gives the reshow pair keys distinct from the original pair's keys", () => {
    const items = buildFeedItems([q("a")]);
    const result = reinjectPairForSecondChance(items, q("a"), 0, 2);
    const keys = result.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not mutate the input array", () => {
    const items = buildFeedItems([q("a"), q("b")]);
    const copy = [...items];
    reinjectPairForSecondChance(items, q("a"), 0, 1);
    expect(items).toEqual(copy);
  });

  it("clamps an out-of-range index rather than throwing", () => {
    const items = buildFeedItems([q("a")]);
    expect(() => reinjectPairForSecondChance(items, q("a"), 0, 999)).not.toThrow();
    expect(() => reinjectPairForSecondChance(items, q("a"), 0, -50)).not.toThrow();
  });
});

// Phase 20 — reconcileFeedItems replaces useInterleavedStudyFeed's old
// length-comparison diff. That diff assumed `questions` only ever grows at
// the END (true for pagination, false for an upload prepended at the FRONT
// by useSocialFeed.prepend, and false for a class-feed pull-to-refresh that
// can reorder the whole list) — so it could mistake an existing question
// for new (duplicate key) while leaving a genuinely new one with no item at
// all. These tests pin down the id-based reconciliation that replaced it.
describe("reconcileFeedItems", () => {
  function types(items: FeedItem[]) {
    return items.map((item) => `${item.type}:${item.question.id}${item.isReshow ? "-r" : ""}`);
  }

  function assertNoDuplicateKeys(items: FeedItem[]) {
    const keys = items.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  }

  it("builds from nothing when the feed was empty (empty → populated)", () => {
    const result = reconcileFeedItems([], [q("a"), q("b")], true);
    expect(types(result)).toEqual(["question:a", "rating:a", "question:b", "rating:b"]);
    assertNoDuplicateKeys(result);
  });

  it("appends a new page at the end (normal pagination growth)", () => {
    const prev = buildFeedItems([q("a"), q("b")]);
    const result = reconcileFeedItems(prev, [q("a"), q("b"), q("c")], true);
    expect(types(result)).toEqual([
      "question:a",
      "rating:a",
      "question:b",
      "rating:b",
      "question:c",
      "rating:c",
    ]);
    assertNoDuplicateKeys(result);
  });

  it("puts a newly PREPENDED question at the front, not the back", () => {
    // The exact upload scenario: useSocialFeed.prepend() puts the new
    // question at index 0, shifting every existing question down by one.
    const prev = buildFeedItems([q("a"), q("b")]);
    const result = reconcileFeedItems(prev, [q("x"), q("a"), q("b")], true);
    expect(types(result)).toEqual([
      "question:x",
      "rating:x",
      "question:a",
      "rating:a",
      "question:b",
      "rating:b",
    ]);
    assertNoDuplicateKeys(result);
  });

  it("handles more than one prepend across successive reconciliations", () => {
    let items = reconcileFeedItems([], [q("a")], true);
    items = reconcileFeedItems(items, [q("x"), q("a")], true);
    items = reconcileFeedItems(items, [q("y"), q("x"), q("a")], true);
    expect(types(items)).toEqual([
      "question:y",
      "rating:y",
      "question:x",
      "rating:x",
      "question:a",
      "rating:a",
    ]);
    assertNoDuplicateKeys(items);
  });

  it("follows a reordered `questions` array after a refresh", () => {
    const prev = buildFeedItems([q("a"), q("b"), q("c")]);
    const result = reconcileFeedItems(prev, [q("c"), q("a"), q("b")], true);
    expect(types(result)).toEqual([
      "question:c",
      "rating:c",
      "question:a",
      "rating:a",
      "question:b",
      "rating:b",
    ]);
    assertNoDuplicateKeys(result);
  });

  it("drops a removed question's pair without regenerating it", () => {
    const prev = buildFeedItems([q("a"), q("b"), q("c")]);
    const result = reconcileFeedItems(prev, [q("a"), q("c")], true);
    expect(types(result)).toEqual(["question:a", "rating:a", "question:c", "rating:c"]);
    assertNoDuplicateKeys(result);
  });

  it("produces no duplicates when the exact same question set comes back", () => {
    const prev = buildFeedItems([q("a"), q("b")]);
    const result = reconcileFeedItems(prev, [q("a"), q("b")], true);
    expect(types(result)).toEqual(["question:a", "rating:a", "question:b", "rating:b"]);
    assertNoDuplicateKeys(result);
  });

  it("carries an existing reshow pair through unchanged when nothing else changes", () => {
    const base = buildFeedItems([q("a"), q("b"), q("c")]);
    const withReshow = reinjectPairForSecondChance(base, q("b"), 1, 4);
    const result = reconcileFeedItems(withReshow, [q("a"), q("b"), q("c")], true);
    expect(types(result)).toEqual([
      "question:a",
      "rating:a",
      "question:b",
      "rating:b",
      "question:b-r",
      "rating:b-r",
      "question:c",
      "rating:c",
    ]);
    assertNoDuplicateKeys(result);
  });

  // The exact regression scenario from the Phase 20 spec.
  it("REGRESSION: [A,B,C] + prepend X keeps C from duplicating and never drops X", () => {
    const prev = buildFeedItems([q("a"), q("b"), q("c")]);
    const result = reconcileFeedItems(prev, [q("x"), q("a"), q("b"), q("c")], true);

    expect(types(result)).toEqual([
      "question:x",
      "rating:x",
      "question:a",
      "rating:a",
      "question:b",
      "rating:b",
      "question:c",
      "rating:c",
    ]);
    expect(result.filter((item) => item.question.id === "c")).toHaveLength(2); // one Q, one R — not four
    expect(result.some((item) => item.question.id === "x")).toBe(true);
    assertNoDuplicateKeys(result);
  });

  it("a prepend keeps an existing reshow pair intact alongside the new question", () => {
    const base = buildFeedItems([q("a"), q("b"), q("c")]);
    const withReshow = reinjectPairForSecondChance(base, q("b"), 1, 4);
    const result = reconcileFeedItems(withReshow, [q("x"), q("a"), q("b"), q("c")], true);

    expect(types(result)).toEqual([
      "question:x",
      "rating:x",
      "question:a",
      "rating:a",
      "question:b",
      "rating:b",
      "question:b-r",
      "rating:b-r",
      "question:c",
      "rating:c",
    ]);
    assertNoDuplicateKeys(result);
  });

  it("still preserves a reshow pair whose anchor question was removed by a refresh", () => {
    const base = buildFeedItems([q("a"), q("b"), q("c")]);
    const withReshow = reinjectPairForSecondChance(base, q("b"), 1, 4);
    // b's normal pair is gone from the new question set entirely.
    const result = reconcileFeedItems(withReshow, [q("a"), q("c")], true);

    expect(result.some((item) => item.question.id === "b" && item.isReshow)).toBe(true);
    expect(result.some((item) => item.question.id === "b" && !item.isReshow)).toBe(false);
    assertNoDuplicateKeys(result);
  });

  it("never builds a rating item when includeRating is false (teacher feed)", () => {
    const prev = buildFeedItems([q("a")], 0, false);
    const result = reconcileFeedItems(prev, [q("x"), q("a"), q("b")], false);
    expect(result.every((item) => item.type === "question")).toBe(true);
    expect(result.map((item) => item.question.id)).toEqual(["x", "a", "b"]);
    assertNoDuplicateKeys(result);
  });

  it("does not mutate the prevItems array or its elements", () => {
    const prev = buildFeedItems([q("a"), q("b")]);
    const prevCopy = prev.map((item) => ({ ...item }));
    reconcileFeedItems(prev, [q("x"), q("a"), q("b"), q("c")], true);
    expect(prev).toEqual(prevCopy);
  });

  it("does not mutate the questions array", () => {
    const questions = [q("a"), q("b")];
    const questionsCopy = [...questions];
    reconcileFeedItems([], questions, true);
    expect(questions).toEqual(questionsCopy);
  });
});
