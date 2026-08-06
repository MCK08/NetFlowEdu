import { buildFeedItems, reinjectPairForSecondChance } from "@features/classes/services/feedItems";
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
