import {
  activeFeedFilterCount,
  EMPTY_FEED_FILTER,
  feedFilterKey,
  FeedFilter,
  filterQuestions,
  isFeedFilterActive,
  matchesFeedFilter,
} from "@features/feed/services/feedFilters";
import { buildFeedItems, reconcileFeedItems, reinjectPairForSecondChance } from "@features/classes/services/feedItems";
import { Question } from "@/types/question";

function q(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    ownerId: "teacher-1",
    organizationId: "org-1",
    visibility: "public",
    imageUrl: `https://example.com/${id}.jpg`,
    classId: null,
    subject: "Matematik",
    topic: "Denklemler",
    gradeLevel: "9",
    description: null,
    posterRole: "teacher",
    createdAt: 0,
    likeCount: 0,
    commentCount: 0,
    answerCount: 0,
    choices: null,
    correctChoice: null,
    hints: [],
    ...overrides,
  };
}

describe("matchesFeedFilter / filterQuestions", () => {
  it("matches everything when no filter field is active", () => {
    expect(filterQuestions([q("a"), q("b")], EMPTY_FEED_FILTER)).toHaveLength(2);
  });

  it("filters by subject alone", () => {
    const questions = [q("a", { subject: "Matematik" }), q("b", { subject: "Fizik" })];
    const filter: FeedFilter = { subject: "Matematik", gradeLevel: null, topic: null };
    expect(filterQuestions(questions, filter).map((x) => x.id)).toEqual(["a"]);
  });

  it("filters by gradeLevel alone", () => {
    const questions = [q("a", { gradeLevel: "9" }), q("b", { gradeLevel: "10" })];
    const filter: FeedFilter = { subject: null, gradeLevel: "10", topic: null };
    expect(filterQuestions(questions, filter).map((x) => x.id)).toEqual(["b"]);
  });

  it("filters by topic alone", () => {
    const questions = [q("a", { topic: "Denklemler" }), q("b", { topic: "Geometri" })];
    const filter: FeedFilter = { subject: null, gradeLevel: null, topic: "Geometri" };
    expect(filterQuestions(questions, filter).map((x) => x.id)).toEqual(["b"]);
  });

  it("combines all three filters with AND", () => {
    const questions = [
      q("a", { subject: "Matematik", gradeLevel: "9", topic: "Denklemler" }),
      q("b", { subject: "Matematik", gradeLevel: "9", topic: "Geometri" }),
      q("c", { subject: "Matematik", gradeLevel: "10", topic: "Denklemler" }),
      q("d", { subject: "Fizik", gradeLevel: "9", topic: "Denklemler" }),
    ];
    const filter: FeedFilter = { subject: "Matematik", gradeLevel: "9", topic: "Denklemler" };
    expect(filterQuestions(questions, filter).map((x) => x.id)).toEqual(["a"]);
  });

  it("matchesFeedFilter agrees with filterQuestions on a single question", () => {
    const question = q("a", { subject: "Fizik" });
    const filter: FeedFilter = { subject: "Matematik", gradeLevel: null, topic: null };
    expect(matchesFeedFilter(question, filter)).toBe(false);
  });
});

describe("isFeedFilterActive / activeFeedFilterCount / clear", () => {
  it("is inactive for the empty filter", () => {
    expect(isFeedFilterActive(EMPTY_FEED_FILTER)).toBe(false);
    expect(activeFeedFilterCount(EMPTY_FEED_FILTER)).toBe(0);
  });

  it("counts exactly how many fields are set", () => {
    expect(activeFeedFilterCount({ subject: "Matematik", gradeLevel: null, topic: null })).toBe(1);
    expect(activeFeedFilterCount({ subject: "Matematik", gradeLevel: "9", topic: null })).toBe(2);
    expect(activeFeedFilterCount({ subject: "Matematik", gradeLevel: "9", topic: "Denklemler" })).toBe(3);
  });

  it("clearing returns to the exact empty-filter shape", () => {
    const cleared: FeedFilter = { subject: null, gradeLevel: null, topic: null };
    expect(cleared).toEqual(EMPTY_FEED_FILTER);
    expect(isFeedFilterActive(cleared)).toBe(false);
  });
});

describe("feedFilterKey — identity used to reset a feed session on filter change", () => {
  it("gives the same key for two filters with the same content", () => {
    const a: FeedFilter = { subject: "Matematik", gradeLevel: "9", topic: null };
    const b: FeedFilter = { subject: "Matematik", gradeLevel: "9", topic: null };
    expect(feedFilterKey(a)).toBe(feedFilterKey(b));
  });

  it("gives a different key when any field differs", () => {
    const a: FeedFilter = { subject: "Matematik", gradeLevel: "9", topic: null };
    const b: FeedFilter = { subject: "Fizik", gradeLevel: "9", topic: null };
    expect(feedFilterKey(a)).not.toBe(feedFilterKey(b));
  });
});

// Filtering never gets its own reconciliation logic — FeedScreen narrows
// `questions` and hands the SAME (already Phase-20-hardened) array to
// reconcileFeedItems, so "filtered pagination", "prepend with an active
// filter", "refresh with an active filter", and "no duplicate keys" are all
// really just more reconcileFeedItems inputs. These tests exercise that
// exact combination end-to-end rather than re-deriving it.
describe("filtering composed with reconcileFeedItems (the real FeedScreen data path)", () => {
  const math9 = q("a", { subject: "Matematik", gradeLevel: "9" });
  const math10 = q("b", { subject: "Matematik", gradeLevel: "10" });
  const physics9 = q("c", { subject: "Fizik", gradeLevel: "9" });
  const filter: FeedFilter = { subject: "Matematik", gradeLevel: null, topic: null };

  function assertNoDuplicateKeys(items: ReturnType<typeof buildFeedItems>) {
    const keys = items.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  }

  it("a filtered page reconciles to only the matching questions' pairs", () => {
    const questions = filterQuestions([math9, math10, physics9], filter);
    const items = reconcileFeedItems([], questions, true);
    expect(items.map((item) => `${item.type}:${item.question.id}`)).toEqual([
      "question:a",
      "rating:a",
      "question:b",
      "rating:b",
    ]);
    assertNoDuplicateKeys(items);
  });

  it("filtered pagination: a second page appends only its own matching questions", () => {
    const page1 = filterQuestions([math9], filter);
    const itemsAfterPage1 = reconcileFeedItems([], page1, true);

    const page2 = filterQuestions([math9, math10, physics9], filter); // math9 + math10 match, physics9 doesn't
    const itemsAfterPage2 = reconcileFeedItems(itemsAfterPage1, page2, true);

    expect(itemsAfterPage2.map((item) => item.question.id)).toEqual(["a", "a", "b", "b"]);
    assertNoDuplicateKeys(itemsAfterPage2);
  });

  it("prepend with an active filter: a new matching question appears at the front", () => {
    const before = filterQuestions([math9], filter);
    const itemsBefore = reconcileFeedItems([], before, true);

    const newMath = q("x", { subject: "Matematik", gradeLevel: "11" });
    const after = filterQuestions([newMath, math9], filter); // both match "Matematik"
    const itemsAfter = reconcileFeedItems(itemsBefore, after, true);

    // Each question contributes a [Question, Rating] pair, so its id
    // appears twice — "x" must lead, "a" must follow, neither duplicated.
    expect(itemsAfter.map((item) => item.question.id)).toEqual(["x", "x", "a", "a"]);
    assertNoDuplicateKeys(itemsAfter);
  });

  it("prepend with an active filter: a new NON-matching question never appears", () => {
    const before = filterQuestions([math9], filter);
    const itemsBefore = reconcileFeedItems([], before, true);

    const newPhysics = q("y", { subject: "Fizik" });
    // Unfiltered source grew, but the filtered view FeedScreen actually
    // passes in did not — physics never matches "Matematik".
    const after = filterQuestions([newPhysics, math9], filter);
    const itemsAfter = reconcileFeedItems(itemsBefore, after, true);

    expect(itemsAfter.map((item) => item.question.id)).toEqual(["a", "a"]);
  });

  it("refresh with an active filter: reordered matching questions follow the new order", () => {
    const before = filterQuestions([math9, math10], filter);
    const itemsBefore = reconcileFeedItems([], before, true);

    const refreshed = filterQuestions([math10, math9, physics9], filter); // reordered, physics9 excluded
    const itemsAfter = reconcileFeedItems(itemsBefore, refreshed, true);

    expect(itemsAfter.map((item) => item.question.id)).toEqual(["b", "b", "a", "a"]);
    assertNoDuplicateKeys(itemsAfter);
  });

  it("a reshow pair from BEFORE a filter change must not leak into the filtered feed (via a session reset, not reconcileFeedItems itself)", () => {
    // This is exactly why useInterleavedStudyFeed's resetKey exists: giving
    // reconcileFeedItems a FRESH (empty) prevItems on filter change, rather
    // than reconciling the old session's reshow pairs against a narrower
    // question set.
    const base = buildFeedItems([math9, math10], 0, true);
    const withReshow = reinjectPairForSecondChance(base, math9, 0, 3);
    expect(withReshow.some((item) => item.isReshow)).toBe(true);

    // Filter changes to "only grade 10" — math9 (and its reshow pair) are
    // no longer part of the filtered question set at all.
    const narrowerFilter: FeedFilter = { subject: null, gradeLevel: "10", topic: null };
    const filteredQuestions = filterQuestions([math9, math10], narrowerFilter);

    // The FRESH-session reconciliation FeedScreen actually performs on a
    // filter change (empty prevItems, not `withReshow`):
    const freshItems = reconcileFeedItems([], filteredQuestions, true);
    expect(freshItems.some((item) => item.isReshow)).toBe(false);
    expect(freshItems.map((item) => item.question.id)).toEqual(["b", "b"]);
  });

  it("teacher feed (includeRating=false) with an active filter never builds rating items", () => {
    const questions = filterQuestions([math9, math10, physics9], filter);
    const items = reconcileFeedItems([], questions, false);
    expect(items.every((item) => item.type === "question")).toBe(true);
    expect(items.map((item) => item.question.id)).toEqual(["a", "b"]);
  });
});
